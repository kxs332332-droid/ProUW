import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("prouw.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT,
    last_name TEXT,
    employee_id TEXT UNIQUE,
    user_id TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user'
  );

  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT, -- 'mcq', 'yesno', 'specific'
    text TEXT,
    options TEXT, -- JSON string for MCQ options
    correct_answer TEXT,
    master_rationale TEXT,
    format TEXT, -- 'Text' or 'Number' for specific
    module INTEGER,
    time_limit INTEGER DEFAULT 60
  );

  CREATE TABLE IF NOT EXISTS test_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    module INTEGER,
    total_questions INTEGER DEFAULT 0,
    start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    end_time DATETIME,
    status TEXT DEFAULT 'in_progress', -- 'in_progress', 'completed', 'published', 'suspended', 'denied'
    total_score REAL DEFAULT 0,
    total_explanation_score REAL DEFAULT 0,
    violation_count INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    question_id INTEGER,
    answer TEXT,
    explanation TEXT,
    ai_explanation_score REAL,
    admin_score REAL,
    admin_explanation_score REAL,
    FOREIGN KEY(session_id) REFERENCES test_sessions(id),
    FOREIGN KEY(question_id) REFERENCES questions(id)
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    details TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

// Migration: Ensure violation_count, module, total_questions exist in test_sessions
try {
  const columns = db.prepare("PRAGMA table_info(test_sessions)").all() as any[];
  const hasViolationCount = columns.some(c => c.name === 'violation_count');
  if (!hasViolationCount) {
    console.log("[SERVER] Adding violation_count column to test_sessions...");
    db.prepare("ALTER TABLE test_sessions ADD COLUMN violation_count INTEGER DEFAULT 0").run();
  }
  const hasModule = columns.some(c => c.name === 'module');
  if (!hasModule) {
    console.log("[SERVER] Adding module column to test_sessions...");
    db.prepare("ALTER TABLE test_sessions ADD COLUMN module INTEGER").run();
  }
  const hasTotalQuestions = columns.some(c => c.name === 'total_questions');
  if (!hasTotalQuestions) {
    console.log("[SERVER] Adding total_questions column to test_sessions...");
    db.prepare("ALTER TABLE test_sessions ADD COLUMN total_questions INTEGER DEFAULT 0").run();
  }
} catch (e) {
  console.error("[SERVER] Migration error:", e);
}

// Seed Admin if not exists
const admin = db.prepare("SELECT * FROM users WHERE user_id = ?").get("admin");
if (!admin) {
  db.prepare("INSERT INTO users (first_name, last_name, employee_id, user_id, password, role) VALUES (?, ?, ?, ?, ?, ?)")
    .run("System", "Admin", "ADMIN001", "admin", "mortgage2026", "admin");
}

// Seed sample questions if empty
const questionCount = db.prepare("SELECT COUNT(*) as count FROM questions").get() as any;
if (questionCount.count === 0) {
  const insertQ = db.prepare("INSERT INTO questions (type, text, options, correct_answer, master_rationale, format, module, time_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  
  // Module 1
  insertQ.run('mcq', 'What is the primary purpose of a Debt-to-Income (DTI) ratio in mortgage underwriting?', JSON.stringify(['To determine the property value', 'To assess the borrower\'s ability to manage monthly payments', 'To calculate the interest rate', 'To verify employment history']), 'b', 'DTI is a key metric used to evaluate if a borrower can afford the new mortgage payment alongside existing debts.', 'Text', 1, 60);
  insertQ.run('yesno', 'Is a credit score of 580 generally sufficient for a standard conventional mortgage?', null, 'No', 'Conventional loans typically require a minimum score of 620, though FHA loans may allow 580.', 'Text', 1, 60);
  insertQ.run('specific', 'What is the maximum standard LTV ratio for a primary residence conventional loan without PMI?', null, '80', 'LTV ratios above 80% typically require Private Mortgage Insurance (PMI).', 'Number', 1, 60);
  
  // Module 2
  insertQ.run('mcq', 'Which document is most critical for verifying self-employed income?', JSON.stringify(['W-2 forms', 'Pay stubs', 'Two years of personal and business tax returns', 'Bank statements only']), 'c', 'Self-employed income requires a comprehensive review of tax returns to determine stable, ongoing income.', 'Text', 2, 60);
  
  console.log("[SERVER] Seeded sample questions.");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Request logger for debugging
  app.use((req, res, next) => {
    console.log(`[SERVER] ${req.method} ${req.url}`);
    next();
  });

  // --- API Routes ---

  // Health check
  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  // Backup & Restore
  app.get(["/api/admin/backup", "/api/admin/backup/"], (req, res) => {
    try {
      const data = {
        users: db.prepare("SELECT * FROM users").all(),
        questions: db.prepare("SELECT * FROM questions").all(),
        test_sessions: db.prepare("SELECT * FROM test_sessions").all(),
        responses: db.prepare("SELECT * FROM responses").all(),
        activity_logs: db.prepare("SELECT * FROM activity_logs").all(),
      };
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post(["/api/admin/restore", "/api/admin/restore/"], (req, res) => {
    const { users, questions, test_sessions, responses, activity_logs } = req.body;
    try {
      db.transaction(() => {
        // Clear existing data
        db.prepare("DELETE FROM responses").run();
        db.prepare("DELETE FROM test_sessions").run();
        db.prepare("DELETE FROM questions").run();
        db.prepare("DELETE FROM activity_logs").run();
        db.prepare("DELETE FROM users").run();

        // Restore users
        const insertUser = db.prepare("INSERT INTO users (id, first_name, last_name, employee_id, user_id, password, role) VALUES (?, ?, ?, ?, ?, ?, ?)");
        users.forEach((u: any) => insertUser.run(u.id, u.first_name, u.last_name, u.employee_id, u.user_id, u.password, u.role));

        // Restore questions
        const insertQuestion = db.prepare("INSERT INTO questions (id, type, text, options, correct_answer, master_rationale, format, module, time_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        questions.forEach((q: any) => insertQuestion.run(q.id, q.type, q.text, q.options, q.correct_answer, q.master_rationale, q.format, q.module, q.time_limit));

        // Restore sessions
        const insertSession = db.prepare("INSERT INTO test_sessions (id, user_id, module, total_questions, start_time, end_time, status, total_score, total_explanation_score, violation_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        test_sessions.forEach((s: any) => insertSession.run(s.id, s.user_id, s.module, s.total_questions, s.start_time, s.end_time, s.status, s.total_score, s.total_explanation_score, s.violation_count));

        // Restore responses
        const insertResponse = db.prepare("INSERT INTO responses (id, session_id, question_id, answer, explanation, ai_explanation_score, admin_score, admin_explanation_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        responses.forEach((r: any) => insertResponse.run(r.id, r.session_id, r.question_id, r.answer, r.explanation, r.ai_explanation_score, r.admin_score, r.admin_explanation_score));

        // Restore logs
        const insertLog = db.prepare("INSERT INTO activity_logs (id, user_id, action, timestamp, details) VALUES (?, ?, ?, ?, ?)");
        activity_logs.forEach((l: any) => insertLog.run(l.id, l.user_id, l.action, l.timestamp, l.details));
      })();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Auth
  app.post(["/api/register", "/api/register/"], (req, res) => {
    const { firstName, lastName, employeeId, userId, password } = req.body;
    try {
      const result = db.prepare("INSERT INTO users (first_name, last_name, employee_id, user_id, password) VALUES (?, ?, ?, ?, ?)")
        .run(firstName, lastName, employeeId, userId, password);
      res.json({ success: true, userId: result.lastInsertRowid });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post(["/api/login", "/api/login/"], (req, res) => {
    const { userId, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE user_id = ? AND password = ?").get(userId, password);
    if (user) {
      res.json({ success: true, user });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });

  // Questions
  app.get(["/api/questions", "/api/questions/"], (req, res) => {
    const questions = db.prepare("SELECT * FROM questions").all();
    res.json(questions.map((q: any) => ({ ...q, options: q.options ? JSON.parse(q.options) : null })));
  });

  app.post(["/api/questions", "/api/questions/"], (req, res) => {
    const { type, text, options, correct_answer, master_rationale, format, module, time_limit } = req.body;
    const result = db.prepare("INSERT INTO questions (type, text, options, correct_answer, master_rationale, format, module, time_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(type, text, JSON.stringify(options), correct_answer, master_rationale, format, module, time_limit);
    res.json({ success: true, id: result.lastInsertRowid });
  });

  app.put("/api/questions/:id", (req, res) => {
    const { type, text, options, correct_answer, master_rationale, format, module, time_limit } = req.body;
    db.prepare("UPDATE questions SET type = ?, text = ?, options = ?, correct_answer = ?, master_rationale = ?, format = ?, module = ?, time_limit = ? WHERE id = ?")
      .run(type, text, JSON.stringify(options), correct_answer, master_rationale, format, module, time_limit, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/questions/:id", (req, res) => {
    db.prepare("DELETE FROM questions WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Test Sessions
  app.post(["/api/sessions", "/api/sessions/"], (req, res) => {
    const { userId, module } = req.body;
    const qCount = db.prepare("SELECT COUNT(*) as count FROM questions WHERE module = ?").get(module) as any;
    const result = db.prepare("INSERT INTO test_sessions (user_id, module, total_questions) VALUES (?, ?, ?)")
      .run(userId, module, qCount.count);
    res.json({ success: true, sessionId: result.lastInsertRowid });
  });

  app.post(["/api/sessions/:id/responses", "/api/sessions/:id/responses/"], (req, res) => {
    const { questionId, answer, explanation, aiScore } = req.body;
    db.prepare("INSERT INTO responses (session_id, question_id, answer, explanation, ai_explanation_score) VALUES (?, ?, ?, ?, ?)")
      .run(req.params.id, questionId, answer, explanation, aiScore);
    res.json({ success: true });
  });

  app.post(["/api/sessions/:id/complete", "/api/sessions/:id/complete/"], (req, res) => {
    const sessionId = req.params.id;
    
    // Calculate scores
    const responses = db.prepare(`
      SELECT r.*, q.correct_answer 
      FROM responses r 
      JOIN questions q ON r.question_id = q.id 
      WHERE r.session_id = ?
    `).all(sessionId) as any[];
    
    let totalScore = 0;
    let totalAiScore = 0;
    
    responses.forEach(r => {
      if (r.answer && r.correct_answer && r.answer.toLowerCase().trim() === r.correct_answer.toLowerCase().trim()) {
        totalScore += 1;
      }
      totalAiScore += (r.ai_explanation_score || 0);
    });
    
    db.prepare("UPDATE test_sessions SET status = 'completed', end_time = CURRENT_TIMESTAMP, total_score = ?, total_explanation_score = ? WHERE id = ?")
      .run(totalScore, totalAiScore, sessionId);
      
    res.json({ success: true });
  });

  app.post(["/api/sessions/:id/violation", "/api/sessions/:id/violation/"], (req, res) => {
    const { reason } = req.body;
    db.prepare("UPDATE test_sessions SET violation_count = violation_count + 1 WHERE id = ?").run(req.params.id);
    const session = db.prepare("SELECT violation_count FROM test_sessions WHERE id = ?").get(req.params.id) as any;
    
    if (session.violation_count >= 5) {
      db.prepare("UPDATE test_sessions SET status = 'suspended' WHERE id = ?").run(req.params.id);
      res.json({ success: true, suspended: true, count: session.violation_count });
    } else {
      res.json({ success: true, suspended: false, count: session.violation_count });
    }
  });

  app.post(["/api/admin/sessions/:id/approve", "/api/admin/sessions/:id/approve/"], (req, res) => {
    db.prepare("UPDATE test_sessions SET status = 'in_progress', violation_count = 0 WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.post(["/api/admin/sessions/:id/deny", "/api/admin/sessions/:id/deny/"], (req, res) => {
    db.prepare("UPDATE test_sessions SET status = 'denied', end_time = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.get(["/api/sessions/active/:userId", "/api/sessions/active/:userId/"], (req, res) => {
    const session = db.prepare("SELECT * FROM test_sessions WHERE user_id = ? AND (status = 'in_progress' OR status = 'suspended') ORDER BY start_time DESC LIMIT 1").get(req.params.userId);
    res.json(session || null);
  });

  app.delete(["/api/sessions/:id", "/api/sessions/:id/"], (req, res) => {
    db.prepare("DELETE FROM responses WHERE session_id = ?").run(req.params.id);
    db.prepare("DELETE FROM test_sessions WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  app.get(["/api/sessions/user/:userId", "/api/sessions/user/:userId/"], (req, res) => {
    const sessions = db.prepare(`
      SELECT ts.*, 
      (SELECT COUNT(*) FROM responses r WHERE r.session_id = ts.id) as response_count
      FROM test_sessions ts 
      WHERE ts.user_id = ?
      ORDER BY ts.start_time DESC
    `).all(req.params.userId);
    res.json(sessions);
  });

  // Admin Results
  app.get(["/api/admin/results", "/api/admin/results/"], (req, res) => {
    const results = db.prepare(`
      SELECT ts.*, u.first_name, u.last_name, u.employee_id, u.user_id as username
      FROM test_sessions ts
      JOIN users u ON ts.user_id = u.id
      ORDER BY ts.start_time DESC
    `).all();
    res.json(results);
  });

  app.get(["/api/admin/results/:sessionId", "/api/admin/results/:sessionId/"], (req, res) => {
    const responses = db.prepare(`
      SELECT r.*, q.text as question_text, q.correct_answer as q_correct_answer, q.master_rationale, q.type as q_type
      FROM responses r
      JOIN questions q ON r.question_id = q.id
      WHERE r.session_id = ?
    `).all(req.params.sessionId);
    res.json(responses);
  });

  app.post(["/api/admin/results/:sessionId/publish", "/api/admin/results/:sessionId/publish/"], (req, res) => {
    const { responses } = req.body; // Array of { id, admin_score, admin_explanation_score }
    let totalScore = 0;
    let totalExpScore = 0;

    const updateResponse = db.prepare("UPDATE responses SET admin_score = ?, admin_explanation_score = ? WHERE id = ?");
    
    responses.forEach((r: any) => {
      updateResponse.run(r.admin_score, r.admin_explanation_score, r.id);
      totalScore += (r.admin_score || 0);
      totalExpScore += (r.admin_explanation_score || 0);
    });

    db.prepare("UPDATE test_sessions SET status = 'published', total_score = ?, total_explanation_score = ? WHERE id = ?")
      .run(totalScore, totalExpScore, req.params.sessionId);

    res.json({ success: true });
  });

  // Admin Users
  app.get(["/api/admin/users", "/api/admin/users/"], (req, res) => {
    const users = db.prepare("SELECT id, first_name, last_name, employee_id, user_id, role FROM users").all();
    res.json(users);
  });

  // Activity Logs
  app.post(["/api/logs", "/api/logs/"], (req, res) => {
    const { userId, action, details } = req.body;
    db.prepare("INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)")
      .run(userId, action, details);
    res.json({ success: true });
  });

  app.get(["/api/admin/logs", "/api/admin/logs/"], (req, res) => {
    const logs = db.prepare(`
      SELECT al.*, u.first_name, u.last_name, u.employee_id
      FROM activity_logs al
      JOIN users u ON al.user_id = u.id
      ORDER BY al.timestamp DESC
    `).all();
    res.json(logs);
  });

  app.get(["/api/admin/repository", "/api/admin/repository/"], (req, res) => {
    // Repository view: Last 30 days of everything
    const days = 30;
    const logs = db.prepare(`
      SELECT al.*, u.first_name, u.last_name, u.employee_id
      FROM activity_logs al
      JOIN users u ON al.user_id = u.id
      WHERE al.timestamp >= date('now', '-' || ? || ' days')
      ORDER BY al.timestamp DESC
    `).all(days);

    const sessions = db.prepare(`
      SELECT ts.*, u.first_name, u.last_name, u.employee_id
      FROM test_sessions ts
      JOIN users u ON ts.user_id = u.id
      WHERE ts.start_time >= date('now', '-' || ? || ' days')
      ORDER BY ts.start_time DESC
    `).all(days);

    res.json({ logs, sessions });
  });

  app.delete(["/api/admin/logs", "/api/admin/logs/"], (req, res) => {
    db.prepare("DELETE FROM activity_logs").run();
    res.json({ success: true });
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User as UserIcon, 
  Lock, 
  Shield, 
  ClipboardList, 
  LogOut, 
  Settings, 
  Plus, 
  Trash2, 
  Download, 
  CheckCircle, 
  XCircle,
  Maximize,
  AlertCircle,
  ChevronRight,
  Eye,
  EyeOff,
  Camera,
  AlertTriangle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { User, Question, TestSession, Response, ActivityLog } from './types';
import { QuestionCanvas } from './components/QuestionCanvas';
import { ProctoringWidget } from './components/ProctoringWidget';
import { scoreExplanation } from './services/aiService';

// --- Components ---

const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false, type = 'button' }: any) => {
  const base = "px-6 py-2 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: any = {
    primary: "bg-black text-white hover:bg-zinc-800",
    secondary: "bg-white text-black border border-black hover:bg-zinc-100",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "bg-transparent text-black hover:bg-zinc-100"
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
};

const Input = ({ label, type = 'text', value, onChange, placeholder, required = false, helperText = '' }: any) => (
  <div className="flex flex-col gap-1 w-full">
    {label && <label className="text-sm font-semibold uppercase tracking-wider">{label}</label>}
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="border-2 border-black p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/20 transition-all"
    />
    {helperText && <p className="text-xs text-zinc-500">{helperText}</p>}
  </div>
);

// --- Main App ---

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [view, setView] = useState<'home' | 'login' | 'register' | 'test' | 'admin' | 'results' | 'admin-login' | 'rules' | 'test-complete' | 'suspended'>('home');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBlurred, setIsBlurred] = useState(false);
  const [proctoringWarnings, setProctoringWarnings] = useState(0);
  const [activeSession, setActiveSession] = useState<number | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraRetryKey, setCameraRetryKey] = useState(0);
  const [violationCount, setViolationCount] = useState(0);

  const handleViolation = useCallback(async (reason: string) => {
    if (!activeSession) return;
    
    const data = await safeFetch(`/api/sessions/${activeSession}/violation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });

    if (data.success) {
      setViolationCount(data.count);
      if (data.suspended) {
        setView('suspended');
        setIsCameraActive(false);
        if (document.fullscreenElement) document.exitFullscreen();
        logActivity('TEST_SUSPENDED', `Test suspended due to 5 violations. Reason: ${reason}`);
      } else {
        alert(`Violation ${data.count}/5: ${reason}. Please follow all exam rules.`);
        logActivity('VIOLATION', reason);
      }
    }
  }, [activeSession]);

  const handleProctoringWarning = useCallback((reason: string) => {
    setProctoringWarnings(prev => {
      const newCount = prev + 1;
      alert(`Proctoring Warning: ${reason}. This detail has been documented.`);
      logActivity('PROCTORING_WARNING', reason);
      return newCount;
    });
  }, [activeSession]);

  const handleCameraError = useCallback((error: string) => {
    setCameraError(error);
    setIsCameraActive(false);
    if (view === 'test') {
      alert("CRITICAL ERROR: Camera access lost. The test will be terminated. Please contact Admin.\n\nDetails: " + error);
      setView('home');
      setActiveSession(null);
      if (document.fullscreenElement) document.exitFullscreen();
    }
  }, [view]);

  const inspirationalQuotes = [
    "Hard work beats talent when talent doesn't work hard.",
    "The only place where success comes before work is in the dictionary.",
    "Dreams don't work unless you do.",
    "Success is the sum of small efforts, repeated day in and day out.",
    "There are no shortcuts to any place worth going.",
    "Underwriting excellence is built on precision and persistence."
  ];

  const [currentQuoteIndex, setCurrentQuoteIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentQuoteIndex(prev => (prev + 1) % inspirationalQuotes.length);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Auth States
  const [loginId, setLoginId] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [regData, setRegData] = useState({ firstName: '', lastName: '', employeeId: '', userId: '', password: '' });

  // Admin States
  const [adminTab, setAdminTab] = useState<'questions' | 'results' | 'logs' | 'repository' | 'database' | 'users'>('questions');
  const [repositoryData, setRepositoryData] = useState<{ logs: any[], sessions: any[] }>({ logs: [], sessions: [] });
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [isRestoring, setIsRestoring] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [adminResults, setAdminResults] = useState<TestSession[]>([]);
  const [adminLogs, setAdminLogs] = useState<ActivityLog[]>([]);
  const [userSessions, setUserSessions] = useState<TestSession[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Test States
  const [currentModule, setCurrentModule] = useState(1);
  const [testQuestions, setTestQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [answers, setAnswers] = useState<Record<number, { answer: string, explanation: string }>>({});

  const updateAnswer = (qId: number, field: 'answer' | 'explanation', value: string) => {
    setAnswers(prev => ({
      ...prev,
      [qId]: {
        ...(prev[qId] || { answer: '', explanation: '' }),
        [field]: value
      }
    }));
  };

  // Security
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFull = !!document.fullscreenElement;
      setIsFullscreen(isFull);
      if (!isFull && view === 'test' && activeSession) {
        handleProctoringWarning("Exited full screen mode.");
      }
    };

    const handleBlur = () => {
      if (view === 'test' && activeSession) {
        setIsBlurred(true);
        handleProctoringWarning("Switched tabs or lost window focus.");
      }
    };

    const handleFocus = () => setIsBlurred(false);

    const handleContextMenu = (e: MouseEvent) => {
      if (view === 'test') e.preventDefault();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (view === 'test' && (e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'v' || e.key === 'p' || e.key === 's')) {
        e.preventDefault();
        handleViolation(`Attempted keyboard shortcut: ${e.key}`);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [view, activeSession, handleProctoringWarning]);

  const safeFetch = async (url: string, options?: RequestInit) => {
    try {
      const res = await fetch(url, options);
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        return await res.json();
      }
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      return { success: res.ok };
    } catch (error) {
      console.error(`Fetch error for ${url}:`, error);
      return { error: "Network or server error" };
    }
  };

  const logActivity = async (action: string, details: string) => {
    if (!currentUser) return;
    await safeFetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, action, details })
    });
  };

  const fetchUserSessions = useCallback(async () => {
    if (!currentUser) return;
    const data = await safeFetch(`/api/sessions/user/${currentUser.id}`);
    if (Array.isArray(data)) setUserSessions(data);
  }, [currentUser]);

  useEffect(() => {
    if (view === 'results') fetchUserSessions();
  }, [view, fetchUserSessions]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = await safeFetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: loginId, password: loginPass })
    });
    if (data.success) {
      setCurrentUser(data.user);
      setIsAdmin(data.user.role === 'admin');
      
      // Check for active/suspended session
      const session = await safeFetch(`/api/sessions/active/${data.user.id}`);
      if (session) {
        setActiveSession(session.id);
        setViolationCount(session.violation_count);
        if (session.status === 'suspended') {
          setView('suspended');
        } else {
          setView('home');
        }
      } else {
        setView('home');
      }
      
      logActivity('LOGIN', 'User logged in');
    } else {
      alert(data.error || "Invalid credentials");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!regData.firstName.trim()) return alert("First Name is required");
    if (!regData.lastName.trim()) return alert("Last Name is required");
    if (!regData.employeeId.trim()) return alert("Employee ID is required");
    if (!regData.userId.trim()) return alert("User ID is required");
    
    if (regData.password.length < 6) {
      return alert("Password must be at least 6 characters");
    }
    
    const alphanumericRegex = /^[a-zA-Z0-9]+$/;
    if (!alphanumericRegex.test(regData.password)) {
      return alert("Password must be alphanumeric (letters and numbers only)");
    }

    const data = await safeFetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(regData)
    });
    
    if (data && data.success) {
      alert("Profile created successfully!");
      setView('login');
      setRegData({ firstName: '', lastName: '', employeeId: '', userId: '', password: '' });
    } else {
      let errorMsg = data?.error || "Registration failed";
      if (errorMsg.includes("UNIQUE constraint failed: users.employee_id")) {
        errorMsg = "Employee ID already exists.";
      } else if (errorMsg.includes("UNIQUE constraint failed: users.user_id")) {
        errorMsg = "User ID already exists.";
      }
      alert(errorMsg);
    }
  };

  const startTest = async (module: number) => {
    const allQs = await safeFetch('/api/questions');
    if (!Array.isArray(allQs)) return alert("Failed to load questions.");
    
    const moduleQs = allQs.filter((q: any) => q.module === module);
    if (moduleQs.length === 0) return alert("No questions in this module.");

    setTestQuestions(moduleQs);
    setCurrentModule(module);
    setIsCameraActive(false);
    setCameraError(null);
    setView('rules');
  };

  const proceedToTest = async () => {
    if (!currentUser) {
      alert("Session expired. Please login again.");
      setView('login');
      return;
    }

    setIsStarting(true);
    try {
      // Check for existing active/suspended session
      const existing = await safeFetch(`/api/sessions/active/${currentUser.id}`);
      if (existing && !existing.error) {
        if (existing.status === 'suspended') {
          alert("You have a suspended session. Please contact Admin.");
          setView('suspended');
          return;
        }
        if (existing.status === 'in_progress') {
          if (confirm("You have an active session in progress. Would you like to resume it?")) {
            setActiveSession(existing.id);
            setViolationCount(existing.violation_count);
            // We might need to fetch responses to know where they left off
            const resps = await safeFetch(`/api/admin/results/${existing.id}`);
            if (Array.isArray(resps)) {
              setCurrentQuestionIndex(resps.length);
              // Re-calculate time left if needed, but for now let's just reset or use a default
              setTimeLeft(120 * 60); 
            }
            setView('test');
            return;
          } else {
            // If they don't want to resume, they can't start a new one while one is in progress
            return;
          }
        }
      }

      // Request full screen first
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
      } catch (err) {
        console.error("Fullscreen request failed", err);
        alert("Full screen mode is required to take the test. Please enable it.");
        return;
      }

      const sessionData = await safeFetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser?.id })
      });

      if (sessionData.success) {
        setActiveSession(sessionData.sessionId);
        setCurrentQuestionIndex(0);
        setTimeLeft(120 * 60); // 120 minutes for the entire module
        setAnswers({});
        setProctoringWarnings(0);
        setView('test');
        logActivity('TEST_START', `Started Module ${currentModule}`);
      } else {
        alert(sessionData.error || "Failed to start test session.");
      }
    } catch (err) {
      console.error("Error starting test:", err);
      alert("An unexpected error occurred while starting the test.");
    } finally {
      setIsStarting(false);
    }
  };

  const handleNextQuestion = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    const currentQ = testQuestions[currentQuestionIndex];
    const userAns = answers[currentQ.id] || { answer: '', explanation: '' };

    try {
      // AI Scoring
      const aiResult = await scoreExplanation(userAns.explanation, currentQ.master_rationale);

      await safeFetch(`/api/sessions/${activeSession}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: currentQ.id,
          answer: userAns.answer,
          explanation: userAns.explanation,
          aiScore: aiResult.score || 0
        })
      });

      if (currentQuestionIndex < testQuestions.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
      } else {
        await safeFetch(`/api/sessions/${activeSession}/complete`, { method: 'POST' });
        setView('test-complete');
        setActiveSession(null);
        setIsCameraActive(false);
        if (document.fullscreenElement) document.exitFullscreen();
        logActivity('TEST_COMPLETE', 'Finished test session');
      }
    } catch (error) {
      console.error("Error submitting response:", error);
      alert("There was an error saving your response. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (view === 'test' && timeLeft > 0) {
      const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
      return () => clearInterval(timer);
    } else if (view === 'test' && timeLeft === 0) {
      // Auto-submit current question and end test if time runs out
      const finishTest = async () => {
        await safeFetch(`/api/sessions/${activeSession}/complete`, { method: 'POST' });
        setView('home');
        setActiveSession(null);
        logActivity('TEST_TIMEOUT', 'Test ended due to time limit');
        alert("Time is up! Your test has been submitted.");
      };
      finishTest();
    }
  }, [view, timeLeft]);

  // --- Admin Logic ---

  const fetchAdminData = useCallback(async () => {
    if (adminTab === 'questions') {
      const data = await safeFetch('/api/questions');
      if (Array.isArray(data)) setQuestions(data);
    } else if (adminTab === 'results') {
      const data = await safeFetch('/api/admin/results');
      if (Array.isArray(data)) setAdminResults(data);
    } else if (adminTab === 'logs') {
      const data = await safeFetch('/api/admin/logs');
      if (Array.isArray(data)) setAdminLogs(data);
    } else if (adminTab === 'repository') {
      const data = await safeFetch('/api/admin/repository');
      if (data && !data.error) setRepositoryData(data);
    } else if (adminTab === 'users') {
      const data = await safeFetch('/api/admin/users');
      if (Array.isArray(data)) setAdminUsers(data);
    }
  }, [adminTab]);

  useEffect(() => {
    if (view === 'admin') fetchAdminData();
  }, [view, adminTab, fetchAdminData]);

  const exportToExcel = (data: any[], fileName: string) => {
    const formattedData = data.map(item => {
      const { id, user_id, ...rest } = item;
      return { ID: id, ...rest };
    });
    const ws = XLSX.utils.json_to_sheet(formattedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, `${fileName}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Admin Modals
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Partial<Question> | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewingSession, setReviewingSession] = useState<TestSession | null>(null);
  const [reviewResponses, setReviewResponses] = useState<Response[]>([]);

  const saveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    const method = editingQuestion?.id ? 'PUT' : 'POST';
    const url = editingQuestion?.id ? `/api/questions/${editingQuestion.id}` : '/api/questions';
    
    const data = await safeFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingQuestion)
    });
    if (data.success) {
      setIsQuestionModalOpen(false);
      setEditingQuestion(null);
      fetchAdminData();
    } else {
      alert("Failed to save question.");
    }
  };

  const deleteQuestion = async (id: number) => {
    if (!confirm("Are you sure you want to delete this question?")) return;
    const data = await safeFetch(`/api/questions/${id}`, { method: 'DELETE' });
    if (data.success) fetchAdminData();
  };

  const deleteSession = async (id: number) => {
    if (!confirm("Are you sure you want to delete this test session? This will remove all candidate responses for this session.")) return;
    const data = await safeFetch(`/api/sessions/${id}`, { method: 'DELETE' });
    if (data.success) fetchAdminData();
  };

  const approveSession = async (id: number) => {
    if (!confirm("Approve this session to continue?")) return;
    const res = await safeFetch(`/api/admin/sessions/${id}/approve`, { method: 'POST' });
    if (res.success) {
      alert("Session approved. Candidate can now resume.");
      fetchAdminData();
    }
  };

  const denySession = async (id: number) => {
    if (!confirm("Deny this session? This will terminate the test permanently.")) return;
    const res = await safeFetch(`/api/admin/sessions/${id}/deny`, { method: 'POST' });
    if (res.success) {
      alert("Session denied and terminated.");
      fetchAdminData();
    }
  };

  const openReview = async (session: TestSession) => {
    const data = await safeFetch(`/api/admin/results/${session.id}`);
    if (Array.isArray(data)) {
      setReviewResponses(data);
      setReviewingSession(session);
      setIsReviewModalOpen(true);
    } else {
      alert("Failed to load responses.");
    }
  };

  const publishResults = async () => {
    const data = await safeFetch(`/api/admin/results/${reviewingSession?.id}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responses: reviewResponses })
    });
    if (data.success) {
      setIsReviewModalOpen(false);
      fetchAdminData();
      alert("Results published successfully!");
    } else {
      alert("Failed to publish results.");
    }
  };

  const clearLogs = async () => {
    if (!confirm("Are you sure you want to clear all activity logs? This action cannot be undone.")) return;
    const data = await safeFetch('/api/admin/logs', { method: 'DELETE' });
    if (data.success) {
      fetchAdminData();
      alert("Activity logs cleared.");
    } else {
      alert("Failed to clear logs.");
    }
  };

  const downloadBackup = async () => {
    const data = await safeFetch('/api/admin/backup');
    if (data && !data.error) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prouw_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const restoreBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!confirm("RESTORE DATA: This will overwrite all current data. Are you sure?")) return;

    setIsRestoring(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        const res = await safeFetch('/api/admin/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (res.success) {
          alert("Data restored successfully. Please refresh or re-login.");
          window.location.reload();
        } else {
          alert("Restore failed: " + res.error);
        }
      } catch (err) {
        alert("Invalid backup file.");
      } finally {
        setIsRestoring(false);
      }
    };
    reader.readAsText(file);
  };

  // --- Renderers ---

  if (isBlurred && view === 'test') {
    return (
      <div className="fixed inset-0 bg-white/90 backdrop-blur-xl z-[9999] flex items-center justify-center text-center p-10">
        <div className="max-w-md">
          <AlertCircle size={64} className="mx-auto mb-6 text-red-600" />
          <h1 className="text-3xl font-bold mb-4">FOCUS LOST</h1>
          <p className="text-zinc-600">Please return to the test window immediately. This attempt has been logged.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black selection:bg-black selection:text-white">
      {/* Watermark */}
      {view === 'test' && currentUser && (
        <div className="watermark">{currentUser.first_name} {currentUser.last_name} - {currentUser.employee_id}</div>
      )}

      {/* Header */}
      <header className="border-b-2 border-black p-4 flex justify-between items-center bg-white sticky top-0 z-50">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('home')}>
          <Shield size={32} strokeWidth={3} />
          <span className="text-2xl font-black tracking-tighter uppercase italic">Pro UW</span>
        </div>
        
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => setView('admin-login')} title="Admin Login">
            <Settings size={20} />
          </Button>
          {currentUser && (
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold uppercase">{currentUser.role}</p>
                <p className="text-sm font-medium">{currentUser.first_name} {currentUser.last_name}</p>
              </div>
              <Button variant="ghost" onClick={() => { setCurrentUser(null); setView('home'); setIsCameraActive(false); }}>
                <LogOut size={20} />
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Proctoring Widget - Only for Test */}
      {view === 'test' && currentUser && (
        <ProctoringWidget 
          key={cameraRetryKey}
          userId={currentUser.id} 
          onWarning={handleProctoringWarning} 
          onCameraError={handleCameraError}
          onReady={() => setIsCameraActive(true)}
        />
      )}

      <main className="max-w-6xl mx-auto p-6">
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <h1 className="text-8xl font-black mb-6 tracking-tighter leading-none uppercase">Pro Underwriter</h1>
              
              <motion.div
                key={currentQuoteIndex}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-12 max-w-2xl"
              >
                <p className="text-xl italic text-zinc-400 font-serif">"{inspirationalQuotes[currentQuoteIndex]}"</p>
              </motion.div>

              {!currentUser ? (
                <div className="flex gap-4 mt-12">
                  <Button onClick={() => setView('login')}>LOGIN TO PROFILE</Button>
                  <Button variant="secondary" onClick={() => setView('register')}>CREATE PROFILE</Button>
                </div>
              ) : (
                <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6">
                  {!isAdmin && (
                    <>
                      <div className="border-2 border-black p-8 rounded-2xl text-left">
                        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                          <ClipboardList /> START EXAM
                        </h2>
                        <p className="text-zinc-500 mb-6">Select a module to begin your assessment. Ensure you are in a quiet environment.</p>
                        <div className="grid grid-cols-5 gap-2">
                          {[1, 2, 3, 4, 5].map(m => (
                            <button 
                              key={m}
                              onClick={() => startTest(m)}
                              className="aspect-square border-2 border-black rounded-lg flex items-center justify-center font-bold hover:bg-black hover:text-white transition-colors"
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="border-2 border-black p-8 rounded-2xl text-left">
                        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                          <CheckCircle /> MY RESULTS
                        </h2>
                        <p className="text-zinc-500 mb-6">View your published scores and feedback from administrators.</p>
                        <Button variant="secondary" onClick={() => setView('results')} className="w-full">VIEW RESULTS HISTORY</Button>
                      </div>
                    </>
                  )}

                  {isAdmin && (
                    <div className="md:col-span-2 border-2 border-black p-8 rounded-2xl text-left bg-black text-white">
                      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                        <Settings /> ADMIN DASHBOARD
                      </h2>
                      <p className="text-zinc-400 mb-6">Manage questions, review test results, and monitor activity logs.</p>
                      <Button variant="secondary" onClick={() => setView('admin')} className="w-full bg-white text-black">ENTER ADMIN PANEL</Button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {view === 'login' && (
            <motion.div key="login" className="max-w-md mx-auto py-20">
              <h2 className="text-4xl font-black mb-8 tracking-tighter">LOGIN</h2>
              <form onSubmit={handleLogin} className="flex flex-col gap-6">
                <Input label="User ID" value={loginId} onChange={setLoginId} required />
                <Input label="Password" type="password" value={loginPass} onChange={setLoginPass} required />
                <Button type="submit" className="w-full">SIGN IN</Button>
                <button type="button" onClick={() => setView('register')} className="text-sm font-bold underline">Don't have an account? Register</button>
              </form>
            </motion.div>
          )}

          {view === 'register' && (
            <motion.div key="register" className="max-w-md mx-auto py-10">
              <h2 className="text-4xl font-black mb-8 tracking-tighter">CREATE PROFILE</h2>
              <form onSubmit={handleRegister} className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input label="First Name" value={regData.firstName} onChange={(v: string) => setRegData({...regData, firstName: v})} required />
                  <Input label="Last Name" value={regData.lastName} onChange={(v: string) => setRegData({...regData, lastName: v})} required />
                </div>
                <Input label="Employee ID" value={regData.employeeId} onChange={(v: string) => setRegData({...regData, employeeId: v})} required />
                <Input label="User ID" value={regData.userId} onChange={(v: string) => setRegData({...regData, userId: v})} required />
                <Input 
                  label="Password" 
                  type="password" 
                  value={regData.password} 
                  onChange={(v: string) => setRegData({...regData, password: v})} 
                  required 
                  helperText="Minimum 6 characters. Alphanumeric allowed."
                />
                <Button type="submit" className="w-full mt-4">CREATE PROFILE</Button>
                <button type="button" onClick={() => setView('login')} className="text-sm font-bold underline">Already have an account? Login</button>
              </form>
            </motion.div>
          )}

          {view === 'admin-login' && (
            <motion.div key="admin-login" className="max-w-md mx-auto py-20">
              <h2 className="text-4xl font-black mb-8 tracking-tighter">ADMIN ACCESS</h2>
              <form onSubmit={handleLogin} className="flex flex-col gap-6">
                <Input label="Admin Username" value={loginId} onChange={setLoginId} required />
                <Input label="Admin Password" type="password" value={loginPass} onChange={setLoginPass} required />
                <Button type="submit" className="w-full">AUTHENTICATE</Button>
              </form>
            </motion.div>
          )}

          {view === 'rules' && (
            <motion.div key="rules" className="max-w-2xl mx-auto py-10">
              <div className="border-4 border-black p-10 rounded-3xl bg-white shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
                <h2 className="text-5xl font-black mb-8 tracking-tighter uppercase italic">Rules of Engagement</h2>
                
                <div className="space-y-6 text-lg">
                  <div className="flex gap-4 items-start">
                    <div className="bg-black text-white p-2 rounded-lg shrink-0"><Maximize size={24} /></div>
                    <div>
                      <p className="font-bold uppercase text-sm tracking-widest">Full Screen Mode</p>
                      <p className="text-zinc-600">The examination must be conducted in full-screen mode. Exiting full-screen will trigger a proctoring alert.</p>
                    </div>
                  </div>

                  <div className="flex gap-4 items-start">
                    <div className="bg-black text-white p-2 rounded-lg shrink-0"><Eye size={24} /></div>
                    <div>
                      <p className="font-bold uppercase text-sm tracking-widest">AI Proctoring</p>
                      <p className="text-zinc-600">Your camera and browser activity are monitored by AI. Malpractice detection is active throughout the session.</p>
                    </div>
                  </div>

                  <div className="flex gap-4 items-start">
                    <div className="bg-black text-white p-2 rounded-lg shrink-0"><Lock size={24} /></div>
                    <div>
                      <p className="font-bold uppercase text-sm tracking-widest">Security Protocol</p>
                      <p className="text-zinc-600">Copy-paste, right-click, and keyboard shortcuts are disabled. Tab switching is strictly prohibited.</p>
                    </div>
                  </div>

                  <div className="flex gap-4 items-start">
                    <div className="bg-black text-white p-2 rounded-lg shrink-0"><ClipboardList size={24} /></div>
                    <div>
                      <p className="font-bold uppercase text-sm tracking-widest">Duration</p>
                      <p className="text-zinc-600">You have 120 minutes to complete all questions in this module. The timer is global.</p>
                    </div>
                  </div>
                </div>

                <div className="mt-12 pt-8 border-t-2 border-zinc-100 flex flex-col gap-4">
                  <p className="text-sm text-zinc-400 italic">By proceeding, you acknowledge that you have read and understood the rules above.</p>
                  <Button 
                    onClick={proceedToTest} 
                    className="w-full text-xl py-4"
                    disabled={isStarting}
                  >
                    {isStarting ? "STARTING..." : "I UNDERSTAND, START EXAM"}
                  </Button>
                  <Button variant="ghost" onClick={() => setView('home')} className="w-full">BACK TO HOME</Button>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'test' && (
            <motion.div key="test" className="py-10">
              {!isFullscreen ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <Maximize size={64} className="mb-6" />
                  <h2 className="text-3xl font-black mb-4">FULL SCREEN REQUIRED</h2>
                  <p className="text-zinc-500 mb-8">The exam can only be taken in full screen mode to ensure integrity.</p>
                  <Button onClick={() => document.documentElement.requestFullscreen()}>ENTER FULL SCREEN</Button>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto">
                  <div className="flex justify-between items-center mb-8">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Module {currentModule}</p>
                      <h2 className="text-2xl font-bold">Question {currentQuestionIndex + 1} of {testQuestions.length}</h2>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-bold ${proctoringWarnings === 0 ? 'bg-zinc-100 text-zinc-600 border-zinc-200' : proctoringWarnings >= 3 ? 'bg-red-100 text-red-700 border-red-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                        <AlertTriangle size={16} />
                        VIOLATIONS: {proctoringWarnings}/3
                      </div>
                      <div className={`px-6 py-2 rounded-full border-2 border-black font-mono text-xl ${timeLeft < 10 ? 'bg-red-600 text-white animate-pulse' : ''}`}>
                        {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                      </div>
                    </div>
                  </div>

                  <div className="mb-10 no-select">
                    <QuestionCanvas text={testQuestions[currentQuestionIndex].text} className="mb-8" />
                    
                    <div className="space-y-6">
                      {testQuestions[currentQuestionIndex].type === 'mcq' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {testQuestions[currentQuestionIndex].options?.map((opt, idx) => (
                            <button
                              key={idx}
                              onClick={() => updateAnswer(testQuestions[currentQuestionIndex].id, 'answer', String.fromCharCode(97 + idx))}
                              className={`p-4 border-2 rounded-xl text-left transition-all ${answers[testQuestions[currentQuestionIndex].id]?.answer === String.fromCharCode(97 + idx) ? 'bg-black text-white border-black' : 'border-zinc-200 hover:border-black'}`}
                            >
                              <span className="font-bold mr-2 uppercase">{String.fromCharCode(97 + idx)}.</span> {opt}
                            </button>
                          ))}
                        </div>
                      )}

                      {testQuestions[currentQuestionIndex].type === 'yesno' && (
                        <div className="flex gap-4">
                          {['Yes', 'No'].map(opt => (
                            <button
                              key={opt}
                              onClick={() => updateAnswer(testQuestions[currentQuestionIndex].id, 'answer', opt)}
                              className={`flex-1 p-4 border-2 rounded-xl text-center font-bold transition-all ${answers[testQuestions[currentQuestionIndex].id]?.answer === opt ? 'bg-black text-white border-black' : 'border-zinc-200 hover:border-black'}`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}

                      {testQuestions[currentQuestionIndex].type === 'specific' && (
                        <div className="w-full">
                          <input 
                            type={testQuestions[currentQuestionIndex].format === 'Number' ? 'number' : 'text'}
                            placeholder={`Enter ${testQuestions[currentQuestionIndex].format} response...`}
                            value={answers[testQuestions[currentQuestionIndex].id]?.answer || ''}
                            onChange={(e) => updateAnswer(testQuestions[currentQuestionIndex].id, 'answer', e.target.value)}
                            className="w-full p-4 border-2 border-black rounded-xl focus:outline-none"
                          />
                        </div>
                      )}

                      <div className="mt-8">
                        <label className="text-sm font-bold uppercase tracking-wider mb-2 block">Explanation / Rationale</label>
                        <textarea
                          rows={4}
                          value={answers[testQuestions[currentQuestionIndex].id]?.explanation || ''}
                          onChange={(e) => updateAnswer(testQuestions[currentQuestionIndex].id, 'explanation', e.target.value)}
                          placeholder="Provide your reasoning for the above answer..."
                          className="w-full p-4 border-2 border-black rounded-xl focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={handleNextQuestion} disabled={isSubmitting} className="w-full sm:w-auto">
                      {isSubmitting ? 'PROCESSING...' : (currentQuestionIndex === testQuestions.length - 1 ? 'FINISH EXAM' : 'NEXT QUESTION')} <ChevronRight size={20} />
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {view === 'test-complete' && (
            <motion.div key="test-complete" className="max-w-2xl mx-auto py-20 text-center">
              <div className="border-4 border-black p-12 rounded-3xl bg-white shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
                <CheckCircle size={80} className="mx-auto mb-6 text-green-600" />
                <h2 className="text-5xl font-black mb-4 tracking-tighter uppercase italic">Exam Submitted</h2>
                <p className="text-2xl font-bold mb-8">Results Awaited</p>
                <p className="text-zinc-500 mb-10 leading-relaxed">
                  Your responses have been securely transmitted for evaluation. 
                  Please come back later and check your results in the <strong>"My Results"</strong> section of your dashboard.
                </p>
                <Button onClick={() => setView('home')} className="w-full text-xl py-4">RETURN TO DASHBOARD</Button>
              </div>
            </motion.div>
          )}

          {view === 'suspended' && (
            <motion.div key="suspended" className="max-w-2xl mx-auto py-20 text-center">
              <div className="border-4 border-black p-12 rounded-3xl bg-white shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
                <AlertTriangle size={80} className="mx-auto mb-6 text-red-600" />
                <h2 className="text-5xl font-black mb-4 tracking-tighter uppercase italic">Exam Suspended</h2>
                <p className="text-2xl font-bold mb-8">Violation Limit Reached</p>
                <p className="text-zinc-500 mb-10 leading-relaxed">
                  Your exam session has been suspended due to multiple violations of the examination rules. 
                  Please contact the <strong>Administrator</strong> immediately to review your case.
                </p>
                <div className="p-6 bg-zinc-50 rounded-2xl border-2 border-black mb-8">
                  <p className="text-sm font-bold uppercase text-zinc-400 mb-1">Current Status</p>
                  <p className="text-xl font-black text-red-600 uppercase">Awaiting Admin Review</p>
                </div>
                <div className="flex flex-col gap-4">
                  <Button onClick={async () => {
                    const session = await safeFetch(`/api/sessions/active/${currentUser?.id}`);
                    if (session && session.status === 'in_progress') {
                      alert("Your session has been approved! You can now continue.");
                      setView('home');
                    } else if (session && session.status === 'denied') {
                      alert("Your session has been denied and terminated.");
                      setView('home');
                      setActiveSession(null);
                    } else {
                      alert("Your session is still awaiting review.");
                    }
                  }} className="w-full text-xl py-4">CHECK REVIEW STATUS</Button>
                  <Button variant="secondary" onClick={() => setView('home')} className="w-full text-xl py-4">RETURN TO DASHBOARD</Button>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'results' && (
            <motion.div key="results" className="py-10">
              <h2 className="text-4xl font-black mb-8 tracking-tighter">MY TEST HISTORY</h2>
              <div className="space-y-4">
                {userSessions.length === 0 ? (
                  <div className="text-center py-10 text-zinc-400 italic">No test history found.</div>
                ) : (
                  userSessions.map(session => (
                    <div key={session.id} className="border-2 border-black p-6 rounded-2xl flex justify-between items-center">
                      <div>
                        <p className="text-xs font-bold text-zinc-500 uppercase">{new Date(session.start_time).toLocaleDateString()}</p>
                        <h3 className="text-xl font-bold">Session #{session.id}</h3>
                        <p className="text-sm">Status: <span className={`uppercase font-bold ${session.status === 'published' ? 'text-green-600' : 'text-zinc-400'}`}>{session.status}</span></p>
                      </div>
                      {session.status === 'published' ? (
                        <div className="text-right">
                          <p className="text-xs uppercase font-bold text-zinc-500">Total Score</p>
                          <p className="text-3xl font-black">{((session.total_score || 0) + (session.total_explanation_score || 0)).toFixed(1)}</p>
                        </div>
                      ) : (
                        <div className="text-zinc-400 italic text-sm">Awaiting review...</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {view === 'admin' && (
            <motion.div key="admin" className="py-10">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-4xl font-black tracking-tighter">ADMIN PANEL</h2>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  <Button variant={adminTab === 'questions' ? 'primary' : 'ghost'} onClick={() => setAdminTab('questions')}>Question Bank</Button>
                  <Button variant={adminTab === 'results' ? 'primary' : 'ghost'} onClick={() => setAdminTab('results')}>Test Results</Button>
                  <Button variant={adminTab === 'logs' ? 'primary' : 'ghost'} onClick={() => setAdminTab('logs')}>Activity Log</Button>
                  <Button variant={adminTab === 'repository' ? 'primary' : 'ghost'} onClick={() => setAdminTab('repository')}>30-Day Repository</Button>
                  <Button variant={adminTab === 'users' ? 'primary' : 'ghost'} onClick={() => setAdminTab('users')}>Users</Button>
                  <Button variant={adminTab === 'database' ? 'primary' : 'ghost'} onClick={() => setAdminTab('database')}>Database</Button>
                </div>
              </div>

              {adminTab === 'questions' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-bold">Question Repository</h3>
                    <Button onClick={() => { setEditingQuestion({ type: 'mcq', module: 1, time_limit: 60 }); setIsQuestionModalOpen(true); }}><Plus size={20} /> Add Question</Button>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {questions.map(q => (
                      <div key={q.id} className="border-2 border-black p-6 rounded-2xl flex justify-between items-start">
                        <div>
                          <p className="text-xs font-bold uppercase text-zinc-500">Module {q.module} • {q.type}</p>
                          <p className="font-medium mt-1">{q.text}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" className="p-2" onClick={() => { setEditingQuestion(q); setIsQuestionModalOpen(true); }}><ChevronRight size={18} /></Button>
                          <Button variant="ghost" className="p-2 text-red-600" onClick={() => deleteQuestion(q.id)}><Trash2 size={18} /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {adminTab === 'results' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-bold">Candidate Responses</h3>
                    <Button variant="secondary" onClick={() => exportToExcel(adminResults, 'Test_Results')}><Download size={20} /> Export Excel</Button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b-2 border-black text-left">
                          <th className="p-4 uppercase text-xs font-black">Candidate</th>
                          <th className="p-4 uppercase text-xs font-black">Module</th>
                          <th className="p-4 uppercase text-xs font-black">Status</th>
                          <th className="p-4 uppercase text-xs font-black">Violations</th>
                          <th className="p-4 uppercase text-xs font-black">Score</th>
                          <th className="p-4 uppercase text-xs font-black">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminResults.map(res => (
                          <tr key={res.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                            <td className="p-4">
                              <p className="font-bold">{res.first_name} {res.last_name}</p>
                              <p className="text-xs text-zinc-500">{res.employee_id}</p>
                            </td>
                            <td className="p-4 font-medium">Module {res.id}</td>
                            <td className="p-4">
                              <span className={`text-[10px] font-black uppercase px-2 py-1 rounded ${res.status === 'published' ? 'bg-green-100 text-green-700' : (res.status === 'suspended' ? 'bg-red-100 text-red-700' : 'bg-zinc-100 text-zinc-600')}`}>
                                {res.status}
                              </span>
                            </td>
                            <td className="p-4">
                              <span className={`font-bold ${res.violation_count >= 5 ? 'text-red-600' : ''}`}>
                                {res.violation_count}
                              </span>
                            </td>
                            <td className="p-4 font-bold">{res.total_score + res.total_explanation_score}</td>
                            <td className="p-4">
                              <div className="flex gap-2">
                                {res.status === 'suspended' && (
                                  <>
                                    <Button variant="primary" className="px-3 py-1 text-[10px]" onClick={() => approveSession(res.id)}>Approve</Button>
                                    <Button variant="danger" className="px-3 py-1 text-[10px]" onClick={() => denySession(res.id)}>Deny</Button>
                                  </>
                                )}
                                <Button variant="ghost" className="p-2" onClick={() => openReview(res)}><Eye size={18} /></Button>
                                <Button variant="ghost" className="p-2 text-red-600" onClick={() => deleteSession(res.id)}><Trash2 size={18} /></Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {adminTab === 'logs' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-bold">Activity Audit (Full History)</h3>
                    <div className="flex gap-2">
                      <Button variant="danger" onClick={clearLogs}><Trash2 size={20} /> Clear All Logs</Button>
                      <Button variant="secondary" onClick={() => exportToExcel(adminLogs, 'Activity_Logs')}><Download size={20} /> Export Excel</Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {adminLogs.map(log => (
                      <div key={log.id} className="text-sm p-3 border-l-4 border-black bg-zinc-50 flex justify-between">
                        <div>
                          <span className="font-bold uppercase text-[10px] bg-black text-white px-1.5 py-0.5 mr-2">{log.action}</span>
                          <span className="font-medium">{log.first_name} {log.last_name}</span>
                          <span className="text-zinc-500 ml-2">— {log.details}</span>
                        </div>
                        <span className="text-zinc-400 font-mono text-xs">{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {adminTab === 'repository' && (
                <div className="space-y-10">
                  <div className="bg-zinc-900 text-white p-8 rounded-3xl">
                    <h3 className="text-2xl font-black mb-2 uppercase italic tracking-tighter">30-Day Data Repository</h3>
                    <p className="text-zinc-400">This view maintains a snapshot of all activity and test sessions from the last 30 days for compliance and audit purposes.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <h4 className="text-sm font-black uppercase border-b-2 border-black pb-2">Recent Activity Logs</h4>
                      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                        {repositoryData.logs.map(log => (
                          <div key={log.id} className="p-3 bg-zinc-50 rounded-xl border border-zinc-200">
                            <div className="flex justify-between items-start mb-1">
                              <span className="text-[10px] font-black uppercase text-zinc-400">{new Date(log.timestamp).toLocaleDateString()}</span>
                              <span className="text-[10px] font-black uppercase bg-black text-white px-1.5 rounded">{log.action}</span>
                            </div>
                            <p className="text-xs font-bold">{log.first_name} {log.last_name}</p>
                            <p className="text-[10px] text-zinc-500 truncate">{log.details}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-sm font-black uppercase border-b-2 border-black pb-2">Recent Test Sessions</h4>
                      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                        {repositoryData.sessions.map(s => (
                          <div key={s.id} className="p-3 bg-zinc-50 rounded-xl border border-zinc-200">
                            <div className="flex justify-between items-start mb-1">
                              <span className="text-[10px] font-black uppercase text-zinc-400">{new Date(s.start_time).toLocaleDateString()}</span>
                              <span className={`text-[10px] font-black uppercase px-1.5 rounded ${s.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-zinc-200 text-zinc-600'}`}>{s.status}</span>
                            </div>
                            <p className="text-xs font-bold">{s.first_name} {s.last_name}</p>
                            <p className="text-[10px] text-zinc-500">Score: {s.total_score + s.total_explanation_score}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {adminTab === 'users' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-bold">User Profiles</h3>
                    <p className="text-sm text-zinc-500 italic">User profiles are maintained permanently for audit integrity.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {adminUsers.map(user => (
                      <div key={user.id} className="border-2 border-black p-4 rounded-2xl bg-white">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 bg-zinc-100 rounded-full flex items-center justify-center">
                            <UserIcon size={20} />
                          </div>
                          <div>
                            <p className="font-bold leading-tight">{user.first_name} {user.last_name}</p>
                            <p className="text-[10px] font-black uppercase text-zinc-400">{user.role}</p>
                          </div>
                        </div>
                        <div className="space-y-1 text-xs">
                          <p><span className="font-bold uppercase text-[9px] text-zinc-400">Employee ID:</span> {user.employee_id}</p>
                          <p><span className="font-bold uppercase text-[9px] text-zinc-400">Username:</span> {user.user_id}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {adminTab === 'database' && (
                <div className="max-w-2xl mx-auto py-10">
                  <div className="border-4 border-black p-10 rounded-3xl bg-white shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
                    <Settings size={48} className="mb-6" />
                    <h3 className="text-3xl font-black mb-2 uppercase italic tracking-tighter">Database Management</h3>
                    <p className="text-zinc-500 mb-8">
                      Since the application runs in a secure, ephemeral environment, data may be lost upon system restarts. 
                      Use these tools to manually backup and restore your entire database.
                    </p>

                    <div className="space-y-4">
                      <div className="p-6 bg-zinc-50 rounded-2xl border-2 border-zinc-200">
                        <h4 className="font-bold mb-2">Backup Data</h4>
                        <p className="text-sm text-zinc-500 mb-4">Download a JSON snapshot of all users, questions, results, and logs.</p>
                        <Button onClick={downloadBackup} className="w-full"><Download size={20} /> DOWNLOAD BACKUP (.JSON)</Button>
                      </div>

                      <div className="p-6 bg-zinc-50 rounded-2xl border-2 border-zinc-200">
                        <h4 className="font-bold mb-2">Restore Data</h4>
                        <p className="text-sm text-zinc-500 mb-4">Upload a previously downloaded backup file to restore all data. <strong>Warning: This overwrites current data!</strong></p>
                        <div className="relative">
                          <input 
                            type="file" 
                            accept=".json" 
                            onChange={restoreBackup}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            disabled={isRestoring}
                          />
                          <Button variant="secondary" className="w-full" disabled={isRestoring}>
                            {isRestoring ? 'RESTORING...' : 'UPLOAD & RESTORE BACKUP'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Question Modal */}
              {isQuestionModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                  <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white border-2 border-black p-8 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                    <h3 className="text-2xl font-black mb-6 uppercase tracking-tighter">{editingQuestion?.id ? 'Edit' : 'Add'} Question</h3>
                    <form onSubmit={saveQuestion} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-bold uppercase">Type</label>
                          <select 
                            className="border-2 border-black p-2 rounded-lg"
                            value={editingQuestion?.type || 'mcq'}
                            onChange={e => setEditingQuestion({...editingQuestion, type: e.target.value as any})}
                          >
                            <option value="mcq">Multiple Choice</option>
                            <option value="yesno">Yes / No</option>
                            <option value="specific">Specific Answer</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-bold uppercase">Module (1-5)</label>
                          <input type="number" min="1" max="5" className="border-2 border-black p-2 rounded-lg" value={editingQuestion?.module || 1} onChange={e => setEditingQuestion({...editingQuestion, module: parseInt(e.target.value)})} />
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold uppercase">Question Text</label>
                        <textarea className="border-2 border-black p-2 rounded-lg" rows={3} value={editingQuestion?.text || ''} onChange={e => setEditingQuestion({...editingQuestion, text: e.target.value})} required />
                      </div>

                      {editingQuestion?.type === 'mcq' && (
                        <div className="grid grid-cols-2 gap-2">
                          {['a', 'b', 'c', 'd'].map((opt, i) => (
                            <div key={opt} className="flex flex-col gap-1">
                              <label className="text-xs font-bold uppercase">Option {opt.toUpperCase()}</label>
                              <input className="border-2 border-black p-2 rounded-lg" value={editingQuestion?.options?.[i] || ''} onChange={e => {
                                const newOpts = [...(editingQuestion?.options || ['', '', '', ''])];
                                newOpts[i] = e.target.value;
                                setEditingQuestion({...editingQuestion, options: newOpts});
                              }} />
                            </div>
                          ))}
                        </div>
                      )}

                      {editingQuestion?.type === 'specific' && (
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-bold uppercase">Expected Format</label>
                          <select className="border-2 border-black p-2 rounded-lg" value={editingQuestion?.format || 'Text'} onChange={e => setEditingQuestion({...editingQuestion, format: e.target.value as any})}>
                            <option value="Text">Text</option>
                            <option value="Number">Number</option>
                          </select>
                        </div>
                      )}

                      <div className="grid grid-cols-1 gap-4">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-bold uppercase">Correct Answer</label>
                          <input className="border-2 border-black p-2 rounded-lg" value={editingQuestion?.correct_answer || ''} onChange={e => setEditingQuestion({...editingQuestion, correct_answer: e.target.value})} required />
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold uppercase">Master Rationale (for AI Scoring)</label>
                        <textarea className="border-2 border-black p-2 rounded-lg" rows={3} value={editingQuestion?.master_rationale || ''} onChange={e => setEditingQuestion({...editingQuestion, master_rationale: e.target.value})} required />
                      </div>

                      <div className="flex gap-2 pt-4">
                        <Button type="submit" className="flex-1">SAVE QUESTION</Button>
                        <Button variant="secondary" onClick={() => setIsQuestionModalOpen(false)}>CANCEL</Button>
                      </div>
                    </form>
                  </motion.div>
                </div>
              )}

              {/* Review Modal */}
              {isReviewModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                  <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white border-2 border-black p-8 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h3 className="text-2xl font-black uppercase tracking-tighter">Review Results</h3>
                        <p className="text-sm font-bold text-zinc-500">{reviewingSession?.first_name} {reviewingSession?.last_name} • {reviewingSession?.employee_id}</p>
                      </div>
                      <Button variant="ghost" onClick={() => setIsReviewModalOpen(false)}><XCircle /></Button>
                    </div>

                    <div className="space-y-8">
                      {reviewResponses.map((resp, idx) => (
                        <div key={resp.id} className="border-b-2 border-zinc-100 pb-8">
                          <div className="flex justify-between items-start mb-4">
                            <h4 className="font-bold">Q{idx + 1}: {resp.question_text}</h4>
                            <div className="text-right">
                              <p className="text-[10px] font-black uppercase text-zinc-400">AI Suggested Score</p>
                              <p className="font-mono font-bold">{resp.ai_explanation_score}%</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                            <div className="bg-zinc-50 p-4 rounded-xl">
                              <p className="text-[10px] font-black uppercase text-zinc-400 mb-2">User Answer</p>
                              <p className="font-medium">{resp.answer}</p>
                              <p className="text-xs mt-2 text-zinc-500">Correct: <span className="font-bold text-black">{resp.q_correct_answer}</span></p>
                            </div>
                            <div className="bg-zinc-50 p-4 rounded-xl">
                              <p className="text-[10px] font-black uppercase text-zinc-400 mb-2">User Explanation</p>
                              <p className="text-sm italic">"{resp.explanation}"</p>
                            </div>
                          </div>

                          <div className="bg-zinc-900 text-white p-4 rounded-xl mb-4">
                            <p className="text-[10px] font-black uppercase text-zinc-500 mb-2">Master Rationale</p>
                            <p className="text-sm">{resp.master_rationale}</p>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-black uppercase">Answer Score (0 or 1)</label>
                              <input 
                                type="number" min="0" max="1" 
                                className="border-2 border-black p-2 rounded-lg text-black" 
                                value={resp.admin_score ?? (resp.answer === resp.q_correct_answer ? 1 : 0)} 
                                onChange={e => {
                                  const newResps = [...reviewResponses];
                                  newResps[idx].admin_score = parseInt(e.target.value);
                                  setReviewResponses(newResps);
                                }}
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-black uppercase">Explanation Score (%)</label>
                              <input 
                                type="number" min="0" max="100" 
                                className="border-2 border-black p-2 rounded-lg text-black" 
                                value={resp.admin_explanation_score ?? resp.ai_explanation_score} 
                                onChange={e => {
                                  const newResps = [...reviewResponses];
                                  newResps[idx].admin_explanation_score = parseInt(e.target.value);
                                  setReviewResponses(newResps);
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-4 mt-10">
                      <Button onClick={publishResults} className="flex-1">PUBLISH FINAL SCORES</Button>
                      <Button variant="secondary" onClick={() => setIsReviewModalOpen(false)}>CLOSE</Button>
                    </div>
                  </motion.div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

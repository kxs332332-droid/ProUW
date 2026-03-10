export interface User {
  id: number;
  first_name: string;
  last_name: string;
  employee_id: string;
  user_id: string;
  role: 'user' | 'admin';
}

export interface Question {
  id: number;
  type: 'mcq' | 'yesno' | 'specific';
  text: string;
  options: string[] | null;
  correct_answer: string;
  master_rationale: string;
  format: 'Text' | 'Number' | null;
  module: number;
  time_limit: number;
}

export interface TestSession {
  id: number;
  user_id: number;
  module: number;
  total_questions: number;
  start_time: string;
  end_time: string | null;
  status: 'in_progress' | 'completed' | 'published' | 'suspended' | 'denied';
  total_score: number;
  total_explanation_score: number;
  violation_count: number;
  first_name?: string;
  last_name?: string;
  employee_id?: string;
  username?: string;
  response_count?: number;
}

export interface Response {
  id: number;
  session_id: number;
  question_id: number;
  answer: string;
  explanation: string;
  ai_explanation_score: number;
  admin_score: number | null;
  admin_explanation_score: number | null;
  question_text?: string;
  q_correct_answer?: string;
  master_rationale?: string;
  q_type?: string;
}

export interface ActivityLog {
  id: number;
  user_id: number;
  action: string;
  timestamp: string;
  details: string;
  first_name?: string;
  last_name?: string;
  employee_id?: string;
}

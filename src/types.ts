export interface User {
  id: string;
  first_name: string;
  last_name: string;
  employee_id: string;
  user_id: string;
  role: 'user' | 'admin';
}

export interface SubQuestion {
  id: string;
  text: string;
  type: 'mcq' | 'yesno' | 'specific';
  options: string[] | null;
  correct_answer: string;
}

export interface Question {
  id: string;
  type: 'mcq' | 'yesno' | 'specific' | 'testcase' | 'pdf-assessment';
  text: string;
  options: string[] | null;
  correct_answer: string;
  master_rationale: string;
  format: 'Text' | 'Number' | null;
  module: number;
  time_limit: number;
  sub_questions?: SubQuestion[];
  pdf_url?: string;
}

export interface TestSession {
  id: string;
  user_id: string;
  module: number;
  total_questions: number;
  start_time: any; // Firestore Timestamp
  end_time: any | null;
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
  id: string;
  session_id: string;
  question_id: string;
  answer: string;
  explanation: string;
  ai_explanation_score: number;
  admin_score: number | null;
  admin_explanation_score: number | null;
  question_text?: string;
  q_correct_answer?: string;
  master_rationale?: string;
  q_type?: string;
  q_sub_questions?: SubQuestion[];
  sub_answers?: { [subId: string]: string };
}

export interface ActivityLog {
  id: string;
  user_id: string;
  action: string;
  timestamp: any; // Firestore Timestamp
  details: string;
  first_name?: string;
  last_name?: string;
  employee_id?: string;
}

export interface Resource {
  id: string;
  name: string;
  url: string;
  type: string;
  timestamp: any;
}

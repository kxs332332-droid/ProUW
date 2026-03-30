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
  AlertTriangle,
  Search,
  Send,
  X,
  FileText,
  Edit,
  Calculator as CalcIcon
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { GoogleGenAI } from "@google/genai";
import { User, Question, TestSession, Response, ActivityLog, Resource } from './types';
import { QuestionCanvas } from './components/QuestionCanvas';
import { ProctoringWidget } from './components/ProctoringWidget';
import { Calculator } from './components/Calculator';
import { ResourceViewer } from './components/ResourceViewer';
import { scoreExplanation, getApiKey } from './services/aiService';
import questionsData from './questions.json';
import { auth, db, storage } from './firebase';
import { handleFirestoreError, OperationType } from './utils/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot,
  Timestamp,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';

const ai = new GoogleGenAI({ apiKey: getApiKey() });

// --- Console Log Capture for Debugging ---
const capturedLogs: any[] = [];
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

console.log = (...args) => {
  capturedLogs.push({ type: 'log', message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '), time: new Date().toLocaleTimeString() });
  if (capturedLogs.length > 100) capturedLogs.shift();
  originalLog.apply(console, args);
};
console.warn = (...args) => {
  capturedLogs.push({ type: 'warn', message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '), time: new Date().toLocaleTimeString() });
  if (capturedLogs.length > 100) capturedLogs.shift();
  originalWarn.apply(console, args);
};
console.error = (...args) => {
  capturedLogs.push({ type: 'error', message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '), time: new Date().toLocaleTimeString() });
  if (capturedLogs.length > 100) capturedLogs.shift();
  originalError.apply(console, args);
};

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
      value={value === undefined || value === null || (typeof value === 'number' && isNaN(value)) ? '' : value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="border-2 border-black p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/20 transition-all"
    />
    {helperText && <p className="text-xs text-zinc-500">{helperText}</p>}
  </div>
);

const Dialog = ({ isOpen, title, message, onConfirm, onCancel, type = 'alert' }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white border-4 border-black p-8 rounded-3xl max-w-md w-full shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]"
      >
        <h3 className="text-2xl font-black mb-2 uppercase italic tracking-tighter">{title}</h3>
        <p className="text-zinc-600 mb-8 font-medium">{message}</p>
        <div className="flex gap-4">
          {type === 'confirm' && (
            <Button variant="secondary" onClick={onCancel} className="flex-1">Cancel</Button>
          )}
          <Button onClick={onConfirm} className="flex-1">{type === 'confirm' ? 'Confirm' : 'OK'}</Button>
        </div>
      </motion.div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [view, setView] = useState<'home' | 'login' | 'register' | 'test' | 'admin' | 'results' | 'admin-login' | 'rules' | 'test-complete' | 'suspended'>('home');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBlurred, setIsBlurred] = useState(false);
  const [proctoringWarnings, setProctoringWarnings] = useState(0);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraRetryKey, setCameraRetryKey] = useState(0);
  const [violationCount, setViolationCount] = useState(0);
  const [dialog, setDialog] = useState<{ isOpen: boolean; title: string; message: string; onConfirm?: () => void; type: 'alert' | 'confirm' }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'alert'
  });

  const showAlert = (title: string, message: string) => {
    setDialog({ isOpen: true, title, message, type: 'alert', onConfirm: () => setDialog(prev => ({ ...prev, isOpen: false })) });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => {
    setDialog({ 
      isOpen: true, 
      title, 
      message, 
      type: 'confirm', 
      onConfirm: () => {
        onConfirm();
        setDialog(prev => ({ ...prev, isOpen: false }));
      },
      onCancel: () => {
        if (onCancel) onCancel();
        setDialog(prev => ({ ...prev, isOpen: false }));
      }
    } as any);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data() as User;
          setCurrentUser({ ...userData, id: firebaseUser.uid as any });
          setIsAdmin(userData.role === 'admin');
        }
      } else {
        setCurrentUser(null);
        setIsAdmin(false);
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const logActivity = useCallback(async (action: string, details: string, userId?: string) => {
    const uid = userId || currentUser?.id;
    if (!uid) {
      console.warn(`logActivity skipped: No userId for action ${action}`);
      return;
    }
    try {
      console.log(`Logging activity: ${action}`, details);
      await addDoc(collection(db, 'activity_logs'), {
        user_id: uid,
        action,
        details,
        timestamp: serverTimestamp()
      });
      console.log(`Activity logged successfully: ${action}`);
    } catch (error) {
      console.error(`Failed to log activity: ${action}`, error);
      handleFirestoreError(error, OperationType.CREATE, 'activity_logs');
    }
  }, [currentUser]);

  const handleViolation = useCallback(async (reason: string) => {
    if (!activeSession || !currentUser) return;
    
    try {
      const sessionRef = doc(db, 'test_sessions', activeSession.toString());
      const sessionDoc = await getDoc(sessionRef);
      if (!sessionDoc.exists()) return;

      const newCount = (sessionDoc.data().violation_count || 0) + 1;
      const isSuspended = newCount >= 5;

      await updateDoc(sessionRef, {
        violation_count: newCount,
        status: isSuspended ? 'suspended' : sessionDoc.data().status
      });

      setViolationCount(newCount);
      if (isSuspended) {
        setView('suspended');
        setIsCameraActive(false);
        if (document.fullscreenElement) document.exitFullscreen();
        logActivity('TEST_SUSPENDED', `Test suspended due to 5 violations. Reason: ${reason}`);
      } else {
        showAlert("Violation Warning", `Violation ${newCount}/5: ${reason}. Please follow all exam rules. The test will be suspended after 5 violations.`);
        logActivity('VIOLATION', reason);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `test_sessions/${activeSession}`);
    }
  }, [activeSession, currentUser, logActivity]);

  const handleProctoringWarning = useCallback((reason: string) => {
    console.log(`handleProctoringWarning triggered: ${reason}`);
    setProctoringWarnings(prev => prev + 1);
    console.warn(`AI Proctoring Alert: ${reason}`);
    logActivity('AI_PROCTORING_ALERT', reason);
  }, [currentUser, logActivity]);

  const handleProctoringCheck = useCallback((details: string) => {
    // Routine checks are no longer logged to the activity log or console to reduce noise
    // Only malpractice detections (warnings) are logged
  }, []);

  const handleCameraError = useCallback((error: string) => {
    setCameraError(error);
    setIsCameraActive(false);
    if (view === 'test') {
      // Don't kick out immediately, just show a persistent warning
      console.error("Camera access lost during test:", error);
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
  const [adminTab, setAdminTab] = useState<'questions' | 'results' | 'logs' | 'repository' | 'database' | 'users' | 'resources' | 'troubleshoot'>('questions');
  const [repositoryData, setRepositoryData] = useState<{ logs: any[], sessions: any[] }>({ logs: [], sessions: [] });
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [editingQuestion, setEditingQuestion] = useState<Partial<Question> | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewingSession, setReviewingSession] = useState<TestSession | null>(null);
  const [reviewResponses, setReviewResponses] = useState<any[]>([]);
  const [adminResults, setAdminResults] = useState<TestSession[]>([]);
  const [adminLogs, setAdminLogs] = useState<ActivityLog[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [isResourceModalOpen, setIsResourceModalOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<Partial<Resource> | null>(null);
  const [activeResource, setActiveResource] = useState<Resource | null>(null);
  const [resourceSearch, setResourceSearch] = useState('');
  const [resourcePage, setResourcePage] = useState('');
  const [resourceFile, setResourceFile] = useState<File | null>(null);
  const [savingResource, setSavingResource] = useState(false);

  useEffect(() => {
    if (view !== 'test') {
      setActiveResource(null);
      setIsCalculatorOpen(false);
    }
  }, [view]);

  useEffect(() => {
    if (!isResourceModalOpen) {
      setResourceFile(null);
    }
  }, [isResourceModalOpen]);

  const fetchResources = useCallback(() => {
    const q = query(collection(db, 'resources'), orderBy('timestamp', 'desc'));
    return onSnapshot(q, (snapshot) => {
      setResources(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Resource)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'resources'));
  }, []);

  useEffect(() => {
    if (currentUser) {
      const unsub = fetchResources();
      return () => unsub();
    }
  }, [currentUser, fetchResources]);

  const sanitizeFirestoreData = (data: any) => {
    const sanitized = { ...data };
    Object.keys(sanitized).forEach(key => {
      if (sanitized[key] === undefined) {
        delete sanitized[key];
      }
    });
    return sanitized;
  };

  const saveResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingResource?.name) return;
    
    // If it's a link, we need a URL. If it's a file, we need either an existing URL or a new file.
    if (editingResource.type === 'Link' && !editingResource.url) return;
    if (editingResource.type !== 'Link' && !editingResource.url && !resourceFile) return;

    try {
      setSavingResource(true);
      console.log('Starting saveResource...', { type: editingResource.type, hasFile: !!resourceFile });
      let finalUrl = editingResource.url || '';

      // Handle file upload to Firebase Storage if a new file is selected
      if (resourceFile) {
        console.log('Uploading file to Storage...', { name: resourceFile.name, size: resourceFile.size, type: resourceFile.type });
        try {
          const sanitizedName = resourceFile.name.replace(/[^a-zA-Z0-9.]/g, '_');
          const fileRef = ref(storage, `resources/${Date.now()}_${sanitizedName}`);
          const uploadResult = await uploadBytes(fileRef, resourceFile);
          finalUrl = await getDownloadURL(uploadResult.ref);
          console.log('File uploaded successfully. URL:', finalUrl);
        } catch (uploadError: any) {
          console.error('Storage Upload Error:', uploadError);
          // Re-throw to be caught by the outer catch
          throw uploadError;
        }
      }

      const resourceData: any = {
        name: editingResource.name,
        type: editingResource.type || 'PDF',
        url: finalUrl,
        timestamp: editingResource.id ? editingResource.timestamp : serverTimestamp()
      };

      console.log('Saving to Firestore...', { id: editingResource.id, data: resourceData });

      if (editingResource.id) {
        await updateDoc(doc(db, 'resources', editingResource.id), resourceData);
      } else {
        await addDoc(collection(db, 'resources'), resourceData);
      }
      
      console.log('Resource saved successfully to Firestore');
      setIsResourceModalOpen(false);
      setEditingResource(null);
      setResourceFile(null);
    } catch (error) {
      console.error('Error in saveResource:', error);
      handleFirestoreError(error, OperationType.WRITE, 'resources');
    } finally {
      setSavingResource(false);
    }
  };

  const deleteResource = async (id: string) => {
    showConfirm("Delete Resource", "Are you sure you want to delete this resource?", async () => {
      try {
        await deleteDoc(doc(db, 'resources', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `resources/${id}`);
      }
    });
  };

  const [userSessions, setUserSessions] = useState<TestSession[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Test States
  const [currentModule, setCurrentModule] = useState(1);
  const [testQuestions, setTestQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [answers, setAnswers] = useState<Record<string, { answer: string, explanation: string, sub_answers?: Record<string, string> }>>({});

  const updateAnswer = (qId: string, field: 'answer' | 'explanation', value: string) => {
    setAnswers(prev => ({
      ...prev,
      [qId]: {
        ...(prev[qId] || { answer: '', explanation: '' }),
        [field]: value
      }
    }));
  };

  const updateSubAnswer = (qId: string, subId: string, value: string) => {
    setAnswers(prev => ({
      ...prev,
      [qId]: {
        ...(prev[qId] || { answer: '', explanation: '', sub_answers: {} }),
        sub_answers: {
          ...(prev[qId]?.sub_answers || {}),
          [subId]: value
        }
      }
    }));
  };

  // Security
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFull = !!document.fullscreenElement;
      setIsFullscreen(isFull);
      if (!isFull && view === 'test' && activeSession) {
        handleViolation("Exited full screen mode.");
      }
    };

    const handleBlur = () => {
      if (view === 'test' && activeSession) {
        // If the blur is caused by clicking into an iframe (like the resource viewer), ignore it
        if (document.activeElement?.tagName === 'IFRAME') {
          return;
        }
        setIsBlurred(true);
        handleViolation("Switched tabs or lost window focus.");
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

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      if (anchor && view === 'test') {
        const href = anchor.getAttribute('href');
        const targetAttr = anchor.getAttribute('target');
        
        // Prevent any link that tries to open in a new tab or navigate away during test
        if (targetAttr === '_blank' || (href && !href.startsWith('#') && !href.startsWith('javascript:'))) {
          e.preventDefault();
          showAlert("Action Blocked", "You are not allowed to navigate away or open new windows during the test.");
          handleViolation(`Attempted to navigate away via link: ${href}`);
        }
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (view === 'test' && activeSession) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('click', handleClick, true);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('click', handleClick, true);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [view, activeSession, handleProctoringWarning, handleViolation]);

  const fetchUserSessions = useCallback(async () => {
    if (!currentUser) return;
    try {
      const q = query(
        collection(db, 'test_sessions'), 
        where('user_id', '==', currentUser.id),
        orderBy('start_time', 'desc')
      );
      const snapshot = await getDocs(q);
      const sessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setUserSessions(sessions);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'test_sessions');
    }
  }, [currentUser]);

  useEffect(() => {
    if (view === 'results') fetchUserSessions();
  }, [view, fetchUserSessions]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let email = loginId;
      if (!email.includes('@')) {
        email = `${loginId}@pro-uw.com`;
      }
      
      try {
        const userCredential = await signInWithEmailAndPassword(auth, email, loginPass);
        const firebaseUser = userCredential.user;
        
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data() as User;
          setCurrentUser({ ...userData, id: firebaseUser.uid });
          setIsAdmin(userData.role === 'admin');
          
          if (userData.role === 'admin') {
            setView('admin');
          } else {
            const q = query(
              collection(db, 'test_sessions'),
              where('user_id', '==', firebaseUser.uid),
              where('status', 'in', ['in_progress', 'suspended']),
              orderBy('start_time', 'desc'),
              limit(1)
            );
            const sessionSnapshot = await getDocs(q);
            if (!sessionSnapshot.empty) {
              const session = sessionSnapshot.docs[0];
              const sessionData = session.data();
              setActiveSession(session.id);
              setViolationCount(sessionData.violation_count);
              if (sessionData.status === 'suspended') {
                setView('suspended');
              } else {
                setView('home');
              }
            } else {
              setView('home');
            }
          }
          logActivity('LOGIN', 'User logged in', firebaseUser.uid);
        } else {
          showAlert("Login Failed", "User profile not found.");
        }
      } catch (authError: any) {
        // Bootstrap Logic: If admin doesn't exist in Auth, create it once
        if (loginId.toLowerCase() === 'admin' && loginPass === 'mortgage2026' && (authError.code === 'auth/user-not-found' || authError.code === 'auth/invalid-credential')) {
          const userCredential = await createUserWithEmailAndPassword(auth, email, loginPass);
          const firebaseUser = userCredential.user;
          const adminData = {
            first_name: 'System',
            last_name: 'Admin',
            employee_id: 'ADMIN001',
            user_id: 'admin',
            role: 'admin' as const
          };
          await setDoc(doc(db, 'users', firebaseUser.uid), adminData);
          setCurrentUser({ ...adminData, id: firebaseUser.uid } as User);
          setIsAdmin(true);
          logActivity('SIGNUP', 'System admin created', firebaseUser.uid);
          logActivity('LOGIN', 'System admin logged in', firebaseUser.uid);
          setView('admin');
          showAlert("System Initialized", "Admin account created and logged in.");
          return;
        }
        throw authError;
      }
    } catch (error: any) {
      showAlert("Login Failed", error.message || "Invalid credentials");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!regData.firstName.trim()) return showAlert("Error", "First Name is required");
    if (!regData.lastName.trim()) return showAlert("Error", "Last Name is required");
    if (!regData.employeeId.trim()) return showAlert("Error", "Employee ID is required");
    if (!regData.userId.trim()) return showAlert("Error", "User ID is required");
    
    if (regData.password.length < 6) {
      return showAlert("Error", "Password must be at least 6 characters");
    }
    
    const alphanumericRegex = /^[a-zA-Z0-9]+$/;
    if (!alphanumericRegex.test(regData.password)) {
      return showAlert("Error", "Password must be alphanumeric (letters and numbers only)");
    }

    try {
      const email = `${regData.userId}@pro-uw.com`;
      const userCredential = await createUserWithEmailAndPassword(auth, email, regData.password);
      const firebaseUser = userCredential.user;

      const userData = {
        first_name: regData.firstName,
        last_name: regData.lastName,
        employee_id: regData.employeeId,
        user_id: regData.userId,
        role: 'user'
      };

      await setDoc(doc(db, 'users', firebaseUser.uid), userData);
      logActivity('SIGNUP', 'New profile created', firebaseUser.uid);
      
      showAlert("Success", "Profile created successfully!");
      setView('login');
      setRegData({ firstName: '', lastName: '', employeeId: '', userId: '', password: '' });
    } catch (error: any) {
      showAlert("Registration Failed", error.message || "Registration failed");
    }
  };

  const fetchQuestions = async (module: number) => {
    const q = query(collection(db, 'questions'), where('module', '==', module));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
  };

  const startTest = async (module: number) => {
    try {
      const moduleQs = await fetchQuestions(module);
      
      if (moduleQs.length === 0) return showAlert("Error", "No questions in this module.");

      setTestQuestions(moduleQs);
      setCurrentModule(module);
      setIsCameraActive(false);
      setCameraError(null);
      setView('rules');
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'questions');
    }
  };

  const proceedToTest = async () => {
    if (!currentUser) {
      showAlert("Error", "Session expired. Please login again.");
      setView('login');
      return;
    }

    setIsStarting(true);
    try {
      // Check for existing active/suspended session
      const q = query(
        collection(db, 'test_sessions'),
        where('user_id', '==', currentUser.id),
        where('status', 'in', ['in_progress', 'suspended']),
        orderBy('start_time', 'desc'),
        limit(1)
      );
      const sessionSnapshot = await getDocs(q);
      
      if (!sessionSnapshot.empty) {
        const session = sessionSnapshot.docs[0];
        const sessionData = session.data();
        
        if (sessionData.status === 'suspended') {
          showAlert("Suspended", "You have a suspended session. Please contact Admin.");
          setView('suspended');
          return;
        }
        if (sessionData.status === 'in_progress') {
          showConfirm("Active Session", "You have an active session in progress.\n\nClick 'Confirm' to RESUME your existing session.\nClick 'Cancel' to START A NEW session (this will discard your current progress).", 
            async () => {
              const moduleQs = await fetchQuestions(sessionData.module);
              setTestQuestions(moduleQs);
              setActiveSession(session.id);
              setViolationCount(sessionData.violation_count);
              
              const respSnapshot = await getDocs(collection(db, 'test_sessions', session.id, 'responses'));
              setCurrentQuestionIndex(respSnapshot.size);
              setTimeLeft(120 * 60); 
              setView('test');
            },
            async () => {
              // Cancel existing session and proceed to start a new one
              await deleteDoc(doc(db, 'test_sessions', session.id));
              logActivity('TEST_CANCELLED', `Cancelled existing session ${session.id} to start new one`);
              // Restart the process
              proceedToTest();
            }
          );
          return;
        }
      }

      // Request full screen first
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
      } catch (err) {
        console.error("Fullscreen request failed", err);
        showAlert("Error", "Full screen mode is required to take the test. Please enable it.");
        return;
      }

      const newSession = {
        user_id: currentUser.id,
        module: currentModule,
        total_questions: testQuestions.length,
        status: 'in_progress',
        start_time: serverTimestamp(),
        violation_count: 0,
        total_score: 0,
        total_explanation_score: 0
      };

      const sessionRef = await addDoc(collection(db, 'test_sessions'), newSession);

      setActiveSession(sessionRef.id);
      setCurrentQuestionIndex(0);
      setTimeLeft(120 * 60); 
      setAnswers({});
      setProctoringWarnings(0);
      setView('test');
      logActivity('TEST_START', `Started Module ${currentModule}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'test_sessions');
    } finally {
      setIsStarting(false);
    }
  };

  const handleNextQuestion = async () => {
    if (isSubmitting || !activeSession) return;
    setIsSubmitting(true);
    
    const currentQ = testQuestions[currentQuestionIndex];
    const userAns = answers[currentQ.id] || { answer: '', explanation: '', sub_answers: {} };

    try {
      let aiScore = 0;
      try {
        const aiResult = await scoreExplanation(userAns.explanation, currentQ.master_rationale);
        aiScore = aiResult.score || 0;
      } catch (e) {
        console.error("AI Scoring failed, defaulting to 0:", e);
      }

      await addDoc(collection(db, 'test_sessions', activeSession, 'responses'), {
        session_id: activeSession,
        question_id: currentQ.id,
        answer: userAns.answer,
        explanation: userAns.explanation,
        sub_answers: userAns.sub_answers || {},
        ai_explanation_score: aiScore,
        admin_score: null,
        admin_explanation_score: null
      });

      if (currentQuestionIndex < testQuestions.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
      } else {
        // Complete session
        const sessionRef = doc(db, 'test_sessions', activeSession);
        
        // Calculate scores
        const respSnapshot = await getDocs(collection(db, 'test_sessions', activeSession, 'responses'));
        const responses = respSnapshot.docs.map(d => d.data());
        
        let totalScore = 0;
        let totalAiScore = 0;
        
        responses.forEach(r => {
          const q = testQuestions.find(tq => tq.id === r.question_id);
          if (q) {
            if (q.type === 'testcase') {
              q.sub_questions?.forEach(sub => {
                const subAns = (r.sub_answers as any)?.[sub.id];
                if (subAns && sub.correct_answer && subAns.toLowerCase().trim() === sub.correct_answer.toLowerCase().trim()) {
                  totalScore += 1;
                }
              });
            } else if (r.answer && q.correct_answer && r.answer.toLowerCase().trim() === q.correct_answer.toLowerCase().trim()) {
              totalScore += 1;
            }
          }
          totalAiScore += (r.ai_explanation_score || 0);
        });

        await updateDoc(sessionRef, {
          status: 'completed',
          end_time: serverTimestamp(),
          total_score: totalScore,
          total_explanation_score: totalAiScore
        });

        setView('test-complete');
        setActiveSession(null);
        setIsCameraActive(false);
        if (document.fullscreenElement) document.exitFullscreen();
        logActivity('TEST_COMPLETE', 'Finished test session');
      }
    } catch (error) {
      showAlert("Error", "Failed to save response. Please check your connection and try again.");
      handleFirestoreError(error, OperationType.WRITE, `test_sessions/${activeSession}/responses`);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (view === 'test' && timeLeft > 0) {
      const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
      return () => clearInterval(timer);
    } else if (view === 'test' && timeLeft === 0) {
      const finishTest = async () => {
        if (!activeSession) return;
        try {
          const sessionRef = doc(db, 'test_sessions', activeSession);
          await updateDoc(sessionRef, {
            status: 'completed',
            end_time: serverTimestamp()
          });
          setView('home');
          setActiveSession(null);
          logActivity('TEST_TIMEOUT', 'Test ended due to time limit');
          showAlert("Timeout", "Time is up! Your test has been submitted.");
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `test_sessions/${activeSession}`);
        }
      };
      finishTest();
    }
  }, [view, timeLeft, activeSession]);

  // --- Admin Logic ---

  const fetchAdminData = useCallback(async () => {
    try {
      if (adminTab === 'questions') {
        const snapshot = await getDocs(collection(db, 'questions'));
        setQuestions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
      } else if (adminTab === 'results') {
        const snapshot = await getDocs(collection(db, 'test_sessions'));
        const sessions = await Promise.all(snapshot.docs.map(async (sessionDoc) => {
          const data = sessionDoc.data();
          const userDoc = await getDoc(doc(db, 'users', data.user_id));
          const userData = userDoc.exists() ? userDoc.data() : {};
          return { id: sessionDoc.id, ...data, ...userData } as any;
        }));
        setAdminResults(sessions.sort((a, b) => b.start_time?.seconds - a.start_time?.seconds));
      } else if (adminTab === 'logs') {
        const q = query(collection(db, 'activity_logs'), orderBy('timestamp', 'desc'));
        const snapshot = await getDocs(q);
        const logs = await Promise.all(snapshot.docs.map(async (logDoc) => {
          const data = logDoc.data();
          const userDoc = await getDoc(doc(db, 'users', data.user_id));
          const userData = userDoc.exists() ? userDoc.data() : {};
          return { id: logDoc.id, ...data, ...userData } as any;
        }));
        setAdminLogs(logs);
      } else if (adminTab === 'repository') {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const logsQ = query(collection(db, 'activity_logs'), where('timestamp', '>=', Timestamp.fromDate(thirtyDaysAgo)), orderBy('timestamp', 'desc'));
        const logsSnapshot = await getDocs(logsQ);
        const logs = await Promise.all(logsSnapshot.docs.map(async (logDoc) => {
          const data = logDoc.data();
          const userDoc = await getDoc(doc(db, 'users', data.user_id));
          const userData = userDoc.exists() ? userDoc.data() : {};
          return { id: logDoc.id, ...data, ...userData } as any;
        }));

        const sessionsQ = query(collection(db, 'test_sessions'), where('start_time', '>=', Timestamp.fromDate(thirtyDaysAgo)), orderBy('start_time', 'desc'));
        const sessionsSnapshot = await getDocs(sessionsQ);
        const sessions = await Promise.all(sessionsSnapshot.docs.map(async (sessionDoc) => {
          const data = sessionDoc.data();
          const userDoc = await getDoc(doc(db, 'users', data.user_id));
          const userData = userDoc.exists() ? userDoc.data() : {};
          return { id: sessionDoc.id, ...data, ...userData } as any;
        }));

        setRepositoryData({ logs, sessions });
      } else if (adminTab === 'users') {
        const snapshot = await getDocs(collection(db, 'users'));
        setAdminUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, adminTab);
    }
  }, [adminTab]);

  useEffect(() => {
    if (view === 'admin' && adminTab === 'logs') {
      const q = query(collection(db, 'activity_logs'), orderBy('timestamp', 'desc'), limit(100));
      const unsubscribe = onSnapshot(q, async (snapshot) => {
        const logs = await Promise.all(snapshot.docs.map(async (logDoc) => {
          const data = logDoc.data();
          const userDoc = await getDoc(doc(db, 'users', data.user_id));
          const userData = userDoc.exists() ? userDoc.data() : {};
          return { id: logDoc.id, ...data, ...userData } as any;
        }));
        setAdminLogs(logs);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'activity_logs');
      });
      return () => unsubscribe();
    }
  }, [view, adminTab]);

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

  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
  const [questionPdfFile, setQuestionPdfFile] = useState<File | null>(null);
  const [isSavingQuestion, setIsSavingQuestion] = useState(false);

  const saveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingQuestion(true);
    try {
      let pdfUrl = editingQuestion?.pdf_url || '';

      if (editingQuestion?.type === 'pdf-assessment') {
        if (questionPdfFile) {
          try {
            const sanitizedName = questionPdfFile.name.replace(/[^a-zA-Z0-9.]/g, '_');
            const fileRef = ref(storage, `questions/${Date.now()}_${sanitizedName}`);
            const uploadResult = await uploadBytes(fileRef, questionPdfFile);
            pdfUrl = await getDownloadURL(uploadResult.ref);
          } catch (uploadError) {
            console.error("PDF upload failed:", uploadError);
            alert("Failed to upload PDF. Please check your connection or try providing a URL instead.");
            setIsSavingQuestion(false);
            return;
          }
        } else if (!pdfUrl) {
          alert("Please upload a PDF or provide a PDF URL.");
          setIsSavingQuestion(false);
          return;
        }

        // Auto-convert Google Drive links to preview format for embedding
        if (pdfUrl.includes('drive.google.com')) {
          const fileIdMatch = pdfUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || pdfUrl.match(/id=([a-zA-Z0-9_-]+)/);
          if (fileIdMatch && fileIdMatch[1]) {
            pdfUrl = `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`;
          }
        }
      }

      const questionData: any = sanitizeFirestoreData({
        ...editingQuestion,
        pdf_url: pdfUrl,
        module: editingQuestion?.module ?? 1,
        time_limit: editingQuestion?.time_limit ?? 60,
        master_rationale: editingQuestion?.master_rationale || 'N/A',
        correct_answer: editingQuestion?.type === 'pdf-assessment' ? 'N/A' : (editingQuestion?.correct_answer || '')
      });

      if (editingQuestion?.id) {
        const { id, ...data } = questionData;
        await updateDoc(doc(db, 'questions', id), data);
      } else {
        await addDoc(collection(db, 'questions'), questionData);
      }
      setIsQuestionModalOpen(false);
      setEditingQuestion(null);
      setQuestionPdfFile(null);
      setIsSavingQuestion(false);
      fetchAdminData();
    } catch (error) {
      setIsSavingQuestion(false);
      handleFirestoreError(error, editingQuestion?.id ? OperationType.UPDATE : OperationType.CREATE, editingQuestion?.id ? `questions/${editingQuestion.id}` : 'questions');
    }
  };

  const deleteQuestion = async (id: string) => {
    showConfirm("Delete Question", "Are you sure you want to delete this question?", async () => {
      try {
        await deleteDoc(doc(db, 'questions', id));
        fetchAdminData();
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `questions/${id}`);
      }
    });
  };

  const deleteSession = async (id: string) => {
    showConfirm("Delete Session", "Are you sure you want to delete this test session? This will remove all candidate responses for this session.", async () => {
      try {
        const respSnapshot = await getDocs(collection(db, 'test_sessions', id, 'responses'));
        const batch = writeBatch(db);
        respSnapshot.docs.forEach(d => batch.delete(d.ref));
        batch.delete(doc(db, 'test_sessions', id));
        await batch.commit();
        fetchAdminData();
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `test_sessions/${id}`);
      }
    });
  };

  const approveSession = async (id: string) => {
    showConfirm("Approve Session", "Approve this session to continue?", async () => {
      try {
        await updateDoc(doc(db, 'test_sessions', id), {
          status: 'in_progress',
          violation_count: 0
        });
        showAlert("Success", "Session approved. Candidate can now resume.");
        fetchAdminData();
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `test_sessions/${id}`);
      }
    });
  };

  const denySession = async (id: string) => {
    showConfirm("Deny Session", "Deny this session? This will terminate the test permanently.", async () => {
      try {
        await updateDoc(doc(db, 'test_sessions', id), {
          status: 'denied',
          end_time: serverTimestamp()
        });
        showAlert("Success", "Session denied and terminated.");
        fetchAdminData();
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `test_sessions/${id}`);
      }
    });
  };

  const openReview = async (session: TestSession) => {
    try {
      const snapshot = await getDocs(collection(db, 'test_sessions', session.id.toString(), 'responses'));
      const responses = await Promise.all(snapshot.docs.map(async (respDoc) => {
        const data = respDoc.data();
        const qDoc = await getDoc(doc(db, 'questions', data.question_id));
        const qData = qDoc.exists() ? qDoc.data() : {};
        return { 
          id: respDoc.id, 
          ...data, 
          question_text: qData.text,
          q_correct_answer: qData.correct_answer,
          master_rationale: qData.master_rationale,
          q_type: qData.type,
          q_sub_questions: qData.sub_questions
        } as any;
      }));
      setReviewResponses(responses);
      setReviewingSession(session);
      setIsReviewModalOpen(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `test_sessions/${session.id}/responses`);
      showAlert("Error", "Failed to load responses.");
    }
  };

  const publishResults = async () => {
    if (!reviewingSession) return;
    try {
      const batch = writeBatch(db);
      let totalScore = 0;
      let totalExpScore = 0;

      reviewResponses.forEach((r: any) => {
        const respRef = doc(db, 'test_sessions', reviewingSession.id.toString(), 'responses', r.id);
        
        let autoScore = 0;
        if (r.q_type === 'testcase') {
          r.q_sub_questions?.forEach((sub: any) => {
            const subAns = r.sub_answers?.[sub.id];
            if (subAns && sub.correct_answer && subAns.toLowerCase().trim() === sub.correct_answer.toLowerCase().trim()) {
              autoScore += 1;
            }
          });
        } else {
          autoScore = (r.answer === r.q_correct_answer ? 1 : 0);
        }

        const finalAdminScore = Number(r.admin_score ?? autoScore) || 0;
        const finalExpScore = Number(r.admin_explanation_score ?? r.ai_explanation_score) || 0;
        
        batch.update(respRef, {
          admin_score: finalAdminScore,
          admin_explanation_score: finalExpScore
        });
        totalScore += finalAdminScore;
        totalExpScore += finalExpScore;
      });

      batch.update(doc(db, 'test_sessions', reviewingSession.id.toString()), {
        status: 'published',
        total_score: totalScore,
        total_explanation_score: totalExpScore
      });

      await batch.commit();
      setIsReviewModalOpen(false);
      fetchAdminData();
      showAlert("Success", "Results published successfully!");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `test_sessions/${reviewingSession.id}`);
      showAlert("Error", "Failed to publish results.");
    }
  };

  const clearLogs = async () => {
    showConfirm("Clear Logs", "Are you sure you want to clear all activity logs? This action cannot be undone.", async () => {
      try {
        const snapshot = await getDocs(collection(db, 'activity_logs'));
        const batch = writeBatch(db);
        snapshot.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        fetchAdminData();
        showAlert("Success", "Activity logs cleared.");
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'activity_logs');
      }
    });
  };

  const downloadBackup = async () => {
    try {
      const collections = ['users', 'questions', 'test_sessions', 'activity_logs'];
      const backup: any = {};
      
      for (const col of collections) {
        const snapshot = await getDocs(collection(db, col));
        backup[col] = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        
        if (col === 'test_sessions') {
          for (const session of backup[col]) {
            const respSnapshot = await getDocs(collection(db, 'test_sessions', session.id, 'responses'));
            session.responses = respSnapshot.docs.map(rd => ({ id: rd.id, ...rd.data() }));
          }
        }
      }

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prouw_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'backup');
      showAlert("Error", "Failed to generate backup.");
    }
  };

  const restoreBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    showConfirm("RESTORE DATA", "This will overwrite all current data. Are you sure?", async () => {
      setIsRestoring(true);
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          
          const clearAndRestore = async (colName: string, items: any[]) => {
            try {
              const snapshot = await getDocs(collection(db, colName));
              for (const d of snapshot.docs) await deleteDoc(d.ref);
              for (const item of items) {
                const { id, responses, ...rest } = item;
                await setDoc(doc(db, colName, id), rest);
                if (responses) {
                  for (const r of responses) {
                    const { id: rid, ...rRest } = r;
                    await setDoc(doc(db, colName, id, 'responses', rid), rRest);
                  }
                }
              }
            } catch (err) {
              handleFirestoreError(err, OperationType.WRITE, colName);
              throw err;
            }
          };

          await clearAndRestore('users', data.users || []);
          await clearAndRestore('questions', data.questions || []);
          await clearAndRestore('test_sessions', data.test_sessions || []);
          await clearAndRestore('activity_logs', data.activity_logs || []);

          showAlert("Success", "Data restored successfully. Please refresh.");
          window.location.reload();
        } catch (err) {
          console.error("Restore failed:", err);
          showAlert("Error", "Restore failed: " + (err as Error).message);
        } finally {
          setIsRestoring(false);
        }
      };
      reader.readAsText(file);
    });
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

      {/* Proctoring Widget - Only for Test and Rules */}
      {(view === 'test' || view === 'rules') && currentUser && (
        <ProctoringWidget 
          key={cameraRetryKey}
          userId={currentUser.id} 
          onWarning={handleProctoringWarning} 
          onCheck={handleProctoringCheck}
          onCameraError={handleCameraError}
          onReady={() => setIsCameraActive(true)}
        />
      )}

      <main className={`${(view === 'test' && activeResource) ? 'max-w-full p-0' : 'max-w-6xl p-6'} mx-auto transition-all duration-300`}>
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

                  <div className="mt-8 p-6 border-2 border-black rounded-2xl bg-zinc-50">
                    <div className="flex items-center gap-3 mb-4">
                      <Camera className={isCameraActive ? "text-green-500" : "text-red-500"} />
                      <h3 className="font-bold uppercase tracking-widest text-sm">Camera Verification</h3>
                    </div>
                    
                    {!isCameraActive ? (
                      <div className="space-y-4">
                        <p className="text-sm text-zinc-600">Camera access is required for AI proctoring. Please ensure your camera is enabled and permitted in your browser settings.</p>
                        {cameraError && (
                          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 whitespace-pre-line">
                            {cameraError}
                          </div>
                        )}
                        <Button 
                          variant="secondary" 
                          className="w-full text-xs"
                          onClick={() => {
                            setCameraRetryKey(prev => prev + 1);
                            setCameraError(null);
                          }}
                        >
                          RETRY CAMERA ACCESS
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 text-green-600">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <p className="text-sm font-bold uppercase">Camera Active & Verified</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-12 pt-8 border-t-2 border-zinc-100 flex flex-col gap-4">
                  <p className="text-sm text-zinc-400 italic">By proceeding, you acknowledge that you have read and understood the rules above.</p>
                  <Button 
                    onClick={proceedToTest} 
                    className="w-full text-xl py-4"
                    disabled={isStarting || !isCameraActive}
                  >
                    {isStarting ? "STARTING..." : "I UNDERSTAND, START EXAM"}
                  </Button>
                  <Button variant="ghost" onClick={() => setView('home')} className="w-full">BACK TO HOME</Button>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'test' && (
            <motion.div key="test" className={activeResource ? "py-0" : "py-10"}>
              {!isFullscreen ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <Maximize size={64} className="mb-6" />
                  <h2 className="text-3xl font-black mb-4">FULL SCREEN REQUIRED</h2>
                  <p className="text-zinc-500 mb-8">The exam can only be taken in full screen mode to ensure integrity.</p>
                  <Button onClick={() => document.documentElement.requestFullscreen()}>ENTER FULL SCREEN</Button>
                </div>
              ) : (
                  <div className={`mx-auto transition-all duration-500 ${activeResource ? 'max-w-full grid grid-cols-1 lg:grid-cols-2 gap-0 h-[calc(100vh-80px)]' : 'max-w-4xl'}`}>
                    <div className={`flex flex-col ${activeResource ? 'overflow-y-auto p-8' : ''}`}>
                      <div className="flex justify-between items-center mb-8">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Module {currentModule}</p>
                          <h2 className="text-2xl font-bold">Question {currentQuestionIndex + 1} of {testQuestions.length}</h2>
                        </div>
                        <div className="flex items-center gap-4">
                          <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => setIsResourceModalOpen(true)}>
                            <FileText size={14} /> Resources
                          </Button>
                          <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => setIsCalculatorOpen(!isCalculatorOpen)}>
                            <CalcIcon size={14} /> Calculator
                          </Button>
                          <div className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-bold ${violationCount === 0 ? 'bg-zinc-100 text-zinc-600 border-zinc-200' : violationCount >= 5 ? 'bg-red-100 text-red-700 border-red-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                            <AlertTriangle size={16} />
                            VIOLATIONS: {violationCount}/5
                          </div>
                          <div className={`px-6 py-2 rounded-full border-2 border-black font-mono text-xl ${timeLeft < 10 ? 'bg-red-600 text-white animate-pulse' : ''}`}>
                            {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                          </div>
                        </div>
                      </div>

                    <div className="mb-10 no-select">
                      <QuestionCanvas text={testQuestions[currentQuestionIndex].text} className="mb-8" />
                      
                      <div className="space-y-6">
                        {testQuestions[currentQuestionIndex].type === 'testcase' && (
                          <div className="space-y-8">
                            {testQuestions[currentQuestionIndex].sub_questions?.map((sub, sIdx) => (
                              <div key={sub.id} className="p-6 border-2 border-black rounded-2xl bg-zinc-50 space-y-4">
                                <h4 className="font-bold text-lg">Question {sIdx + 1}: {sub.text}</h4>
                                
                                {sub.type === 'mcq' && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {sub.options?.map((opt, oIdx) => (
                                      <button
                                        key={oIdx}
                                        onClick={() => updateSubAnswer(testQuestions[currentQuestionIndex].id, sub.id, String.fromCharCode(97 + oIdx))}
                                        className={`p-3 border-2 rounded-xl text-left transition-all text-sm ${answers[testQuestions[currentQuestionIndex].id]?.sub_answers?.[sub.id] === String.fromCharCode(97 + oIdx) ? 'bg-black text-white border-black' : 'border-zinc-200 hover:border-black bg-white'}`}
                                      >
                                        <span className="font-bold mr-2 uppercase">{String.fromCharCode(97 + oIdx)}.</span> {opt}
                                      </button>
                                    ))}
                                  </div>
                                )}

                                {sub.type === 'yesno' && (
                                  <div className="flex gap-3">
                                    {['Yes', 'No'].map(opt => (
                                      <button
                                        key={opt}
                                        onClick={() => updateSubAnswer(testQuestions[currentQuestionIndex].id, sub.id, opt)}
                                        className={`flex-1 p-3 border-2 rounded-xl text-center font-bold transition-all text-sm ${answers[testQuestions[currentQuestionIndex].id]?.sub_answers?.[sub.id] === opt ? 'bg-black text-white border-black' : 'border-zinc-200 hover:border-black bg-white'}`}
                                      >
                                        {opt}
                                      </button>
                                    ))}
                                  </div>
                                )}

                                {sub.type === 'specific' && (
                                  <input 
                                    type="text"
                                    placeholder="Enter response..."
                                    value={answers[testQuestions[currentQuestionIndex].id]?.sub_answers?.[sub.id] || ''}
                                    onChange={(e) => updateSubAnswer(testQuestions[currentQuestionIndex].id, sub.id, e.target.value)}
                                    className="w-full p-3 border-2 border-black rounded-xl focus:outline-none bg-white text-sm"
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {testQuestions[currentQuestionIndex].type === 'pdf-assessment' && testQuestions[currentQuestionIndex].pdf_url && (
                          <div className="w-full h-[600px] border-4 border-black rounded-2xl overflow-hidden relative bg-zinc-100 mb-6">
                            <div className="absolute top-0 left-0 right-0 h-16 z-10 bg-transparent pointer-events-auto" title="Interaction with PDF toolbar is disabled" />
                            <iframe 
                              src={`${testQuestions[currentQuestionIndex].pdf_url}#toolbar=0&navpanes=0&scrollbar=1&statusbar=0&messages=0&view=FitH`}
                              className="w-full h-full border-none"
                              title="Assessment PDF"
                              sandbox="allow-scripts allow-same-origin allow-forms"
                              allow="autoplay; fullscreen"
                            />
                          </div>
                        )}

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
                          <label className="text-sm font-bold uppercase tracking-wider mb-2 block">
                            {testQuestions[currentQuestionIndex].type === 'pdf-assessment' ? 'Your Assessment / Explanation' : 'Explanation / Rationale'}
                          </label>
                          <textarea
                            rows={testQuestions[currentQuestionIndex].type === 'pdf-assessment' ? 8 : 4}
                            value={answers[testQuestions[currentQuestionIndex].id]?.explanation || ''}
                            onChange={(e) => updateAnswer(testQuestions[currentQuestionIndex].id, 'explanation', e.target.value)}
                            placeholder={testQuestions[currentQuestionIndex].type === 'pdf-assessment' ? "Provide your detailed assessment based on the PDF above..." : "Provide your reasoning for the above answer..."}
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

                  {activeResource && (
                    <ResourceViewer 
                      url={activeResource.url} 
                      type={activeResource.type}
                      onClose={() => setActiveResource(null)}
                      search={resourceSearch}
                      onSearchChange={setResourceSearch}
                      page={resourcePage}
                      onPageChange={setResourcePage}
                    />
                  )}
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
                    if (!currentUser) return;
                    try {
                      const q = query(
                        collection(db, 'test_sessions'),
                        where('user_id', '==', currentUser.id),
                        where('status', 'in', ['in_progress', 'suspended', 'denied']),
                        orderBy('start_time', 'desc'),
                        limit(1)
                      );
                      const snapshot = await getDocs(q);
                      if (!snapshot.empty) {
                        const session = snapshot.docs[0].data();
                        if (session.status === 'in_progress') {
                          showAlert("Approved", "Your session has been approved! You can now continue.");
                          setView('home');
                        } else if (session.status === 'denied') {
                          showAlert("Denied", "Your session has been denied and terminated.");
                          setView('home');
                          setActiveSession(null);
                        } else {
                          showAlert("Awaiting Review", "Your session is still awaiting review.");
                        }
                      }
                    } catch (error) {
                      console.error("Error checking session status:", error);
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
                        <p className="text-xs font-bold text-zinc-500 uppercase">{new Date(session.start_time).toLocaleDateString()} • Module {session.module}</p>
                        <h3 className="text-xl font-bold">Session #{session.id}</h3>
                        <p className="text-sm">Status: <span className={`uppercase font-bold ${session.status === 'published' ? 'text-green-600' : 'text-zinc-400'}`}>{session.status}</span></p>
                      </div>
                      {session.status === 'published' ? (
                        <div className="flex gap-8">
                          <div className="text-right">
                            <p className="text-[10px] uppercase font-bold text-zinc-400">Answer Score</p>
                            <p className="text-xl font-black">{(session.total_score || 0)} / {session.total_questions}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] uppercase font-bold text-zinc-400">Explanation Score</p>
                            <p className="text-xl font-black">{(Number(session.total_explanation_score) / (session.total_questions * 10 || 1)).toFixed(1)} / 10</p>
                          </div>
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
                  <Button variant={adminTab === 'resources' ? 'primary' : 'ghost'} onClick={() => setAdminTab('resources')}>Resources</Button>
                  <Button variant={adminTab === 'repository' ? 'primary' : 'ghost'} onClick={() => setAdminTab('repository')}>30-Day Repository</Button>
                  <Button variant={adminTab === 'users' ? 'primary' : 'ghost'} onClick={() => setAdminTab('users')}>Users</Button>
                  <Button variant={adminTab === 'database' ? 'primary' : 'ghost'} onClick={() => setAdminTab('database')}>Database</Button>
                  <Button variant={adminTab === 'troubleshoot' ? 'primary' : 'ghost'} onClick={() => setAdminTab('troubleshoot')}>Troubleshoot</Button>
                </div>
              </div>

              {adminTab === 'questions' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-bold">Question Repository</h3>
                    <div className="flex gap-2">
                      <Button onClick={() => { setEditingQuestion({ type: 'mcq', module: 1 }); setQuestionPdfFile(null); setIsQuestionModalOpen(true); }}><Plus size={20} /> Add Question</Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {questions.map(q => (
                      <div key={q.id} className="border-2 border-black p-6 rounded-2xl flex justify-between items-start">
                        <div>
                          <p className="text-xs font-bold uppercase text-zinc-500">Module {q.module} • {q.type}</p>
                          <p className="font-medium mt-1">{q.text}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" className="p-2" onClick={() => { setEditingQuestion(q); setQuestionPdfFile(null); setIsQuestionModalOpen(true); }}><ChevronRight size={18} /></Button>
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
                    <h3 className="text-xl font-bold">User Responses</h3>
                    <Button variant="secondary" onClick={() => exportToExcel(adminResults, 'Test_Results')}><Download size={20} /> Export Excel</Button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b-2 border-black text-left">
                          <th className="p-4 uppercase text-xs font-black">User</th>
                          <th className="p-4 uppercase text-xs font-black">Module</th>
                          <th className="p-4 uppercase text-xs font-black">Status</th>
                          <th className="p-4 uppercase text-xs font-black">Violations</th>
                          <th className="p-4 uppercase text-xs font-black">Answer Score</th>
                          <th className="p-4 uppercase text-xs font-black">Explanation Score</th>
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
                            <td className="p-4 font-medium">Module {res.module || 'N/A'}</td>
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
                            <td className="p-4 font-bold">
                              {res.status === 'published' ? `${res.total_score} / ${res.total_questions}` : '-'}
                            </td>
                            <td className="p-4 font-bold">
                              {res.status === 'published' ? `${(Number(res.total_explanation_score) / (res.total_questions * 10 || 1)).toFixed(1)} / 10` : '-'}
                            </td>
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
                    {(() => {
                      const groupedLogs: any[] = [];
                      adminLogs.forEach(log => {
                        const lastGroup = groupedLogs[groupedLogs.length - 1];
                        // Group consecutive identical AI alerts for the same user
                        if (lastGroup && 
                            lastGroup.user_id === log.user_id && 
                            lastGroup.action === log.action && 
                            lastGroup.details === log.details && 
                            log.action === 'AI_PROCTORING_ALERT') {
                          lastGroup.count = (lastGroup.count || 1) + 1;
                          // Keep the earliest timestamp for the first occurrence? 
                          // Or latest? User said "show (7) in brackets next to AI alert", 
                          // usually we show the latest timestamp for the group.
                          lastGroup.timestamp = log.timestamp; 
                        } else {
                          groupedLogs.push({ ...log, count: 1 });
                        }
                      });
                      return groupedLogs.map(log => (
                        <div key={log.id} className={`text-sm p-3 border-l-4 ${log.action === 'AI_PROCTORING_ALERT' ? 'border-red-600 bg-red-50' : 'border-black bg-zinc-50'} flex justify-between transition-all hover:bg-zinc-100`}>
                          <div>
                            <span className={`font-bold uppercase text-[10px] ${log.action === 'AI_PROCTORING_ALERT' ? 'bg-red-600' : 'bg-black'} text-white px-1.5 py-0.5 mr-2`}>
                              {log.action}
                            </span>
                            <span className="font-medium">
                              {log.first_name ? `${log.first_name} ${log.last_name}` : 'Unknown User'}
                            </span>
                            <span className="text-zinc-500 ml-2">
                              — {log.details}
                              {log.count > 1 && (
                                <span className="ml-2 font-bold text-red-600">({log.count})</span>
                              )}
                            </span>
                          </div>
                          <span className="text-zinc-400 font-mono text-xs">
                            {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : 
                             log.timestamp?.seconds ? new Date(log.timestamp.seconds * 1000).toLocaleString() : 
                             'Just now'}
                          </span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}

              {adminTab === 'troubleshoot' && (
                <div className="space-y-10">
                  <div className="bg-red-600 text-white p-8 rounded-3xl">
                    <h3 className="text-2xl font-black mb-2 uppercase italic tracking-tighter">System Troubleshooter</h3>
                    <p className="text-red-100">Use this tool to diagnose AI proctoring issues on Render or other environments.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white p-6 border-2 border-black rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                      <h4 className="font-bold uppercase mb-4 flex items-center gap-2">
                        <Shield size={18} /> API Key Status
                      </h4>
                      <div className="space-y-4">
                        <div className="p-4 bg-zinc-100 rounded-lg font-mono text-sm break-all">
                          {getApiKey() ? (
                            <div className="text-green-600 font-bold">
                              ✓ API Key Detected: {getApiKey().substring(0, 6)}...{getApiKey().substring(getApiKey().length - 4)}
                            </div>
                          ) : (
                            <div className="text-red-600 font-bold animate-pulse">
                              ✗ NO API KEY FOUND!
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-zinc-500 space-y-2">
                          <p><strong>Step 1:</strong> Go to your Render Dashboard.</p>
                          <p><strong>Step 2:</strong> Navigate to Environment settings.</p>
                          <p><strong>Step 3:</strong> Add a variable named <code className="bg-zinc-200 px-1 rounded">VITE_GEMINI_API_KEY</code>.</p>
                          <p><strong>Step 4:</strong> Paste your Gemini API key and save.</p>
                          <p><strong>Step 5:</strong> Redeploy your application.</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-6 border-2 border-black rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                      <h4 className="font-bold uppercase mb-4 flex items-center gap-2">
                        <AlertCircle size={18} /> Debug Console
                      </h4>
                      <p className="text-sm text-zinc-600 mb-4">Since F12 might be blocked, you can view the internal system logs here.</p>
                      <Button onClick={() => setShowLogs(!showLogs)} className="w-full">
                        {showLogs ? 'Hide System Logs' : 'Show System Logs'}
                      </Button>
                      
                      {showLogs && (
                        <div className="mt-4 p-4 bg-zinc-900 text-zinc-300 rounded-lg font-mono text-[10px] h-64 overflow-y-auto space-y-1">
                          {capturedLogs.length === 0 ? (
                            <p className="text-zinc-500 italic">No logs captured yet...</p>
                          ) : (
                            capturedLogs.map((log, i) => (
                              <div key={i} className={`${log.type === 'error' ? 'text-red-400' : log.type === 'warn' ? 'text-amber-400' : 'text-zinc-400'}`}>
                                <span className="opacity-50">[{log.time}]</span> {log.message}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-zinc-100 p-8 rounded-3xl border-2 border-dashed border-zinc-300">
                    <h4 className="font-bold uppercase mb-4 italic">Common Fixes for Dummies</h4>
                    <ul className="space-y-4 text-sm">
                      <li className="flex gap-4">
                        <div className="bg-black text-white w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 font-bold">1</div>
                        <div>
                          <p className="font-bold">Enable the API in Google Cloud</p>
                          <p className="text-zinc-600">Your key must have the "Generative Language API" enabled. Go to Google Cloud Console, find your project, and enable it in the API Library.</p>
                        </div>
                      </li>
                      <li className="flex gap-4">
                        <div className="bg-black text-white w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 font-bold">2</div>
                        <div>
                          <p className="font-bold">Check API Key Restrictions</p>
                          <p className="text-zinc-600">If you set "API Restrictions" on your key, make sure it allows "Generative Language API". If you set "Website Restrictions", make sure your Render URL is allowed.</p>
                        </div>
                      </li>
                      <li className="flex gap-4">
                        <div className="bg-black text-white w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 font-bold">3</div>
                        <div>
                          <p className="font-bold">Camera Permissions</p>
                          <p className="text-zinc-600">Ensure your browser is not blocking the camera. Look for the camera icon in the URL bar and select "Allow".</p>
                        </div>
                      </li>
                    </ul>
                  </div>
                </div>
              )}

              {adminTab === 'repository' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-bold">30-Day Audit Repository</h3>
                    <Button variant="secondary" onClick={() => exportToExcel([...repositoryData.logs, ...repositoryData.sessions], 'Repository_Audit')}><Download size={20} /> Export Full Audit</Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <h4 className="text-sm font-black uppercase border-b-2 border-black pb-2">Recent Activity Logs</h4>
                      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                        {repositoryData.logs.map(log => (
                          <div key={log.id} className={`p-3 rounded-xl border ${log.action === 'AI_PROCTORING_ALERT' ? 'bg-red-50 border-red-200' : 'bg-zinc-50 border-zinc-200'}`}>
                            <div className="flex justify-between items-start mb-1">
                              <span className="text-[10px] font-black uppercase text-zinc-400">
                                {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleDateString() : 
                                 log.timestamp?.seconds ? new Date(log.timestamp.seconds * 1000).toLocaleDateString() : 
                                 'Recent'}
                              </span>
                              <span className={`text-[10px] font-black uppercase ${log.action === 'AI_PROCTORING_ALERT' ? 'bg-red-600' : 'bg-black'} text-white px-1.5 rounded`}>
                                {log.action}
                              </span>
                            </div>
                            <p className="text-xs font-bold">
                              {log.first_name ? `${log.first_name} ${log.last_name}` : 'Unknown User'}
                            </p>
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

              {adminTab === 'resources' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-bold uppercase tracking-tighter italic">Resource Repository</h3>
                    <Button onClick={() => { setEditingResource({ type: 'PDF' }); setIsResourceModalOpen(true); }}>
                      <Plus size={20} /> ADD RESOURCE
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {resources.length === 0 ? (
                      <div className="col-span-full text-center py-20 border-4 border-dashed border-zinc-200 rounded-3xl text-zinc-400 font-bold uppercase tracking-widest">
                        No resources added yet.
                      </div>
                    ) : (
                      resources.map(res => (
                        <div key={res.id} className="border-4 border-black p-6 rounded-3xl bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all">
                          <div className="flex justify-between items-start mb-4">
                            <div className="bg-black text-white p-2 rounded-xl">
                              <FileText size={24} />
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => { setEditingResource(res); setIsResourceModalOpen(true); }} className="p-2 hover:bg-zinc-100 rounded-lg transition-colors">
                                <Edit size={18} />
                              </button>
                              <button onClick={() => deleteResource(res.id)} className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors">
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </div>
                          <h4 className="text-xl font-black mb-1 uppercase tracking-tighter leading-tight">{res.name}</h4>
                          <p className="text-[10px] font-black uppercase text-zinc-400 mb-4">{res.type}</p>
                          <div className="text-xs font-mono text-zinc-500 truncate mb-4 bg-zinc-50 p-2 rounded-lg border border-zinc-200">
                            {res.type === 'Link' ? res.url : 'File Uploaded'}
                          </div>
                        </div>
                      ))
                    )}
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
                            onChange={e => setEditingQuestion({...editingQuestion, type: e.target.value as any, sub_questions: e.target.value === 'testcase' ? [] : undefined})}
                          >
                            <option value="mcq">Multiple Choice</option>
                            <option value="yesno">Yes / No</option>
                            <option value="specific">Specific Answer</option>
                            <option value="testcase">Test Case (Scenario)</option>
                            <option value="pdf-assessment">PDF-Assessment</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-bold uppercase">Module (1-5)</label>
                          <input type="number" min="1" max="5" className="border-2 border-black p-2 rounded-lg" value={editingQuestion?.module ?? ''} onChange={e => {
                            const val = e.target.value === '' ? undefined : parseInt(e.target.value);
                            setEditingQuestion({...editingQuestion, module: isNaN(val as any) ? undefined : val});
                          }} />
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold uppercase">{editingQuestion?.type === 'testcase' ? 'Test Case Scenario' : 'Question Text'}</label>
                        <textarea className="border-2 border-black p-2 rounded-lg font-mono text-sm whitespace-pre-wrap" rows={editingQuestion?.type === 'testcase' ? 6 : 3} value={editingQuestion?.text || ''} onChange={e => setEditingQuestion({...editingQuestion, text: e.target.value})} required />
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

                      {editingQuestion?.type === 'testcase' && (
                        <div className="space-y-4 border-2 border-black p-4 rounded-xl bg-zinc-50">
                          <div className="flex justify-between items-center">
                            <h4 className="font-black uppercase text-sm">Sub-Questions (1-5)</h4>
                            <Button 
                              variant="secondary" 
                              className="py-1 px-3 text-xs" 
                              onClick={() => {
                                if ((editingQuestion?.sub_questions?.length || 0) < 5) {
                                  const newSub = { id: Math.random().toString(36).substr(2, 9), text: '', type: 'mcq' as any, options: ['', '', '', ''], correct_answer: 'a' };
                                  setEditingQuestion({...editingQuestion, sub_questions: [...(editingQuestion?.sub_questions || []), newSub]});
                                }
                              }}
                              disabled={(editingQuestion?.sub_questions?.length || 0) >= 5}
                            >
                              <Plus size={14} /> Add Sub-Question
                            </Button>
                          </div>
                          
                          {editingQuestion?.sub_questions?.map((sub: any, sIdx: number) => (
                            <div key={sub.id} className="p-4 border-2 border-black rounded-lg bg-white space-y-3 relative">
                              <button 
                                type="button"
                                onClick={() => {
                                  const newSubs = [...(editingQuestion.sub_questions || [])];
                                  newSubs.splice(sIdx, 1);
                                  setEditingQuestion({...editingQuestion, sub_questions: newSubs});
                                }}
                                className="absolute top-2 right-2 text-red-500 hover:text-red-700"
                              >
                                <Trash2 size={16} />
                              </button>
                              
                              <div className="grid grid-cols-2 gap-2">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-bold uppercase">Type</label>
                                  <select 
                                    className="border border-black p-1 rounded text-xs"
                                    value={sub.type}
                                    onChange={e => {
                                      const newSubs = [...(editingQuestion.sub_questions || [])];
                                      newSubs[sIdx].type = e.target.value as any;
                                      if (e.target.value === 'mcq') newSubs[sIdx].correct_answer = 'a';
                                      if (e.target.value === 'yesno') newSubs[sIdx].correct_answer = 'Yes';
                                      setEditingQuestion({...editingQuestion, sub_questions: newSubs});
                                    }}
                                  >
                                    <option value="mcq">MCQ</option>
                                    <option value="yesno">Yes/No</option>
                                    <option value="specific">Specific</option>
                                  </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-bold uppercase">Correct Answer</label>
                                  {sub.type === 'mcq' ? (
                                    <select 
                                      className="border border-black p-1 rounded text-xs"
                                      value={sub.correct_answer}
                                      onChange={e => {
                                        const newSubs = [...(editingQuestion.sub_questions || [])];
                                        newSubs[sIdx].correct_answer = e.target.value;
                                        setEditingQuestion({...editingQuestion, sub_questions: newSubs});
                                      }}
                                    >
                                      <option value="a">A</option>
                                      <option value="b">B</option>
                                      <option value="c">C</option>
                                      <option value="d">D</option>
                                    </select>
                                  ) : sub.type === 'yesno' ? (
                                    <select 
                                      className="border border-black p-1 rounded text-xs"
                                      value={sub.correct_answer}
                                      onChange={e => {
                                        const newSubs = [...(editingQuestion.sub_questions || [])];
                                        newSubs[sIdx].correct_answer = e.target.value;
                                        setEditingQuestion({...editingQuestion, sub_questions: newSubs});
                                      }}
                                    >
                                      <option value="Yes">Yes</option>
                                      <option value="No">No</option>
                                    </select>
                                  ) : (
                                    <input 
                                      className="border border-black p-1 rounded text-xs"
                                      value={sub.correct_answer}
                                      onChange={e => {
                                        const newSubs = [...(editingQuestion.sub_questions || [])];
                                        newSubs[sIdx].correct_answer = e.target.value;
                                        setEditingQuestion({...editingQuestion, sub_questions: newSubs});
                                      }}
                                    />
                                  )}
                                </div>
                              </div>
                              
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold uppercase">Question Text</label>
                                <textarea 
                                  className="border border-black p-1 rounded text-xs" 
                                  rows={2} 
                                  value={sub.text} 
                                  onChange={e => {
                                    const newSubs = [...(editingQuestion.sub_questions || [])];
                                    newSubs[sIdx].text = e.target.value;
                                    setEditingQuestion({...editingQuestion, sub_questions: newSubs});
                                  }}
                                />
                              </div>
                              
                              {sub.type === 'mcq' && (
                                <div className="grid grid-cols-2 gap-1">
                                  {['a', 'b', 'c', 'd'].map((opt, i) => (
                                    <input 
                                      key={opt}
                                      placeholder={`Option ${opt.toUpperCase()}`}
                                      className="border border-black p-1 rounded text-[10px]"
                                      value={sub.options?.[i] || ''}
                                      onChange={e => {
                                        const newSubs = [...(editingQuestion.sub_questions || [])];
                                        const newOpts = [...(newSubs[sIdx].options || ['', '', '', ''])];
                                        newOpts[i] = e.target.value;
                                        newSubs[sIdx].options = newOpts;
                                        setEditingQuestion({...editingQuestion, sub_questions: newSubs});
                                      }}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {editingQuestion?.type === 'pdf-assessment' && (
                        <div className="space-y-4 border-2 border-black p-4 rounded-xl bg-zinc-50">
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold uppercase">Upload Question PDF</label>
                            <input 
                              type="file" 
                              accept=".pdf" 
                              className="border-2 border-black p-2 rounded-lg bg-white" 
                              onChange={e => setQuestionPdfFile(e.target.files?.[0] || null)}
                            />
                          </div>
                          
                          <div className="flex items-center gap-4 py-1">
                            <div className="h-px bg-zinc-300 flex-1"></div>
                            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">OR</span>
                            <div className="h-px bg-zinc-300 flex-1"></div>
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold uppercase">PDF URL</label>
                            <input 
                              type="url" 
                              className="border-2 border-black p-2 rounded-lg bg-white" 
                              placeholder="https://example.com/question.pdf"
                              value={editingQuestion?.pdf_url || ''}
                              onChange={e => setEditingQuestion({...editingQuestion, pdf_url: e.target.value})}
                            />
                            {editingQuestion?.pdf_url && !questionPdfFile && (
                              <p className="text-[10px] text-zinc-500 mt-1 font-mono truncate">Current: {editingQuestion.pdf_url}</p>
                            )}
                          </div>
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

                      {editingQuestion?.type !== 'testcase' && editingQuestion?.type !== 'pdf-assessment' && (
                        <div className="grid grid-cols-1 gap-4">
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold uppercase">Correct Answer</label>
                            {editingQuestion?.type === 'mcq' ? (
                              <select 
                                className="border-2 border-black p-2 rounded-lg"
                                value={editingQuestion?.correct_answer || 'a'}
                                onChange={e => setEditingQuestion({...editingQuestion, correct_answer: e.target.value})}
                              >
                                <option value="a">Option A</option>
                                <option value="b">Option B</option>
                                <option value="c">Option C</option>
                                <option value="d">Option D</option>
                              </select>
                            ) : editingQuestion?.type === 'yesno' ? (
                              <select 
                                className="border-2 border-black p-2 rounded-lg"
                                value={editingQuestion?.correct_answer || 'Yes'}
                                onChange={e => setEditingQuestion({...editingQuestion, correct_answer: e.target.value})}
                              >
                                <option value="Yes">Yes</option>
                                <option value="No">No</option>
                              </select>
                            ) : (
                              <input className="border-2 border-black p-2 rounded-lg" value={editingQuestion?.correct_answer || ''} onChange={e => setEditingQuestion({...editingQuestion, correct_answer: e.target.value})} required />
                            )}
                          </div>
                        </div>
                      )}

                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold uppercase">Master Rationale (for AI Scoring)</label>
                        <textarea className="border-2 border-black p-2 rounded-lg" rows={3} value={editingQuestion?.master_rationale || ''} onChange={e => setEditingQuestion({...editingQuestion, master_rationale: e.target.value})} required />
                      </div>

                      <div className="flex gap-2 pt-4">
                        <Button type="submit" className="flex-1" disabled={isSavingQuestion}>
                          {isSavingQuestion ? 'SAVING...' : 'SAVE QUESTION'}
                        </Button>
                        <Button variant="secondary" onClick={() => setIsQuestionModalOpen(false)} disabled={isSavingQuestion}>CANCEL</Button>
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
                              {resp.q_type === 'testcase' ? (
                                <div className="space-y-3">
                                  {resp.q_sub_questions?.map((sub: any, sIdx: number) => (
                                    <div key={sub.id} className="text-sm border-b border-zinc-200 last:border-0 pb-2 last:pb-0">
                                      <p className="font-bold">Sub Q{sIdx + 1}: {sub.text}</p>
                                      <p>Answer: <span className="font-medium">{resp.sub_answers?.[sub.id] || '(No Answer)'}</span></p>
                                      <p className="text-xs text-zinc-500">Correct: <span className="font-bold text-black">{sub.correct_answer}</span></p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <>
                                  <p className="font-medium">{resp.answer}</p>
                                  <p className="text-xs mt-2 text-zinc-500">Correct: <span className="font-bold text-black">{resp.q_correct_answer}</span></p>
                                </>
                              )}
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
                              <label className="text-[10px] font-black uppercase">
                                Answer Score (0 to {resp.q_type === 'testcase' ? resp.q_sub_questions?.length : 1})
                              </label>
                              <input 
                                type="number" min="0" max={resp.q_type === 'testcase' ? resp.q_sub_questions?.length : 1} 
                                className="border-2 border-black p-2 rounded-lg text-black" 
                                value={resp.admin_score ?? (
                                  resp.q_type === 'testcase' 
                                    ? resp.q_sub_questions?.reduce((acc: number, sub: any) => {
                                        const subAns = resp.sub_answers?.[sub.id];
                                        if (subAns && sub.correct_answer && subAns.toLowerCase().trim() === sub.correct_answer.toLowerCase().trim()) return acc + 1;
                                        return acc;
                                      }, 0)
                                    : (resp.answer === resp.q_correct_answer ? 1 : 0)
                                ) ?? ''} 
                                onChange={e => {
                                  const newResps = [...reviewResponses];
                                  const val = e.target.value === '' ? undefined : parseInt(e.target.value);
                                  newResps[idx].admin_score = isNaN(val as any) ? undefined : val;
                                  setReviewResponses(newResps);
                                }}
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-black uppercase">Explanation Score (%)</label>
                              <input 
                                type="number" min="0" max="100" 
                                className="border-2 border-black p-2 rounded-lg text-black" 
                                value={resp.admin_explanation_score ?? resp.ai_explanation_score ?? ''} 
                                onChange={e => {
                                  const newResps = [...reviewResponses];
                                  const val = e.target.value === '' ? undefined : parseInt(e.target.value);
                                  newResps[idx].admin_explanation_score = isNaN(val as any) ? undefined : val;
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
        {/* Resource Modal */}
        {isResourceModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white border-4 border-black p-8 rounded-3xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
            >
              <h2 className="text-3xl font-black mb-6 uppercase italic tracking-tighter">
                {isAdmin ? (editingResource?.id ? 'Edit Resource' : 'Add Resource') : 'Allowed Resources'}
              </h2>
              
              {isAdmin ? (
                <form onSubmit={saveResource} className="space-y-4">
                  <Input 
                    label="Resource Name" 
                    value={editingResource?.name || ''} 
                    onChange={(v: string) => setEditingResource({ ...editingResource, name: v })} 
                    required 
                  />
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-semibold uppercase tracking-wider">Type</label>
                    <select 
                      value={editingResource?.type || 'PDF'}
                      onChange={(e) => {
                        setEditingResource({ ...editingResource, type: e.target.value });
                        setResourceFile(null);
                      }}
                      className="border-2 border-black p-3 rounded-lg focus:outline-none"
                    >
                      <option value="PDF">PDF Document</option>
                      <option value="Image">Image</option>
                      <option value="Link">Web Link</option>
                    </select>
                  </div>

                  {editingResource?.type !== 'Link' && (
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-semibold uppercase tracking-wider">Upload File ({editingResource?.type})</label>
                      <input 
                        type="file" 
                        accept={editingResource?.type === 'PDF' ? '.pdf' : 'image/*'}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 5 * 1024 * 1024) {
                              showAlert("File Too Large", "Maximum file size is 5MB.");
                              e.target.value = '';
                              return;
                            }
                            setResourceFile(file);
                          }
                        }}
                        className="border-2 border-black p-3 rounded-lg focus:outline-none"
                      />
                      <p className="text-[10px] text-zinc-400 uppercase font-bold mt-1">Max size: 5MB. Files are stored in Firebase Storage.</p>
                    </div>
                  )}

                  <div className="flex flex-col gap-1">
                    <Input 
                      label={editingResource?.type === 'Link' ? "Web Link URL" : "Or Paste URL"} 
                      value={editingResource?.url || ''} 
                      onChange={(v: string) => setEditingResource({ ...editingResource, url: v })} 
                      required={editingResource?.type === 'Link' || (!editingResource?.id && !resourceFile)}
                      helperText={editingResource?.type === 'Link' ? "Enter a direct link to the web resource." : "If you have a direct link (e.g. Google Drive, Dropbox), paste it here instead of uploading."}
                    />
                    {editingResource?.url && !resourceFile && editingResource?.type !== 'Link' && (
                      <p className="text-[10px] text-green-600 uppercase font-bold mt-1">Current URL will be used unless you upload a new file.</p>
                    )}
                  </div>

                  <div className="flex gap-4 pt-4">
                    <Button type="submit" className="flex-1" disabled={savingResource}>
                      {savingResource ? 'SAVING...' : 'SAVE RESOURCE'}
                    </Button>
                    <Button variant="secondary" onClick={() => setIsResourceModalOpen(false)} disabled={savingResource}>CANCEL</Button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <p className="text-zinc-500 mb-6">Select a resource to open it alongside your test questions.</p>
                  <div className="grid grid-cols-1 gap-3">
                    {resources.length === 0 ? (
                      <div className="text-center py-10 text-zinc-400 italic">No resources available for this test.</div>
                    ) : (
                      resources.map(res => (
                        <button
                          key={res.id}
                          onClick={() => {
                            setActiveResource(res);
                            setIsResourceModalOpen(false);
                          }}
                          className="flex items-center gap-4 p-4 border-2 border-black rounded-2xl hover:bg-zinc-50 transition-all text-left"
                        >
                          <div className="bg-black text-white p-2 rounded-lg">
                            <FileText size={20} />
                          </div>
                          <div>
                            <p className="font-bold">{res.name}</p>
                            <p className="text-[10px] font-black uppercase text-zinc-400">{res.type}</p>
                          </div>
                          <ChevronRight className="ml-auto text-zinc-400" size={20} />
                        </button>
                      ))
                    )}
                  </div>
                  <Button variant="secondary" onClick={() => setIsResourceModalOpen(false)} className="w-full mt-6">CLOSE</Button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </main>

      <AnimatePresence>
        {isCalculatorOpen && (
          <Calculator onClose={() => setIsCalculatorOpen(false)} />
        )}
      </AnimatePresence>

      <Dialog 
        isOpen={dialog.isOpen}
        title={dialog.title}
        message={dialog.message}
        onConfirm={dialog.onConfirm}
        onCancel={(dialog as any).onCancel || (() => setDialog(prev => ({ ...prev, isOpen: false })))}
        type={dialog.type}
      />
    </div>
  );
}

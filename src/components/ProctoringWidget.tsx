import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Camera, AlertTriangle } from 'lucide-react';
import { analyzeProctoring } from '../services/aiService';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { handleFirestoreError } from '../App';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface ProctoringWidgetProps {
  userId: string;
  onWarning: (reason: string) => void;
  onCameraError: (error: string) => void;
  onReady?: () => void;
}

export const ProctoringWidget: React.FC<ProctoringWidgetProps> = ({ userId, onWarning, onCameraError, onReady }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isAnalyzingRef = useRef(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    let activeStream: MediaStream | null = null;
    const timeout = setTimeout(() => {
      if (!activeStream) {
        onCameraError("Camera initialization timed out. Please ensure your camera is connected and not in use by another application.");
      }
    }, 15000);

    async function setupCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        onCameraError("Your browser does not support camera access. Please use a modern browser like Chrome or Edge.");
        return;
      }

      try {
        // Try with ideal constraints first
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user"
          },
          audio: false
        }).catch(async (e) => {
          // Fallback to basic video if ideal fails
          console.warn("Ideal constraints failed, falling back to basic video", e);
          return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        });

        activeStream = stream;
        clearTimeout(timeout);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(e => console.error("Video play failed", e));
            if (onReady) onReady();
          };
        }
      } catch (err: any) {
        clearTimeout(timeout);
        console.error("Camera access error:", err);
        let msg = "Camera access is mandatory for this exam.";
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          msg += " Permission was denied. To fix this:\n1. Click the camera icon in your browser's address bar.\n2. Select 'Always allow' or 'Allow'.\n3. Refresh this page.\n\nIf you don't see an icon, check your browser settings for 'Privacy and Security' > 'Site Settings' > 'Camera'.";
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          msg += " No camera was found on your device. Please connect a camera and try again.";
        } else if (err.name === 'OverconstrainedError') {
          msg += " Your camera does not support the required resolution. Please try a different camera.";
        } else {
          msg += " Error: " + err.message;
        }
        onCameraError(msg);
      }
    }
    setupCamera();

    return () => {
      clearTimeout(timeout);
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []); // Only run once on mount

  useEffect(() => {
    const interval = setInterval(async () => {
      if (videoRef.current && canvasRef.current && !isAnalyzingRef.current) {
        isAnalyzingRef.current = true;
        setIsAnalyzing(true);
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (context && video.videoWidth > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = canvas.toDataURL('image/jpeg', 0.5);

          const result = await analyzeProctoring(imageData);
          console.log("AI Proctoring Result:", result);
          if (result.malpracticeDetected) {
            console.warn("Malpractice detected:", result.reason);
            onWarning(result.reason);
            
            // Log to Firestore
            try {
              await addDoc(collection(db, 'activity_logs'), {
                user_id: userId,
                action: 'AI_PROCTORING_ALERT',
                details: result.reason,
                timestamp: serverTimestamp()
              });
            } catch (e) {
              handleFirestoreError(e, OperationType.CREATE, 'activity_logs');
            }
          }
        }
        isAnalyzingRef.current = false;
        setIsAnalyzing(false);
      }
    }, 7000); // Every 7 seconds for frequent analysis

    return () => clearInterval(interval);
  }, [userId, onWarning]);

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragConstraints={{ left: 0, right: window.innerWidth - 192, top: 0, bottom: window.innerHeight - 144 }}
      className="fixed top-20 right-4 w-48 h-36 bg-black border border-white/20 rounded-lg overflow-hidden shadow-2xl z-[100] cursor-move"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
      <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/50 px-2 py-0.5 rounded text-[10px] text-white">
        <Camera size={10} className={isAnalyzing ? "text-red-500 animate-pulse" : "text-green-500"} />
        <span>AI PROCTORING</span>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </motion.div>
  );
};

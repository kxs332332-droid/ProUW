import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Camera, AlertTriangle, ShieldCheck } from 'lucide-react';
import { analyzeProctoring, getApiKey } from '../services/aiService';

interface ProctoringWidgetProps {
  userId: string;
  onWarning: (reason: string) => void;
  onCheck?: (details: string) => void;
  onCameraError: (error: string) => void;
  onReady?: () => void;
}

export const ProctoringWidget: React.FC<ProctoringWidgetProps> = ({ userId, onWarning, onCheck, onCameraError, onReady }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isAnalyzingRef = useRef(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null);
  const [status, setStatus] = useState<'secure' | 'warning'>('secure');
  const [debugKey, setDebugKey] = useState<string>("");
  const [isKeyMissing, setIsKeyMissing] = useState(false);

  useEffect(() => {
    const apiKey = getApiKey();
    if (apiKey) {
      setDebugKey(`${apiKey.substring(0, 6)}...${apiKey.substring(apiKey.length - 4)}`);
      setIsKeyMissing(false);
      // Keep debug info visible for 60s
      setTimeout(() => setDebugKey(""), 60000);
    } else {
      console.error("ProctoringWidget: No API Key found in environment!");
      setDebugKey("MISSING_KEY");
      setIsKeyMissing(true);
    }
    
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
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user"
          },
          audio: false
        }).catch(async (e) => {
          if (e.name === 'OverconstrainedError' || e.name === 'ConstraintNotSatisfiedError') {
            console.warn("Ideal constraints failed, falling back to basic video", e);
            return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          }
          throw e;
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
          msg += " Permission was denied. \n\nTo fix this:\n1. Click the camera icon in your browser's address bar.\n2. Select 'Always allow' or 'Allow'.\n3. Click 'RETRY CAMERA ACCESS' below.\n\nIf you don't see an icon, check your browser settings for 'Privacy and Security' > 'Site Settings' > 'Camera'.";
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          msg += " No camera was found on your device. Please connect a camera and try again.";
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          msg += " Your camera is already in use by another application. Please close other apps using the camera and retry.";
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
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (videoRef.current && canvasRef.current && !isAnalyzingRef.current) {
        isAnalyzingRef.current = true;
        setIsAnalyzing(true);
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (context && video.videoWidth > 0) {
          try {
            // Resize to a smaller resolution for AI analysis to save bandwidth and tokens
            const targetWidth = 320;
            const scale = Math.min(1, targetWidth / video.videoWidth);
            canvas.width = video.videoWidth * scale;
            canvas.height = video.videoHeight * scale;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Client-side black screen detection as a fallback for robustness
            const pixelData = context.getImageData(0, 0, canvas.width, canvas.height).data;
            let totalBrightness = 0;
            for (let i = 0; i < pixelData.length; i += 4) {
              totalBrightness += (pixelData[i] + pixelData[i+1] + pixelData[i+2]) / 3;
            }
            const avgBrightness = totalBrightness / (pixelData.length / 4);
            
            if (avgBrightness < 15) { // Increased threshold for better detection
              console.warn("Client-side black screen detection triggered. Brightness:", avgBrightness);
              setStatus('warning');
              onWarning("Camera is obscured or black screen detected.");
              setLastCheckTime(new Date());
            } else {
              const imageData = canvas.toDataURL('image/jpeg', 0.5);
              const result = await analyzeProctoring(imageData);
              setLastCheckTime(new Date());

              if (result.malpracticeDetected) {
                console.warn("Malpractice detected:", result.reason);
                setStatus('warning');
                onWarning(result.reason);
                if (onCheck) {
                  onCheck(`Warning: ${result.reason}`);
                }
              } else {
                setStatus('secure');
                if (onCheck) {
                  onCheck("No malpractice detected. Confidence: " + (result.confidence || "N/A"));
                }
              }
            }
          } catch (error: any) {
            console.error("Proctoring analysis cycle error:", error);
            setStatus('warning');
            onWarning(`Analysis Error: ${error.message || "Unknown error"}`);
          }
        }
        isAnalyzingRef.current = false;
        setIsAnalyzing(false);
      }
    }, 10000); // Every 10 seconds to balance security and API usage

    return () => clearInterval(interval);
  }, [userId, onWarning, onCheck]);

  return (
    <motion.div
      drag
      dragMomentum={false}
      className="fixed top-20 right-4 w-48 h-40 bg-black border-2 border-white/20 rounded-xl overflow-hidden shadow-2xl z-[10000] cursor-move"
      initial={{ opacity: 0, scale: 0.8, x: 0, y: 0 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <video ref={videoRef} autoPlay muted playsInline className="w-full h-32 object-cover" />
      
      {/* Debug Key Overlay */}
      {debugKey && (
        <div className={`absolute top-10 left-2 ${isKeyMissing ? 'bg-red-600 animate-pulse' : 'bg-black/80'} text-white text-[8px] px-1.5 py-0.5 rounded font-mono z-50 border border-white/20`}>
          Key: {debugKey}
        </div>
      )}

      <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-full text-[9px] text-white font-bold border border-white/10">
        <div className={`w-1.5 h-1.5 rounded-full ${isAnalyzing ? "bg-blue-500 animate-pulse" : "bg-green-500"}`} />
        <span className="tracking-widest uppercase">AI Proctoring</span>
      </div>

      <div className="bg-zinc-900 p-2 flex flex-col justify-center h-8 border-t border-white/10">
        <div className="flex items-center justify-end text-[8px] text-zinc-400 font-mono uppercase tracking-tighter">
          <span>{lastCheckTime ? lastCheckTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}</span>
        </div>
      </div>
      
      <canvas ref={canvasRef} className="hidden" />
    </motion.div>
  );
};

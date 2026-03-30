import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Gemini AI on the server
const getAiClient = () => {
  // Try multiple sources for the key
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
  
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
    console.error("GEMINI_API_KEY is not set or is a placeholder on the server!");
    return null;
  }

  // Log key info safely to help diagnose issues without exposing the full key
  const keyPreview = apiKey.length > 8 
    ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` 
    : "INVALID_LENGTH";
  console.log(`AI Service: Initializing with API Key [${keyPreview}] (Length: ${apiKey.length})`);

  return new GoogleGenAI({ apiKey });
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // --- API Routes ---
  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  // AI Proctoring Endpoint
  app.post("/api/ai/proctor", async (req, res) => {
    const { imageBuffer } = req.body;
    if (!imageBuffer) return res.status(400).json({ error: "Image buffer is required" });

    const ai = getAiClient();
    if (!ai) return res.status(500).json({ error: "AI Service Unavailable (Missing API Key)" });

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: `Analyze this webcam frame for exam malpractice. 
              CRITICAL CHECKS:
              1. BLACK SCREEN / OBSCURED: If the image is completely black, extremely dark, or clearly obscured (e.g., hand over camera), set malpracticeDetected: true with reason 'Camera is obscured or black screen'.
              2. NO PERSON: If no human face is clearly visible in the frame, set malpracticeDetected: true with reason 'No candidate visible in frame'.
              3. MULTIPLE PEOPLE: If more than one person is visible in the frame, set malpracticeDetected: true with reason 'Multiple people detected'.
              4. PHONE/DEVICES: If a smartphone, tablet, or any other unauthorized electronic device is visible, set malpracticeDetected: true with reason 'Electronic device detected'.
              5. LOOKING AWAY: If the candidate is consistently looking away from the screen (e.g., looking down at a lap, or far to the side) rather than at the monitor, set malpracticeDetected: true with reason 'Candidate consistently looking away'.
              6. TALKING: If the candidate appears to be talking or communicating with someone off-camera, set malpracticeDetected: true with reason 'Candidate appears to be talking'.
  
              If the frame is ambiguous, dark, or you are unsure if a candidate is present, set malpracticeDetected: true with reason 'Ambiguous frame or poor visibility'.
              If the candidate is clearly visible, alone, and focused on the screen, set malpracticeDetected to false.` },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: imageBuffer.split(",")[1],
                },
              },
            ],
          },
        ],
        config: {
          systemInstruction: "You are a highly vigilant exam proctor. Your goal is to detect any sign of cheating or malpractice from a webcam feed. Be extremely precise. Flag black screens, missing candidates, multiple people, and unauthorized devices immediately. If the frame is dark or obscured, it is a violation.",
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          maxOutputTokens: 1024,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              malpracticeDetected: { type: Type.BOOLEAN },
              reason: { type: Type.STRING },
              confidence: { type: Type.NUMBER }
            },
            required: ["malpracticeDetected", "reason", "confidence"]
          }
        }
      });

      res.json(JSON.parse(response.text || "{}"));
    } catch (error: any) {
      console.error("Server AI Proctoring Error:", error);
      const statusCode = error.status || 500;
      const errorMessage = error.message || "Internal Server Error";
      
      // Provide specific guidance for API key issues
      if (errorMessage.includes("API key not valid")) {
        return res.status(400).json({ 
          error: "Invalid Gemini API Key. Please check your environment variables.",
          details: "Ensure GEMINI_API_KEY is correctly set in the Secrets panel (AI Studio) or Environment Variables (Render/Replit)."
        });
      }

      res.status(statusCode).json({ error: errorMessage });
    }
  });

  // AI Scoring Endpoint
  app.post("/api/ai/score", async (req, res) => {
    const { userExplanation, masterRationale } = req.body;
    
    const ai = getAiClient();
    if (!ai) return res.status(500).json({ error: "AI Service Unavailable (Missing API Key)" });

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              {
                text: `Compare the user's explanation with the master rationale for a mortgage underwriting question. 
                Master Rationale: ${masterRationale}
                User Explanation: ${userExplanation}
                
                Provide a similarity score from 0 to 100 based on how well the user captures the core concepts and technical accuracy.`
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          maxOutputTokens: 1024,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER },
              feedback: { type: Type.STRING }
            },
            required: ["score", "feedback"]
          }
        }
      });

      res.json(JSON.parse(response.text || "{}"));
    } catch (error: any) {
      console.error("Server AI Scoring Error:", error);
      const statusCode = error.status || 500;
      const errorMessage = error.message || "Internal Server Error";

      if (errorMessage.includes("API key not valid")) {
        return res.status(400).json({ 
          error: "Invalid Gemini API Key. Please check your environment variables."
        });
      }

      res.status(statusCode).json({ error: errorMessage });
    }
  });

  // Secure Proxy for Allowed Resources
  app.get("/api/proxy", async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) return res.status(400).send("URL is required");

    // Domain Restriction: Only allow Fannie Mae and Freddie Mac
    const allowedDomains = [
      'selling-guide.fanniemae.com',
      'guide.freddiemac.com'
    ];
    
    try {
      const urlObj = new URL(targetUrl);
      if (!allowedDomains.some(domain => urlObj.hostname.endsWith(domain))) {
        return res.status(403).send("Domain not allowed");
      }

      const response = await axios.get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        responseType: 'text'
      });

      // Set headers
      res.set('Content-Type', response.headers['content-type'] || 'text/html');
      
      // Strip security headers that prevent embedding
      res.removeHeader('X-Frame-Options');
      res.removeHeader('Content-Security-Policy');
      res.removeHeader('Content-Security-Policy-Report-Only');
      
      // Inject <base> tag and proxy script
      let html = response.data;
      const baseTag = `<base href="${urlObj.origin}${urlObj.pathname}">`;
      const proxyScript = `
        <script>
          document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && link.href) {
              const url = new URL(link.href);
              const allowedDomains = ['selling-guide.fanniemae.com', 'guide.freddiemac.com'];
              if (allowedDomains.some(domain => url.hostname.endsWith(domain))) {
                // If it's a relative-looking link that's actually absolute due to <base>, 
                // we still want to proxy it to keep it in the iframe
                e.preventDefault();
                window.location.href = '/api/proxy?url=' + encodeURIComponent(link.href);
              }
            }
          });
        </script>
      `;
      
      html = html.replace('<head>', `<head>${baseTag}`);
      html = html.replace('</body>', `${proxyScript}</body>`);

      res.send(html);
    } catch (error) {
      console.error("Proxy error:", error);
      res.status(500).send("Failed to fetch resource");
    }
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

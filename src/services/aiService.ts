import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function analyzeProctoring(imageBuffer: string) {
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    console.error("AI Proctoring: GEMINI_API_KEY is missing!");
    return { malpracticeDetected: true, reason: "Proctoring Service Unavailable (Missing API Key)", confidence: 0 };
  }

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

    const text = response.text;
    console.log("AI Proctoring Raw Response:", text);
    if (!text) return { malpracticeDetected: false, reason: "No response from AI", confidence: 0 };
    
    const result = JSON.parse(text);
    return result;
  } catch (error: any) {
    if (error?.message?.includes("429") || error?.message?.includes("RESOURCE_EXHAUSTED")) {
      console.warn("AI Proctoring: Rate limit exceeded (429). Skipping analysis.");
      return { malpracticeDetected: false, reason: "AI Service Busy (Rate Limit)", confidence: 0 };
    }
    console.error("AI Proctoring Critical Error:", error);
    // If it's a foundational error (like API key invalid), we should probably flag it
    if (error?.message?.includes("API key not valid") || error?.message?.includes("not found")) {
      return { malpracticeDetected: true, reason: "Proctoring Service Error (API Key Issue)", confidence: 0 };
    }
    return { malpracticeDetected: false, reason: "Error in analysis", confidence: 0 };
  }
}

export async function scoreExplanation(userExplanation: string, masterRationale: string) {
  if (!userExplanation || userExplanation.trim().length < 5) {
    return { score: 0, feedback: "Explanation too short or missing." };
  }
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

    const result = JSON.parse(response.text || "{}");
    return {
      score: typeof result.score === 'number' ? Math.min(100, Math.max(0, result.score)) : 0,
      feedback: result.feedback || ""
    };
  } catch (error: any) {
    if (error?.message?.includes("429") || error?.message?.includes("RESOURCE_EXHAUSTED")) {
      console.warn("AI Scoring: Rate limit exceeded (429). Defaulting to 0.");
      return { score: 0, feedback: "AI Service Busy (Rate Limit). Scoring deferred." };
    }
    console.error("AI Scoring Error:", error);
    return { score: 0, feedback: "Error in scoring" };
  }
}

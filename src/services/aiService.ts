import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function analyzeProctoring(imageBuffer: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: "Analyze this webcam frame for malpractice during an exam. Look for: multiple people, looking away frequently, using a phone, or talking. If you see anything suspicious, set malpracticeDetected to true and provide a clear reason." },
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
        systemInstruction: "You are a strict exam proctor. Your goal is to detect any sign of cheating or malpractice from a webcam feed. Be precise and only flag clear violations. If multiple people are present, or the candidate is using a phone, or talking, or looking away from the screen consistently, mark it as malpractice.",
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
    if (!text) return { malpracticeDetected: false, reason: "No response from AI" };
    return JSON.parse(text);
  } catch (error: any) {
    if (error?.message?.includes("429") || error?.message?.includes("RESOURCE_EXHAUSTED")) {
      console.warn("AI Proctoring: Rate limit exceeded (429). Skipping analysis.");
      return { malpracticeDetected: false, reason: "AI Service Busy (Rate Limit)" };
    }
    console.error("AI Proctoring Error:", error);
    return { malpracticeDetected: false, reason: "Error in analysis" };
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

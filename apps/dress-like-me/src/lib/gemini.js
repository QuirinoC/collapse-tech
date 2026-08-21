import { GoogleGenAI } from "@google/genai";
import {
  garmentExtractionJsonSchema,
  garmentExtractionSchema,
} from "@/lib/schemas";

const PROMPT_VERSION = "garment-extraction-v1";

export async function analyzeOutfitImage({ bytes, mimeType }) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY is not configured.");

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "Analyze only clearly visible wearable items in this image.",
              "Describe observable attributes, not the wearer's identity.",
              "Do not infer a brand unless a logo or distinctive item provides evidence.",
              "Write a concise shopping query for a visually similar item.",
              "Use lower confidence when an item is obscured.",
            ].join(" "),
          },
          {
            inlineData: {
              mimeType,
              data: Buffer.from(bytes).toString("base64"),
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: garmentExtractionJsonSchema,
      temperature: 0.2,
    },
  });

  if (!response.text) throw new Error("Gemini returned an empty analysis.");

  let parsed;
  try {
    parsed = JSON.parse(response.text);
  } catch {
    throw new Error("Gemini returned malformed JSON.");
  }

  return {
    ...garmentExtractionSchema.parse(parsed),
    model,
    promptVersion: PROMPT_VERSION,
  };
}

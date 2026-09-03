/**
 * Thin Gemini REST client for generateContent.
 * Uses `GEMINI_API_KEY` and the model slug from `leseno.ai_models`.
 */

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

export type GeminiGenerateInput = {
  modelSlug: string;
  systemInstruction?: string;
  userText: string;
  jsonOutput?: boolean;
};

export type GeminiGenerateResult = {
  text: string;
  modelSlug: string;
};

function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim() ?? "";
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY fehlt. Bitte in .env.local und Coolify setzen.",
    );
  }
  return key;
}

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  error?: {
    message?: string;
    status?: string;
  };
};

/**
 * Calls Gemini generateContent and returns concatenated text parts.
 */
export async function generateWithGemini(
  input: GeminiGenerateInput,
): Promise<GeminiGenerateResult> {
  const apiKey = getGeminiApiKey();
  const url = `${GEMINI_API_BASE}/${encodeURIComponent(input.modelSlug)}:generateContent`;

  const body: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [{ text: input.userText }],
      },
    ],
  };

  if (input.systemInstruction?.trim()) {
    body.systemInstruction = {
      parts: [{ text: input.systemInstruction }],
    };
  }

  if (input.jsonOutput) {
    body.generationConfig = {
      responseMimeType: "application/json",
    };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as GeminiResponse;

  if (!response.ok || payload.error) {
    throw new Error(
      payload.error?.message ??
        `Gemini-Anfrage fehlgeschlagen (${response.status}).`,
    );
  }

  const text =
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? "";

  if (!text) {
    throw new Error("Gemini hat keinen Text zurückgegeben.");
  }

  return { text, modelSlug: input.modelSlug };
}

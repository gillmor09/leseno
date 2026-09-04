/**
 * OpenAI-compatible chat completions client.
 * Primary target: IONOS Cloud AI Model Hub (`IONOS_API_TOKEN`).
 * See https://docs.ionos.com/cloud/ai/ai-model-hub/how-tos/text-generation.md
 */

const DEFAULT_IONOS_BASE_URL =
  "https://openai.inference.de-txl.ionos.com/v1";

export type OpenAiCompatibleGenerateInput = {
  modelSlug: string;
  systemInstruction?: string;
  userText: string;
  jsonOutput?: boolean;
};

export type OpenAiCompatibleGenerateResult = {
  text: string;
  modelSlug: string;
};

function getIonosApiToken(): string {
  const token = process.env.IONOS_API_TOKEN?.trim() ?? "";
  if (!token) {
    throw new Error(
      "IONOS_API_TOKEN fehlt. Bitte in .env.local und Coolify setzen.",
    );
  }
  return token;
}

function getIonosBaseUrl(): string {
  const configured =
    process.env.IONOS_OPENAI_BASE_URL?.trim() || DEFAULT_IONOS_BASE_URL;
  return configured.replace(/\/+$/, "");
}

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning?: string | null;
    };
    finish_reason?: string;
  }>;
  error?: {
    message?: string;
    type?: string;
  };
};

/**
 * Calls `/v1/chat/completions` on the IONOS OpenAI-compatible endpoint.
 */
export async function generateWithOpenAiCompatible(
  input: OpenAiCompatibleGenerateInput,
): Promise<OpenAiCompatibleGenerateResult> {
  const apiKey = getIonosApiToken();
  const baseUrl = getIonosBaseUrl();
  const url = `${baseUrl}/chat/completions`;

  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (input.systemInstruction?.trim()) {
    messages.push({
      role: "system",
      content: input.systemInstruction.trim(),
    });
  }
  messages.push({ role: "user", content: input.userText });

  const body: Record<string, unknown> = {
    model: input.modelSlug,
    messages,
  };

  if (input.jsonOutput) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as ChatCompletionResponse;

  if (!response.ok || payload.error) {
    throw new Error(
      payload.error?.message ??
        `IONOS-Anfrage fehlgeschlagen (${response.status}).`,
    );
  }

  const text = payload.choices?.[0]?.message?.content?.trim() ?? "";

  if (!text) {
    throw new Error("IONOS hat keinen Text zurückgegeben.");
  }

  return { text, modelSlug: input.modelSlug };
}

/**
 * Anthropic Messages API client for Claude text models.
 * Auth: `CLAUDE_API_KEY` (Coolify / `.env.local`).
 */

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export type ClaudeGenerateInput = {
  modelSlug: string;
  systemInstruction?: string;
  userText: string;
  jsonOutput?: boolean;
};

export type ClaudeGenerateResult = {
  text: string;
  modelSlug: string;
};

function getClaudeApiKey(): string {
  const key = process.env.CLAUDE_API_KEY?.trim().replace(/^["']|["']$/g, "") ?? "";
  if (!key) {
    throw new Error(
      "CLAUDE_API_KEY fehlt. Bitte in .env.local und Coolify setzen.",
    );
  }
  // Anthropic keys are `sk-ant-…`; `sk-proj-…` is OpenAI and will always 401.
  if (key.startsWith("sk-proj-") || key.startsWith("sk-")) {
    if (!key.startsWith("sk-ant-")) {
      throw new Error(
        "CLAUDE_API_KEY sieht nicht nach einem Anthropic-Key aus (erwartet „sk-ant-…“). Bitte den Key aus console.anthropic.com eintragen — nicht den OpenAI-Key.",
      );
    }
  }
  return key;
}

type ClaudeContentBlock = {
  type?: string;
  text?: string;
};

type ClaudeMessagesResponse = {
  content?: ClaudeContentBlock[];
  error?: {
    type?: string;
    message?: string;
  };
};

/**
 * Calls Anthropic `/v1/messages`.
 * Thinking is disabled for Leseno throughput/cost; Sonnet 5 still writes well without it.
 */
export async function generateWithClaude(
  input: ClaudeGenerateInput,
): Promise<ClaudeGenerateResult> {
  const apiKey = getClaudeApiKey();

  let userText = input.userText;
  if (input.jsonOutput) {
    userText = `${userText}\n\nAntworte ausschließlich mit gültigem JSON, ohne Markdown-Codeblöcke.`;
  }

  const body: Record<string, unknown> = {
    model: input.modelSlug,
    max_tokens: 8192,
    thinking: { type: "disabled" },
    messages: [
      {
        role: "user",
        content: userText,
      },
    ],
  };

  if (input.systemInstruction?.trim()) {
    body.system = input.systemInstruction.trim();
  }

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as ClaudeMessagesResponse;

  if (!response.ok || payload.error) {
    throw new Error(
      payload.error?.message ??
        `Claude-Anfrage fehlgeschlagen (${response.status}).`,
    );
  }

  const text =
    payload.content
      ?.filter((block) => block.type === "text" || Boolean(block.text))
      .map((block) => block.text ?? "")
      .join("")
      .trim() ?? "";

  if (!text) {
    throw new Error("Claude hat keinen Text zurückgegeben.");
  }

  return { text, modelSlug: input.modelSlug };
}

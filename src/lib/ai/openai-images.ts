/**
 * OpenAI Images API (`/v1/images/generations`).
 * Wired model: `gpt-image-2.5-sunburst` (provider `openai-image`).
 * Key: `OPENAI_API_KEY` via `getOpenAiApiKey`.
 */

import { getOpenAiApiKey, getOpenAiBaseUrl } from "@/lib/ai/openai";

export type OpenAiImageQuality =
  | "auto"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export type OpenAiImageGenerateInput = {
  prompt: string;
  /** e.g. `1024x1024`, `1024x1536`, `1600x2400` (cover native 2:3). */
  size?: string;
  modelSlug?: string;
  quality?: OpenAiImageQuality;
  outputFormat?: "png" | "jpeg" | "webp";
};

export type OpenAiImageGenerateResult = {
  dataUrl: string;
  modelSlug: string;
};

type ImagesGenerationsResponse = {
  data?: Array<{
    b64_json?: string;
    url?: string;
  }>;
  error?: {
    message?: string;
    code?: string | number;
    type?: string;
  };
};

const DEFAULT_MODEL = "gpt-image-2.5-sunburst";

/**
 * Generates one image via OpenAI Images API and returns a data URL.
 */
export async function generateOpenAiImage(
  input: OpenAiImageGenerateInput,
): Promise<OpenAiImageGenerateResult> {
  const apiKey = getOpenAiApiKey();
  const baseUrl = getOpenAiBaseUrl();
  const modelSlug = input.modelSlug?.trim() || DEFAULT_MODEL;
  const size = input.size ?? "1024x1024";
  const outputFormat = input.outputFormat ?? "png";
  const quality = input.quality ?? "high";

  const response = await fetch(`${baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelSlug,
      prompt: input.prompt,
      n: 1,
      size,
      quality,
      output_format: outputFormat,
    }),
  });

  let payload: ImagesGenerationsResponse;
  try {
    payload = (await response.json()) as ImagesGenerationsResponse;
  } catch {
    throw new Error(
      `OpenAI-Bildgenerierung fehlgeschlagen (${response.status}).`,
    );
  }

  if (!response.ok || payload.error) {
    throw new Error(
      `${
        payload.error?.message?.trim() ||
        `OpenAI-Bildgenerierung fehlgeschlagen (${response.status}).`
      } (model=${modelSlug}, size=${size})`,
    );
  }

  const b64 = payload.data?.[0]?.b64_json?.trim();
  if (b64) {
    const mime =
      outputFormat === "jpeg"
        ? "image/jpeg"
        : outputFormat === "webp"
          ? "image/webp"
          : "image/png";
    return {
      dataUrl: `data:${mime};base64,${b64}`,
      modelSlug,
    };
  }

  const url = payload.data?.[0]?.url?.trim();
  if (url) {
    const imgRes = await fetch(url);
    if (!imgRes.ok) {
      throw new Error(
        `OpenAI-Bild-URL konnte nicht geladen werden (${imgRes.status}).`,
      );
    }
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const contentType = imgRes.headers.get("content-type")?.trim() || "image/png";
    return {
      dataUrl: `data:${contentType};base64,${buf.toString("base64")}`,
      modelSlug,
    };
  }

  throw new Error("OpenAI hat kein Bild (b64_json/url) zurückgegeben.");
}

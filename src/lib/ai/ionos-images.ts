/**
 * IONOS OpenAI-compatible image generation (`/v1/images/generations`).
 * Default: FLUX.2-klein at 256×256 for story illustrations.
 */

import {
  getIonosApiToken,
  getIonosBaseUrl,
  getIonosImageModelSlug,
} from "@/lib/ai/ionos";

export type IonosImageGenerateInput = {
  prompt: string;
  /** OpenAI size string, e.g. `256x256`. */
  size?: string;
  /** Override model slug (defaults to `IONOS_IMAGE_MODEL` / FLUX.2-klein). */
  modelSlug?: string;
  outputFormat?: "png" | "jpeg" | "webp";
};

export type IonosImageGenerateResult = {
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
  };
};

/**
 * Generates one square illustration and returns a data URL for HTML embedding.
 */
export async function generateIonosImage(
  input: IonosImageGenerateInput,
): Promise<IonosImageGenerateResult> {
  const apiKey = getIonosApiToken();
  const baseUrl = getIonosBaseUrl();
  const modelSlug = input.modelSlug?.trim() || getIonosImageModelSlug();
  const size = input.size ?? "256x256";
  const outputFormat = input.outputFormat ?? "png";

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
      output_format: outputFormat,
      response_format: "b64_json",
    }),
  });

  const payload = (await response.json()) as ImagesGenerationsResponse;

  if (!response.ok || payload.error) {
    throw new Error(
      payload.error?.message ??
        `IONOS-Bildgenerierung fehlgeschlagen (${response.status}).`,
    );
  }

  const b64 = payload.data?.[0]?.b64_json?.trim();
  if (!b64) {
    throw new Error("IONOS hat kein Bild (b64_json) zurückgegeben.");
  }

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

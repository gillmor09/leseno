/**
 * Gemini Veo video generation via `predictLongRunning` (Gemini API / GEMINI_API_KEY).
 * Image→video: `image.bytesBase64Encoded`.
 * Video extension: `video.uri` from a prior Veo generation only (not uploaded files).
 */

import { getGeminiApiKey } from "@/lib/ai/gemini";

const GEMINI_API_ROOT = "https://generativelanguage.googleapis.com/v1beta";

export const DEFAULT_VEO_MODEL = "veo-3.1-generate-preview";

/** Veo duration options (seconds). Longer values may depend on model access. */
export const VEO_DURATION_SECONDS = [4, 6, 8, 10, 12, 15, 20] as const;
export type VeoDurationSeconds = (typeof VEO_DURATION_SECONDS)[number];

export type VeoAspectRatio = "16:9" | "9:16";

export type GeminiVideoSource =
  | {
      kind: "image";
      mimeType: string;
      /** Raw base64 without data-URL prefix. */
      base64: string;
    }
  | {
      kind: "video-uri";
      /** Gemini Files download URI from a previous Veo result. */
      uri: string;
    };

export type GenerateGeminiVideoInput = {
  prompt: string;
  source: GeminiVideoSource;
  modelSlug?: string;
  durationSeconds?: VeoDurationSeconds;
  aspectRatio?: VeoAspectRatio;
};

export type GenerateGeminiVideoResult = {
  /** MP4 bytes. */
  buffer: Buffer;
  mimeType: string;
  modelSlug: string;
  durationSeconds: VeoDurationSeconds;
  operationName: string;
  /** Gemini download URI (usable for Veo extension for ~2 days). */
  veoFileUri: string | null;
};

type LongRunningStart = {
  name?: string;
  error?: { message?: string };
};

type LongRunningStatus = {
  name?: string;
  done?: boolean;
  error?: { message?: string; status?: string };
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{
        video?: { uri?: string; videoBytes?: string };
      }>;
      raiMediaFilteredCount?: number;
      raiMediaFilteredReasons?: string[];
    };
  };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Starts Veo, polls until done, downloads the MP4.
 * Typical runtime: 1–3 minutes.
 */
export async function generateWithGeminiVideo(
  input: GenerateGeminiVideoInput,
): Promise<GenerateGeminiVideoResult> {
  const apiKey = getGeminiApiKey();
  const modelSlug = (input.modelSlug?.trim() || DEFAULT_VEO_MODEL).trim();
  const durationSeconds = input.durationSeconds ?? 8;
  const aspectRatio = input.aspectRatio ?? "16:9";
  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new Error("Prompt für den Video-Clip fehlt.");
  }

  const instance: Record<string, unknown> = { prompt };
  if (input.source.kind === "image") {
    // Veo image-to-video expects Vertex-style bytes, not Gemini inlineData.
    instance.image = {
      mimeType: input.source.mimeType,
      bytesBase64Encoded: input.source.base64,
    };
  } else {
    const uri = input.source.uri.trim();
    if (!uri) {
      throw new Error(
        "Zum Verlängern fehlt die Gemini-Video-URI des Ausgangs-Clips.",
      );
    }
    // Extension only accepts the URI from a prior Veo generation — not base64 uploads.
    instance.video = { uri };
  }

  const startUrl = `${GEMINI_API_ROOT}/models/${encodeURIComponent(modelSlug)}:predictLongRunning`;
  const startResponse = await fetch(startUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      instances: [instance],
      parameters: {
        sampleCount: 1,
        durationSeconds,
        aspectRatio,
        resolution: "720p",
      },
    }),
  });

  const startPayload = (await startResponse.json()) as LongRunningStart;
  if (!startResponse.ok || startPayload.error || !startPayload.name) {
    throw new Error(
      startPayload.error?.message ??
        `Video-Generierung starten fehlgeschlagen (${startResponse.status}).`,
    );
  }

  const operationName = startPayload.name;
  const deadline = Date.now() + 8 * 60_000;
  let status: LongRunningStatus | null = null;

  while (Date.now() < deadline) {
    await sleep(8_000);
    const statusUrl = `${GEMINI_API_ROOT}/${operationName}`;
    const statusResponse = await fetch(statusUrl, {
      headers: { "x-goog-api-key": apiKey },
    });
    status = (await statusResponse.json()) as LongRunningStatus;
    if (!statusResponse.ok || status.error) {
      throw new Error(
        status.error?.message ??
          `Video-Statusabfrage fehlgeschlagen (${statusResponse.status}).`,
      );
    }
    if (status.done) break;
  }

  if (!status?.done) {
    throw new Error(
      "Video-Generierung hat das Zeitlimit überschritten. Bitte später erneut versuchen.",
    );
  }

  const samples = status.response?.generateVideoResponse?.generatedSamples;
  const sample = samples?.[0];
  const filtered =
    status.response?.generateVideoResponse?.raiMediaFilteredCount ?? 0;
  if (!sample?.video && filtered > 0) {
    const reason =
      status.response?.generateVideoResponse?.raiMediaFilteredReasons?.[0];
    throw new Error(
      reason
        ? `Video von der Sicherheitsfilterung blockiert: ${reason}`
        : "Video von der Sicherheitsfilterung blockiert.",
    );
  }

  const veoFileUri = sample?.video?.uri?.trim() || null;

  if (sample?.video?.videoBytes) {
    return {
      buffer: Buffer.from(sample.video.videoBytes, "base64"),
      mimeType: "video/mp4",
      modelSlug,
      durationSeconds,
      operationName,
      veoFileUri,
    };
  }

  if (!veoFileUri) {
    throw new Error("Gemini hat kein Video zurückgegeben.");
  }

  const download = await fetch(veoFileUri, {
    headers: { "x-goog-api-key": apiKey },
    redirect: "follow",
  });
  if (!download.ok) {
    throw new Error(
      `Video-Download fehlgeschlagen (${download.status}).`,
    );
  }
  const arrayBuffer = await download.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: "video/mp4",
    modelSlug,
    durationSeconds,
    operationName,
    veoFileUri,
  };
}

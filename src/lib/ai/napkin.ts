/**
 * Napkin Visuals API — text → diagram/infographic (async create → poll → download).
 * Auth: `NAPKIN_API_KEY` (Bearer) in `.env.local` / Coolify.
 *
 * @see https://api.napkin.ai/
 */

const NAPKIN_BASE_URL =
  process.env.NAPKIN_BASE_URL?.trim() || "https://api.napkin.ai";

const DEFAULT_POLL_MS = 2_500;
const MAX_POLL_MS = 12_000;
const MAX_WAIT_MS = 180_000;

export type NapkinVisualFormat = "png" | "svg" | "ppt";

export type NapkinGenerateVisualInput = {
  /** Main text Napkin turns into a visual (German for Sachbuch). */
  content: string;
  /** Optional surrounding context for better layout. */
  context?: string;
  format?: NapkinVisualFormat;
  /** BCP 47, e.g. de-DE. */
  language?: string;
  /** Built-in or custom style id from Napkin. */
  styleId?: string;
  /** Prefer a single visual for book pages. */
  numberOfVisuals?: 1 | 2 | 3 | 4;
  /** Hint when API supports orientation. */
  orientation?: "portrait" | "landscape" | "square";
};

export type NapkinGenerateVisualResult = {
  requestId: string;
  /** data:image/png;base64,… or data:image/svg+xml;base64,… */
  dataUrl: string;
  format: NapkinVisualFormat | string;
};

function getNapkinApiKey(): string {
  const key = process.env.NAPKIN_API_KEY?.trim() ?? "";
  if (!key) {
    throw new Error(
      "NAPKIN_API_KEY fehlt. Bitte in .env.local und Coolify setzen.",
    );
  }
  return key;
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${getNapkinApiKey()}`,
    Accept: "application/json",
  };
}

async function readNapkinError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as {
      error?: string;
      message?: string;
    };
    const code = body.error?.trim();
    const msg = body.message?.trim();
    if (code && msg) return `${code}: ${msg}`;
    if (msg) return msg;
    if (code) return code;
  } catch {
    /* ignore */
  }
  return `HTTP ${res.status}`;
}

function pickRequestId(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const row = raw as Record<string, unknown>;
  for (const key of ["id", "request_id", "requestId"]) {
    const v = row[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

type GeneratedFile = {
  url?: string;
  file_id?: string;
  fileId?: string;
  id?: string;
  format?: string;
};

function pickGeneratedFiles(raw: unknown): GeneratedFile[] {
  if (!raw || typeof raw !== "object") return [];
  const row = raw as Record<string, unknown>;
  const list = row.generated_files ?? row.generatedFiles;
  if (!Array.isArray(list)) return [];
  return list.filter((f): f is GeneratedFile => Boolean(f) && typeof f === "object");
}

function pickStatus(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const row = raw as Record<string, unknown>;
  const s = row.status;
  return typeof s === "string" ? s.trim().toLowerCase() : "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a Napkin visual request; returns request id.
 */
export async function createNapkinVisualRequest(
  input: NapkinGenerateVisualInput,
): Promise<string> {
  const content = input.content.trim();
  if (content.length < 8) {
    throw new Error("Napkin: content zu kurz.");
  }

  const body: Record<string, unknown> = {
    content,
    format: input.format ?? "png",
    language: input.language ?? "de-DE",
    number_of_visuals: input.numberOfVisuals ?? 1,
  };
  if (input.context?.trim()) body.context = input.context.trim();
  if (input.styleId?.trim()) body.style_id = input.styleId.trim();
  if (input.orientation) body.orientation = input.orientation;

  const res = await fetch(`${NAPKIN_BASE_URL}/v1/visual`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Napkin create failed — ${await readNapkinError(res)}`);
  }

  const json: unknown = await res.json();
  const id = pickRequestId(json);
  if (!id) {
    throw new Error("Napkin create: keine request-id in der Antwort.");
  }
  return id;
}

/**
 * Poll until completed/failed/expired; return status payload.
 */
export async function waitForNapkinVisual(
  requestId: string,
): Promise<{ status: string; files: GeneratedFile[]; raw: unknown }> {
  const started = Date.now();
  let delay = DEFAULT_POLL_MS;

  while (Date.now() - started < MAX_WAIT_MS) {
    const res = await fetch(
      `${NAPKIN_BASE_URL}/v1/visual/${encodeURIComponent(requestId)}/status`,
      { method: "GET", headers: authHeaders() },
    );

    if (res.status === 410) {
      throw new Error("Napkin: Request abgelaufen (410).");
    }
    if (!res.ok) {
      throw new Error(`Napkin status failed — ${await readNapkinError(res)}`);
    }

    const json: unknown = await res.json();
    const status = pickStatus(json);
    const files = pickGeneratedFiles(json);

    if (status === "completed") {
      return { status, files, raw: json };
    }
    if (status === "failed" || status === "error") {
      const msg =
        json && typeof json === "object" && "message" in json
          ? String((json as { message?: unknown }).message ?? "")
          : "";
      throw new Error(
        msg.trim()
          ? `Napkin generation failed: ${msg.trim()}`
          : "Napkin generation failed.",
      );
    }

    await sleep(delay);
    delay = Math.min(MAX_POLL_MS, Math.round(delay * 1.35));
  }

  throw new Error("Napkin: Timeout beim Warten auf die Infografik.");
}

/**
 * Download first generated file as data URL (auth required on Napkin URLs).
 */
export async function downloadNapkinVisualFile(input: {
  requestId: string;
  file: GeneratedFile;
}): Promise<{ dataUrl: string; format: string }> {
  const fileId =
    input.file.file_id?.trim() ||
    input.file.fileId?.trim() ||
    input.file.id?.trim() ||
    "";
  const url = input.file.url?.trim() || "";

  let res: Response;
  if (url) {
    res = await fetch(url, { method: "GET", headers: authHeaders() });
  } else if (fileId) {
    res = await fetch(
      `${NAPKIN_BASE_URL}/v1/visual/${encodeURIComponent(input.requestId)}/file/${encodeURIComponent(fileId)}`,
      { method: "GET", headers: authHeaders() },
    );
  } else {
    throw new Error("Napkin: generated_files ohne url/file_id.");
  }

  if (!res.ok) {
    throw new Error(`Napkin download failed — ${await readNapkinError(res)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  const formatHint = (input.file.format || "").toLowerCase();

  let mime = "image/png";
  let format = "png";
  if (contentType.includes("svg") || formatHint === "svg") {
    mime = "image/svg+xml";
    format = "svg";
  } else if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    mime = "image/jpeg";
    format = "jpeg";
  } else if (contentType.includes("png") || formatHint === "png") {
    mime = "image/png";
    format = "png";
  }

  return {
    dataUrl: `data:${mime};base64,${buf.toString("base64")}`,
    format,
  };
}

/**
 * End-to-end: create → poll → download first visual as data URL.
 */
export async function generateNapkinVisual(
  input: NapkinGenerateVisualInput,
): Promise<NapkinGenerateVisualResult> {
  const requestId = await createNapkinVisualRequest(input);
  const { files } = await waitForNapkinVisual(requestId);
  const file = files[0];
  if (!file) {
    throw new Error("Napkin: completed ohne generated_files.");
  }
  const downloaded = await downloadNapkinVisualFile({ requestId, file });
  return {
    requestId,
    dataUrl: downloaded.dataUrl,
    format: downloaded.format,
  };
}

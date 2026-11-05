/**
 * Sachbuch Hörbuch: track Abschnitte, Tolino filenames, spoken-text helpers.
 * Audio bytes live in Storage (`sachbuch-hoerbuch`); meta in `idee.hoerbuch`.
 */

import type {
  SachbuchHoerbuchSample,
  SachbuchHoerbuchState,
  SachbuchHoerbuchTrack,
  SachbuchHoerbuchTrackAudio,
  SachbuchKontext,
} from "@/lib/sachbuch/types";
import { sachbuchKapitelExportBody } from "@/lib/sachbuch/parse";

/** Default Gemini 3.8 Flash TTS prebuilt voice (firm / narration-friendly). */
export const SACHBUCH_HOERBUCH_DEFAULT_VOICE = "Kore";

/** Gemini model for Sachbuch Hörbuch (Tolino). */
export const SACHBUCH_HOERBUCH_MODEL_SLUG = "gemini-3.8-flash-tts";

/** Soft style for German non-fiction narration. */
export const SACHBUCH_HOERBUCH_DEFAULT_STYLE =
  "Ruhige, klare deutschsprachige Sachbuch-Erzählstimme: professionell, warm, ohne Übertreibung.";

/** Hörprobe target window for Tolino Media. */
export const SACHBUCH_HOERBUCH_SAMPLE_MIN_SEC = 90;
export const SACHBUCH_HOERBUCH_SAMPLE_MAX_SEC = 180;
export const SACHBUCH_HOERBUCH_SAMPLE_TARGET_SEC = 120;

export function emptySachbuchHoerbuchState(): SachbuchHoerbuchState {
  return {
    voiceId: SACHBUCH_HOERBUCH_DEFAULT_VOICE,
    style: SACHBUCH_HOERBUCH_DEFAULT_STYLE,
    tracks: [],
    sample: null,
    tracksBuiltAt: null,
  };
}

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

function parseTrackAudio(raw: unknown): SachbuchHoerbuchTrackAudio | null {
  const row = asRecord(raw);
  const storagePath =
    typeof row.storagePath === "string" ? row.storagePath.trim() : "";
  const byteSize =
    typeof row.byteSize === "number" && Number.isFinite(row.byteSize)
      ? Math.max(0, Math.round(row.byteSize))
      : 0;
  if (!storagePath || byteSize < 100) return null;
  return {
    storagePath,
    byteSize,
    durationSec:
      typeof row.durationSec === "number" && Number.isFinite(row.durationSec)
        ? row.durationSec
        : null,
    modelSlug:
      typeof row.modelSlug === "string" ? row.modelSlug.trim() : "",
    voiceId: typeof row.voiceId === "string" ? row.voiceId.trim() : "",
    generatedAt:
      typeof row.generatedAt === "string" ? row.generatedAt.trim() : "",
  };
}

function parseSample(raw: unknown): SachbuchHoerbuchSample | null {
  const row = asRecord(raw);
  const storagePath =
    typeof row.storagePath === "string" ? row.storagePath.trim() : "";
  const fileName =
    typeof row.fileName === "string" ? row.fileName.trim() : "00_Hoerprobe.mp3";
  const byteSize =
    typeof row.byteSize === "number" && Number.isFinite(row.byteSize)
      ? Math.max(0, Math.round(row.byteSize))
      : 0;
  const durationSec =
    typeof row.durationSec === "number" && Number.isFinite(row.durationSec)
      ? row.durationSec
      : 0;
  if (!storagePath || byteSize < 100) return null;
  return {
    storagePath,
    fileName: fileName || "00_Hoerprobe.mp3",
    byteSize,
    durationSec,
    generatedAt:
      typeof row.generatedAt === "string" ? row.generatedAt.trim() : "",
  };
}

/** UI/DB preview only — full spoken text is rebuilt at TTS time. */
export const SACHBUCH_HOERBUCH_TRACK_PREVIEW_CHARS = 280;

/**
 * Persist tracks without multi-100k spoken bodies (those duplicated the book
 * inside `idee` and froze admin tab switches). Keep a short preview + charCount.
 */
export function toPersistedHoerbuchTracks(
  tracks: SachbuchHoerbuchTrack[],
): SachbuchHoerbuchTrack[] {
  return tracks.map((t) => ({
    ...t,
    charCount: t.charCount > 0 ? t.charCount : t.text.length,
    text: t.text.slice(0, SACHBUCH_HOERBUCH_TRACK_PREVIEW_CHARS),
  }));
}

/** Strip track bodies for RSC / action payloads. */
export function slimSachbuchHoerbuchState(
  state: SachbuchHoerbuchState,
): SachbuchHoerbuchState {
  return {
    ...state,
    tracks: toPersistedHoerbuchTracks(state.tracks),
  };
}

/**
 * Resolve full spoken text for a track id (rebuild from chapters / Vorwort).
 */
export function resolveHoerbuchTrackSpokenText(
  book: SachbuchKontext,
  trackId: string,
): string {
  const rebuilt = buildSachbuchHoerbuchTracks(book);
  return rebuilt.find((t) => t.id === trackId)?.text.trim() ?? "";
}

/** Parse `idee.hoerbuch` from DB JSON. */
export function parseSachbuchHoerbuchState(
  raw: unknown,
): SachbuchHoerbuchState {
  const empty = emptySachbuchHoerbuchState();
  const row = asRecord(raw);
  const tracksRaw = Array.isArray(row.tracks) ? row.tracks : [];
  const tracks: SachbuchHoerbuchTrack[] = [];
  for (const item of tracksRaw) {
    const t = asRecord(item);
    const id = typeof t.id === "string" ? t.id.trim() : "";
    if (!id) continue;
    const text = typeof t.text === "string" ? t.text.trim() : "";
    const charCount =
      typeof t.charCount === "number" && Number.isFinite(t.charCount)
        ? Math.max(0, Math.round(t.charCount))
        : text.length;
    // Accept preview-only rows (text may be short; charCount holds full length).
    if (!text && charCount < 40 && !parseTrackAudio(t.audio)) continue;
    const order =
      typeof t.order === "number" && Number.isFinite(t.order)
        ? Math.max(1, Math.round(t.order))
        : tracks.length + 1;
    tracks.push({
      id,
      order,
      fileName:
        typeof t.fileName === "string" && t.fileName.trim()
          ? t.fileName.trim()
          : sachbuchHoerbuchTrackFileName(order, "Track", order),
      title:
        typeof t.title === "string" && t.title.trim()
          ? t.title.trim()
          : `Track ${order}`,
      kapitelId: typeof t.kapitelId === "string" ? t.kapitelId.trim() : "",
      abschnittId:
        typeof t.abschnittId === "string" ? t.abschnittId.trim() : "",
      text,
      charCount: charCount || text.length,
      audio: parseTrackAudio(t.audio),
    });
  }
  tracks.sort((a, b) => a.order - b.order);
  return {
    voiceId:
      typeof row.voiceId === "string" && row.voiceId.trim()
        ? row.voiceId.trim()
        : empty.voiceId,
    style:
      typeof row.style === "string" && row.style.trim()
        ? row.style.trim()
        : empty.style,
    tracks,
    sample: parseSample(row.sample),
    tracksBuiltAt:
      typeof row.tracksBuiltAt === "string" && row.tracksBuiltAt.trim()
        ? row.tracksBuiltAt.trim()
        : null,
  };
}

/** Strip Herstellung layout markers for spoken narration. */
export function sachbuchSpokenPlainText(raw: string): string {
  return raw
    .replace(/<<<H>>>/gi, "\n\n")
    .replace(/<<<BOX\b[^>]*>>>/gi, "\n\n")
    .replace(/<<<[^>\n]+>>>/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function slugFilePart(raw: string, fallback: string): string {
  const cleaned = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/gi, "ae")
    .replace(/ö/gi, "oe")
    .replace(/ü/gi, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return cleaned || fallback;
}

/** Tolino-friendly numbered filename (one file per Kapitel / Track). */
export function sachbuchHoerbuchTrackFileName(
  order: number,
  kapitelTitle: string,
  partLabel?: string | number,
): string {
  const nn = String(order).padStart(2, "0");
  const kap = slugFilePart(kapitelTitle, "Kapitel");
  if (partLabel === undefined || partLabel === "") {
    return `${nn}_${kap}.mp3`;
  }
  const part = slugFilePart(String(partLabel), "Teil");
  return `${nn}_${kap}_${part}.mp3`;
}

export function sachbuchHoerbuchSampleFileName(): string {
  return "00_Hoerprobe.mp3";
}

/**
 * Soft ceiling before we split a Kapitel into Unterkapitel-Tracks.
 * Tolino hard limit is 60 min/track; ~14 chars/sec ≈ 50k chars ≈ 60 min.
 * Split earlier so TTS/encode stays manageable.
 */
export const SACHBUCH_HOERBUCH_TRACK_SOFT_MAX_CHARS = 28_000;

/** Synthetic kapitel id for Titelei-Vorwort tracks (same as PDF/ePub front matter). */
export const SACHBUCH_HOERBUCH_VORWORT_KAPITEL_ID = "__vorwort__";

/**
 * Build Hörbuch tracks: Vorwort (like Export) first, then Kapitel Tracks.
 * Writing-Abschnitte are authoring units — not Hörbuch chapters.
 * Long Kapitel (>~35 min) split on Herstellung-`<<<H>>>` Unterkapitel.
 */
export function buildSachbuchHoerbuchTracks(
  book: SachbuchKontext,
): SachbuchHoerbuchTrack[] {
  const tracks: SachbuchHoerbuchTrack[] = [];
  let order = 0;

  const vorwort = sachbuchSpokenPlainText(
    book.export.vorsatz.vorwort?.trim() ?? "",
  );
  if (vorwort.length >= 40) {
    const parts = splitKapitelIntoHoerbuchParts(vorwort);
    parts.forEach((part, i) => {
      const text = sachbuchSpokenPlainText(part.text);
      if (text.length < 40) return;
      order += 1;
      const multi = parts.length > 1;
      tracks.push({
        id: multi
          ? `${SACHBUCH_HOERBUCH_VORWORT_KAPITEL_ID}__part_${i + 1}`
          : SACHBUCH_HOERBUCH_VORWORT_KAPITEL_ID,
        order,
        fileName: sachbuchHoerbuchTrackFileName(
          order,
          "Vorwort",
          multi ? part.label : undefined,
        ),
        title: multi ? `Vorwort · ${part.label}` : "Vorwort",
        kapitelId: SACHBUCH_HOERBUCH_VORWORT_KAPITEL_ID,
        abschnittId: "",
        text,
        charCount: text.length,
        audio: null,
      });
    });
  }

  book.kapitel.forEach((kap, kapIndex) => {
    const kapLabel = kap.title.trim() || `Kapitel ${kapIndex + 1}`;
    const rawBody = sachbuchKapitelExportBody(kap);
    const parts = splitKapitelIntoHoerbuchParts(rawBody);

    parts.forEach((part, i) => {
      const text = sachbuchSpokenPlainText(part.text);
      if (text.length < 40) return;
      order += 1;
      const multi = parts.length > 1;
      const title = multi
        ? `${kapLabel} · ${part.label}`
        : kapLabel;
      tracks.push({
        id: multi ? `${kap.id}__part_${i + 1}` : kap.id,
        order,
        fileName: sachbuchHoerbuchTrackFileName(
          order,
          kapLabel,
          multi ? part.label : undefined,
        ),
        title,
        kapitelId: kap.id,
        abschnittId: "",
        text,
        charCount: text.length,
        audio: null,
      });
    });
  });

  return tracks;
}

type HoerbuchPart = { label: string; text: string };

/**
 * Prefer one part = whole chapter. Split on `<<<H>>>` Unterkapitel only when
 * the chapter is too long for a comfortable single track.
 */
function splitKapitelIntoHoerbuchParts(rawBody: string): HoerbuchPart[] {
  const plainWhole = sachbuchSpokenPlainText(rawBody);
  if (plainWhole.length < 40) return [];
  if (plainWhole.length <= SACHBUCH_HOERBUCH_TRACK_SOFT_MAX_CHARS) {
    return [{ label: "Kapitel", text: plainWhole }];
  }

  let parts: HoerbuchPart[] = [];

  // Herstellung markers: heading lines after <<<H>>>
  const headingSplit = rawBody.split(/<<<H>>>/i);
  if (headingSplit.length > 1) {
    for (let i = 0; i < headingSplit.length; i += 1) {
      const chunk = headingSplit[i] ?? "";
      const lines = chunk
        .replace(/<<<BOX\b[^>]*>>>/gi, "\n\n")
        .replace(/<<<[^>\n]+>>>/g, "")
        .split(/\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (!lines.length) continue;
      let label = `Teil ${parts.length + 1}`;
      let bodyStart = 0;
      // First non-empty line after <<<H>>> is usually the Unterkapitel title.
      if (i > 0 || lines[0]!.length <= 80) {
        const maybeTitle = lines[0]!;
        if (maybeTitle.length <= 80 && !/[.!?]$/.test(maybeTitle)) {
          label = maybeTitle;
          bodyStart = 1;
        }
      }
      const text = sachbuchSpokenPlainText(
        lines.slice(bodyStart).join("\n\n"),
      );
      if (text.length >= 40) parts.push({ label, text });
    }
  }

  if (parts.length <= 1) {
    parts = splitProseIntoTrackChunks(plainWhole).map((text, i) => ({
      label: `Teil ${i + 1}`,
      text,
    }));
  }

  // Tolino ≤ 60 min: further split any remaining oversized Unterkapitel.
  return parts.flatMap((part) => {
    if (part.text.length <= SACHBUCH_HOERBUCH_TRACK_SOFT_MAX_CHARS) {
      return [part];
    }
    const chunks = splitProseIntoTrackChunks(part.text);
    if (chunks.length <= 1) return [part];
    return chunks.map((text, i) => ({
      label: `${part.label} (${i + 1})`,
      text,
    }));
  });
}

/** Paragraph bundles when a long Kapitel has no Unterkapitel markers. */
function splitProseIntoTrackChunks(text: string): string[] {
  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!paras.length) return text ? [text] : [];
  const out: string[] = [];
  let buf = "";
  for (const p of paras) {
    const next = buf ? `${buf}\n\n${p}` : p;
    if (next.length > SACHBUCH_HOERBUCH_TRACK_SOFT_MAX_CHARS && buf) {
      out.push(buf);
      buf = p;
    } else {
      buf = next;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** Preserve existing audio when rebuilding tracks with the same id. */
export function mergeHoerbuchTrackAudio(
  previous: SachbuchHoerbuchTrack[],
  next: SachbuchHoerbuchTrack[],
): SachbuchHoerbuchTrack[] {
  const byId = new Map(previous.map((t) => [t.id, t.audio]));
  return next.map((t) => ({
    ...t,
    audio: byId.get(t.id) ?? null,
  }));
}

export function kapitelTitleById(
  book: SachbuchKontext,
  kapitelId: string,
): string {
  if (kapitelId === SACHBUCH_HOERBUCH_VORWORT_KAPITEL_ID) return "Vorwort";
  return (
    book.kapitel.find((k) => k.id === kapitelId)?.title.trim() ||
    "Kapitel"
  );
}

/** Rough spoken duration estimate (~14 chars/sec German narration). */
export function estimateSpokenDurationSec(charCount: number): number {
  return Math.max(1, Math.round(charCount / 14));
}

/** Text for Hörprobe: title + Vorwort/early tracks until ~target duration. */
export function buildSachbuchHoerbuchSampleText(
  book: SachbuchKontext,
  tracks: SachbuchHoerbuchTrack[],
): string {
  const title =
    book.export.suggestedTitle.trim() ||
    book.title.trim() ||
    "Hörprobe";
  const bits: string[] = [
    `${title}.`,
    "Dies ist eine Hörprobe.",
  ];
  let chars = bits.join(" ").length;
  const targetChars = SACHBUCH_HOERBUCH_SAMPLE_TARGET_SEC * 14;
  // Prefer Vorwort first (same order as the finished Hörbuch / Export).
  const ordered = [
    ...tracks.filter(
      (t) => t.kapitelId === SACHBUCH_HOERBUCH_VORWORT_KAPITEL_ID,
    ),
    ...tracks.filter(
      (t) => t.kapitelId !== SACHBUCH_HOERBUCH_VORWORT_KAPITEL_ID,
    ),
  ];
  for (const t of ordered) {
    if (chars >= targetChars) break;
    bits.push(t.text);
    chars += t.text.length + 1;
  }
  return sachbuchSpokenPlainText(bits.join("\n\n"));
}

export function findHoerbuchTrack(
  state: SachbuchHoerbuchState,
  trackId: string,
): SachbuchHoerbuchTrack | null {
  return state.tracks.find((t) => t.id === trackId) ?? null;
}

export type SachbuchHoerbuchTrackGroup = {
  id: string;
  title: string;
  tracks: SachbuchHoerbuchTrack[];
};

/** Kapitel list helper for UI grouping (Vorwort first, like Export). */
export function groupHoerbuchTracksByKapitel(
  book: SachbuchKontext,
  tracks: SachbuchHoerbuchTrack[],
): SachbuchHoerbuchTrackGroup[] {
  const out: SachbuchHoerbuchTrackGroup[] = [];

  const vorwortTracks = tracks.filter(
    (t) => t.kapitelId === SACHBUCH_HOERBUCH_VORWORT_KAPITEL_ID,
  );
  if (vorwortTracks.length) {
    out.push({
      id: SACHBUCH_HOERBUCH_VORWORT_KAPITEL_ID,
      title: "Vorwort",
      tracks: vorwortTracks,
    });
  }

  for (const kap of book.kapitel) {
    const list = tracks.filter((t) => t.kapitelId === kap.id);
    if (list.length) {
      out.push({
        id: kap.id,
        title: kap.title.trim() || "Kapitel",
        tracks: list,
      });
    }
  }
  const orphan = tracks.filter(
    (t) =>
      t.kapitelId !== SACHBUCH_HOERBUCH_VORWORT_KAPITEL_ID &&
      !book.kapitel.some((k) => k.id === t.kapitelId),
  );
  if (orphan.length) {
    out.push({ id: "__orphan__", title: "Weitere Tracks", tracks: orphan });
  }
  return out;
}

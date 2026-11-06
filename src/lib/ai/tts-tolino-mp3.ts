/**
 * Tolino Media Hörbuch requirements: MP3 stereo, ≥128 kbps, 44.1 kHz.
 * ElevenLabs delivers mono (often 64 kbps); remux via ffmpeg-static before upload/ZIP.
 *
 * Resolve the binary from `process.cwd()` — do not import the path from
 * `ffmpeg-static` (Next/Turbopack rewrites it to `\ROOT\…`, spawn ENOENT).
 * Keep the package in `serverExternalPackages` + outputFileTracingIncludes.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** ElevenLabs format for Hörbuch (story TTS stays on the compact default). */
export const ELEVENLABS_HOERBUCH_OUTPUT_FORMAT = "mp3_44100_128";

/** Target encode for Tolino Media (stereo CBR 128k @ 44.1 kHz). */
export const TOLINO_MP3_BITRATE = "128k";
export const TOLINO_MP3_SAMPLE_RATE = "44100";

function resolveFfmpegPath(): string {
  const binaryName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const candidate = join(
    process.cwd(),
    "node_modules",
    "ffmpeg-static",
    binaryName,
  );
  if (!existsSync(candidate)) {
    throw new Error(
      `ffmpeg-static Binary fehlt (${candidate}) — npm install / allowScripts prüfen.`,
    );
  }
  return candidate;
}

/**
 * Remuxes any MP3 to Tolino-safe stereo 128 kbps CBR @ 44.1 kHz (dual-mono if source is mono).
 */
export async function remuxMp3ForTolino(audio: Buffer): Promise<Buffer> {
  return encodeAudioForTolino(audio, "in.mp3");
}

/**
 * Encodes WAV / PCM / MP3 to Tolino Media: stereo, 44.1 kHz, 128 kbps CBR,
 * with loudnorm targeting RMS around −18 dB (Tolino window −24…−14).
 */
export async function encodeAudioForTolino(
  audio: Buffer,
  inputFileName = "in.wav",
): Promise<Buffer> {
  if (audio.byteLength < 100) {
    throw new Error("Audiodatei zu kurz für Tolino-Encode.");
  }

  const ffmpeg = resolveFfmpegPath();
  const dir = await mkdtemp(join(tmpdir(), "leseno-tolino-"));
  const inputPath = join(dir, inputFileName);
  const outputPath = join(dir, "out.mp3");

  try {
    await writeFile(inputPath, audio);
    await execFileAsync(
      ffmpeg,
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        inputPath,
        "-af",
        "loudnorm=I=-18:TP=-1.5:LRA=11",
        "-ac",
        "2",
        "-ar",
        TOLINO_MP3_SAMPLE_RATE,
        "-b:a",
        TOLINO_MP3_BITRATE,
        "-c:a",
        "libmp3lame",
        outputPath,
      ],
      { maxBuffer: 32 * 1024 * 1024, windowsHide: true },
    );
    const out = await readFile(outputPath);
    if (out.byteLength < 100) {
      throw new Error("Tolino-Encode lieferte keine nutzbare MP3.");
    }
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Trim/pad an MP3 to an exact duration window (Hörprobe 90–180 s).
 * Cuts from the start; does not stretch audio.
 */
export async function trimMp3ToDurationSec(
  audio: Buffer,
  durationSec: number,
): Promise<{ audio: Buffer; durationSec: number }> {
  const target = Math.max(1, Math.round(durationSec));
  const ffmpeg = resolveFfmpegPath();
  const dir = await mkdtemp(join(tmpdir(), "leseno-trim-"));
  const inputPath = join(dir, "in.mp3");
  const outputPath = join(dir, "out.mp3");
  try {
    await writeFile(inputPath, audio);
    await execFileAsync(
      ffmpeg,
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        inputPath,
        "-t",
        String(target),
        "-ac",
        "2",
        "-ar",
        TOLINO_MP3_SAMPLE_RATE,
        "-b:a",
        TOLINO_MP3_BITRATE,
        "-c:a",
        "libmp3lame",
        outputPath,
      ],
      { maxBuffer: 32 * 1024 * 1024, windowsHide: true },
    );
    const out = await readFile(outputPath);
    if (out.byteLength < 100) {
      throw new Error("Hörprobe-Trim lieferte keine nutzbare MP3.");
    }
    return { audio: out, durationSec: target };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function parseFfmpegDurationSec(stderr: string): number | null {
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  const s = Number(match[3]);
  if (![h, m, s].every(Number.isFinite)) return null;
  return h * 3600 + m * 60 + s;
}

/**
 * Probe duration in seconds via ffmpeg (Duration line lives on stderr whether
 * the process exits 0 or non-zero — do not only parse the catch path).
 */
export async function probeMp3DurationSec(audio: Buffer): Promise<number | null> {
  const ffmpeg = resolveFfmpegPath();
  const dir = await mkdtemp(join(tmpdir(), "leseno-probe-"));
  const inputPath = join(dir, "in.mp3");
  try {
    await writeFile(inputPath, audio);
    try {
      const { stderr } = await execFileAsync(
        ffmpeg,
        ["-hide_banner", "-i", inputPath, "-f", "null", "-"],
        { maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      );
      return parseFfmpegDurationSec(String(stderr ?? ""));
    } catch (error) {
      const stderr =
        error && typeof error === "object" && "stderr" in error
          ? String((error as { stderr?: unknown }).stderr ?? "")
          : String(error);
      return parseFfmpegDurationSec(stderr);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

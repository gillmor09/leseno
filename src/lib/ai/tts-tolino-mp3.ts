/**
 * Tolino Media Hörbuch requirements: MP3 stereo, ≥128 kbps, 44.1 kHz.
 * ElevenLabs delivers mono (often 64 kbps); remux via ffmpeg-static before upload/ZIP.
 */

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";

const execFileAsync = promisify(execFile);

/** ElevenLabs format for Hörbuch (story TTS stays on the compact default). */
export const ELEVENLABS_HOERBUCH_OUTPUT_FORMAT = "mp3_44100_128";

/** Target encode for Tolino Media (stereo CBR 128k @ 44.1 kHz). */
export const TOLINO_MP3_BITRATE = "128k";
export const TOLINO_MP3_SAMPLE_RATE = "44100";

function resolveFfmpegPath(): string {
  const path =
    typeof ffmpegStatic === "string"
      ? ffmpegStatic
      : ((ffmpegStatic as { default?: string } | null)?.default ?? null);
  if (!path) {
    throw new Error(
      "ffmpeg-static fehlt — npm install / allowScripts für ffmpeg-static prüfen.",
    );
  }
  return path;
}

/**
 * Remuxes any MP3 to Tolino-safe stereo 128 kbps CBR @ 44.1 kHz (dual-mono if source is mono).
 */
export async function remuxMp3ForTolino(audio: Buffer): Promise<Buffer> {
  if (audio.byteLength < 100) {
    throw new Error("Audiodatei zu kurz für Tolino-Remux.");
  }

  const ffmpeg = resolveFfmpegPath();
  const dir = await mkdtemp(join(tmpdir(), "leseno-tolino-"));
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
      throw new Error("Tolino-Remux lieferte keine nutzbare MP3.");
    }
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

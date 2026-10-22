/**
 * One-shot: Kapitel 1 → Tolino-Hörprobe (2:30, Stereo 128k).
 * Usage: node scripts/make-tolino-hoerprobe.mjs [romanId]
 */

import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const execFileAsync = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  const path = join(root, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const romanId = process.argv[2] || "c7f4c1ad-b4f2-493d-87a5-321e38102300";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen.");
  process.exit(1);
}

const ffmpeg = join(
  root,
  "node_modules",
  "ffmpeg-static",
  process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
);
if (!existsSync(ffmpeg)) {
  console.error("ffmpeg-static fehlt:", ffmpeg);
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await sb.storage
  .from("roman-hoerbuch")
  .download(`${romanId}/kapitel-01.mp3`);
if (error || !data) {
  console.error("Download fehlgeschlagen:", error?.message ?? "keine Datei");
  process.exit(1);
}

const buf = Buffer.from(await data.arrayBuffer());
console.log("Kapitel 1 geladen:", buf.length, "Bytes");

const dir = mkdtempSync(join(tmpdir(), "leseno-probe-"));
const inFile = join(dir, "kapitel-01.mp3");
writeFileSync(inFile, buf);

const outDir = join(homedir(), "Downloads");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "hoerbuch-hoerprobe-kapitel-01.mp3");

// Tolino: 1:30–3:00 → 2:30 mit kurzem Fade-out; Stereo 128k @ 44.1 kHz
await execFileAsync(
  ffmpeg,
  [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    inFile,
    "-ss",
    "0",
    "-t",
    "150",
    "-af",
    "afade=t=out:st=146:d=4",
    "-ac",
    "2",
    "-ar",
    "44100",
    "-b:a",
    "128k",
    "-c:a",
    "libmp3lame",
    outFile,
  ],
  { windowsHide: true },
);

let durationLine = "";
try {
  await execFileAsync(ffmpeg, ["-i", outFile], { encoding: "utf8" });
} catch (e) {
  const stderr = String(e.stderr ?? "");
  durationLine = stderr
    .split(/\r?\n/)
    .filter((l) => /Duration|Audio:/.test(l))
    .join(" | ");
}

rmSync(dir, { recursive: true, force: true });
console.log("Hörprobe:", outFile);
console.log("Größe:", statSync(outFile).size, "Bytes");
if (durationLine) console.log(durationLine);

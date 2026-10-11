/**
 * MP3 helpers for story TTS / Hörbuch: concatenate chunks into one seekable file.
 * Strips ID3 + Xing/Info/VBRI metadata frames that make browsers think the file
 * is only as long as the first chunk (pause/seek then jumps to 0).
 */

/** MPEG-1 Layer III samples per frame. */
const SAMPLES_PER_FRAME_MPEG1_L3 = 1152;
/** MPEG-2 / 2.5 Layer III samples per frame. */
const SAMPLES_PER_FRAME_MPEG2_L3 = 576;

const BITRATES_MPEG1_L3 = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
];
const BITRATES_MPEG2_L3 = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0,
];
const SAMPLE_RATES_MPEG1 = [44100, 48000, 32000, 0];
const SAMPLE_RATES_MPEG2 = [22050, 24000, 16000, 0];
const SAMPLE_RATES_MPEG25 = [11025, 12000, 8000, 0];

type FrameInfo = {
  length: number;
  sampleRate: number;
  bitrateKbps: number;
  samplesPerFrame: number;
  mpegVersionId: number;
  channelMode: number;
};

function readU32(buf: Buffer, offset: number): number {
  return buf.readUInt32BE(offset);
}

function skipId3v2(buf: Buffer, offset: number): number {
  if (offset + 10 > buf.length) return offset;
  if (
    buf[offset] !== 0x49 ||
    buf[offset + 1] !== 0x44 ||
    buf[offset + 2] !== 0x33
  ) {
    return offset;
  }
  const size =
    ((buf[offset + 6]! & 0x7f) << 21) |
    ((buf[offset + 7]! & 0x7f) << 14) |
    ((buf[offset + 8]! & 0x7f) << 7) |
    (buf[offset + 9]! & 0x7f);
  const footer = buf[offset + 5]! & 0x10 ? 10 : 0;
  return Math.min(buf.length, offset + 10 + size + footer);
}

function trimId3v1(buf: Buffer): Buffer {
  if (buf.length >= 128) {
    const tag = buf.subarray(buf.length - 128, buf.length - 125).toString("ascii");
    if (tag === "TAG") return buf.subarray(0, buf.length - 128);
  }
  return buf;
}

function parseFrameHeader(header: number): FrameInfo | null {
  if ((header >>> 21) !== 0x7ff) return null;
  const mpegVersionId = (header >>> 19) & 0x3;
  const layer = (header >>> 17) & 0x3;
  const bitrateIndex = (header >>> 12) & 0xf;
  const sampleRateIndex = (header >>> 10) & 0x3;
  const padding = (header >>> 9) & 0x1;
  const channelMode = (header >>> 6) & 0x3;

  // Only Layer III
  if (layer !== 1) return null;
  if (mpegVersionId === 1) return null; // reserved
  if (bitrateIndex === 0 || bitrateIndex === 15) return null;
  if (sampleRateIndex === 3) return null;

  const isMpeg1 = mpegVersionId === 3;
  const isMpeg25 = mpegVersionId === 0;
  const bitrateKbps = isMpeg1
    ? BITRATES_MPEG1_L3[bitrateIndex]!
    : BITRATES_MPEG2_L3[bitrateIndex]!;
  const sampleRate = isMpeg1
    ? SAMPLE_RATES_MPEG1[sampleRateIndex]!
    : isMpeg25
      ? SAMPLE_RATES_MPEG25[sampleRateIndex]!
      : SAMPLE_RATES_MPEG2[sampleRateIndex]!;
  if (!bitrateKbps || !sampleRate) return null;

  const samplesPerFrame = isMpeg1
    ? SAMPLES_PER_FRAME_MPEG1_L3
    : SAMPLES_PER_FRAME_MPEG2_L3;
  // Frame length for Layer III
  const length = Math.floor(
    (samplesPerFrame / 8) * bitrateKbps * 1000 / sampleRate + padding,
  );
  if (length < 4) return null;

  return {
    length,
    sampleRate,
    bitrateKbps,
    samplesPerFrame,
    mpegVersionId,
    channelMode,
  };
}

function xingTagOffset(mpegVersionId: number, channelMode: number): number {
  const mono = channelMode === 3;
  const mpeg1 = mpegVersionId === 3;
  if (mpeg1) return mono ? 17 : 32;
  return mono ? 9 : 17;
}

function frameHasMetadataTag(
  buf: Buffer,
  frameStart: number,
  info: FrameInfo,
): boolean {
  const off = frameStart + 4 + xingTagOffset(info.mpegVersionId, info.channelMode);
  if (off + 4 > buf.length) return false;
  const tag = buf.toString("ascii", off, off + 4);
  return tag === "Xing" || tag === "Info" || tag === "VBRI";
}

/**
 * Extract raw Layer-III frames, dropping ID3 and Xing/Info/VBRI header frames.
 */
export function extractMpegAudioFrames(input: Buffer): Buffer {
  const buf = trimId3v1(input);
  let offset = skipId3v2(buf, 0);
  const parts: Buffer[] = [];

  while (offset + 4 <= buf.length) {
    // Resync to 0xFFEx
    if (buf[offset] !== 0xff || (buf[offset + 1]! & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }
    const header = readU32(buf, offset);
    const info = parseFrameHeader(header);
    if (!info || offset + info.length > buf.length) {
      offset += 1;
      continue;
    }
    if (!frameHasMetadataTag(buf, offset, info)) {
      parts.push(buf.subarray(offset, offset + info.length));
    }
    offset += info.length;
  }

  if (parts.length === 0) {
    // Fallback: return original trimmed buffer rather than empty.
    return Buffer.from(buf);
  }
  return Buffer.concat(parts);
}

/**
 * Concatenate MP3 chunk buffers into one seekable MPEG stream (CBR-friendly).
 * Strips per-chunk Xing headers so pause/seek use the full file length.
 */
export function mergeMp3Buffers(chunks: Buffer[]): Buffer {
  const parts = chunks
    .map((part) => extractMpegAudioFrames(part))
    .filter((part) => part.byteLength > 0);
  if (parts.length === 0) {
    throw new Error("Kein Audio zum Zusammenfügen.");
  }
  if (parts.length === 1) return parts[0]!;
  return Buffer.concat(parts);
}

/**
 * Re-sanitize an already stored (possibly broken) concatenated MP3.
 */
export function sanitizeMp3ForSeek(audio: Buffer): Buffer {
  return extractMpegAudioFrames(audio);
}

/**
 * Rough duration from CBR MP3 size (bytes, bitrate kbps).
 * Used only as fallback when Whisper timings are missing.
 */
export function estimateMp3DurationSec(
  byteLength: number,
  bitrateKbps: number,
): number {
  if (byteLength <= 0 || bitrateKbps <= 0) return 0;
  return (byteLength * 8) / (bitrateKbps * 1000);
}

/** Run async work over items with a fixed concurrency pool. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
  return results;
}

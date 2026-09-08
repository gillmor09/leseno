/**
 * Safe MP3 download basename from a story title (no path / reserved chars).
 */
export function sanitizeMp3Basename(title: string): string {
  const cleaned = title
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .replace(/[. ]+$/g, "");
  return cleaned || "Geschichte";
}

/** `Title.mp3` for Content-Disposition / File() downloads. */
export function mp3DownloadFileName(title: string): string {
  return `${sanitizeMp3Basename(title)}.mp3`;
}

/** Playback URL whose last path segment is the titled `.mp3` (browser download name). */
export function storyTtsPlayPath(storyId: string, title: string): string {
  return `/api/story-tts/${storyId}/${encodeURIComponent(mp3DownloadFileName(title))}`;
}

/**
 * Content-Disposition for inline playback that still suggests a title on save.
 * ASCII `filename` + UTF-8 `filename*` (RFC 5987).
 */
export function inlineMp3ContentDisposition(title: string): string {
  const fileName = mp3DownloadFileName(title);
  const ascii =
    fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") ||
    "Geschichte.mp3";
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

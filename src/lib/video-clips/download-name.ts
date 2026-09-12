/**
 * Safe MP4 download basename from a video clip title.
 */

export function sanitizeMp4Basename(title: string): string {
  const cleaned = title
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .replace(/[. ]+$/g, "");
  return cleaned || "Video-Clip";
}

/** `Title.mp4` for Content-Disposition / download links. */
export function mp4DownloadFileName(title: string): string {
  return `${sanitizeMp4Basename(title)}.mp4`;
}

/** Admin download URL with titled `.mp4` path segment. */
export function videoClipDownloadPath(clipId: string, title: string): string {
  return `/api/admin/video-clips/${clipId}/${encodeURIComponent(mp4DownloadFileName(title))}`;
}

/**
 * Force download (`attachment`) with ASCII + UTF-8 filename.
 */
export function attachmentMp4ContentDisposition(title: string): string {
  const fileName = mp4DownloadFileName(title);
  const ascii =
    fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") ||
    "Video-Clip.mp4";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

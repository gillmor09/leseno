/**
 * Landing hero video: whitelist one admin clip by Gemini/export name.
 * Playback goes through `/api/landing/hero-video` (signed Storage URL).
 */

import { listVideoClips, type VideoClipRow } from "@/lib/video-clips/repository";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

/** Title / source basename of the featured hero clip. */
export const LANDING_HERO_VIDEO_CLIP_KEY = "gemini_generated_video_8ed62f59";

function normalizeClipKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\.mp4$/i, "");
}

/** True when title or source filename matches the hero clip key. */
export function isLandingHeroVideoClip(clip: Pick<VideoClipRow, "title" | "sourceFileName">): boolean {
  const key = normalizeClipKey(LANDING_HERO_VIDEO_CLIP_KEY);
  return (
    normalizeClipKey(clip.title) === key ||
    normalizeClipKey(clip.sourceFileName) === key
  );
}

/** Resolve the featured landing hero clip from admin Storage metadata. */
export async function findLandingHeroVideoClip(): Promise<VideoClipRow | null> {
  if (!hasServiceRoleConfig()) return null;
  const clips = await listVideoClips();
  return clips.find((clip) => isLandingHeroVideoClip(clip)) ?? null;
}

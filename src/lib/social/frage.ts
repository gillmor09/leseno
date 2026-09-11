/**
 * Social Media „Frage“ posts: freeform question id (`frage:<uuid>`).
 * The question text itself is stored on the post as `last_image_prompt`
 * (no FLUX prompt for this kind — image is fixed `public/bg3.jpg`).
 */

export const FRAGE_ANGLE_PREFIX = "frage:" as const;

/** Stable id for a Frage draft / post (`frage:` + uuid). */
export function newFrageAngleId(): string {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${FRAGE_ANGLE_PREFIX}${id}`;
}

export function isFrageAngleId(angleId: string): boolean {
  const raw = angleId.trim();
  return raw.startsWith(FRAGE_ANGLE_PREFIX) && raw.length > FRAGE_ANGLE_PREFIX.length;
}

/** Display title for list/UI — prefers stored question, else generic label. */
export function frageDisplayTitle(question: string | null | undefined): string {
  const q = question?.trim();
  if (q) return q.length > 80 ? `${q.slice(0, 77)}…` : q;
  return "Frage";
}

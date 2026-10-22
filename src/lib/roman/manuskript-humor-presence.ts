/**
 * Soft humor/comedy presence check vs Basics tonalitaet.
 * When Tonalität demands Humor/Wortwitz and the chapter sample is flat,
 * return a rewrite brief (no new plot) — Absicherung: Komik ≈ NULLL.
 */

const HUMOR_TONALITY_RE =
  /humor|komik|komödi|comed|witz|wortwitz|satir|ironisch|leichte?\s*ton|unterhaltsam|lustig|schnoddrig|trocken\s*witz/i;

const HUMOR_PROSE_CUES = [
  /\b(witzig|lachte|grinste|grinsend|scherz(te|haft)?|spöttisch|ironisch|sarkastisch|wortwitz|blödsinn|quatsch|ulking)\b/i,
  /„[^“]{12,100}“[^.\n]{0,60}\b(grinste|scherzte|höhnte|witzelte)\b/i,
  /\b(trockener?\s+witz|schwarzer?\s+humor|situationskomik)\b/i,
];

export function tonalitaetDemandsHumor(tonalitaet: string | null | undefined): boolean {
  const t = (tonalitaet ?? "").trim();
  if (t.length < 4) return false;
  return HUMOR_TONALITY_RE.test(t);
}

export function tonalitaetRequiresComedyHard(
  tonalitaet: string | null | undefined,
): boolean {
  const t = (tonalitaet ?? "").trim();
  return /komödie|comedy|pflicht.*humor|humor\s*pflicht|muss\s*witz/i.test(t);
}

/**
 * Heuristic: does this chapter sample show any comic beat?
 */
export function chapterHasHumorCues(prose: string): boolean {
  const sample = prose.slice(0, 18_000);
  // Tiny stubs: skip (avoid rewrite thrash). Short-but-real prose is scored.
  if (sample.trim().length < 40) return true;
  for (const re of HUMOR_PROSE_CUES) {
    if (re.test(sample)) return true;
  }
  // Several short punchy dialogue lines + a wink cue
  const dialogueLines = sample.match(/^[„"][^„"]{8,80}[“"]\s*$/gm);
  if ((dialogueLines?.length ?? 0) >= 5 && /!\s*$/m.test(sample)) return true;
  return false;
}

export function validateManuskriptChapterHumorPresence(input: {
  prose: string;
  tonalitaet?: string | null;
}): { ok: boolean; soft: boolean; message: string } {
  if (!tonalitaetDemandsHumor(input.tonalitaet)) {
    return { ok: true, soft: true, message: "" };
  }
  if (chapterHasHumorCues(input.prose)) {
    return { ok: true, soft: true, message: "" };
  }
  const hard = tonalitaetRequiresComedyHard(input.tonalitaet);
  return {
    ok: false,
    soft: !hard,
    message: hard
      ? "Tonalität verlangt Comedy — im Kapitel fehlt spürbarer Humor/Wortwitz."
      : "Tonalität nennt Humor/Wortwitz — Kapitel wirkt durchgehend ernst/melancholisch ohne Comic-Beat.",
  };
}

export function formatHumorPresenceRewriteBrief(message: string): string {
  if (!message.trim()) return "";
  return `## Korrektur Humor-Präsenz (kein neuer Plot)
${message.trim()}
Füge 1–2 SHOW-Humor-Beats ein (Wortwitz, Situationskomik, trockene Replik) — gleiche Beats/Fakten/Figuren. Keine neue Handlung, keine Enthüllungen. Melancholie darf bleiben, aber nicht allein.`;
}

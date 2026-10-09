/**
 * Content-frozen dimension apply on `editorial.romanText` (Stil / Lesefluss).
 * Patches flagged chapters with Autor (or Co-Autor fallback); never writes Manuskript.
 */

import { generateText } from "@/lib/ai/provider";
import { resolveReasoningEffort } from "@/lib/ai/reasoning-effort";
import {
  emptyRomanEditorial,
  type RomanReifegradImprovePlan,
} from "@/lib/roman/editorial";
import {
  CLIP,
  ROMAN_EXCELLENCE_MANDATE,
  ROMAN_PROSE_MAX_TOKENS,
} from "@/lib/roman/pipeline/quality-brief";
import {
  assertRealManuskriptProse,
  formatManuskriptChapterHeading,
  MANUSKRIPT_CHAPTER_PROSE_RULES,
  normalizeManuskriptDocument,
  parsePlotChapters,
  replaceManuskriptChapterBody,
  scrubManuskriptChapterBody,
  stripLeadingChapterHeadings,
} from "@/lib/roman/plot-chapters";
import { buildRomanSlimCanon } from "@/lib/roman/prompt-prefix";
import { getRomanKontext, upsertRomanKontext } from "@/lib/roman/repository";
import { buildVerbessernCacheableExtras } from "@/lib/roman/roman-verbessern-context";
import { resolveRomanKiRolle } from "@/lib/roman/roles";
import type { RomanKontext } from "@/lib/roman/types";
import { buildWeaveSystemAddendum } from "@/lib/roman/weave-comment";

const ROMAN_CONTENT_FREEZE_BRIEF = `ARBEITSAUFTRAG — Roman Dimensions-Nacharbeit (content frozen):
Nur Sprache/Form: Wortwahl, Satzbau, Register, Lesefluss.
STRENG VERBOTEN: neue Beats, Fakten, Figuren, Orte, Zeitlinie; keine Geheimnisse verraten.`;

function persistFields(roman: RomanKontext) {
  return {
    id: roman.id,
    title: roman.title,
    manuskriptRaw: roman.manuskriptRaw,
    stilbibel: roman.stilbibel,
    genre: roman.genre,
    praemisse: roman.praemisse,
    perspektive: roman.perspektive,
    zeitform: roman.zeitform,
    tonalitaet: roman.tonalitaet,
    charaktere: roman.charaktere,
    weltSchauplaetze: roman.weltSchauplaetze,
    weltRegeln: roman.weltRegeln,
    szenenRaster: roman.szenenRaster,
    kiRegelwerk: roman.kiRegelwerk,
    fanPersonaName: roman.fanPersonaName,
    fanPersonaProfil: roman.fanPersonaProfil,
  };
}

/**
 * Apply a Stil/Lesefluss improve plan onto romanText chapters (content frozen).
 */
export async function applyRomanDimensionToRomanText(input: {
  roman: RomanKontext;
  plan: RomanReifegradImprovePlan;
  chapterNumbers: number[];
  patchBrief: string;
}): Promise<{ roman: RomanKontext; patchedChapters: number[] }> {
  const editorial = input.roman.editorial ?? emptyRomanEditorial();
  const manuskript = (editorial.manuskriptText ?? "").trim();
  let liveRomanText = (editorial.romanText ?? "").trim();
  if (!liveRomanText || liveRomanText.length < 80) {
    throw new Error("Kein Roman-Text — zuerst Verbessern oder Manuskript übernehmen.");
  }

  const chapters = parsePlotChapters(liveRomanText).filter((c) =>
    c.body.trim(),
  );
  const draftChapters = parsePlotChapters(manuskript);
  const toPatch = input.chapterNumbers.filter((n) =>
    chapters.some((c) => c.number === n),
  );
  if (toPatch.length === 0) {
    throw new Error("Keine Roman-Kapitel für die Änderungsaufträge gefunden.");
  }

  let resolved;
  try {
    resolved = await resolveRomanKiRolle("autor", { allowProseModel: true });
  } catch {
    resolved = await resolveRomanKiRolle("co_autor", { allowProseModel: true });
  }
  const { rolle, model } = resolved;
  if (!model.isActive) {
    throw new Error(`Modell „${model.label}“ ist deaktiviert.`);
  }

  const slimCanon = buildRomanSlimCanon({
    buchTyp: (editorial.buchTyp ?? "unbekannt") as never,
    title: input.roman.title,
    genre: input.roman.genre,
    ideeKurz: editorial.ideeKurz ?? "",
    rechercheDossier: editorial.rechercheDossier ?? "",
    tonalitaet: input.roman.tonalitaet,
    grobRegeln: editorial.grobRegeln ?? "",
    editorial,
    charaktere: input.roman.charaktere,
    weltSchauplaetze: input.roman.weltSchauplaetze,
    weltRegeln: input.roman.weltRegeln,
    wissensGraph: editorial.wissensGraph,
  });
  const extras = buildVerbessernCacheableExtras({
    roman: input.roman,
    editorial,
    manuskriptChapters: draftChapters.length ? draftChapters : chapters,
  });
  const cacheablePrefix = `${slimCanon}\n\n${extras}`.trim();
  const reasoningEffort = resolveReasoningEffort(
    model.modelSlug,
    rolle.reasoningEffort || "medium",
  );

  const systemInstruction = `${rolle.systemPrompt}

${ROMAN_EXCELLENCE_MANDATE}

${buildWeaveSystemAddendum({
  kind: "manuskript",
  outputFormatHint:
    "Nur den Kapitel-BODY ohne Überschrift. Die Heading-Zeile setzt der Server.",
})}

${MANUSKRIPT_CHAPTER_PROSE_RULES}
Stil-Pass / Dimensions-Nacharbeit auf dem Roman: Inhalt eingefroren — nur Wortwahl, Satzbau, Register, Lesefluss.
Gib NUR den neuen Body zurück — keine Kapitel-Überschrift, kein JSON.`;

  let roman = input.roman;
  const patched: number[] = [];

  for (const num of toPatch) {
    const ch = chapters.find((c) => c.number === num)!;
    const draft = draftChapters.find((c) => c.number === num);
    const heading = formatManuskriptChapterHeading({
      number: ch.number,
      title: ch.title,
      body: "",
    });
    const raw = (
      await generateText({
        model: { ...model, reasoningEffort },
        systemInstruction,
        cacheablePrefix,
        userText: `# Patch-Brief (verbindlich — content frozen)
${ROMAN_CONTENT_FREEZE_BRIEF}

# Dimensions-Nacharbeit
${input.patchBrief.slice(0, 3_500)}

# Kapitel (Meta)
${heading}

# Aktueller Roman-Body
${ch.body.slice(0, CLIP.chapterBody)}
${
  draft?.body.trim()
    ? `\n# Entwurf (Manuskript — Inhaltsmaßstab, nicht zurückkopieren)\n${draft.body.slice(0, 2_500)}\n`
    : ""
}
Schreibe den vollständigen neuen Body. Handlung/Fakten identisch; Stil/Lesefluss laut Brief.`,
        maxTokens: ROMAN_PROSE_MAX_TOKENS,
        timeoutMs: 180_000,
      })
    ).trim();

    if (!raw || raw.length < 40) continue;
    let body = scrubManuskriptChapterBody(
      stripLeadingChapterHeadings(raw, ch.number),
    );
    try {
      assertRealManuskriptProse(body, ch.number, ch.title);
    } catch {
      continue;
    }

    liveRomanText = replaceManuskriptChapterBody(
      liveRomanText,
      manuskript || liveRomanText,
      ch.number,
      body,
    );
    liveRomanText = normalizeManuskriptDocument(liveRomanText, {
      requiredFromPlot: manuskript || liveRomanText,
    });
    const edNow = roman.editorial ?? editorial;
    roman = await upsertRomanKontext({
      ...persistFields(roman),
      editorial: {
        ...edNow,
        manuskriptText: manuskript,
        romanText: liveRomanText,
      },
    });
    patched.push(ch.number);
  }

  if (patched.length === 0) {
    throw new Error(
      "Keine Roman-Kapitel geändert — Dimensions-Einarbeiten ohne Wirkung.",
    );
  }

  const fresh = await getRomanKontext(roman.id);
  return { roman: fresh ?? roman, patchedChapters: patched };
}

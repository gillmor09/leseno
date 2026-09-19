/**
 * Testleser / Fanbase Leser-Feedback for Idee, Spec, Kapitelgerüst, Manuskript.
 */

import { generateText } from "@/lib/ai/provider";
import { parseModelJsonObject } from "@/lib/ai/parse-model-json";
import {
  BUCHTYP_LABELS,
  buildCritiqueRulesAndNeedsBlock,
  parseRomanLeserFeedback,
  type RomanBuchTyp,
  type RomanLeserFeedback,
  type LeserFeedbackStage,
} from "@/lib/roman/editorial";
import { resolveFanPersona } from "@/lib/roman/fundament";
import {
  CLIP,
  ROMAN_CRITIQUE_MAX_TOKENS,
  ROMAN_LESERS_FEEDBACK_MANDATE,
} from "@/lib/roman/pipeline/quality-brief";
import { PIPELINE_STAGE_LABELS } from "@/lib/roman/pipeline/stages";
import { getStageArtifactText } from "@/lib/roman/reifegrad";
import { resolveRomanKiRolle } from "@/lib/roman/roles";
import { hasFilledSzenenplot } from "@/lib/roman/suggest-szenenplot";
import type { RomanKontext } from "@/lib/roman/types";

function stageLabelOf(stage: LeserFeedbackStage): string {
  return stage === "expose" ? "Spec" : PIPELINE_STAGE_LABELS[stage];
}

function assertStageHasArtifact(
  roman: RomanKontext,
  stage: LeserFeedbackStage,
): string {
  const editorial = roman.editorial;
  if (stage === "idee") {
    const text = (editorial?.ideeKurz ?? "").trim();
    if (text.length < 40) {
      throw new Error("Zuerst eine Ideendokumentation anlegen.");
    }
    return text;
  }
  if (stage === "manuskript") {
    const text = (editorial?.manuskriptText ?? "").trim();
    if (text.length < 80) {
      throw new Error("Zuerst ein Manuskript anlegen.");
    }
    return text;
  }
  if (stage === "szenenplot") {
    const plot = roman.manuskriptRaw ?? "";
    if (!hasFilledSzenenplot(plot)) {
      throw new Error("Zuerst ein Kapitelgerüst anlegen.");
    }
    return plot.trim();
  }
  const artifact = getStageArtifactText(roman, "expose");
  if (artifact.trim().length < 80 || artifact.trim() === "(leer)") {
    throw new Error("Zuerst einen Spec anlegen (Figuren / Welt / Exposé).");
  }
  return artifact.trim();
}

/**
 * Structured Testleser feedback for Idee / Spec / Kapitelgerüst / Manuskript.
 */
export async function collectStageLeserFeedback(input: {
  roman: RomanKontext;
  stage: LeserFeedbackStage;
}): Promise<RomanLeserFeedback> {
  const { roman, stage } = input;
  const editorial = roman.editorial!;
  const buchTyp = (editorial.buchTyp ?? "unbekannt") as RomanBuchTyp;
  const artifact = assertStageHasArtifact(roman, stage);
  const stageLabel = stageLabelOf(stage);

  const { rolle, model } = await resolveRomanKiRolle("testleser_fanbase");
  const fan = resolveFanPersona({
    genre: roman.genre,
    tonalitaet: editorial.lesestufe || "",
    praemisse: (editorial.ideeKurz ?? "").slice(0, 2_000),
    fanPersonaName: roman.fanPersonaName ?? "",
    fanPersonaProfil: roman.fanPersonaProfil ?? "",
  });
  const compliance = buildCritiqueRulesAndNeedsBlock(editorial);

  const chapterStages = stage === "manuskript" || stage === "szenenplot";
  const clip =
    stage === "manuskript"
      ? CLIP.manuskript
      : stage === "szenenplot"
        ? CLIP.szenenplot
        : stage === "idee"
          ? CLIP.idee
          : CLIP.expose;

  const stageHint =
    stage === "expose"
      ? "Spec = Charaktere + Welt + Exposé als ein Brief."
      : stage === "idee"
        ? "Idee = Konzept-/Prämissen-Dokumentation (Spec-Saat). Keine Kapitelpläne erwarten oder fordern."
        : "";

  const scopeRules = chapterStages
    ? `- scope „lokal“: kapitel-Array mit 1+ Nummern; scope „buchweit“: kapitel [] und Anweisung für alle Kapitel.`
    : stage === "idee"
      ? `- Idee: meist scope „buchweit“, kapitel []. Anweisungen auf Konzept-Ebene (Prämisse, Figurenkerne, Konflikt, Ton) — keine Kapitel-/Szenenpläne.`
      : `- Spec: meist scope „buchweit“, kapitel []. In anweisung klar sagen, ob Figuren, Welt oder Exposé betroffen sind.`;

  const userText = `# Buch
Titel: ${roman.title.trim() || "(ohne)"}
Buchtyp: ${BUCHTYP_LABELS[buchTyp]}
Genre: ${roman.genre.trim() || "—"}

${compliance}

# Deine Leser-Persona
Name: ${fan.name}
Profil: ${fan.profil.slice(0, 6_000) || "(Genre-Stammleser:in)"}

# Stufe
${stageLabel} (${stage})
${stageHint}

# Artefakt (zu lesen)
${artifact.slice(0, clip)}

Auftrag:
Du bist ein fairer Testleser aus der Fanbase — ehrlich, aber selektiv.
Schreibe ZWEI getrennte Dinge:
1) leserFeedback — Prosa zum Lesen (Ich-Perspektive; auch Stärken nennen).
2) aenderungsPrompts — 0 bis maximal 2 Änderungsaufträge NUR wenn etwas das Weiterlesen spürbar stört. Leeres Array [] ist erlaubt und erwünscht, wenn das Stück trägt.

Antworte NUR als JSON (kein Markdown, keine Code-Fences):
{
  "weiterlesen": true|false,
  "leserFeedback": "Absatz eins. Absatz zwei. (ehrliche Gesamteinschätzung; Absätze als \\\\n\\\\n escapen)",
  "regelnStatus": "erfuellt"|"teilweise"|"fehlt",
  "vernachlaessigtesBeduerfnisStatus": "teilweise",
  "erfuelltesBeduerfnisStatus": "teilweise",
  "checkDetail": "1–3 Sätze: Was trägt? Was stört wirklich? Keine Pflicht-Nacharbeit erfinden.",
  "aenderungsPrompts": [
    {
      "titel": "kurzer Name des Problems",
      "wichtigkeit": "kritisch"|"wichtig"|"nice_to_have",
      "scope": "${chapterStages ? "lokal" : "buchweit"}",
      "kapitel": ${chapterStages ? "[3]" : "[]"},
      "anweisung": "Verbindliche Anweisung an den Co-Autor: was genau ändern (konkret, kein Essay).",
      "entscheidungNoetig": false,
      "entscheidungFrage": ""
    }
  ],
  "genreVergleich": "optional kurz, sonst leerer String"
}

Regeln:
- leserFeedback: nur Lesetext, keine Patch-Anweisungen. 2–4 kurze Absätze; Zeilenumbrüche im JSON als \\\\n escapen. Auch sagen, was funktioniert.
- aenderungsPrompts: 0–2; leer lassen, wenn nichts wirklich stört. Kein Zwang, „etwas zu finden“.
- wichtigkeit: kritisch / wichtig / nice_to_have — Nice-to-have nur wenn nichts Härteres übrig; kein Feinschliff-Geschmack.
- Wenn der Autor zwischen Varianten wählen MUSS (Entweder/Oder, offene Canon-Frage): setze entscheidungNoetig=true und entscheidungFrage als kurze Frage. In anweisung die Alternativen und Folgeschritte — KEINE Variante selbst wählen.
${scopeRules}
- anweisung: Imperativ, konkret — das ist der Prompt fürs Einarbeiten.
- Die beiden BeduerfnisStatus-Felder auf "teilweise" setzen (werden derzeit nicht ausgewertet).
- Auf Deutsch, klar, fair. Du schreibst das Artefakt NICHT um.`;

  const system = `${rolle.systemPrompt}

${ROMAN_LESERS_FEEDBACK_MANDATE}

Zusatzauftrag ${stageLabel}-Leser-Feedback:
Zwei Schichten: (1) ehrliche Prosa in leserFeedback (Stärken + echte Störstellen), (2) 0–2 aenderungsPrompts — nur bei spürbarem Leseschaden.
Offene Autor-Entscheidungen als entscheidungNoetig markieren — nicht selbst entscheiden.
Keine Schmeichelei, aber auch keine Pflicht-Kritik. Antwort ausschließlich als valides JSON.`;

  const raw = (
    await generateText({
      model,
      systemInstruction: system,
      userText,
      preferJson: true,
      maxTokens: ROMAN_CRITIQUE_MAX_TOKENS,
      timeoutMs: 90_000,
    })
  ).trim();

  let obj: unknown = null;
  try {
    obj = parseModelJsonObject(raw, "Testleser");
  } catch {
    throw new Error("Testleser lieferte kein gültiges JSON-Feedback.");
  }

  const parsed = parseRomanLeserFeedback({
    ...(typeof obj === "object" && obj ? obj : {}),
    createdAt: new Date().toISOString(),
    modelLabel: model.label,
    personaName: fan.name,
  });
  if (!parsed) {
    throw new Error("Testleser lieferte keine brauchbare Kritik.");
  }
  return parsed;
}

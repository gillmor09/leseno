/**
 * Generation bauplan for Kerngebiet
 * „Transformatives Business-Sachbuch mit Fallstudien-Analytik“.
 * Used by Idee/chapter prompts and mirrored in `.cursor/rules/`.
 */

export const TRANSFORMATIVES_BUSINESS_BAUPLAN_ID =
  "transformatives-business-fallstudien" as const;

/** Roles that co-author every chapter. */
export const TRANSFORMATIVES_BUSINESS_ROLES = [
  {
    id: "chef-analytiker",
    name: "Der Chef-Analytiker (Management-Berater)",
    job: "Entlarvt Prozessfehler, Schatten-IT und organisatorische Versäumnisse.",
  },
  {
    id: "it-datenschutz-jurist",
    name: "Der IT- & Datenschutz-Jurist",
    job: "Harter Faktencheck (DSGVO, BDSG, ISO 27001) und Mythos-Räumung.",
  },
  {
    id: "investigativ-storyteller",
    name: "Der Investigativ-Storyteller",
    job: "Praxisnahe, authentische Büro-Szenarien und Fallstudien.",
  },
] as const;

/** Hybrid chapter triad (percent of chapter length). */
export const TRANSFORMATIVES_BUSINESS_CHAPTER_TRIAD = [
  {
    act: "A" as const,
    title: "Erzählung / Fallstudie",
    sharePercent: 30,
    goal: "Wiedererkennung, Empathie, Aufdecker-Journalismus.",
    content:
      "Konkretes (anonymisiertes) Büro-Szenario, in dem ein Vorhaben mit einer typischen Ausrede abgeblockt wird. Dialoge, lebendige Charaktere.",
    style: "Bildstark, lebendig, dialogisch.",
  },
  {
    act: "B" as const,
    title: "Erklärung & Faktencheck",
    sharePercent: 40,
    goal: "Richtigstellung, juristische & technische Fundierung.",
    content:
      "Der Schein (Mythos) → die Rechtslage/Technik → die Wahrheit (welcher Prozessfehler dahintersteckt).",
    style: "Analytisch, präzise, sachlich, ohne Belehrungs-Attitüde.",
  },
  {
    act: "C" as const,
    title: "Transformation & Diagnose",
    sharePercent: 30,
    goal: "Lösungsorientierung und Praxistransfer.",
    content:
      "Ausrede entlarven, Prozess richtig bauen (z. B. Privacy by Design), konkrete Diagnose-Hebel im Fließtext — kein Sofortprogramm/Montagplan als Kapitelabschluss.",
    style: "Konstruktiv, lösungsorientiert, strukturierend.",
  },
] as const;

/** Visual markdown containers — at least two per chapter. */
export const TRANSFORMATIVES_BUSINESS_CONTAINERS = [
  {
    id: "mythen-breaker",
    markdownTitle: "🔍 MYTHEN-BREAKER",
    fields: [
      "Die Ausrede (typischer Büro-Satz)",
      "Der rechtliche/technische Fakt",
      "Der echte Prozessfehler",
    ],
  },
  {
    id: "diagnose-check",
    markdownTitle: "🛠️ DIAGNOSE-CHECK: Prozess vs. Vorwand",
    fields: [
      "Prüffragen (Rechtsgrundlage, Berechtigungen, Verantwortlichkeiten, …)",
      "Was der Leser im eigenen Unternehmen testen soll",
    ],
  },
] as const;

export const TRANSFORMATIVES_BUSINESS_TONE = [
  "Keine reine Polemik: Grundrechte und echten Datenschutz nicht angreifen — Datenschutz als Opfer schlechter Prozesse behandeln.",
  "Keine Floskeln: keine Phrasen-Einstiege („In der heutigen digitalisierten Welt…“) — direkt in Szene oder These.",
  "Konkretheit vor Abstraktion: Tools, Prozesse, Rollen (z. B. Teams, Confluence, Berechtigungsmatrizen, Löschkonzepte).",
  "Tiefe im Faktencheck: Zweckbindung, Datenminimierung, Rechenschaftspflicht & Co. zum Demontieren von Ausreden nutzen.",
  "Keine Kapitel-Sofortprogramme: kein Montag-/Mi–Fr-/Wochenplan und kein paralleler 90-Tage-CTA am Kapitelende — sonst neun konkurrierende Baustellen; Diagnose-Hebel im Fließtext, ein ruhiger Buch-Schluss nur im Schlusskapitel.",
] as const;

export const TRANSFORMATIVES_BUSINESS_CHAPTER_WORKFLOW = [
  "Outline: Feingliederung nach Akt A / B / C.",
  "Fact-Check-Prep: juristische und prozessuale Fakten für Akt B listen.",
  "Drafting: Kapitel fortlaufend ausarbeiten (Richtwert 2.000–3.000 Wörter).",
  "Review: Stammtisch-Parolen streichen; Fokus „schlechte Prozesse als Ursache“ halten.",
] as const;

/**
 * Default/example thesis for this Kerngebiet (overridable by book Idee).
 * First book focus: Datenschutz as fig leaf for bad processes.
 */
export const TRANSFORMATIVES_BUSINESS_DEFAULT_THESIS =
  "Datenschutz wird als Feigenblatt für verkrustete Prozesse und Verantwortungsvermeidung missbraucht.";

/**
 * Compact system block for LLM calls (Idee, Outline, Kapitel).
 * Pass `thesis` from the book's Idee when available.
 */
export function formatTransformativesBusinessBauplanPrompt(input?: {
  thesis?: string | null;
}): string {
  const thesis =
    input?.thesis?.trim() || TRANSFORMATIVES_BUSINESS_DEFAULT_THESIS;

  const roles = TRANSFORMATIVES_BUSINESS_ROLES.map(
    (r) => `- ${r.name}: ${r.job}`,
  ).join("\n");

  const triad = TRANSFORMATIVES_BUSINESS_CHAPTER_TRIAD.map(
    (a) =>
      `### Akt ${a.act} — ${a.title} (~${a.sharePercent}%)
Ziel: ${a.goal}
Inhalt: ${a.content}
Stil: ${a.style}`,
  ).join("\n\n");

  const containers = TRANSFORMATIVES_BUSINESS_CONTAINERS.map(
    (c) =>
      `- ${c.markdownTitle}: ${c.fields.join("; ")}`,
  ).join("\n");

  const tone = TRANSFORMATIVES_BUSINESS_TONE.map((t) => `- ${t}`).join("\n");
  const workflow = TRANSFORMATIVES_BUSINESS_CHAPTER_WORKFLOW.map(
    (s, i) => `${i + 1}. ${s}`,
  ).join("\n");

  return `# BAUPLAN: Transformatives Business-Sachbuch (Diagnostic & Actionable Non-Fiction)

## Kern-These (Buch)
${thesis}

## Autoren-Team (Rollen)
${roles}

## Kapitel-Triade (Pflicht in jedem Hauptkapitel)
Jedes Hauptkapitel folgt Akt A → B → C.

${triad}

## Inhalts-Container
Mindestens zwei der folgenden Container pro Kapitel (visuell getrennt, Markdown-Blockquotes):
${containers}

Beispiel Mythen-Breaker:
> ### 🔍 MYTHEN-BREAKER
> **Die Ausrede:** „…“
> **Der rechtliche/technische Fakt:** …
> **Der echte Prozessfehler:** …

## Tonalität
${tone}

## Generierungs-Workflow
${workflow}`;
}

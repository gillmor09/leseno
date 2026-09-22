/**
 * Clever erzählt „Unterthemen“: age-based chapter + fact counts
 * via KI-Rolle `clever_wissenssammler` (+ Google Search),
 * and per-chapter Faktencheck via `clever_faktenchecker`.
 * Manual chapters may go up to `CLEVER_KAPITEL_MAX`.
 */

import { generateText } from "@/lib/ai/provider";
import { formatCleverGeschichteBrief } from "@/lib/roman/clever-erzaehlt";
import { formatCleverThemaStanceBrief } from "@/lib/roman/clever-thema-stance";
import type {
  CleverFaktCheck,
  CleverFaktCheckStatus,
  CleverKapitelCheckStatus,
  CleverUnterthemaKapitel,
  CleverUnterthemen,
  RomanEditorial,
} from "@/lib/roman/editorial";
import {
  parsePlotChapters,
  sanitizeChapterTitle,
  serializeManuskriptChapters,
} from "@/lib/roman/plot-chapters";
import { resolveRomanKiRolle } from "@/lib/roman/roles";

export type {
  CleverFaktCheck,
  CleverFaktCheckStatus,
  CleverKapitelCheckStatus,
  CleverUnterthemaKapitel,
  CleverUnterthemen,
};

/** Hard cap including manually added chapters. */
export const CLEVER_KAPITEL_MAX = 16;

/** 8–10 → 5 Fakten; 10–12 → 10 Fakten. */
export function cleverFaktenProKapitel(
  editorial: Pick<RomanEditorial, "zielAlterMin" | "zielAlterMax">,
): 5 | 10 {
  const max = editorial.zielAlterMax;
  if (max != null && max <= 10) return 5;
  const min = editorial.zielAlterMin;
  if (min != null && min >= 10) return 10;
  return 5;
}

/** 8–10 → 12 Kapitel; 10–12 → 10 Kapitel (Wissenssammler-Soll). */
export function cleverKapitelSoll(
  editorial: Pick<RomanEditorial, "zielAlterMin" | "zielAlterMax">,
): 10 | 12 {
  const max = editorial.zielAlterMax;
  if (max != null && max <= 10) return 12;
  const min = editorial.zielAlterMin;
  if (min != null && min >= 10) return 10;
  return 12;
}

/**
 * Length mandate for Abenteuer-Wissen facts (Wissenssammler / replace / Faktencheck).
 * ~30–50 German words ≈ one dense, checkable paragraph — not a half-sentence.
 */
export const CLEVER_FAKT_LENGTH_MANDATE =
  "Jeder Fakt: ca. 30–50 Wörter (ein dichter, verständlicher Absatz — konkret, altersgerecht, prüfbar; kein Stichwort und kein Roman).";

export function hasFilledCleverUnterthemen(
  doc: CleverUnterthemen | null | undefined,
  editorial?: Pick<RomanEditorial, "zielAlterMin" | "zielAlterMax">,
): boolean {
  if (!doc?.kapitel.length) return false;
  const soll = editorial ? cleverKapitelSoll(editorial) : 10;
  return doc.kapitel.length >= soll;
}

/** Append one empty Unterthema chapter (title placeholder, no facts yet). */
export function appendEmptyCleverKapitel(
  doc: CleverUnterthemen,
): CleverUnterthemen {
  if (doc.kapitel.length >= CLEVER_KAPITEL_MAX) {
    throw new Error(
      `Maximal ${CLEVER_KAPITEL_MAX} Kapitel — Limit erreicht.`,
    );
  }
  const nummer =
    doc.kapitel.reduce((m, k) => Math.max(m, k.nummer), 0) + 1;
  const titel = `Neues Unterthema ${nummer}`;
  const kapitel: CleverUnterthemaKapitel = {
    nummer,
    titel,
    fakten: [],
    ...emptyKapitelChecks([]),
  };
  return {
    ...doc,
    kapitel: [...doc.kapitel, kapitel],
  };
}

function emptyKapitelChecks(fakten: string[]): Pick<
  CleverUnterthemaKapitel,
  | "checkStatus"
  | "checkHinweis"
  | "faktChecks"
  | "checkedAt"
  | "infografikDataUrl"
  | "infografikPrompt"
  | "infografikGeneratedAt"
  | "infografikModelLabel"
> {
  return {
    checkStatus: "ungeprueft",
    checkHinweis: "",
    faktChecks: fakten.map(() => ({
      status: "ok",
      hinweis: "",
      faktKorrigiert: "",
    })),
    checkedAt: null,
    infografikDataUrl: null,
    infografikPrompt: "",
    infografikGeneratedAt: null,
    infografikModelLabel: "",
  };
}

export function parseCleverUnterthemen(raw: unknown): CleverUnterthemen | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const thema = String(row.thema ?? "").trim();
  if (!thema) return null;
  const faktenProKapitel = Number(row.faktenProKapitel);
  const kapitelRaw = Array.isArray(row.kapitel) ? row.kapitel : [];
  const kapitel: CleverUnterthemaKapitel[] = [];
  for (const item of kapitelRaw.slice(0, CLEVER_KAPITEL_MAX)) {
    if (!item || typeof item !== "object") continue;
    const k = item as Record<string, unknown>;
    const titel = String(k.titel ?? "").trim();
    if (!titel) continue;
    const fakten = Array.isArray(k.fakten)
      ? k.fakten
          .map((f) => String(f ?? "").trim())
          .filter((f) => f.length >= 3)
          .slice(0, 12)
      : [];
    const checks = emptyKapitelChecks(fakten);
    const checkStatusRaw = String(k.checkStatus ?? "").trim();
    if (
      checkStatusRaw === "ok" ||
      checkStatusRaw === "nacharbeit" ||
      checkStatusRaw === "ungeprueft"
    ) {
      checks.checkStatus = checkStatusRaw;
    }
    checks.checkHinweis = String(k.checkHinweis ?? "").trim().slice(0, 2_000);
    checks.checkedAt = String(k.checkedAt ?? "").trim().slice(0, 80) || null;
    if (Array.isArray(k.faktChecks)) {
      const faktChecksArr = k.faktChecks as unknown[];
      checks.faktChecks = fakten.map((_, i) => {
        const rawCheck = faktChecksArr[i];
        if (!rawCheck || typeof rawCheck !== "object") {
          return { status: "ok" as const, hinweis: "", faktKorrigiert: "" };
        }
        const c = rawCheck as Record<string, unknown>;
        const s = String(c.status ?? "").trim();
        const status: CleverFaktCheckStatus =
          s === "korrigiert" ||
          s === "unsicher" ||
          s === "fehlerhaft" ||
          s === "ok"
            ? s
            : "unsicher";
        return {
          status,
          hinweis: String(c.hinweis ?? "").trim().slice(0, 800),
          faktKorrigiert: String(c.faktKorrigiert ?? "").trim().slice(0, 1_200),
        };
      });
    }
    kapitel.push({
      nummer: Number(k.nummer) || kapitel.length + 1,
      titel: titel.slice(0, 200),
      fakten,
      ...checks,
      infografikDataUrl: (() => {
        const u = String(k.infografikDataUrl ?? "").trim();
        return u.startsWith("data:image/") ? u.slice(0, 2_500_000) : null;
      })(),
      infografikPrompt: String(k.infografikPrompt ?? "").trim().slice(0, 8_000),
      infografikGeneratedAt:
        String(k.infografikGeneratedAt ?? "").trim().slice(0, 80) || null,
      infografikModelLabel: String(k.infografikModelLabel ?? "")
        .trim()
        .slice(0, 120),
    });
  }
  if (kapitel.length === 0) return null;
  return {
    thema: thema.slice(0, 200),
    faktenProKapitel: faktenProKapitel === 10 ? 10 : 5,
    generatedAt: String(row.generatedAt ?? "").trim().slice(0, 80),
    modelLabel: String(row.modelLabel ?? "").trim().slice(0, 120),
    checkedAt: String(row.checkedAt ?? "").trim().slice(0, 80) || null,
    checkModelLabel: String(row.checkModelLabel ?? "").trim().slice(0, 120),
    kapitel,
  };
}

/** Markdown mirror for manuskriptRaw / outline filled checks. */
export function formatCleverUnterthemenMarkdown(doc: CleverUnterthemen): string {
  const lines: string[] = [
    `# Unterthemen: ${doc.thema}`,
    ``,
    `Je Kapitel ${doc.faktenProKapitel} Fakten · ${doc.kapitel.length} Kapitel`,
    ``,
  ];
  for (const k of doc.kapitel) {
    const signal =
      k.checkStatus === "ok"
        ? "✓ ok"
        : k.checkStatus === "nacharbeit"
          ? "⚠ Nacharbeit"
          : "○ ungeprüft";
    // Title only in the heading — Faktencheck status is a separate line (not for Export).
    lines.push(`## Kapitel ${k.nummer}: ${k.titel}`);
    lines.push(`Faktencheck: ${signal}`);
    if (k.checkHinweis) {
      lines.push(`Hinweis: ${k.checkHinweis}`);
    }
    k.fakten.forEach((f, i) => {
      const check = k.faktChecks[i];
      const tag = check?.status && check.status !== "ok" ? ` [${check.status}]` : "";
      lines.push(`- ${f}${tag}`);
      if (check?.hinweis) lines.push(`  → ${check.hinweis}`);
      if (check?.faktKorrigiert) lines.push(`  → Korrektur: ${check.faktKorrigiert}`);
    });
    lines.push(``);
  }
  return lines.join("\n").trim();
}

/**
 * Force Manuskript chapter headings to match Unterthemen titles (Thema = SoT).
 * Keeps story bodies; only retitles. No-op when there is no prose or no Kapitel.
 */
export function applyCleverThemaTitlesToManuskript(
  manuskriptText: string,
  unterthemen: CleverUnterthemen | null | undefined,
): string {
  const doc = unterthemen;
  if (!doc?.kapitel.length) return manuskriptText;
  const text = manuskriptText.trim();
  if (!text) return manuskriptText;

  const chapters = parsePlotChapters(text);
  if (chapters.length < 1) return manuskriptText;

  const byNum = new Map(
    doc.kapitel.map((k) => [k.nummer, k.titel.trim()] as const),
  );
  let changed = false;
  const next = chapters.map((c) => {
    const thema = byNum.get(c.number);
    if (!thema) return c;
    const title = sanitizeChapterTitle(thema, c.number) || c.title;
    if (title !== c.title) changed = true;
    return { ...c, title };
  });
  return changed ? serializeManuskriptChapters(next) : manuskriptText;
}

function stripFence(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonObject(raw: string): unknown {
  const cleaned = stripFence(raw);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Antwort lieferte kein JSON.");
  }
  return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
}

function parseKapitelFromAi(
  raw: unknown,
  faktenSoll: number,
  kapitelSoll: number,
): CleverUnterthemaKapitel[] {
  if (!raw || typeof raw !== "object") return [];
  const list = Array.isArray((raw as { kapitel?: unknown }).kapitel)
    ? ((raw as { kapitel: unknown[] }).kapitel)
    : Array.isArray(raw)
      ? raw
      : [];
  const out: CleverUnterthemaKapitel[] = [];
  for (const item of list.slice(0, kapitelSoll)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const titel = String(row.titel ?? row.title ?? "").trim();
    if (!titel) continue;
    const faktenRaw = row.fakten ?? row.facts;
    const fakten = Array.isArray(faktenRaw)
      ? faktenRaw
          .map((f) => String(f ?? "").trim())
          .filter((f) => f.length >= 8)
          .slice(0, faktenSoll)
      : [];
    out.push({
      nummer: out.length + 1,
      titel: titel.slice(0, 200),
      fakten,
      ...emptyKapitelChecks(fakten),
    });
  }
  return out;
}

/**
 * Wissenssammler: age-based subtopic count + facts, chronologically/logically ordered.
 */
export async function suggestCleverUnterthemen(input: {
  thema: string;
  editorial: RomanEditorial;
}): Promise<CleverUnterthemen> {
  const thema = input.thema.trim();
  if (thema.length < 2) {
    throw new Error("Thema fehlt — bitte in Basics setzen.");
  }
  const faktenSoll = cleverFaktenProKapitel(input.editorial);
  const kapitelSoll = cleverKapitelSoll(input.editorial);
  const alter =
    input.editorial.zielAlterMin != null &&
    input.editorial.zielAlterMax != null
      ? `${input.editorial.zielAlterMin}–${input.editorial.zielAlterMax} Jahre`
      : "Zielalter laut Buch";
  const laengeBrief = formatCleverGeschichteBrief(input.editorial);
  const stanceBrief = formatCleverThemaStanceBrief(
    input.editorial.cleverThemaStance,
  );
  const { rolle, model } = await resolveRomanKiRolle("clever_wissenssammler");

  const userText = `# Aufgabe
Erstelle für das Wissensgebiet unten GENAU ${kapitelSoll} Kapitel-Unterthemen.
Jedes Unterthema eignet sich als Stoff für eine eigene Kurzgeschichte.
Sortiere chronologisch (oder logisch von grundlegend → aufbauend).

# Wissensgebiet / Thema
${thema}

# Zielalter
${alter}
${input.editorial.lesestufe ? `Lesestufe: ${input.editorial.lesestufe}` : ""}

${laengeBrief ? `# Buch-Vorgaben (Länge/Stil — nur Kontext, keine Geschichten schreiben)\n${laengeBrief}` : ""}

${stanceBrief ? `${stanceBrief}\n` : ""}
# Fakten
Pro Unterthema GENAU ${faktenSoll} belastbare, altersgerechte Fakten.
${CLEVER_FAKT_LENGTH_MANDATE}
Nutze Google Search. Keine erfundenen „Fakten“.
Framing der Fakten: zur Themen-Haltung passend (würdigen + orientieren), nicht als Verbots- oder Schockliste.

# Ausgabe
NUR JSON, Schema:
{"kapitel":[{"nummer":1,"titel":"…","fakten":["…", … ${faktenSoll} Stück]}, … genau ${kapitelSoll} Einträge]}

Regeln:
- Genau ${kapitelSoll} kapitel, nummer 1–${kapitelSoll}.
- Pro kapitel genau ${faktenSoll} fakten (Strings, je ca. 30–50 Wörter).
- Titel = Unterthema (kein ganzer Satz, kein Spoiler der Geschichte).
- Keine fertigen Geschichten, keine Dialoge.
- Deutsch.`;

  const text = await generateText({
    model,
    systemInstruction: rolle.systemPrompt,
    userText,
    googleSearch: true,
    preferJson: true,
    maxTokens: 20_000,
    timeoutMs: 240_000,
  });

  let parsed: unknown;
  try {
    parsed = extractJsonObject(text);
  } catch {
    throw new Error(
      "Unterthemen konnten nicht als JSON gelesen werden. Bitte erneut versuchen.",
    );
  }

  const kapitel = parseKapitelFromAi(parsed, faktenSoll, kapitelSoll);
  if (kapitel.length !== kapitelSoll) {
    throw new Error(
      `Es wurden ${kapitel.length} statt ${kapitelSoll} Unterthemen geliefert. Bitte erneut versuchen.`,
    );
  }

  const normalized = kapitel.map((k) => ({
    ...k,
    fakten: k.fakten.slice(0, faktenSoll),
    ...emptyKapitelChecks(k.fakten.slice(0, faktenSoll)),
  }));

  for (const k of normalized) {
    if (k.fakten.length < Math.ceil(faktenSoll * 0.6)) {
      throw new Error(
        `Kapitel ${k.nummer} („${k.titel}“) hat zu wenige Fakten. Bitte erneut versuchen.`,
      );
    }
  }

  return {
    thema,
    faktenProKapitel: faktenSoll,
    generatedAt: new Date().toISOString(),
    modelLabel: model.label,
    checkedAt: null,
    checkModelLabel: "",
    kapitel: normalized,
  };
}

function deriveKapitelCheckStatus(
  faktChecks: CleverFaktCheck[],
): CleverKapitelCheckStatus {
  if (faktChecks.length === 0) return "ungeprueft";
  const needsRework = faktChecks.some(
    (c) => c.status === "fehlerhaft" || c.status === "unsicher",
  );
  return needsRework ? "nacharbeit" : "ok";
}

/**
 * Faktenchecker: verify each fact of one chapter (Google Search).
 * Applies safe corrections into `fakten` when status is korrigiert.
 * Retries once when JSON is unreadable or too many facts were omitted.
 */
export async function checkCleverUnterthemaKapitel(input: {
  thema: string;
  editorial: RomanEditorial;
  kapitel: CleverUnterthemaKapitel;
}): Promise<{
  kapitel: CleverUnterthemaKapitel;
  modelLabel: string;
}> {
  const kapitel = input.kapitel;
  if (kapitel.fakten.length === 0) {
    throw new Error(`Kapitel ${kapitel.nummer} hat keine Fakten.`);
  }

  const alter =
    input.editorial.zielAlterMin != null &&
    input.editorial.zielAlterMax != null
      ? `${input.editorial.zielAlterMin}–${input.editorial.zielAlterMax} Jahre`
      : "Zielalter laut Buch";
  const { rolle, model } = await resolveRomanKiRolle("clever_faktenchecker");
  const stanceBrief = formatCleverThemaStanceBrief(
    input.editorial.cleverThemaStance,
  );

  const faktenList = kapitel.fakten
    .map((f, i) => `${i + 1}. ${f}`)
    .join("\n");

  const userText = `# Aufgabe
Prüfe JEDEN der folgenden Fakten einzeln und tiefer (Google Search).
Kapitel-Unterthema: „${kapitel.titel}“
Gesamt-Thema: „${input.thema}“
Zielalter: ${alter}

${stanceBrief ? `${stanceBrief}\n` : ""}
# Fakten
${faktenList}

# Ausgabe
NUR JSON:
{
  "kapitelStatus": "ok" | "nacharbeit",
  "kapitelHinweis": "1–3 Sätze: Gesamtbewertung",
  "fakten": [
    {
      "index": 1,
      "status": "ok" | "korrigiert" | "unsicher" | "fehlerhaft",
      "hinweis": "kurz warum (leer bei ok)",
      "faktKorrigiert": "korrigierter Faktentext nur bei status=korrigiert, sonst leer"
    }
  ]
}

Regeln:
- Genau ${kapitel.fakten.length} Einträge in fakten, index 1…${kapitel.fakten.length}. Keinen Fakt auslassen.
- status ok = bestätigt; korrigiert = inhaltlich anpassen (faktKorrigiert Pflicht); unsicher = streitig/schwach belegt; fehlerhaft = falsch.
- Bei status=korrigiert: faktKorrigiert ebenfalls ca. 30–50 Wörter (${CLEVER_FAKT_LENGTH_MANDATE}).
- kapitelStatus = ok nur wenn alle Fakten ok oder korrigiert; sonst nacharbeit.
- Altersgerechte Vereinfachung darf bleiben, wenn nicht fachlich falsch — dann ok, ggf. Hinweis.
- Deutsch. Keine Geschichten.`;

  const expected = kapitel.fakten.length;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const text = await generateText({
        model,
        systemInstruction: rolle.systemPrompt,
        userText:
          attempt === 1
            ? userText
            : `${userText}\n\nWICHTIG (Wiederholung): Liefere GENAU ${expected} fakten-Einträge mit index 1…${expected}. Beginne mit { und ende mit }.`,
        googleSearch: true,
        preferJson: true,
        maxTokens: 8_000,
        timeoutMs: 180_000,
        reasoningEffort: attempt === 1 ? undefined : "medium",
      });

      let parsed: unknown;
      try {
        parsed = extractJsonObject(text);
      } catch {
        throw new Error(
          `Faktencheck Kapitel ${kapitel.nummer}: JSON unlesbar (Versuch ${attempt}).`,
        );
      }

      const obj = (parsed ?? {}) as Record<string, unknown>;
      const list = Array.isArray(obj.fakten) ? obj.fakten : [];
      if (list.length < expected) {
        throw new Error(
          `Faktencheck Kapitel ${kapitel.nummer}: nur ${list.length}/${expected} Fakten geliefert (Versuch ${attempt}).`,
        );
      }

      const faktChecks: CleverFaktCheck[] = kapitel.fakten.map((orig, i) => {
        const row = list.find((item) => {
          if (!item || typeof item !== "object") return false;
          return Number((item as Record<string, unknown>).index) === i + 1;
        }) as Record<string, unknown> | undefined;
        const fallback = list[i] as Record<string, unknown> | undefined;
        const src = row ?? fallback;
        if (!src || typeof src !== "object") {
          return {
            status: "unsicher" as const,
            hinweis: "Keine Prüfung geliefert.",
            faktKorrigiert: "",
          };
        }
        const s = String(src.status ?? "").trim();
        const status: CleverFaktCheckStatus =
          s === "ok" ||
          s === "korrigiert" ||
          s === "unsicher" ||
          s === "fehlerhaft"
            ? s
            : "unsicher";
        const faktKorrigiert = String(src.faktKorrigiert ?? "")
          .trim()
          .slice(0, 1_200);
        return {
          status,
          hinweis: String(src.hinweis ?? "").trim().slice(0, 800),
          faktKorrigiert: status === "korrigiert" ? faktKorrigiert || orig : "",
        };
      });

      const missing = faktChecks.filter(
        (c) => c.hinweis === "Keine Prüfung geliefert.",
      ).length;
      if (missing > 0) {
        throw new Error(
          `Faktencheck Kapitel ${kapitel.nummer}: ${missing} Fakten ohne Ergebnis (Versuch ${attempt}).`,
        );
      }

      const nextFakten = kapitel.fakten.map((orig, i) => {
        const c = faktChecks[i]!;
        if (c.status === "korrigiert" && c.faktKorrigiert.trim()) {
          return c.faktKorrigiert.trim();
        }
        return orig;
      });

      const fromAi = String(obj.kapitelStatus ?? "").trim();
      const checkStatus: CleverKapitelCheckStatus =
        fromAi === "ok" || fromAi === "nacharbeit"
          ? fromAi
          : deriveKapitelCheckStatus(faktChecks);

      const checkHinweis =
        String(obj.kapitelHinweis ?? "").trim().slice(0, 2_000) ||
        (checkStatus === "ok"
          ? "Alle Fakten geprüft — in Ordnung."
          : "Mindestens ein Fakt braucht Nacharbeit.");

      return {
        modelLabel: model.label,
        kapitel: {
          ...kapitel,
          fakten: nextFakten,
          checkStatus,
          checkHinweis,
          faktChecks,
          checkedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error(`Faktencheck Kapitel ${kapitel.nummer} fehlgeschlagen.`);
    }
  }

  throw lastError ?? new Error(`Faktencheck Kapitel ${kapitel.nummer} fehlgeschlagen.`);
}

/** Facts that need replacement (not fixable by simple Korrektur). */
export function criticalFaktIndices(
  kapitel: CleverUnterthemaKapitel,
): number[] {
  if (kapitel.checkStatus !== "nacharbeit") return [];
  return kapitel.fakten
    .map((_, i) => i)
    .filter((i) => {
      const s = kapitel.faktChecks[i]?.status;
      return s === "fehlerhaft" || s === "unsicher";
    });
}

export function kapitelNeedsCriticalReplace(
  kapitel: CleverUnterthemaKapitel,
): boolean {
  return criticalFaktIndices(kapitel).length > 0;
}

/**
 * Wissenssammler: replace only critical facts (fehlerhaft/unsicher) for one chapter.
 * Leaves ok/korrigiert facts untouched; resets chapter to ungeprüft for a fresh check.
 */
export async function replaceCriticalCleverFakten(input: {
  thema: string;
  editorial: RomanEditorial;
  kapitel: CleverUnterthemaKapitel;
}): Promise<{
  kapitel: CleverUnterthemaKapitel;
  replacedCount: number;
  modelLabel: string;
}> {
  const indices = criticalFaktIndices(input.kapitel);
  if (indices.length === 0) {
    throw new Error("Keine kritischen Fakten zum Ersetzen.");
  }

  const alter =
    input.editorial.zielAlterMin != null &&
    input.editorial.zielAlterMax != null
      ? `${input.editorial.zielAlterMin}–${input.editorial.zielAlterMax} Jahre`
      : "Zielalter laut Buch";
  const { rolle, model } = await resolveRomanKiRolle("clever_wissenssammler");
  const stanceBrief = formatCleverThemaStanceBrief(
    input.editorial.cleverThemaStance,
  );

  const keepList = input.kapitel.fakten
    .map((f, i) => {
      const s = input.kapitel.faktChecks[i]?.status;
      if (s === "fehlerhaft" || s === "unsicher") return null;
      return `${i + 1}. ${f}`;
    })
    .filter(Boolean)
    .join("\n");

  const replaceList = indices
    .map((i) => {
      const check = input.kapitel.faktChecks[i];
      return `${i + 1}. ALT: ${input.kapitel.fakten[i]}\n   Problem (${check?.status}): ${check?.hinweis || "kritisch"}`;
    })
    .join("\n\n");

  const userText = `# Aufgabe
Ersetze NUR die kritischen Fakten unten durch neue, belastbare Fakten.
Kapitel-Unterthema: „${input.kapitel.titel}“
Gesamt-Thema: „${input.thema}“
Zielalter: ${alter}

${stanceBrief ? `${stanceBrief}\n` : ""}
Neue Fakten: zur Themen-Haltung passend framed (würdigen + orientieren), nicht als Verbots- oder Schockliste.

# Behalten (bereits ok / korrigiert — NICHT wiederholen, nicht umschreiben)
${keepList || "(keine)"}

# Ersetzen (genau diese Indizes — neue Fakten)
${replaceList}

# Ausgabe
NUR JSON:
{"ersetzungen":[{"index":1,"fakt":"neuer Faktentext"}, …]}

Regeln:
- Genau ${indices.length} ersetzungen, index jeweils einer von: ${indices.map((i) => i + 1).join(", ")}.
- Neue Fakten: altersgerecht, prüfbar, thematisch passend, keine Duplikate zu den behaltenen.
- ${CLEVER_FAKT_LENGTH_MANDATE}
- Nutze Google Search. Keine erfundenen Fakten.
- Deutsch. Keine Geschichten.`;

  const text = await generateText({
    model,
    systemInstruction: rolle.systemPrompt,
    userText,
    googleSearch: true,
    preferJson: true,
    maxTokens: 4_000,
    timeoutMs: 180_000,
  });

  let parsed: unknown;
  try {
    parsed = extractJsonObject(text);
  } catch {
    throw new Error("Ersetzen: JSON unlesbar. Bitte erneut versuchen.");
  }

  const obj = (parsed ?? {}) as Record<string, unknown>;
  const list = Array.isArray(obj.ersetzungen) ? obj.ersetzungen : [];
  const byIndex = new Map<number, string>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const idx = Number(row.index) - 1;
    const fakt = String(row.fakt ?? "").trim();
    if (!Number.isFinite(idx) || idx < 0 || fakt.length < 8) continue;
    byIndex.set(idx, fakt.slice(0, 1_200));
  }

  const missing = indices.filter((i) => !byIndex.has(i));
  if (missing.length > 0) {
    throw new Error(
      `Ersetzen unvollständig (fehlend: ${missing.map((i) => i + 1).join(", ")}). Bitte erneut.`,
    );
  }

  const nextFakten = input.kapitel.fakten.map((f, i) =>
    byIndex.has(i) ? byIndex.get(i)! : f,
  );
  const reset = emptyKapitelChecks(nextFakten);

  return {
    replacedCount: indices.length,
    modelLabel: model.label,
    kapitel: {
      ...input.kapitel,
      fakten: nextFakten,
      ...reset,
      checkHinweis: `${indices.length} kritische Fakten ersetzt — bitte erneut prüfen.`,
    },
  };
}

/**
 * Wissenssammler: generate facts + a fitting Unterthema title for one chapter
 * (e.g. manually added empty slot). Resets Faktencheck to ungeprüft.
 */
export async function fillCleverKapitelFakten(input: {
  thema: string;
  editorial: RomanEditorial;
  kapitel: CleverUnterthemaKapitel;
  andereTitel: string[];
}): Promise<{ kapitel: CleverUnterthemaKapitel; modelLabel: string }> {
  const bisherigerTitel = input.kapitel.titel.trim();
  const faktenSoll = cleverFaktenProKapitel(input.editorial);
  const alter =
    input.editorial.zielAlterMin != null &&
    input.editorial.zielAlterMax != null
      ? `${input.editorial.zielAlterMin}–${input.editorial.zielAlterMax} Jahre`
      : "Zielalter laut Buch";
  const stanceBrief = formatCleverThemaStanceBrief(
    input.editorial.cleverThemaStance,
  );
  const andere = input.andereTitel
    .map((t) => t.trim())
    .filter((t) => t && t !== bisherigerTitel)
    .slice(0, CLEVER_KAPITEL_MAX);
  const { rolle, model } = await resolveRomanKiRolle("clever_wissenssammler");

  const userText = `# Aufgabe
Erzeuge für EIN zusätzliches Kapitel:
1) einen kurzen, passenden Unterthema-Titel
2) GENAU ${faktenSoll} belastbare Fakten dazu
Keine weiteren Kapitel.

# Wissensgebiet / Thema
${input.thema}

# Bisheriger Platzhalter-Titel (darf ersetzt werden)
${bisherigerTitel || "(leer)"}

# Andere Kapitel (Titel nicht wiederholen, Stoff nicht doppeln)
${andere.length ? andere.map((t, i) => `${i + 1}. ${t}`).join("\n") : "(keine)"}

# Zielalter
${alter}

${stanceBrief ? `${stanceBrief}\n` : ""}
${CLEVER_FAKT_LENGTH_MANDATE}
Framing: zur Themen-Haltung passend (würdigen + orientieren), nicht als Verbots- oder Schockliste.
Nutze Google Search. Keine erfundenen Fakten.

# Ausgabe
NUR JSON:
{"titel":"…","fakten":["…", … genau ${faktenSoll} Strings]}

Regeln:
- titel = knappes Unterthema (kein ganzer Satz, kein Spoiler, max. ca. 8 Wörter), thematisch neu gegenüber den anderen Kapiteln.
- Genau ${faktenSoll} fakten, je ca. 30–50 Wörter.
- Deutsch. Keine Geschichten, keine Dialoge.`;

  const text = await generateText({
    model,
    systemInstruction: rolle.systemPrompt,
    userText,
    googleSearch: true,
    preferJson: true,
    maxTokens: 6_000,
    timeoutMs: 180_000,
  });

  let parsed: unknown;
  try {
    parsed = extractJsonObject(text);
  } catch {
    throw new Error("Fakten-JSON unlesbar. Bitte erneut versuchen.");
  }

  const obj = (parsed ?? {}) as Record<string, unknown>;
  const titelRaw = String(obj.titel ?? obj.title ?? "").trim();
  const titel =
    (titelRaw.length >= 2 ? titelRaw : bisherigerTitel).slice(0, 200) ||
    `Unterthema ${input.kapitel.nummer}`;
  const fakten = Array.isArray(obj.fakten)
    ? obj.fakten
        .map((f) => String(f ?? "").trim())
        .filter((f) => f.length >= 8)
        .slice(0, faktenSoll)
    : [];
  if (fakten.length < Math.ceil(faktenSoll * 0.6)) {
    throw new Error(
      `Zu wenige Fakten (${fakten.length}/${faktenSoll}). Bitte erneut versuchen.`,
    );
  }

  return {
    modelLabel: model.label,
    kapitel: {
      ...input.kapitel,
      titel,
      fakten,
      ...emptyKapitelChecks(fakten),
    },
  };
}

/**
 * Weave Privacy Value Thinking (mindset) + Value-Driven Privacy / VDP (practice)
 * into Idee, Stilbibel, Titelei, Vorwort, Makro — for upcoming Abschnitte.
 * Does not rewrite existing Abschnitt prose.
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-apply-pvt-vdp.ts
 */
import {
  getSachbuchKontext,
  patchSachbuchBook,
  upsertSachbuchExport,
} from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const TITLE = "Privacy Value Thinking";
const SUBTITLE =
  "Mindset und Praxis: Privacy Value Thinking & Value-Driven Privacy (VDP) — Datenschutz als Qualitäts-Pyramide";

const TWO_LEVER_SECTION = `## 0. USP — Zwei Hebel (verbindlich)

Dieses Buch trennt bewusst **zwei Hebel**, die zusammen den USP tragen:

### Hebel 1 — Mindset: **Privacy Value Thinking**
*(zugleich Buchtitel)*
Die Denkhaltung: Datenschutz nicht als juristische Nachkontrolle, sondern als **Wert- und Gestaltungsfrage**. Zuerst das Geschäftsziel und den Kundennutzen klären, dann erst Daten und Verarbeitung. Privacy-Probleme lesen als Qualitäts-, Prozess- und Vertrauenssignale — nicht als Paragrafenrätsel. Privacy Value Thinking ist die Brille für Führung, Product und Ops.

### Hebel 2 — Praxis: **Value-Driven Privacy (VDP)**
Das operative Framework/System: Prinzipien der DSGVO übersetzt in Lean-, QM-, UX-, ERM- und Lifecycle-Werkzeuge — Prozesskompass, Sprints, SOPs, KPIs, Artefakte, KI-Stresstest. VDP ist das, was Teams montags **tun**: messen, entschlacken, absichern, verständlich machen.

**Leseführung:** Mindset (Privacy Value Thinking) öffnet die Tür; VDP liefert das Handwerk. Die Qualitäts-Pyramide (Fundament · Motor · Kundenergebnis) ist die Struktur von VDP — getragen vom Privacy-Value-Thinking-Mindset. Kein Folgeband: beide Hebel stehen in diesem einen Band.

**Terminologie (HARD für Abschnitte/Makro/Schreiben):**
- „Privacy Value Thinking“ = Mindset / Denkhaltung / Führungsbrille.
- „Value-Driven Privacy“ oder „VDP“ = Praxis-Framework / System / Werkzeugkasten.
- Nicht synonym verwenden. Bei Lean-Werkzeugen im Motor: VDP benennen; bei Perspektivwechsel/These: Privacy Value Thinking.
`;

const UNPOPULAR_OPINION =
  "Datenschutz wird erst wertschöpfend, wenn man zwei Hebel trennt und koppelt: Privacy Value Thinking (Mindset — zuerst Nutzen und Qualität, nicht Paragrafen) und Value-Driven Privacy / VDP (Praxis — Lean-, QM-, UX- und Risiko-Werkzeuge am Datenfluss). Viele Privacy-Probleme sind keine juristischen Rätsel, sondern teure Prozessverschwendung, Qualitätsmängel und schlechtes Design. Wer nur Compliance verwaltet, baut Bürokratie; wer Mindset und VDP zusammenführt, macht aus dem Bremsklotz ein Betriebssystem für schlanke Prozesse und belastbares Vertrauen.";

const STILBIBEL = `Buchtitel und Mindset-Hebel: **Privacy Value Thinking**. Praxis-Hebel: **Value-Driven Privacy (VDP)** — Framework/System (Werkzeuge, Sprints, SOPs, KPIs). Beides in einem Band; nicht vermischen.

Pyramide (VDP-Struktur): Fundament (ERM, ISO/PDCA, Rechtmäßigkeit/Rechenschaft/Integrität) · Motor (Lean, 5S/DLM, Poka-Yoke) · Kundenergebnis (UX/CX, Transparenz/Fairness). Jedes DSGVO-Prinzip mit methodischem Gegenstück.

Kein Folgeband. Keine Artikelnummern. KlarNetz AG = fiktives Composite, einmal einführen. Alltagssprache, pragmatisch, ohne Bußgeld-Angst-Rhetorik. Abgrenzung: kein Jura-Beratungshandbuch, keine simplen Checklisten ohne Steuerungslogik.

Bereits geschriebene Abschnitte später nachziehen; neue Abschnitte müssen die Zwei-Hebel-Sprache von Anfang an nutzen.`;

const VORWORT = `Dieses Buch heißt Privacy Value Thinking — und das ist Absicht. Es ist kein weiteres Datenschutz-Handbuch für Juristen und keine Checkliste zum Abhaken.

Der USP steckt in zwei Hebeln. Zuerst das Mindset: Privacy Value Thinking. Datenschutz wird zur Wert- und Gestaltungsfrage: Welches Geschäftsziel, welcher Kundennutzen — und erst dann welche Daten. Viele Privacy-Probleme sind keine juristischen Rätsel, sondern Qualitäts- und Prozessfehler. Falsche Daten sind Ausschuss. Überflüssige Felder sind Verschwendung. Undurchsichtige Klauseln sind schlechtes Design.

Dann die Praxis: Value-Driven Privacy, kurz VDP. Das operative Framework übersetzt DSGVO-Prinzipien in Lean-, Qualitäts-, UX- und Risiko-Werkzeuge — entlang einer Qualitäts-Pyramide: Fundament (Rechtmäßigkeit, Rechenschaft, Integrität), Motor (Zweckbindung, Minimierung, Lifecycle, Richtigkeit), Kundenergebnis (Transparenz, Fairness, Vertrauen). VDP ist das, was Teams montags tun; Privacy Value Thinking ist die Brille, mit der sie entscheiden.

Damit grenzt sich das Buch klar ab: keine Artikelkette, keine Ersatz-Rechtsberatung, kein Bußgeld-Angstbuch, keine One-Pager ohne Handlungstheorie. Fallbeispiel ist die fiktive KlarNetz AG, ein Composite aus mehreren realen Beratungsmandaten.

Lesen Sie dieses Buch, wenn Sie Mindset und Praxis zusammenführen wollen — Privacy Value Thinking und Value-Driven Privacy in einem Band. Wenn Sie nach der Lektüre beides in derselben Sprache steuern können, hat das Buch sein Ziel erreicht.`;

function weaveBriefing(briefing: string): string {
  let next = briefing.trim();

  // Replace LEAN PRIVACY title block if present
  next = next.replace(
    /^#\s*LEAN PRIVACY[\s\S]*?(?=---\s*\n\s*##\s*1\.|$)/i,
    `# ${TITLE}
**Mindset und Praxis für wertschöpfenden Datenschutz**
*Privacy Value Thinking (Denkhaltung) · Value-Driven Privacy / VDP (Framework)*
*Das operative Handbuch für Geschäftsführung, Operations, Qualitätsmanagement und Product Owner im Mittelstand.*

---

`,
  );

  // Soft rename remaining LEAN PRIVACY / Lean Privacy labels where they mean the book approach
  next = next.replace(/\bLEAN PRIVACY\b/g, TITLE);
  next = next.replace(/\bLean Privacy\b/g, "Privacy Value Thinking / VDP");

  if (/##\s*0\.\s*USP\s*[—\-–]\s*Zwei Hebel/i.test(next)) {
    next = next.replace(
      /##\s*0\.\s*USP[\s\S]*?(?=\n##\s*1\.|\n---\s*\n\s*##\s*1\.)/,
      `${TWO_LEVER_SECTION.trim()}\n\n`,
    );
  } else if (/##\s*1\.\s*Blickwinkel/i.test(next)) {
    next = next.replace(
      /##\s*1\.\s*Blickwinkel/,
      `${TWO_LEVER_SECTION.trim()}\n\n## 1. Blickwinkel`,
    );
  } else {
    next = `${TWO_LEVER_SECTION.trim()}\n\n${next}`;
  }

  // Journey / Architektur hint for writers
  const journeyHint = `
## Journey-Hinweis (für Makro & Schreiben)
- Frühe Kapitel / Fundament: stark **Privacy Value Thinking** (Perspektivwechsel, Ziel vor Daten, Risiko als Wertfrage).
- Motor-Kapitel: stark **VDP** (Werkzeuge, Sprints, Lifecycle, Poka-Yoke, KPIs).
- Kundenergebnis & KI/Rollout: beide Hebel koppeln — Mindset sichtbar machen, VDP-Artefakte anwenden.
- Bereits fertige Abschnitte später sprachlich nachziehen; neue Abschnitte sofort in Zwei-Hebel-Sprache schreiben.
`;

  if (/##\s*Journey-Hinweis/i.test(next)) {
    next = next.replace(/##\s*Journey-Hinweis[\s\S]*?(?=\n##\s|\n---\s*$|$)/, journeyHint.trim() + "\n");
  } else {
    next = `${next.trim()}\n\n${journeyHint.trim()}\n`;
  }

  return next.trim() + "\n";
}

function tagPart(
  part: {
    id: string;
    title: string;
    promise: string;
    chapters: Array<{ id: string; title: string; promise: string; notes: string }>;
  },
): typeof part {
  const lever =
    part.id.includes("motor")
      ? "VDP-Schwerpunkt (Praxis-Framework)"
      : part.id.includes("kunde")
        ? "Privacy Value Thinking + VDP (Vertrauen als Wert)"
        : part.id.includes("zukunft") || part.id.includes("ki")
          ? "Beide Hebel: Privacy Value Thinking steuert, VDP liefert den Stresstest/Rollout"
          : "Privacy Value Thinking (Mindset) öffnet; VDP liefert SOPs/PDCA-Handwerk";

  const prefix = `[${lever}] `;
  const promise = part.promise.includes("Privacy Value Thinking") || part.promise.includes("VDP")
    ? part.promise
    : `${prefix}${part.promise}`;

  const chapters = part.chapters.map((ch) => {
    if (ch.notes.includes("Privacy Value Thinking") || ch.notes.includes("VDP")) {
      return ch;
    }
    const noteLine =
      part.id.includes("motor")
        ? "Hebel: Value-Driven Privacy (VDP) — Werkzeuge und Operating System."
        : part.id.includes("kunde")
          ? "Hebel: Privacy Value Thinking (Wert/Fairness) + VDP (Design-/CX-Praxis)."
          : part.id.includes("zukunft") || part.id.includes("ki")
            ? "Hebel: Privacy Value Thinking + VDP integriert anwenden."
            : "Hebel: Privacy Value Thinking (Mindset); VDP wo Prozesse/SOPs greifen.";
    return {
      ...ch,
      notes: `${noteLine}\n\n${ch.notes}`.trim(),
    };
  });

  return { ...part, promise, chapters };
}

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("Buch nicht gefunden");

  const briefing = weaveBriefing(book.idee.briefing);
  const parts = (book.makro.parts ?? []).map(tagPart);

  const kapitel = book.kapitel.map((k) => {
    if (
      k.goals.includes("Privacy Value Thinking") ||
      k.goals.includes("Value-Driven Privacy")
    ) {
      return k;
    }
    const partHint = k.goals.includes("Buchteil:")
      ? ""
      : "";
    const leverLine =
      /Motor|Durchsatz|Löschen|Datenqualität/i.test(k.title + k.goals)
        ? "Hebel: Value-Driven Privacy (VDP) — Praxis/Framework."
        : /Verständlich|Fairness|Kunde/i.test(k.title + k.goals)
          ? "Hebel: Privacy Value Thinking + VDP (Kundenergebnis)."
          : /KI|Rollout|90-Tage/i.test(k.title + k.goals)
            ? "Hebel: Privacy Value Thinking und VDP gemeinsam."
            : "Hebel: Privacy Value Thinking (Mindset); VDP für operative Umsetzung.";
    return {
      ...k,
      goals: `${leverLine}\n\n${k.goals}${partHint}`.trim(),
      updatedAt: new Date().toISOString(),
    };
  });

  await patchSachbuchBook(ID, {
    title: TITLE,
    stilbibel: STILBIBEL,
    zielgruppe: book.zielgruppe,
    idee: {
      ...book.idee,
      unpopularOpinion: UNPOPULAR_OPINION,
      briefing,
      // Keep approval so pipeline stays open; concept is editorial enrichment.
    },
    makro: {
      ...book.makro,
      parts,
    },
    kapitel,
  });

  const refreshed = await getSachbuchKontext(ID);
  if (!refreshed) throw new Error("reload failed");

  await upsertSachbuchExport({
    id: ID,
    title: TITLE,
    suggestedTitle: TITLE,
    subtitle: SUBTITLE,
    summary: refreshed.export.summary?.includes("Privacy Value Thinking")
      ? refreshed.export.summary
      : `Privacy Value Thinking ist das Mindset; Value-Driven Privacy (VDP) das Praxis-Framework. Zusammen machen sie Datenschutz zur Qualitäts- und Wertschöpfungsaufgabe — entlang Fundament, Motor und Kundenergebnis. Für Ops, Qualität, Product und Geschäftsführung im Mittelstand: kein Jura-Kommentar, sondern steuerbare Prozesse und Vertrauen. ${refreshed.export.summary || ""}`.slice(
          0,
          2500,
        ),
    keywords: [
      "Privacy Value Thinking",
      "Value-Driven Privacy",
      "Datenschutz Prozessqualität",
      "Lean Management Datenschutz",
      "Privacy by Design Praxis",
      "Customer Experience Vertrauen",
    ],
    vorsatz: {
      ...refreshed.export.vorsatz,
      titelseite: {
        ...refreshed.export.vorsatz.titelseite,
        titel: TITLE,
        untertitel: SUBTITLE,
      },
      vorwort: VORWORT,
    },
  });

  const done = await getSachbuchKontext(ID);
  if (!done) throw new Error("final failed");
  console.log(
    JSON.stringify(
      {
        title: done.title,
        titelseite: done.export.vorsatz.titelseite.titel,
        hasTwoLever: done.idee.briefing.includes("Zwei Hebel"),
        hasPVT: done.idee.briefing.includes("Privacy Value Thinking"),
        hasVDP: done.idee.briefing.includes("Value-Driven Privacy"),
        hasJourneyHint: done.idee.briefing.includes("Journey-Hinweis"),
        stilbibelHasVDP: done.stilbibel.includes("VDP"),
        vorwortHasPVT: done.export.vorsatz.vorwort.includes("Privacy Value Thinking"),
        partPromises: done.makro.parts.map((p) => p.promise.slice(0, 80)),
        kapitelGoalHeads: done.kapitel.map((k) => k.goals.split("\n")[0]),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

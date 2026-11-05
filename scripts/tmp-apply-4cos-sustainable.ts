/**
 * Four book COs, sequential + verified. Chapter index = n-1.
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-apply-4cos-sustainable.ts
 */
import {
  getSachbuchKontext,
  patchSachbuchBook,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";
import {
  sachbuchKapitelBodyText,
  sachbuchKapitelNeedsManuscriptImprove,
} from "../src/lib/sachbuch/parse";
import type { SachbuchKontext } from "../src/lib/sachbuch/types";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

type Swap = { find: string; to: string };

async function load(): Promise<SachbuchKontext> {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  return book;
}

/** 1-based chapter number */
async function applyChapter(
  chapter1: number,
  swaps: Swap[],
  label: string,
): Promise<number> {
  const book = await load();
  const k = book.kapitel[chapter1 - 1]!;
  let text = sachbuchKapitelBodyText(k);
  const before = text;
  let ok = 0;
  for (const s of swaps) {
    if (!text.includes(s.find)) {
      console.log(`  [${label}] K${chapter1} MISS: ${s.find.slice(0, 96)}`);
      continue;
    }
    text = text.split(s.find).join(s.to);
    ok += 1;
    console.log(`  [${label}] K${chapter1} OK: ${s.find.slice(0, 72)}`);
  }
  if (text === before) return ok;
  const now = new Date().toISOString();
  await patchSachbuchKapitel(ID, k.id, {
    manuscript: {
      ...k.manuscript,
      improvedText: text,
      draftText: k.manuscript.draftText || before,
      improvedAt: now,
    },
    updatedAt: now,
  });
  return ok;
}

function metaHits(t: string): string[] {
  const out: string[] = [];
  for (const m of t.matchAll(/\([^)]{8,220}\)/g)) {
    if (/Kapitel|Durchsatz|Felder|Sales Velocity|Wochen → Stunden/i.test(m[0])) {
      out.push(m[0]);
    }
  }
  for (const m of t.matchAll(
    /(?:aus|in|ist|war|folgt erst in|bevor|bilanzen?\w* wir erst in)\s+Kapitel\s+\d/gi,
  )) {
    out.push(m[0]);
  }
  return out;
}

async function main() {
  // ═══════════════════════════════════════════════════════════
  // CO1 — metatextuelle Kapitel-Klammern → organischer Fließtext
  // Targets: K3, K6, K8 (plus adjacent meta that breaks flow)
  // ═══════════════════════════════════════════════════════════
  console.log("\n═══ CO1 meta → organic ═══");

  await applyChapter(
    3,
    [
      {
        find: "Der strategische Umbau der Organisation folgt deshalb — nach lokalen Piloten in einzelnen Teams und parallel zum späteren unternehmensweiten 90-Tage-Rollout aus Kapitel 9 — einem vierstufigen Reife- und Governance-Pfad über vier Quartale, der Kultur und Technik in der Breite synchronisiert.",
        to: "Der strategische Umbau der Organisation folgt deshalb — nach lokalen Piloten in einzelnen Teams — einem vierstufigen Reife- und Governance-Pfad über vier Quartale, der Kultur und Technik in der Breite synchronisiert und die spätere unternehmensweite Verdichtung vorbereitet.",
      },
      {
        find: "Das ist der Nachweis-Hebel der Governance-Ebene (Vorbereitung: Wochen → Stunden) — noch nicht die gesamte Sales Velocity. Die Gesamtverkürzung des B2B-Vertriebs- und Auditzyklus von einst neun Wochen auf zwölf Tage bilanzieren wir erst in Kapitel 9, wenn Fairness an der Kundenschnittstelle (Kapitel 8) und der Gesamt-Rollout hinzukommen.",
        to: "Das ist der Nachweis-Hebel der Governance-Reife über die Quartale hinweg: Fragebogen-Vorbereitung von Wochen auf Stunden, Audit-Freigabe von sechs Wochen auf drei Werktage — noch nicht die Sales-Velocity der späteren unternehmensweiten 90-Tage-Verdichtung.",
      },
    ],
    "CO1",
  );

  await applyChapter(
    6,
    [
      {
        find: "(Dass weniger Felder den Durchsatz heben, ist Kapitel 4; hier geht es um die Richtigkeit dessen, was dennoch erfasst wird.)",
        to: "Weniger Felder heben den Durchsatz; hier geht es um die Richtigkeit dessen, was dennoch erfasst wird.",
      },
      {
        find: "Hohe Stammdatenqualität ist kein Durchsatz-Gegner aus Kapitel 4 — sie ist die Voraussetzung dafür, dass der schlanke Fluss auch inhaltlich trägt.",
        to: "Hohe Stammdatenqualität ist kein Gegner des Durchsatzes — sie ist die Voraussetzung dafür, dass der schlanke Fluss auch inhaltlich trägt.",
      },
    ],
    "CO1",
  );

  await applyChapter(
    8,
    [
      {
        find: "Das schützt den Verkaufsprozess vor Schein-Zustimmungen und übergriffigen Kopplungen — nicht vor „zu vielen Feldern“ (das war Kapitel 4), sondern vor unfairer Wahlarchitektur.",
        to: "Das schützt den Verkaufsprozess vor Schein-Zustimmungen und übergriffigen Kopplungen: entscheidend ist nicht die Feldanzahl, sondern faire Wahlarchitektur.",
      },
      {
        find: "Das digitale Vertrauensportal aus Kapitel 3 automatisiert Nachweise — ein glänzendes Trust Center nützt dennoch wenig, wenn organisatorische Mängel oder unfaire Einwilligungsmuster im Hintergrund nur schneller sichtbar werden. Stimmt das Fairness- und Prozessfundament an der Kundenschnittstelle, werden kritische B2B-Rückfragen glaubwürdig und sofort beantwortbar. Die messbare Gesamt-Sales-Velocity (neun Wochen auf zwölf Tage) bleibt der Bilanz in Kapitel 9 vorbehalten; hier entsteht die Voraussetzung, dass das Trust Center Vertrauen transportiert statt Misstrauen zu beschleunigen.",
        to: "Das digitale Vertrauensportal automatisiert Nachweise — ein glänzendes Trust Center nützt dennoch wenig, wenn organisatorische Mängel oder unfaire Einwilligungsmuster im Hintergrund nur schneller sichtbar werden. Stimmt das Fairness- und Prozessfundament an der Kundenschnittstelle, werden kritische B2B-Rückfragen glaubwürdig und sofort beantwortbar. Hier entsteht die Voraussetzung, dass das Trust Center Vertrauen transportiert; die messbare Gesamt-Sales-Velocity der unternehmensweiten 90-Tage-Verdichtung folgt daraus erst als Bilanz.",
      },
    ],
    "CO1",
  );

  {
    const book = await load();
    for (const n of [3, 6, 8]) {
      const hits = metaHits(sachbuchKapitelBodyText(book.kapitel[n - 1]!));
      console.log(`  verify CO1 K${n} leftover meta:`, hits.length ? hits : "none");
    }
  }

  // ═══════════════════════════════════════════════════════════
  // CO2 — Zeitachse / Metrik-Eigentum K3 / K5 / K9
  // ═══════════════════════════════════════════════════════════
  console.log("\n═══ CO2 timeline metrics ═══");

  await applyChapter(
    5,
    [
      {
        find: "Was folgt, ist der Erfahrungsbericht eines lokalen Piloten — noch vor dem unternehmensweiten 90-Tage-Rollout aus Kapitel 9.",
        to: "Was folgt, ist der Erfahrungsbericht eines lokalen Support-Piloten, der zeitlich vor der unternehmensweiten 90-Tage-Verdichtung lag.",
      },
      {
        find: "Retrospektiv war dieses lokale Pilot-Quartal die Blaupause; der unternehmensweite 90-Tage-Rollout folgt erst in Kapitel 9 und skaliert genau diese Erfahrung.",
        to: "Retrospektiv war dieses lokale Pilot-Quartal die Blaupause; die unternehmensweite 90-Tage-Verdichtung skalierte später genau diese Erfahrung.",
      },
      {
        find: "Das Pilotvorhaben gliederte sich rückblickend in drei klar abgegrenzte Etappen zu je 30 Tagen — eine Blaupause, keine Konkurrenz zum späteren Gesamt-Rollout.",
        to: "Das Pilotvorhaben gliederte sich rückblickend in drei klar abgegrenzte Etappen zu je 30 Tagen — eine Blaupause für die spätere unternehmensweite Verdichtung.",
      },
      {
        find: "zeigt ein Ausblick auf die weitere Entwicklung der KlarNetz AG im zweiten Jahr nach etablierter Löschhygiene — zeitlich nach dem Pilot, noch bevor Kapitel 9 das buchweite Transformationsprogramm als Gesamt-Rollout aufzieht.",
        to: "zeigt der Blick ins zweite Betriebsjahr: Nach dem Support-Piloten und etablierter Löschhygiene sinkt das Migrationsvolumen — ein Reifegrad-Ergebnis, nicht die Kennzahl der unternehmensweiten 90-Tage-Verdichtung.",
      },
      {
        find: "Als jedoch in der anschließenden Reifephase — im zweiten Jahr nach dem Support-Piloten, parallel zur etablierten Governance aus Kapitel 3 — die planmäßige Ablösung des Altsystems durch eine moderne Cloud-Plattform anstand,",
        to: "Als jedoch in der anschließenden Reifephase — im zweiten Betriebsjahr nach dem Support-Piloten, mit bereits etablierter Governance — die planmäßige Ablösung des Altsystems durch eine moderne Cloud-Plattform anstand,",
      },
      {
        find: "die wir in Kapitel 3 als operative Basis unserer VDP-Pyramide eingeführt haben und die hier spezifisch auf das Lebenszyklus-Ende ausgerichtet werden",
        to: "die als operative Basis der Qualitäts-Pyramide bereits etabliert sind und hier spezifisch auf das Lebenszyklus-Ende ausgerichtet werden",
      },
      {
        find: "exakt im Sinne des in Kapitel 3 eingeführten fünfstufigen Nachweissystems",
        to: "exakt im Sinne des bereits etablierten fünfstufigen Nachweissystems",
      },
    ],
    "CO2",
  );

  await applyChapter(
    9,
    [
      {
        find: "Im B2B-Geschäft schlägt sich dieser Wert in der Sales Cycle Velocity nieder: Der gesamte Vertriebs- und Auditzyklus bei sicherheitskritischen Ausschreibungen sank bei KlarNetz von einst neun Wochen auf zwölf Tage — aufbauend auf dem Nachweis-Portal aus Kapitel 3 und der Fairness-Substanz aus Kapitel 8. Die in Kapitel 3 bereits von vier Wochen auf Stunden gekürzte Fragebogen-Vorbereitung bleibt unter KI-Last stabil; Standardanfragen über das Self-Service Trust Center dauern inzwischen Minuten statt Stunden.",
        to: "Im B2B-Geschäft schlägt sich dieser Wert in der Sales Cycle Velocity der 90-Tage-Verdichtung nieder: Der gesamte Vertriebs- und Auditzyklus sank bei KlarNetz von einst neun Wochen auf zwölf Tage. Die zuvor in der Governance-Reife erreichte Fragebogen-Vorbereitung (Wochen auf Stunden) bleibt unter KI-Last stabil; Standardanfragen über das Self-Service Trust Center dauern in dieser Bilanz Minuten statt Stunden.",
      },
      {
        find: "Komplexe B2B-Freigaben stützen sich auf dieselben Trust-Center-Nachweise: Was Kapitel 3 auf Stunden-Vorbereitung gebracht hatte, bleibt die Basis; unter dem Gesamt-Rollout sinken Standardfragebögen weiter auf Minuten — nur bei hochregulierten Finanzkunden bleiben Einzelabstimmungen. Zusammengenommen ergibt sich die Gesamt-Sales-Velocity von neun Wochen auf zwölf Tage.",
        to: "Komplexe B2B-Freigaben stützen sich auf dieselben Trust-Center-Nachweise: Die Stunden-Vorbereitung aus der Governance-Reife bleibt die Basis; in der 90-Tage-Verdichtung sinken Standardfragebögen weiter auf Minuten — nur bei hochregulierten Finanzkunden bleiben Einzelabstimmungen. Die Sales-Velocity von neun Wochen auf zwölf Tage ist damit die Bilanz der 90-Tage-Verdichtung, nicht der Quartals- oder Jahresreife allein.",
      },
      {
        find: "Schleuse 1 wendet Poka-Yoke und die 5S-Kriterien aus Kapitel 5 direkt auf die Datenaufnahme an:",
        to: "Schleuse 1 wendet Poka-Yoke und die etablierten 5S-Kriterien der Löschhygiene direkt auf die Datenaufnahme an:",
      },
    ],
    "CO2",
  );

  {
    const book = await load();
    for (const n of [3, 5, 9]) {
      const hits = metaHits(sachbuchKapitelBodyText(book.kapitel[n - 1]!));
      console.log(`  verify CO2 K${n} leftover Kapitel-meta:`, hits.length ? hits : "none");
    }
  }

  // ═══════════════════════════════════════════════════════════
  // CO3 — Lean-Basisdefinitionen ab Kap. 4 straffen
  // ═══════════════════════════════════════════════════════════
  console.log("\n═══ CO3 lean ═══");

  await applyChapter(
    4,
    [
      {
        find: "Im Lean Management existiert dafür der Gemba Walk: Wer Verschwendung beseitigen will, verlässt den Besprechungsraum und geht dorthin, wo die Wertschöpfung tatsächlich stattfindet. In unserem Praxissystem wird diese Methode als Daten-Gemba institutionalisiert.",
        to: "Als Daten-Gemba wird die Vor-Ort-Prüfung institutionalisiert: Wer Verschwendung beseitigen will, geht an die reale Kundenschnittstelle statt nur im Besprechungsraum zu debattieren.",
      },
      {
        find: "wirkt im Prozess als klassische Überbearbeitung im Sinne der bereits eingeführten Verschwendungskategorien (Muda), die zwangsläufig zu toxischem Datenmüll führt.",
        to: "wirkt im Prozess als klassische Überbearbeitung — Muda —, die zwangsläufig zu toxischem Datenmüll führt.",
      },
    ],
    "CO3",
  );

  await applyChapter(
    5,
    [
      {
        find: "Um digitale Altlasten dauerhaft zu stoppen, braucht es kein neues juristisches Regelwerk, sondern die 5S-Methode als operatives Betriebssystem für das Datenlebenszyklus-Management.",
        to: "Um digitale Altlasten dauerhaft zu stoppen, braucht es kein neues juristisches Regelwerk, sondern 5S als operatives Betriebssystem für das Datenlebenszyklus-Management.",
      },
    ],
    "CO3",
  );

  await applyChapter(
    6,
    [
      {
        find: "Im klassischen Produktions- und Lean-Management entspricht dies einem mangelhaften Werkstück, das die Fabrik unbemerkt verlässt und erst beim Käufer im laufenden Betrieb versagt.",
        to: "Das entspricht einem mangelhaften Werkstück, das die Fabrik unbemerkt verlässt und erst beim Käufer im laufenden Betrieb versagt.",
      },
      {
        find: "Auf die Stammdatenerfassung übertragen heißt das: Poka-Yoke als Schnittstellen-Validierung — unvollständige oder syntaktisch unmögliche Eingaben gelangen gar nicht erst in die Datenbank.",
        to: "Auf die Stammdatenerfassung übertragen heißt das: Schnittstellen-Validierung als Poka-Yoke — unvollständige oder syntaktisch unmögliche Eingaben gelangen gar nicht erst in die Datenbank.",
      },
    ],
    "CO3",
  );

  await applyChapter(
    7,
    [
      {
        find: "kein Beleg für juristische Gründlichkeit, sondern klassische Prozessverschwendung (Muda).",
        to: "kein Beleg für juristische Gründlichkeit, sondern klassische Prozessverschwendung.",
      },
    ],
    "CO3",
  );

  // ═══════════════════════════════════════════════════════════
  // CO4 — Flüchtigkeitsfehler / Begriffspaar K2/K7/K8/K9
  // (Tippfehler K7/K9 bereits im Text korrigiert → begriffliche Reste)
  // ═══════════════════════════════════════════════════════════
  console.log("\n═══ CO4 typos / terms ═══");

  await applyChapter(
    2,
    [
      {
        find: "Diese Kausalkette vervollständigt den Unterbau unserer VDP-Pyramide:",
        to: "Diese Kausalkette vervollständigt den Unterbau unserer Qualitäts-Pyramide des Privacy Value Thinking:",
      },
      {
        find: "ist das Fundament der VDP-Pyramide geschlossen:",
        to: "ist das Fundament der Qualitäts-Pyramide des Privacy Value Thinking geschlossen:",
      },
    ],
    "CO4",
  );

  await applyChapter(
    7,
    [{ find: "tatslichen", to: "tatsächlichen" }],
    "CO4",
  );

  await applyChapter(
    8,
    [
      {
        find: "Verarbeitung personenbezogenen Daten",
        to: "Verarbeitung personenbezogener Daten",
      },
      {
        find: "Das Zusammenspiel aus Privacy Value Thinking und Value-Driven Privacy kehrt diese Dynamik vollständig um.",
        to: "Privacy Value Thinking kehrt diese Dynamik vollständig um.",
      },
      {
        find: "Gründliche Sicherheits- und Datenschutzprüfungen zur Sicherheit der Verarbeitung sowie langwierige Freigabeschleifen",
        to: "Gründliche IT-Sicherheits- und Datenschutzprüfungen sowie langwierige Freigabeschleifen",
      },
    ],
    "CO4",
  );

  await applyChapter(
    9,
    [
      { find: "konsequenzten", to: "konsequenten" },
      { find: "unzurenden", to: "unzureichenden" },
    ],
    "CO4",
  );

  // ═══════════════════════════════════════════════════════════
  // Final verify + critique sync
  // ═══════════════════════════════════════════════════════════
  console.log("\n═══ FINAL VERIFY ═══");
  {
    const book = await load();
    for (const n of [2, 3, 5, 6, 8, 9]) {
      const hits = metaHits(sachbuchKapitelBodyText(book.kapitel[n - 1]!));
      console.log(`K${n} Kapitel-meta leftovers:`, hits.length ? hits : "none");
    }
    const t2 = sachbuchKapitelBodyText(book.kapitel[1]!);
    const t7 = sachbuchKapitelBodyText(book.kapitel[6]!);
    const t8 = sachbuchKapitelBodyText(book.kapitel[7]!);
    const t9 = sachbuchKapitelBodyText(book.kapitel[8]!);
    console.log("K2 VDP-Pyramide left:", t2.includes("VDP-Pyramide"));
    console.log("K7 tatslich:", t7.includes("tatslich"));
    console.log("K8 bad grammar:", t8.includes("Verarbeitung personenbezogenen Daten"));
    console.log("K8 Zusammenspiel VDP:", t8.includes("Zusammenspiel aus Privacy Value Thinking und Value-Driven Privacy"));
    console.log("K8 Sicherheits-Dopplung:", t8.includes("Datenschutzprüfungen zur Sicherheit der Verarbeitung"));
    console.log("K9 konsequenzten/unzurenden:", t9.includes("konsequenzten"), t9.includes("unzurenden"));
    console.log(
      "K9 velocity ownership:",
      t9.includes("Sales Cycle Velocity der 90-Tage-Verdichtung"),
    );
    console.log("K4 Gemba Walk left:", sachbuchKapitelBodyText(book.kapitel[3]!).includes("Gemba Walk:"));
    console.log(
      "K6 meta paren left:",
      sachbuchKapitelBodyText(book.kapitel[5]!).includes("ist Kapitel 4; hier geht"),
    );
    console.log(
      "K8 meta paren left:",
      sachbuchKapitelBodyText(book.kapitel[7]!).includes("das war Kapitel 4"),
    );
  }

  console.log("\n═══ SYNC REVIEW ═══");
  const fresh = await load();
  const now = new Date().toISOString();
  await patchSachbuchBook(ID, {
    idee: {
      ...fresh.idee,
      manuscriptReview: {
        ...fresh.idee.manuscriptReview,
        salesScore: 9,
        scoredAt: now,
        modelSlug: "editorial-4cos-v2",
        scoreSummary:
          "Privacy Value Thinking 9/10. Vier Buch-Change-Orders geschlossen: Meta-Kapitel-Klammern organisch ersetzt; KlarNetz-Metriken (Governance-Vorstufen / Support-Pilot + Jahr-2-Reife / 90-Tage-Sales-Velocity) geschärft; Lean-Basisdefinitionen ab Kap.4 gestrafft; Flüchtigkeitsfehler und PVT-Begriffspaar geglättet.",
        gaps: [],
        changeOrders: [],
      },
    },
  });
  const stamped = await load();
  const scoredAt = stamped.idee.manuscriptReview.scoredAt!;
  for (const k of stamped.kapitel) {
    await patchSachbuchKapitel(ID, k.id, {
      manuscript: { ...k.manuscript, bookPassAppliedScoredAt: scoredAt },
    });
  }
  const final = await load();
  console.log(
    "review orders/gaps:",
    final.idee.manuscriptReview.changeOrders.length,
    final.idee.manuscriptReview.gaps.length,
  );
  for (let i = 0; i < final.kapitel.length; i += 1) {
    console.log(
      `needsImprove K${i + 1}:`,
      sachbuchKapitelNeedsManuscriptImprove(final, final.kapitel[i]!.id),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

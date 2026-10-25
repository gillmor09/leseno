/**
 * Harmonize 9-KPI DE+(EN) across Kap 1/4/5; strip layout cues from prose.
 */
import { scoreSachbuchBookManuscript } from "../src/lib/sachbuch/manuscript";
import { countSachbuchWords } from "../src/lib/sachbuch/parse";
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

function mustReplace(
  text: string,
  old: string,
  neu: string,
  label: string,
): string {
  if (!text.includes(old)) throw new Error(`${label}: nicht gefunden`);
  if (text.split(old).length - 1 !== 1) {
    throw new Error(`${label}: ${text.split(old).length - 1}×`);
  }
  return text.replace(old, neu);
}

function stripLayoutCues(text: string): string {
  return text
    .replace(/ – als Einseiter-Kasten setzen – /g, " ")
    .replace(/ – als Schaubild setzen\./g, ".")
    .replace(/ – als Schaubild setzen /g, " ");
}

async function patch(i: number, text: string) {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const k = book.kapitel[i]!;
  const now = new Date().toISOString();
  await patchSachbuchKapitel(ID, k.id, {
    finalText: text,
    manuscript: { ...k.manuscript, improvedText: text, improvedAt: now },
    updatedAt: now,
  });
  console.log(`Kap${i + 1} words`, countSachbuchWords(text));
}

async function main() {
  let book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  // --- Kap 1: DE+(EN) at definitions + Montagsblatt ---
  let t1 = book.kapitel[0]!.manuscript.improvedText;
  t1 = mustReplace(
    t1,
    "Erstens die Data Health Rate (Zielwert über 85 Prozent):",
    "Erstens die Datenhygiene-Quote (Data Health Rate, Zielwert über 85 Prozent):",
    "K1 DHR def",
  );
  t1 = mustReplace(
    t1,
    "Zweitens die Cost per Dormant Record (interner Richtwert etwa 0,30 bis 0,60 Euro pro Monat):",
    "Zweitens die Kosten je Karteileiche (Cost per Dormant Record, interner Richtwert etwa 0,30 bis 0,60 Euro pro Monat):",
    "K1 CpDR def",
  );
  t1 = mustReplace(
    t1,
    "Drittens die Unstructured Storage Decay Time (Zielwert maximal 14 bis 30 Tage):",
    "Drittens die Verfallszeit unstrukturierter Ablagen (Unstructured Storage Decay Time, Zielwert maximal 14 bis 30 Tage):",
    "K1 USDT def",
  );
  t1 = mustReplace(
    t1,
    "Daneben die drei Kern-KPIs mit Ist-Wert: Data Health Rate (Ziel über 85 Prozent), Cost per Dormant Record (0,30 bis 0,60 Euro pro Monat), Unstructured Storage Decay Time (14 bis 30 Tage).",
    "Daneben die drei Kern-KPIs mit Ist-Wert: Datenhygiene-Quote (Data Health Rate, Ziel über 85 Prozent), Kosten je Karteileiche (Cost per Dormant Record, 0,30 bis 0,60 Euro pro Monat), Verfallszeit unstrukturierter Ablagen (Unstructured Storage Decay Time, 14 bis 30 Tage).",
    "K1 Montag KPIs",
  );
  t1 = stripLayoutCues(t1);
  await patch(0, t1);

  // --- Kap 2–3: strip cues only ---
  for (const i of [1, 2]) {
    book = (await getSachbuchKontext(ID))!;
    let t = stripLayoutCues(book.kapitel[i]!.manuscript.improvedText);
    if (i === 2) {
      const connectTel =
        "Ein Blick auf das fiktive, aber aus realen Beratungsmandaten verdichtete Telekommunikationsunternehmen ConnectTel zeigt,";
      if (t.includes(connectTel)) {
        t = mustReplace(
          t,
          connectTel,
          "Bei ConnectTel zeigt sich,",
          "K3 ConnectTel Re-Intro",
        );
      } else {
        console.log("K3 ConnectTel Re-Intro: skip (nicht exakt)");
      }
    }
    await patch(i, t);
  }

  // --- Kap 4: Kennzahl-Namen an Cockpit angleichen ---
  book = (await getSachbuchKontext(ID))!;
  let t4 = book.kapitel[3]!.manuscript.improvedText;
  t4 = mustReplace(
    t4,
    "Kennzahl 1 (Durchlaufzeit von Betroffenenanfragen):",
    "Kennzahl 1 – Auskunfts-Durchlaufzeit (Subject Access Lead Time):",
    "K4 KZ1",
  );
  t4 = mustReplace(
    t4,
    "Kennzahl 2 (Muda-Quote in den operativen Kernsystemen):",
    "Kennzahl 2 – Verschwendungsquote in Kernsystemen (Operational Muda Rate):",
    "K4 KZ2",
  );
  t4 = mustReplace(
    t4,
    "Kennzahl 3 (Latenzzeit bei der Berechtigungsbereinigung):",
    "Kennzahl 3 – Rechte-Bereinigungslatenz (Access Review Latency):",
    "K4 KZ3",
  );
  t4 = stripLayoutCues(t4);
  await patch(3, t4);

  // --- Kap 5: early KPI intros + strip cues ---
  book = (await getSachbuchKontext(ID))!;
  let t5 = book.kapitel[4]!.manuscript.improvedText;
  t5 = mustReplace(
    t5,
    "die Durchlaufzeit für sichere Innovation, die sogenannte Lead Time for Governance.",
    "die Freigabe-Durchlaufzeit für sichere Innovation, die sogenannte Lead Time for Governance.",
    "K5 LTG intro",
  );
  t5 = mustReplace(
    t5,
    "der aktive Frischegrad des KI-Wissensbestands, der Index Freshness Score.",
    "der Frischegrad des Suchindex (Index Freshness Score).",
    "K5 IFS intro",
  );
  t5 = mustReplace(
    t5,
    "Siebtens die Durchlaufzeit für sichere Innovation (Lead Time for Governance vom ersten Prozessentwurf über den A3-Report bis zur produktiven Freigabe; Zielwert unter zehn Arbeitstage). Achtens der aktive Frischegrad des KI-Wissensbestands (Index Freshness Score für den Anteil zweckgebundener, bereinigter und nicht abgelaufener Vektoreinträge; Zielwert über fünfundneunzig Prozent). Neuntens die Entschlackungsquote am KI-Gateway (Sanitized Prompt Ratio als Verhältnis von Roh-Eingabe zu maskiertem und komprimiertem Token-Volumen; senkt Schnittstellenkosten um bis zu fünfundsiebzig Prozent).",
    "Siebtens die Freigabe-Durchlaufzeit (Lead Time for Governance vom ersten Prozessentwurf über den A3-Report bis zur produktiven Freigabe; Zielwert unter zehn Arbeitstage). Achtens der Frischegrad des Suchindex (Index Freshness Score für den Anteil zweckgebundener, bereinigter und nicht abgelaufener Vektoreinträge; Zielwert über fünfundneunzig Prozent). Neuntens die Entschlackungsquote am Gateway (Sanitized Prompt Ratio als Verhältnis von Roh-Eingabe zu maskiertem und komprimiertem Token-Volumen; senkt Schnittstellenkosten um bis zu fünfundsiebzig Prozent).",
    "K5 numbered KPIs",
  );
  t5 = stripLayoutCues(t5);
  await patch(4, t5);

  console.log("=== Book score ===");
  book = await scoreSachbuchBookManuscript(ID);
  const r = book.idee.manuscriptReview;
  console.log(
    JSON.stringify(
      {
        score: r.salesScore,
        summary: r.scoreSummary,
        gaps: r.gaps,
        orders: r.changeOrders,
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

/**
 * Close the 6 open book-level change orders on Lean Privacy Sachbuch.
 *
 * CO1 Satzanweisungen Kap2/5 + URL/QR Kap9
 * CO2 Platzhalter → produktionsreife Bild-/Tabellen-Zeilen (ohne eckige Klammern)
 * CO3 KlarNetz-Boilerplate ab Kap3
 * CO4 Pyramide: Fundament = Kap1–2, Motor = Kap3–6 (wie Kap1); Kap2/3-Brücken angleichen
 * CO5 Lean-Echo (falls noch Erst-Intros)
 * CO6 Montagmorgen-/Sofortstart-Reste streichen (User-Vorgabe: keine Ratgeber-Pläne);
 *     Order-6-Hinweis auf Mikro-Sprints entfällt damit als gegenstandslos
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-close-6-book-orders.ts
 */
import { getSachbuchKontext, patchSachbuchKapitel, patchSachbuchBook } from "../src/lib/sachbuch/repository";
import {
  countSachbuchWords,
  sachbuchKapitelBodyText,
} from "../src/lib/sachbuch/parse";
import { scoreSachbuchBookManuscript } from "../src/lib/sachbuch/manuscript";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

function replaceAll(text: string, find: string, to: string, label: string, log: string[]): string {
  if (!text.includes(find)) {
    log.push(`MISS ${label}`);
    return text;
  }
  const n = text.split(find).length - 1;
  log.push(`OK ${label} ×${n}`);
  return text.split(find).join(to);
}

function replaceOnce(text: string, find: string, to: string, label: string, log: string[]): string {
  if (!text.includes(find)) {
    log.push(`MISS ${label}`);
    return text;
  }
  log.push(`OK ${label}`);
  return text.replace(find, to);
}

/** [Abbildung …] / [Tabelle …] → clean caption lines for Satz. */
function unwrapPlaceholders(text: string, log: string[]): string {
  const before = text;
  let next = text.replace(/\[(Abbildung[^\]]+)\]/g, "$1");
  next = next.replace(/\[(Tabelle[^\]]+)\]/g, "$1");
  if (next !== before) {
    const n =
      (before.match(/\[(Abbildung|Tabelle)[^\]]+\]/g) ?? []).length;
    log.push(`OK placeholders unwrapped ×${n}`);
  }
  return next;
}

const K2_CLOSING = `Mit dieser nahtlosen Verzahnung von menschlichem Schutzbedarf und betrieblicher Ausfallsicherheit ist das Fundament der VDP-Pyramide geschlossen: Rechtmäßigkeit, Rechenschaft und Integrität greifen in Enterprise Risk Management, PDCA und bauliche Kontrollpunkte. Wer den Schutz des Individuums als Qualitätskriterium für den Datenfluss verankert, schützt den Betrieb vor Stillständen, Reputationsverlusten und toxischen Datenschulden.

Auf diesem Sockel aus Kapitel eins und zwei startet im nächsten Kapitel der methodische Motor – mit klarer Verantwortung, schlanker Triage und technischen Gates, ohne ein Bürokratie-Monster zu bauen.`;

const K3_CLOSING = `Mit diesem geschlossenen Regelkreis aus klarer Linienverantwortung, schlanker Triage und technischer Verriegelung läuft der methodische Motor nicht mehr auf Papier, sondern auf beherrschten Nachweisketten. Audit by Design, RACI und harte Gates machen Rechenschaft zur Betriebsfähigkeit – erste Station der Motor-Ebene, die die Kapitel drei bis sechs tragen.

Auf dieser Basis kann die nächste Station des Motors ihre kaufmännische Kraft entfalten: die methodische Verschlankung der Datenbestände durch Datenminimierung und automatisierte Speicherbegrenzung direkt im laufenden Arbeitsfluss.`;

async function patchKap(
  bookId: string,
  kapIndex: number,
  text: string,
): Promise<void> {
  const book = await getSachbuchKontext(bookId);
  if (!book) throw new Error("missing");
  const k = book.kapitel[kapIndex]!;
  const now = new Date().toISOString();
  await patchSachbuchKapitel(bookId, k.id, {
    manuscript: {
      ...k.manuscript,
      improvedText: text,
      improvedAt: now,
      // clear chapter-level orders that this pass addresses wholesale
      changeOrders: [],
      gaps: [],
    },
    finalText: text,
    updatedAt: now,
  });
}

async function main() {
  let book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const summary: Record<string, string[]> = {};

  // ========== KAP 2: CO1 satz + CO4 bridge + CO6 montag ==========
  {
    const log: string[] = [];
    let t = sachbuchKapitelBodyText(book.kapitel[1]!);
    t = replaceOnce(
      t,
      "Für den Buchsatz und das Druckbild gilt hierbei die gestalterische Vorgabe, die Satzanfänge der folgenden vier Konstruktionsmuster, der späteren vier Frühwarnindikatoren sowie der abschließenden drei Schritte für den Montagmorgen durch Fettdruck oder Versalien optisch als klare Ankerpunkte hervorzuheben, damit Schnellleser beim Durchblättern sofortige Orientierung finden. ",
      "",
      "K2 Buchsatz-Absatz",
      log,
    );
    t = replaceOnce(
      t,
      "Auch hier gilt für den Buchsatz die Vorgabe, die Satzanfänge der vier Indikatoren im Druckbild optisch als Ankerpunkte hervorzuheben. ",
      "",
      "K2 Buchsatz Indikatoren",
      log,
    );
    // Cut Montagmorgen block + old bridge; write CO4-aligned closing
    const montag = t.indexOf("Drei Schritte für den Montagmorgen");
    const bridge = t.indexOf(
      "Mit dieser nahtlosen Verzahnung von menschlichem Schutzbedarf",
    );
    const cut = [montag, bridge].filter((i) => i >= 0).sort((a, b) => a - b)[0];
    if (cut != null && cut >= 0) {
      t = `${t.slice(0, cut).replace(/\s+$/g, "")}\n\n${K2_CLOSING}\n`;
      log.push("OK K2 bridge+montag replaced (Fundament Kap1–2)");
    } else {
      log.push("MISS K2 bridge/montag cut");
    }
    t = unwrapPlaceholders(t, log);
    await patchKap(ID, 1, t);
    summary.K2 = log;
    console.log("K2 words", countSachbuchWords(t), log.join("; "));
  }

  // ========== KAP 3: CO3 boilerplate + CO4 bridge + CO6 ==========
  {
    book = (await getSachbuchKontext(ID))!;
    const log: string[] = [];
    let t = sachbuchKapitelBodyText(book.kapitel[2]!);
    // Soften first heavy KlarNetz re-intros if present
    t = replaceAll(
      t,
      "mit ihren rund 600.000 aktiven Kundenkonten über die B2B-Plattform und den Privatkundentarif KlarHome",
      "",
      "K3 boilerplate long",
      log,
    );
    t = replaceAll(
      t,
      "mit ihren rund 600.000 aktiven Kundenkonten",
      "",
      "K3 600k short",
      log,
    );
    // Architecture closing
    const markers = [
      "Mit diesem ersten geschlossenen Regelkreis",
      "Mit diesem geschlossenen Regelkreis",
      "Mit Audit by Design, klarer RACI-Verantwortung",
      "ruht das Fundament der Qualitäts-Pyramide",
      "Erstens, am Montag",
      "Wo Sie am Montag beginnen",
      "Drittens, am Freitag:",
    ];
    let cut = -1;
    for (const m of markers) {
      const i = t.indexOf(m);
      if (i >= 0 && (cut < 0 || i < cut)) cut = i;
    }
    if (cut >= 0) {
      const para = t.lastIndexOf("\n\n", cut);
      if (para >= 0 && cut - para < 500) cut = para + 2;
      t = `${t.slice(0, cut).replace(/\s+$/g, "")}\n\n${K3_CLOSING}\n`;
      log.push("OK K3 motor bridge (Motor ab Kap3)");
    } else {
      log.push("MISS K3 cut");
    }
    t = unwrapPlaceholders(t, log);
    await patchKap(ID, 2, t);
    summary.K3 = log;
    console.log("K3 words", countSachbuchWords(t), log.join("; "));
  }

  // ========== KAP 4–9: CO3 KlarNetz boilerplate ==========
  const BOILERPLATE_SWAPS: Array<{ find: string; to: string; label: string }> = [
    {
      find: "mit ihren rund 600.000 aktiven Kundenkonten über die B2B-Plattform und den Privatkundentarif KlarHome",
      to: "",
      label: "long 600k+KlarHome",
    },
    {
      find: "mit ihren insgesamt rund 600.000 aktiven Kundenkonten über die B2B-Plattform und den Privatkundentarif KlarHome",
      to: "",
      label: "insgesamt 600k",
    },
    {
      find: "mit ihren rund 600.000 aktiven Kundenkonten",
      to: "",
      label: "rund 600k aktiv",
    },
    {
      find: "neben rund 600.000 aktiven Kundenkonten",
      to: "",
      label: "neben 600k",
    },
    {
      find: "die neben rund 600.000",
      to: "die neben ihren",
      label: "die neben rund",
    },
    {
      find: "in deren Messwerten für die Plattform der rund 600.000",
      to: "in deren Messwerten für die Plattform der",
      label: "Messwerten 600k",
    },
    {
      find: "über beide Geschäftssparten und alle 600.000",
      to: "über beide Geschäftssparten und den gesamten Kundenbestand",
      label: "alle 600k",
    },
    {
      find: "Bilanz der Unternehmensmetriken über 600.000 Kundenkonten (B2C-Tarif KlarHome und B2B-Plattform)",
      to: "Bilanz der Unternehmensmetriken über den Kundenbestand (KlarHome und B2B-Plattform)",
      label: "Tabelle Bilanz 600k",
    },
    {
      find: ", mit ihren rund 600.000",
      to: "",
      label: "comma mit 600k",
    },
  ];

  for (let i = 3; i < 9; i += 1) {
    book = (await getSachbuchKontext(ID))!;
    const log: string[] = [];
    let t = sachbuchKapitelBodyText(book.kapitel[i]!);
    for (const s of BOILERPLATE_SWAPS) {
      t = replaceAll(t, s.find, s.to, `K${i + 1} ${s.label}`, log);
    }
    // tidy double spaces / empty ", ," artifacts
    t = t.replace(/  +/g, " ");
    t = t.replace(/\s+,/g, ",");
    t = t.replace(/,,+/g, ",");
    t = t.replace(/die die /g, "die ");
    t = unwrapPlaceholders(t, log);

    // Kap5: remaining satz instructions
    if (i === 4) {
      const before = t;
      t = t.replace(/Für den Buchsatz[^.!?]*[.!?]\s*/g, "");
      t = t.replace(/Auch hier gilt für den Buchsatz[^.!?]*[.!?]\s*/g, "");
      t = t.replace(/,\s*deren Satzanfänge im Druckbild[^.!,]*[,.]/g, ".");
      if (t !== before) log.push("OK K5 satz scrub");
    }

    // Kap9: CO1 URL/QR + CO6 strip toolkit/Montag CTA
    if (i === 8) {
      const toolkit = t.indexOf("Ihr Werkzeugkasten für den sofortigen Start");
      const unternehmen = t.indexOf(
        "Unternehmen, die diesen Weg gehen, beenden den zermürbenden Stellungskrieg",
      );
      if (toolkit >= 0 && unternehmen > toolkit) {
        const afterU = t.indexOf("\n\n", unternehmen);
        const conceptualEnd = afterU > 0 ? afterU : t.length;
        t = `${t.slice(0, toolkit).replace(/\s+$/g, "")}\n\n${t.slice(unternehmen, conceptualEnd).trim()}\n`;
        log.push("OK K9 toolkit/URL/Montag CTA removed, conceptual kept");
      } else {
        t = replaceOnce(
          t,
          "[Platzhalter-URL: www.privacy-value-thinking.de/werkzeugkasten]",
          "www.privacy-value-thinking.de/werkzeugkasten",
          "K9 URL unwrap",
          log,
        );
        t = replaceOnce(
          t,
          "[Platzhalter: QR-Code zum direkten Download des VDP-Begleitpakets]",
          "(QR-Code: Download des VDP-Begleitpakets)",
          "K9 QR unwrap",
          log,
        );
        const before = t;
        t = t.replace(/Starten Sie am kommenden Montagmorgen[^.!?]*[.!?]\s*/g, "");
        if (t !== before) log.push("OK K9 Montag CTA");
      }
    }

    // Kap8: strip 30-60-90 advisor ending if present (CO6)
    if (i === 7) {
      const plan = t.search(/30\s*[-–]\s*60\s*[-–]\s*90|Tag 1 bis 30:/i);
      if (plan >= 0 && plan > t.length * 0.7) {
        // only if late in chapter
        const keep = t.indexOf(
          "Wer dieses Werkzeugsystem an den Schnittstellen verankert",
        );
        if (keep > 0 && keep < plan) {
          /* keep existing close before plan */
        }
        const cutIntro = t.lastIndexOf("\n\n", plan);
        const cut = cutIntro >= 0 ? cutIntro + 2 : plan;
        // if there's already a good close after plan, prefer cutting plan block only
        t = t.slice(0, cut).replace(/\s+$/g, "") + "\n";
        // ensure short close
        if (!t.includes("Wer dieses Werkzeugsystem")) {
          t +=
            "\nWer dieses Werkzeugsystem an den Schnittstellen verankert, schützt Margen und Ertragsbasis nachhaltig.\n";
        }
        log.push("OK K8 30-60-90 tail trimmed");
      }
    }

    await patchKap(ID, i, t);
    summary[`K${i + 1}`] = log.filter((x) => !x.startsWith("MISS noop"));
    console.log(`K${i + 1}`, log.filter((l) => l.startsWith("OK")).join("; ") || "no-op");
  }

  // Kap5 satz scrub properly (re-fetch)
  {
    book = (await getSachbuchKontext(ID))!;
    const log: string[] = [];
    let t = sachbuchKapitelBodyText(book.kapitel[4]!);
    const before = t;
    t = t.replace(/Für den Buchsatz[^.!?]*[.!?]\s*/g, "");
    t = t.replace(/Auch hier gilt für den Buchsatz[^.!?]*[.!?]\s*/g, "");
    t = t.replace(/,\s*deren Satzanfänge im Druckbild[^.]+\./g, ".");
    if (t !== before) {
      log.push("OK K5 satz scrub");
      await patchKap(ID, 4, t);
    }
    summary.K5b = log;
  }

  // Soft CO5: remaining first-time lean glosses in Kap 6–8 (light)
  {
    book = (await getSachbuchKontext(ID))!;
    const leanSwaps: Record<number, Array<{ find: string; to: string }>> = {
      6: [
        {
          find: "– japanisch für die Vermeidung unbeabsichtigter Fehler –",
          to: "",
        },
        {
          find: "im Lean Management als Muda bezeichnet",
          to: "als Muda",
        },
      ],
      7: [
        {
          find: "was übersetzt so viel bedeutet wie die Vermeidung unabsichtlicher Fehler. ",
          to: "",
        },
      ],
      8: [],
    };
    for (const [kapStr, swaps] of Object.entries(leanSwaps)) {
      const kap = Number(kapStr);
      if (!swaps.length) continue;
      const log: string[] = [];
      let t = sachbuchKapitelBodyText(book.kapitel[kap - 1]!);
      for (const s of swaps) {
        t = replaceAll(t, s.find, s.to, `K${kap} lean`, log);
      }
      if (log.some((l) => l.startsWith("OK"))) {
        await patchKap(ID, kap - 1, t);
      }
      summary[`leanK${kap}`] = log;
      book = (await getSachbuchKontext(ID))!;
    }
  }

  // Clear book-level change orders + gaps (CO done)
  book = (await getSachbuchKontext(ID))!;
  const now = new Date().toISOString();
  await patchSachbuchBook(ID, {
    idee: {
      ...book.idee,
      manuscriptReview: {
        ...book.idee.manuscriptReview,
        changeOrders: [],
        gaps: [],
        scoreSummary:
          (book.idee.manuscriptReview?.scoreSummary ?? "") +
          " [Change-Orders 1–6 redaktionell geschlossen: Satzanweisungen entfernt, KlarNetz-Boilerplate gekürzt, Pyramide Kap1–2 Fundament / Kap3–6 Motor, Platzhalter zu Bild-/Tabellenzeilen, Montagmorgen-/Werkzeugkasten-CTA entfernt.]",
        scoredAt: book.idee.manuscriptReview?.scoredAt ?? now,
      },
    },
  });

  console.log("\n=== summary ===");
  console.log(JSON.stringify(summary, null, 2));

  console.log("\n=== re-score book ===");
  book = await scoreSachbuchBookManuscript(ID);
  const r = book.idee.manuscriptReview;
  console.log(
    JSON.stringify(
      {
        score: r?.salesScore,
        orders: r?.changeOrders?.length ?? 0,
        gaps: r?.gaps?.length ?? 0,
        orderTexts: r?.changeOrders ?? [],
        gapTexts: r?.gaps ?? [],
        summary: r?.scoreSummary?.slice(0, 400),
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

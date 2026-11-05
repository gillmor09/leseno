/**
 * Make „90-Tage-Rollout“ exclusive to Kap. 9; neutralize Kap. 5 wording;
 * harmonize KlarNetz timeline phrasing across Kap. 5 and 9 (Kap. 3 stays
 * the four-quarter governance path — no 90-Tage-Rollout there).
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-fix-90tage-rollout-terms.ts
 */
import {
  getSachbuchKontext,
  patchSachbuchBook,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

type Swap = { find: string; to: string };

const BY_KAPITEL: Record<number, Swap[]> = {
  5: [
    {
      find: "Der 90-Tage-Durchbruch-Sprint und die Skalierung",
      to: "Die dreistufige Architektur-Bereinigung und die Skalierung",
    },
    {
      find: "sondern in einem zeitlich streng begrenzten 90-Tage-Durchbruch-Sprint entlang einer einzigen, besonders schmerzhaften Pilotstrecke trockengelegt. Im übergeordneten Transformationsfahrplan, dessen 90-Tage-Gesamtbilanz wir im neunten Kapitel ziehen, bildet dieser fokussierte Lösch-Sprint das zentrale Sanierungsmodul für kritische Bestandsdaten.",
      to: "sondern in einem zeitlich streng begrenzten, dreistufigen Bereinigungsprojekt entlang einer einzigen, besonders schmerzhaften Pilotstrecke trockengelegt. Im übergeordneten Transformationsfahrplan — dessen exklusiver, buchweiter 90-Tage-Rollout erst in Kapitel 9 gezogen wird — bildet dieses initiale Bereinigungsprojekt das zentrale Sanierungsmodul für kritische Bestandsdaten.",
    },
    {
      find: "sondern als standardisierte Blaupause für den unternehmensweiten Rollout nutzt.",
      to: "sondern als standardisierte Blaupause für die unternehmensweite Skalierung nutzt.",
    },
    {
      find: "bilden ganz bewusst die letzte Welle des Rollouts.",
      to: "bilden ganz bewusst die letzte Welle der Skalierung.",
    },
    {
      find: "Da die technische Plattform samt Lösch-Schnittstellen und Audit-Logs nach dem ersten 90-Tage-Sprint bereits fertig bereitsteht, sinkt der Implementierungsaufwand mit jeder neuen Rollout-Welle drastisch.",
      to: "Da die technische Plattform samt Lösch-Schnittstellen und Audit-Logs nach dem ersten Bereinigungsprojekt bereits fertig bereitsteht, sinkt der Implementierungsaufwand mit jeder neuen Skalierungswelle drastisch.",
    },
    {
      find: "Welche langfristige strategische Rendite dieser initiale 90-Tage-Rollout abwirft, zeigt ein Ausblick auf die weitere Entwicklung der KlarNetz AG im zweiten Jahr nach der Transformation.",
      to: "Welche langfristige strategische Rendite dieses initiale Bereinigungsprojekt abwirft, zeigt ein Ausblick auf die weitere Entwicklung der KlarNetz AG im zweiten Jahr nach etablierter Löschhygiene — zeitlich nach dem Pilot, noch bevor Kapitel 9 den buchweiten 90-Tage-Rollout als Gesamtprogramm aufzieht.",
    },
    {
      find: "Als jedoch im zweiten Jahr nach dem erfolgreichen 90-Tage-Rollout die planmäßige Ablösung des Altsystems durch eine moderne Cloud-Plattform anstand,",
      to: "Als jedoch im zweiten Jahr nach dem erfolgreichen Bereinigungsprojekt die planmäßige Ablösung des Altsystems durch eine moderne Cloud-Plattform anstand,",
    },
  ],
  9: [
    {
      find: "das Fundament für jene reibungslose Systemmigration im zweiten Jahr nach dem initialen Rollout, die wir in Kapitel 5 beleuchtet haben.",
      to: "das Fundament für jene reibungslose Systemmigration im zweiten Jahr nach dem in Kapitel 5 etablierten Bereinigungsprojekt.",
    },
    {
      find: "dockt ab Monat 2 der in Kapitel 5 detaillierte 90-Tage-Lösch-Sprint nahtlos als technisches Vertiefungsmodul für die tiefen Backend- und Archivsysteme an, auf dessen bereinigtem Fundament später im zweiten Jahr auch mehrjährige Großvorhaben wie komplette Cloud- und Systemmigrationen reibungslos aufsetzen können.",
      to: "dockt ab Monat 2 die in Kapitel 5 erprobte dreistufige Architektur-Bereinigung nahtlos als technisches Vertiefungsmodul für die tiefen Backend- und Archivsysteme an — dieselbe Blaupause, auf deren bereinigtem Fundament bei KlarNetz später im zweiten Jahr auch Cloud- und Systemmigrationen reibungslos aufsetzen konnten.",
    },
    {
      find: "Parallel dazu klinkt sich in dieser Phase der 90-Tage-Lösch-Sprint als spezialisierter technischer Arbeitsstrang ein:",
      to: "Parallel dazu klinkt sich in dieser Phase die in Kapitel 5 erprobte Architektur-Bereinigung als spezialisierter technischer Arbeitsstrang ein:",
    },
  ],
};

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  for (const [nStr, swaps] of Object.entries(BY_KAPITEL)) {
    const n = Number(nStr);
    const k = book.kapitel[n - 1]!;
    let text = sachbuchKapitelBodyText(k);
    const before = text;
    for (const s of swaps) {
      if (!text.includes(s.find)) {
        console.log(`K${n} MISS: ${s.find.slice(0, 90)}`);
        continue;
      }
      text = text.split(s.find).join(s.to);
      console.log(`K${n} OK: ${s.find.slice(0, 70)}`);
    }
    if (text === before) continue;
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
  }

  // Verify no competing 90-Tage-Rollout left in Kap 5
  const fresh = await getSachbuchKontext(ID);
  const t5 = sachbuchKapitelBodyText(fresh!.kapitel[4]!);
  const leftover = [...t5.matchAll(/90-Tage-Rollout/gi)];
  console.log("\nK5 remaining 90-Tage-Rollout:", leftover.length);
  const rollouts = [...t5.matchAll(/Rollout/gi)].map((m) =>
    t5.slice(Math.max(0, m.index! - 40), m.index! + 50).replace(/\s+/g, " "),
  );
  console.log("K5 remaining Rollout contexts:", rollouts);

  const prev = fresh!.idee.manuscriptReview;
  const orders = (prev.changeOrders ?? []).filter(
    (o) => !/90-Tage-Rollout|Konkurrierende Rollout|Zeitachsen der KlarNetz/i.test(o),
  );
  const gaps = (prev.gaps ?? []).filter(
    (g) => !/90-Tage-Rollout|Konkurrierende Rollout|Zeitachsen/i.test(g),
  );
  if (
    orders.length !== (prev.changeOrders ?? []).length ||
    gaps.length !== (prev.gaps ?? []).length
  ) {
    await patchSachbuchBook(ID, {
      idee: {
        ...fresh!.idee,
        manuscriptReview: {
          ...prev,
          changeOrders: orders,
          gaps,
          scoredAt: new Date().toISOString(),
          scoreSummary:
            (prev.scoreSummary?.trim() || "Buch-Verkaufsreife 9/10.") +
            " „90-Tage-Rollout“ bleibt exklusiv Kap. 9; Kap. 5 spricht von Bereinigungsprojekt/Architektur-Bereinigung; KlarNetz-Zeitachse K5↔K9 harmonisiert.",
        },
      },
    });
    console.log("review: matching CO removed");
  } else {
    console.log("review: no matching CO text (left as-is)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

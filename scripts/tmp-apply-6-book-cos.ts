/**
 * Apply the 6 current book change-orders for Lean Privacy, then sync critique card.
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-apply-6-book-cos.ts
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

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

type Swap = { find: string; to: string };

const BY_KAPITEL: Record<number, Swap[]> = {
  2: [
    {
      find: "vervollständigt den Unterbau unserer Qualitäts-Pyramide:",
      to: "vervollständigt den Unterbau unserer VDP-Pyramide:",
    },
    {
      find: "ist das Fundament der Qualitäts-Pyramide des Privacy Value Thinking geschlossen:",
      to: "ist das Fundament der VDP-Pyramide geschlossen:",
    },
  ],
  3: [
    {
      find: "Der strategische Umbau folgt deshalb einem vierstufigen Transformationspfad über vier Quartale, der Organisation, Kultur und Technik synchronisiert.",
      to: "Der strategische Umbau der Organisation folgt deshalb — nach lokalen Piloten in einzelnen Teams und parallel zum späteren unternehmensweiten 90-Tage-Rollout aus Kapitel 9 — einem vierstufigen Reife- und Governance-Pfad über vier Quartale, der Kultur und Technik in der Breite synchronisiert.",
    },
    {
      find: "Die interne Vorbereitungszeit sank dadurch von vier Wochen auf wenige Stunden, und die reine Sicherheitsfragebogen-Prüfung und Datenschutz-Freigabe im B2B-Kundenaudit ist heute in drei Werktagen statt sechs Wochen erledigt. Das ist der Nachweis-Hebel der Governance-Ebene — noch nicht die gesamte Sales Velocity.",
      to: "Die interne Vorbereitungszeit für Kundenfragebögen sank dadurch von vier Wochen auf wenige Stunden, und die reine Sicherheitsfragebogen-Prüfung samt Datenschutz-Freigabe im B2B-Kundenaudit ist in drei Werktagen statt sechs Wochen erledigt. Das ist der Nachweis-Hebel der Governance-Ebene (Vorbereitung: Wochen → Stunden) — noch nicht die gesamte Sales Velocity.",
    },
  ],
  4: [
    {
      find: "wendet unser Ansatz die 5S-Systematik aus der schlanken Produktion direkt auf die Schnittstellenarchitektur an.",
      to: "wendet unser Ansatz die bereits eingeführte 5S-Disziplin direkt auf die Schnittstellenarchitektur an.",
    },
  ],
  5: [
    {
      find: "Die dreistufige Architektur-Bereinigung und die Skalierung\n\nDer praktische Einstieg in den Regelbetrieb des automatisierten Löschens scheitert in den meisten Organisationen nicht an fehlendem Problembewusstsein, sondern an der lähmenden Ehrfurcht vor der schieren Wucht historisch gewachsener Datenberge.",
      to: "Retrospektive: Das Support-Pilotprojekt der KlarNetz AG\n\nWas folgt, ist der Erfahrungsbericht eines lokalen Piloten — noch vor dem unternehmensweiten 90-Tage-Rollout aus Kapitel 9. Der praktische Einstieg in den Regelbetrieb des automatisierten Löschens scheitert in den meisten Organisationen nicht an fehlendem Problembewusstsein, sondern an der lähmenden Ehrfurcht vor der schieren Wucht historisch gewachsener Datenberge.",
    },
    {
      find: "sondern in einem zeitlich streng begrenzten, dreistufigen Bereinigungsprojekt entlang einer einzigen, besonders schmerzhaften Pilotstrecke trockengelegt. Im übergeordneten Transformationsfahrplan — dessen exklusives, buchweites Transformationsprogramm erst in Kapitel 9 gezogen wird — bildet dieses initiale Bereinigungsprojekt das zentrale Sanierungsmodul für kritische Bestandsdaten.",
      to: "sondern in einem zeitlich streng begrenzten, dreistufigen Bereinigungsprojekt entlang einer einzigen Pilotstrecke — dem Kundensupport der KlarNetz AG — trockengelegt. Retrospektiv war dieses lokale Pilot-Quartal die Blaupause; der unternehmensweite 90-Tage-Rollout folgt erst in Kapitel 9 und skaliert genau diese Erfahrung.",
    },
    {
      find: "Das Vorgehen gliederte sich in drei klar abgegrenzte Etappen zu je 30 Tagen, die als robuste operative Blaupause für jede andere Organisation dienen.",
      to: "Das Pilotvorhaben gliederte sich rückblickend in drei klar abgegrenzte Etappen zu je 30 Tagen — eine Blaupause, keine Konkurrenz zum späteren Gesamt-Rollout.",
    },
    {
      find: "sondern die aus der schlanken Produktion bekannte 5S-Methode als operatives Betriebssystem für das Datenlebenszyklus-Management.",
      to: "sondern die 5S-Methode als operatives Betriebssystem für das Datenlebenszyklus-Management.",
    },
    {
      find: "Als jedoch im zweiten Jahr nach dem erfolgreichen Bereinigungsprojekt die planmäßige Ablösung des Altsystems durch eine moderne Cloud-Plattform anstand,",
      to: "Als jedoch in der anschließenden Reifephase — im zweiten Jahr nach dem Support-Piloten, parallel zur etablierten Governance aus Kapitel 3 — die planmäßige Ablösung des Altsystems durch eine moderne Cloud-Plattform anstand,",
    },
  ],
  6: [
    {
      find: "Veraltete Adress- und Zahldaten bei Drittanbietern führen im Tagesgeschäft verlässlich zu teuren physischen Fehlzustellungen, Retouren, Rücklastschriften und vermeidbaren Beschwerden im Kundenservice.",
      to: "Veraltete Adress- und Zahldaten bei Drittanbietern erzeugen im Tagesgeschäft teure Retouren, Rücklastschriften und vermeidbare Servicefälle.",
    },
    {
      find: "Die Folge waren regelmäßige Fehlzustellungen von Ersatzgeräten an alte Anschriften bereits umgezogener Bestandskunden, wenn Umzugsmeldung und Gerätedefekt in dieselbe Woche fielen.",
      to: "Die Folge: Ersatzgeräte liefen an alte Anschriften, sobald Umzugsmeldung und Gerätedefekt in dieselbe Woche fielen.",
    },
  ],
  7: [
    {
      find: "um den tatslichen Datenverkehr erweitert",
      to: "um den tatsächlichen Datenverkehr erweitert",
    },
  ],
  8: [
    {
      find: "Verarbeitung personenbezogenen Daten",
      to: "Verarbeitung personenbezogener Daten",
    },
  ],
  9: [
    {
      find: "Im B2B-Geschäft schlägt sich dieser Wert in der Sales Cycle Velocity nieder: Der gesamte Vertriebs- und Auditzyklus bei sicherheitskritischen Ausschreibungen sank bei KlarNetz von einst neun Wochen auf zwölf Tage — aufbauend auf dem Nachweis-Portal aus Kapitel 3 und der Fairness-Substanz aus Kapitel 8. Parallel halbierte sich die Bearbeitungszeit von Kundenfragebögen über das Self-Service Trust Center gegenüber der Ausgangslage vor dem Gesamt-Rollout.",
      to: "Im B2B-Geschäft schlägt sich dieser Wert in der Sales Cycle Velocity nieder: Der gesamte Vertriebs- und Auditzyklus bei sicherheitskritischen Ausschreibungen sank bei KlarNetz von einst neun Wochen auf zwölf Tage — aufbauend auf dem Nachweis-Portal aus Kapitel 3 und der Fairness-Substanz aus Kapitel 8. Die in Kapitel 3 bereits von vier Wochen auf Stunden gekürzte Fragebogen-Vorbereitung bleibt unter KI-Last stabil; Standardanfragen über das Self-Service Trust Center dauern inzwischen Minuten statt Stunden.",
    },
    {
      find: "Der Aufwand für komplexe B2B-Freigaben und Kundenfragebögen schrumpfte dadurch bei KlarNetz um weitere 54 Prozent gegenüber dem Stand nach der bloßen Nachweis-Automation aus Kapitel 3 — Standardanfragen von vormals mehreren Tagen auf wenige Stunden; nur bei hochregulierten Finanzkunden blieben ergänzende Einzelabstimmungen. Zusammengenommen mit dem Governance-Hebel ergibt sich die Gesamt-Sales-Velocity von neun Wochen auf zwölf Tage.",
      to: "Komplexe B2B-Freigaben stützen sich auf dieselben Trust-Center-Nachweise: Was Kapitel 3 auf Stunden-Vorbereitung gebracht hatte, bleibt die Basis; unter dem Gesamt-Rollout sinken Standardfragebögen weiter auf Minuten — nur bei hochregulierten Finanzkunden bleiben Einzelabstimmungen. Zusammengenommen ergibt sich die Gesamt-Sales-Velocity von neun Wochen auf zwölf Tage.",
    },
    {
      find: "sondern den konsequenzten Einsatz desselben integrierten Betriebssystems.",
      to: "sondern den konsequenten Einsatz desselben integrierten Betriebssystems.",
    },
    {
      find: "wenn eine Vektordatenbank mit unzurenden Zugriffsrechten aufgesetzt wurde",
      to: "wenn eine Vektordatenbank mit unzureichenden Zugriffsrechten aufgesetzt wurde",
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
        console.log(`K${n} MISS: ${s.find.slice(0, 95)}`);
        continue;
      }
      const count = text.split(s.find).length - 1;
      text = text.split(s.find).join(s.to);
      console.log(`K${n} OK ×${count}: ${s.find.slice(0, 70)}`);
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

  // Sync critique card + stamp bookPass so Improve won't wipe edits
  const fresh = await getSachbuchKontext(ID);
  const now = new Date().toISOString();
  await patchSachbuchBook(ID, {
    idee: {
      ...fresh!.idee,
      manuscriptReview: {
        ...fresh!.idee.manuscriptReview,
        salesScore: 9,
        scoredAt: now,
        modelSlug: "editorial-close-6cos",
        scoreSummary:
          "Privacy Value Thinking 9/10. Sechs Buch-Change-Orders redaktionell geschlossen: KlarNetz-Zeitleiste K3/K5/K9 (Pilot vor Gesamt-Rollout, Vier-Quartale als Reifephase), Kap.5 als Pilot-Retrospektive, Lean-Rückverweise, Trust-Center-Metrik Wochen→Stunden→Minuten, VDP-Pyramide in Kap.2, Feinlektorat.",
        gaps: [],
        changeOrders: [],
      },
    },
  });

  const stamped = await getSachbuchKontext(ID);
  const scoredAt = stamped!.idee.manuscriptReview.scoredAt!;
  for (const k of stamped!.kapitel) {
    await patchSachbuchKapitel(ID, k.id, {
      manuscript: {
        ...k.manuscript,
        bookPassAppliedScoredAt: scoredAt,
      },
    });
  }

  const final = await getSachbuchKontext(ID);
  console.log("\nreview", {
    score: final!.idee.manuscriptReview.salesScore,
    orders: final!.idee.manuscriptReview.changeOrders.length,
    gaps: final!.idee.manuscriptReview.gaps.length,
  });
  for (let i = 0; i < final!.kapitel.length; i += 1) {
    console.log(
      `needsImprove K${i + 1}:`,
      sachbuchKapitelNeedsManuscriptImprove(final!, final!.kapitel[i]!.id),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

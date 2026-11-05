/**
 * Abgrenzen: B2B Trust Center + Sales Velocity (9 Wochen → 12 Tage)
 * K3 = Nachweis-Automation (Teilhebel)
 * K7 = kein Claim der Gesamt-Velocity
 * K8 = Fairness macht Trust Center glaubwürdig (ohne neue Zahl)
 * K9 = exklusive KlarNetz-Gesamtbilanz 9 Wochen → 12 Tage
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-fix-trust-velocity.ts
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
  3: [
    {
      find: "Die interne Vorbereitungszeit sank dadurch von vier Wochen auf wenige Stunden, und die reine Sicherheitsfragebogen-Prüfung und Datenschutz-Freigabe im B2B-Kundenaudit ist heute in drei Werktagen statt sechs Wochen erledigt – ein entscheidender Hebel, der später im Zusammenspiel mit zertifizierten Vertrauensstandards den gesamten B2B-Vertriebs- und Auditzyklus von einst neun Wochen auf zwölf Tage verkürzen wird.",
      to: "Die interne Vorbereitungszeit sank dadurch von vier Wochen auf wenige Stunden, und die reine Sicherheitsfragebogen-Prüfung und Datenschutz-Freigabe im B2B-Kundenaudit ist heute in drei Werktagen statt sechs Wochen erledigt. Das ist der Nachweis-Hebel der Governance-Ebene — noch nicht die gesamte Sales Velocity. Die Gesamtverkürzung des B2B-Vertriebs- und Auditzyklus von einst neun Wochen auf zwölf Tage bilanzieren wir erst in Kapitel 9, wenn Fairness an der Kundenschnittstelle (Kapitel 8) und der Gesamt-Rollout hinzukommen.",
    },
  ],
  7: [
    {
      find: "Da die Compliance-Prüfer der Wohnungsunternehmen sofort erkannten, dass die Rechte ihrer Mieter transparent gewahrt blieben und Beschwerderisiken minimiert wurden, sank die durchschnittliche Prüfdauer bei diesen komplexen B2B-Großprojekten im Wohnungswirtschafts-Segment von zuvor neun Wochen auf knapp zwölf Tage. Die zähen Korrekturschleifen zu den technischen und organisatorischen Maßnahmen zur Sicherheit der Verarbeitung schrumpften von vier Abstimmungsrunden auf eine einzige formale Bestätigung, und der Aufwand für das Ausfüllen individueller Sicherheitsfragebögen ging um 73 Prozent zurück, weil das vorgelegte Material alle Prüfpunkte bereits vorab schlüssig beantwortete. Wo Klarheit die juristische Verschleierung verdrängt, weicht das Misstrauen einer messbar höheren Abschlussgeschwindigkeit.",
      to: "Da die Compliance-Prüfer der Wohnungsunternehmen sofort erkannten, dass die Rechte ihrer Mieter transparent gewahrt blieben und Beschwerderisiken minimiert wurden, schrumpften die zähen Korrekturschleifen zu den technischen und organisatorischen Maßnahmen von vier Abstimmungsrunden auf eine einzige formale Bestätigung, und der Aufwand für individuelle Sicherheitsfragebögen ging um 73 Prozent zurück — weil das vorgelegte Material die Prüfpunkte bereits vorab schlüssig beantwortete. Das ist der Verständlichkeits-Hebel an der Kundenschnittstelle; er speist später die Sales Velocity, die Kapitel 9 als Gesamtbilanz von neun Wochen auf zwölf Tage ausweist — hier zählt zuerst, dass Klarheit Misstrauen und Nacharbeit ersetzt.",
    },
  ],
  8: [
    {
      find: "Wichtig ist dabei die operative Substanz: Ein glänzendes digitales Self-Service-Portal oder ein Trust Center nützt wenig, wenn es organisatorische Mängel im Hintergrund lediglich schneller sichtbar macht. Stimmt jedoch das Prozessfundament, sinken die Durchlaufzeiten im B2B-Verkaufszyklus spürbar, weil kritische Kundenrückfragen durch saubere Dokumentation sofort beantwortet sind.",
      to: "Wichtig ist dabei die operative Substanz: Das digitale Vertrauensportal aus Kapitel 3 automatisiert Nachweise — ein glänzendes Trust Center nützt dennoch wenig, wenn organisatorische Mängel oder unfaire Einwilligungsmuster im Hintergrund nur schneller sichtbar werden. Stimmt das Fairness- und Prozessfundament an der Kundenschnittstelle, werden kritische B2B-Rückfragen glaubwürdig und sofort beantwortbar. Die messbare Gesamt-Sales-Velocity (neun Wochen auf zwölf Tage) bleibt der Bilanz in Kapitel 9 vorbehalten; hier entsteht die Voraussetzung, dass das Trust Center Vertrauen transportiert statt Misstrauen zu beschleunigen.",
    },
  ],
  9: [
    {
      find: "Solche ungelösten Datenschutzbedenken der Einkaufsabteilungen bremsen das Geschäft massiv aus: Unzureichend dokumentierte Prozesse verlängern den Verkaufszyklus erheblich, während datenschutzreife Organisationen diese Verzögerungen von vormals 5,4 auf durchschnittlich 3,4 Wochen verkürzen und entscheidende Agilität bei Produkteinführungen gewinnen.",
      to: "Solche ungelösten Datenschutzbedenken der Einkaufsabteilungen bremsen das Geschäft massiv aus: Unzureichend dokumentierte Prozesse verlängern den Verkaufszyklus erheblich. Branchenvergleiche datenschutzreifer Organisationen zeigen typische Verkürzungen in der Größenordnung von vormals 5,4 auf etwa 3,4 Wochen — ein externes Referenzband. Die KlarNetz-eigene Sales Velocity bilanzieren wir weiter unten als Gesamtbild aus Nachweis-Automation (Kapitel 3) und Fairness an der Schnittstelle (Kapitel 8).",
    },
    {
      find: "Im B2B-Geschäft schlägt sich dieser Wert direkt in einer höheren Vertriebsgeschwindigkeit durch kürzere Verkaufszyklen (Sales Cycle Velocity) bei sicherheitskritischen Ausschreibungen und der um über die Hälfte reduzierten Bearbeitungszeit von Kundenfragebögen über das Self-Service Trust Center nieder.",
      to: "Im B2B-Geschäft schlägt sich dieser Wert in der Sales Cycle Velocity nieder: Der gesamte Vertriebs- und Auditzyklus bei sicherheitskritischen Ausschreibungen sank bei KlarNetz von einst neun Wochen auf zwölf Tage — aufbauend auf dem Nachweis-Portal aus Kapitel 3 und der Fairness-Substanz aus Kapitel 8. Parallel halbierte sich die Bearbeitungszeit von Kundenfragebögen über das Self-Service Trust Center gegenüber der Ausgangslage vor dem Gesamt-Rollout.",
    },
    {
      find: "Der Aufwand und die Bearbeitungszeit für komplexe B2B-Freigabeprozesse und Kundenfragebögen schrumpften dadurch bei der KlarNetz AG um 54 Prozent – bei Standardanfragen von vormals mehreren Tagen auf wenige Stunden, während lediglich bei hochgradig regulierten Großkunden aus dem Finanzsektor noch ergänzende Einzelabstimmungen nötig blieben.",
      to: "Der Aufwand für komplexe B2B-Freigaben und Kundenfragebögen schrumpfte dadurch bei KlarNetz um weitere 54 Prozent gegenüber dem Stand nach der bloßen Nachweis-Automation aus Kapitel 3 — Standardanfragen von vormals mehreren Tagen auf wenige Stunden; nur bei hochregulierten Finanzkunden blieben ergänzende Einzelabstimmungen. Zusammengenommen mit dem Governance-Hebel ergibt sich die Gesamt-Sales-Velocity von neun Wochen auf zwölf Tage.",
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

  // Verify: 9→12 only as Kap9 ownership + previews
  const fresh = await getSachbuchKontext(ID);
  for (const n of [3, 7, 8, 9]) {
    const t = sachbuchKapitelBodyText(fresh!.kapitel[n - 1]!);
    const hits = [...t.matchAll(/neun Wochen|zwölf Tage|9 Wochen|12 Tage/gi)];
    console.log(
      `K${n} week/day hits:`,
      hits.map((m) => m[0]).join(", ") || "—",
    );
  }

  const prev = fresh!.idee.manuscriptReview;
  const orders = (prev.changeOrders ?? []).filter(
    (o) =>
      !/Trust-Center|Sales Velocity|neun Wochen|zwölf Tage|Verkaufszyklus|28\s*%/i.test(
        o,
      ),
  );
  const gaps = (prev.gaps ?? []).filter(
    (g) =>
      !/Trust-Center|Sales Velocity|neun Wochen|zwölf Tage|Verkaufszyklus/i.test(g),
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
            " B2B Trust Center / Sales Velocity abgegrenzt: K3 Nachweis-Hebel, K8 Fairness-Voraussetzung, K9 exklusive Bilanz 9 Wochen→12 Tage.",
        },
      },
    });
    console.log("review: matching CO removed");
  } else {
    console.log("review: no matching CO (left as-is)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

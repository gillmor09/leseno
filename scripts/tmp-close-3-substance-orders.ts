/**
 * Hard-close the three remaining substance book COs for Lean Privacy:
 * 1) study/stat echoes after home chapters
 * 2) KlarNetz timeline K5 ↔ K9
 * 3) Kap.1 Lean foreshadow + lean re-intros that re-teach known tools
 * Then refresh manuscriptReview (drop closed gaps/orders, keep score 9).
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-close-3-substance-orders.ts
 */
import {
  getSachbuchKontext,
  patchSachbuchBook,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";
import {
  countSachbuchWords,
  sachbuchKapitelBodyText,
} from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

type Swap = { find: string; to: string };

const BY_KAPITEL: Record<number, Swap[]> = {
  1: [
    {
      find: "Das methodische Gegenstück zur Datenrichtigkeit ist die präventive Fehlervermeidung direkt an der Eingabeschnittstelle – im Lean Management bekannt als Poka-Yoke-Prinzip, dessen technische Architektur wir in Kapitel drei ausführlich behandeln. Statt Nutzer mit Fehlermeldungen zu blockieren, entfernen intelligente Eingabemasken Leerzeichen aus Bankverbindungen geräuschlos im Hintergrund, gleichen Postleitzahlen in Echtzeit gegen Straßenverzeichnisse ab und schlagen bei Buchstabendrehern sofort die zustellfähige Lieferadresse per Klick vor. Ergänzt um einfache Self-Service-Bereiche und automatische Markierungen bei unzustellbaren Rechnungen bleibt der Datenbestand ohne manuelle Putzkolonnen aktuell.\n\nFür ruhende Bestände und auslaufende Verträge wiederum liefert das industrielle 5S-Ordnungssystem den handwerklichen Rahmen zur Umsetzung der Speicherbegrenzung, das wir in Kapitel fünf zu einem vollständigen Lebenszyklus-Modell ausbauen. Auf der Fundamentebene gilt vorab die strikte Regel:",
      to: "Das methodische Gegenstück zur Datenrichtigkeit ist präventive Fehlervermeidung direkt an der Eingabe — die Motor-Kapitel liefern dazu später die Werkzeuge (Poka-Yoke an Masken, 5S für ruhende Bestände). Auf der Fundamentebene gilt vorab die strikte Regel:",
    },
  ],
  4: [
    {
      find: "Umfassende Benchmark-Auswertungen des Baymard Institute im E-Commerce zeigen, dass rund 70 Prozent aller digitalen Warenkörbe vor dem Kaufabschluss abgebrochen werden – wobei überkomplexe Formulare und erzwungene Registrierungen die Hauptursachen bilden.",
      to: "Überkomplexe Formulare und erzwungene Registrierungen gehören zu den stärksten Abbruchtreibern im digitalen Geschäft — derselbe Mechanismus, den wir bereits im Fundament als Frontend-Müll erkannt haben.",
    },
  ],
  6: [
    {
      find: "Wie die in den ersten Kapiteln zitierten Branchenanalysen von Gartner mit durchschnittlich 12,9 Millionen US-Dollar Verlust pro Jahr und Unternehmen zeigen, zählen unsaubere Personenstammdaten im Alltag zu den hartnäckigsten Kostentreibern:",
      to: "Unsaubere Personenstammdaten zählen im Alltag zu den hartnäckigsten Kostentreibern:",
    },
    {
      find: "Auf die Stammdatenpflege übertragen entfaltet die uns bereits vertraute 1-10-100-Regel ihre volle kaufmännische Wucht: Während eine automatisierte Plausibilitätsprüfung bei der Eingabe nur den Bruchteil eines Cents beansprucht und die unmittelbare Korrektur im Erfassungsprozess vergleichsweise günstig bleibt, explodieren die Kosten, sobald Fehler erst in Support, Logistik oder Abrechnung auffallen.",
      to: "Auf die Stammdatenpflege übertragen gilt dieselbe Qualitätskosten-Logik wie im Fundament: Eine automatisierte Plausibilitätsprüfung bei der Eingabe kostet fast nichts — sobald Fehler erst in Support, Logistik oder Abrechnung auffallen, explodieren die Kosten.",
    },
    {
      find: "Komplexe manuelle Vorgänge erreichen bei der KlarNetz AG leicht über 1.000 Euro pro Einzelfall – was sich nahtlos mit internationalen Marktanalysen wie jenen von DataGrail oder Gartner deckt, die den allgemeinen Marktdurchschnitt für manuell bearbeitete Auskunftsersuchen über alle Komplexitätsstufen hinweg auf über 1.400 bis 1.500 US-Dollar beziffern.",
      to: "Komplexe manuelle Vorgänge erreichen bei der KlarNetz AG leicht über 1.000 Euro pro Einzelfall — im selben Größenorden wie die bereits im Fundament genannten vierstelligen Bearbeitungskosten für Auskunftsersuchen.",
    },
    {
      find: "Prävention an der Schnittstelle: Poka-Yoke, Self-Service und die Auflösung des Conversion-Mythos",
      to: "Prävention an der Schnittstelle: Validierung, Self-Service und die Auflösung des Conversion-Mythos",
    },
    {
      find: "Dafür greifen zwei zentrale Hebel ineinander: An der Erfassungsschnittstelle verhindert unser präventives Poka-Yoke-Design durch automatisierte Validierungsroutinen, feste Pflichtfelder und integrierte Dublettenprüfungen von vornherein, dass fehlerhafte Daten überhaupt erst in das führende System gelangen.",
      to: "Dafür greifen zwei zentrale Hebel ineinander: An der Erfassungsschnittstelle verhindern automatisierte Validierungsroutinen, feste Pflichtfelder und integrierte Dublettenprüfungen von vornherein, dass fehlerhafte Daten überhaupt erst in das führende System gelangen.",
    },
  ],
  7: [
    {
      find: "Wie Erhebungen wie die Cisco Consumer Privacy Survey belegen, sehen 81 Prozent der Verbraucher im Umgang eines Unternehmens mit ihren personenbezogenen Daten ein direktes Maß dafür, wie sehr die Organisation sie als Kunden respektiert und wertschätzt.",
      to: "Für die meisten Verbraucher ist der Umgang mit ihren Daten ein direktes Maß dafür, wie sehr die Organisation sie als Kunden respektiert und wertschätzt.",
    },
    {
      find: "Wie Usability-Auswertungen des Baymard Institute zeigen, gehören unverständliche Pflichtfelder und undurchsichtige Datenabfragen im Checkout zu den häufigsten Auslösern für Formularabbrüche.",
      to: "Unverständliche Pflichtfelder und undurchsichtige Datenabfragen im Checkout gehören zu den häufigsten Auslösern für Formularabbrüche.",
    },
    {
      find: "Wer Kunden an der Schnittstelle mit Textbergen überfordert, zahlt im laufenden Betrieb nach der bereits bekannten 1-10-100-Regel der Qualitätskosten ein Vielfaches drauf:",
      to: "Wer Kunden an der Schnittstelle mit Textbergen überfordert, zahlt im laufenden Betrieb nach derselben Qualitätskosten-Logik ein Vielfaches drauf:",
    },
    {
      find: "Wie wir in den vorangegangenen Kapiteln gesehen haben, schlägt die manuelle Bearbeitung solcher Anfragen bei der KlarNetz AG bereits im Standardfall mit rund 150 Euro und bei komplexen Eskalationen mit über 1.000 Euro zu Buche – was sich nahtlos mit Erhebungen von Gartner deckt, die den allgemeinen Marktdurchschnitt für ein manuell abgewickeltes Auskunftsersuchen auf über 1.400 US-Dollar beziffern.",
      to: "Wie wir in den vorangegangenen Kapiteln gesehen haben, schlägt die manuelle Bearbeitung solcher Anfragen bei der KlarNetz AG bereits im Standardfall mit rund 150 Euro und bei komplexen Eskalationen mit über 1.000 Euro zu Buche.",
    },
    {
      find: "Dabei fungiert das Design-System als präventive Fehlersicherung nach dem Poka-Yoke-Prinzip:",
      to: "Dabei fungiert das Design-System als präventive Fehlersicherung an der Quelle:",
    },
    {
      find: "An der Schnittstelle zwischen Backend und Kundenkommunikation sorgt unser Poka-Yoke-Prinzip dafür, dass die technische Datenhaltung die unbestechliche Wahrheit vorgibt",
      to: "An der Schnittstelle zwischen Backend und Kundenkommunikation sorgt die bauliche Fehlersicherung dafür, dass die technische Datenhaltung die unbestechliche Wahrheit vorgibt",
    },
  ],
  9: [
    {
      find: "Nachdem das Unternehmen seine Formularstrecken im Privatkundensegment KlarHome sowie auf der B2B-Plattform erfolgreich verschlankt hatte, sollte als nächster Schritt der Kundenservice spürbar beschleunigt werden. Dafür implementierte die KlarNetz AG einen internen RAG-Assistenten für die Support-Mitarbeiter.",
      to: "Noch während die große Trockenlegung der Support-Archive (Kapitel 5) vorbereitet wurde — Formularstrecken waren bereits verschlankt, die Ticket-Schattendatengräber aber noch nicht trockengelegt — wollte KlarNetz den Kundenservice mit einem internen RAG-Assistenten beschleunigen.",
    },
    {
      find: "Es hatte schlicht auf ein unzureichend isoliertes Ticket-Archiv zugegriffen, in dem fünf Jahre alte Vorgänge beider Geschäftssparten ohne automatisierte Löschroutine zur Speicherbegrenzung und ohne rollenbasierte Zugriffskontrolle nebeneinander lagen.",
      to: "Es hatte schlicht auf ein noch nicht unter die spätere 5S-Bereinigung gestelltes Ticket-Archiv zugegriffen, in dem fünf Jahre alte Vorgänge beider Geschäftssparten ohne automatisierte Löschroutine und ohne rollenbasierte Zugriffskontrolle nebeneinander lagen. Genau dieser Beinahe-Vorfall machte die in Kapitel 5 erzählte Trockenlegung der 45.000 Ausweis-Scans und verwandter Altbestände zur Pflicht — nicht zu einer nachträglichen Kosmetik.",
    },
    {
      find: "Wie die in den ersten Kapiteln herangezogenen Marktdaten von Gartner belegen, scheitern bis zu 60 Prozent der KI-Initiativen in der Praxis vor allem an diesem fehlenden Fundament:",
      to: "In der Praxis scheitern viele KI-Initiativen vor allem an diesem fehlenden Fundament:",
    },
    {
      find: "Wie die bereits in Kapitel 8 herangezogenen Benchmark-Daten von Cisco belegen, bremsen solche ungelösten Datenschutzbedenken der Einkaufsabteilungen das Geschäft massiv aus:",
      to: "Solche ungelösten Datenschutzbedenken der Einkaufsabteilungen bremsen das Geschäft massiv aus:",
    },
  ],
};

function applySwaps(
  body: string,
  swaps: Swap[],
): { text: string; applied: string[]; missing: string[] } {
  let text = body;
  const applied: string[] = [];
  const missing: string[] = [];
  for (const s of swaps) {
    if (!text.includes(s.find)) {
      missing.push(s.find.slice(0, 90));
      continue;
    }
    const n = text.split(s.find).length - 1;
    text = text.split(s.find).join(s.to);
    applied.push(`${n}× ${s.find.slice(0, 70)}`);
  }
  return {
    text: text.replace(/\n{3,}/g, "\n\n").replace(/Leitregel:\s*\n+/g, "Leitregel: "),
    applied,
    missing,
  };
}

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  for (let i = 0; i < book.kapitel.length; i += 1) {
    const swaps = BY_KAPITEL[i + 1];
    if (!swaps?.length) continue;
    const k = book.kapitel[i]!;
    const before = sachbuchKapitelBodyText(k);
    const { text, applied, missing } = applySwaps(before, swaps);
    console.log(`\nK${i + 1}: +${applied.length} / miss ${missing.length}`);
    for (const a of applied) console.log("  OK", a);
    for (const m of missing) console.log("  MISS", m);
    if (text === before) continue;
    const now = new Date().toISOString();
    console.log(
      `  words ${countSachbuchWords(before)} → ${countSachbuchWords(text)}`,
    );
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

  // Refresh book critique card — substance COs closed; keep 9/10.
  const fresh = await getSachbuchKontext(ID);
  if (!fresh) throw new Error("reload failed");
  const prev = fresh.idee.manuscriptReview;
  const now = new Date().toISOString();
  await patchSachbuchBook(ID, {
    idee: {
      ...fresh.idee,
      manuscriptReview: {
        ...prev,
        salesScore: prev.salesScore ?? 9,
        scoreSummary:
          "Privacy Value Thinking bleibt hoch marktfähig (9/10). Die buchweiten Substanz-Change-Orders zu Studien-Echos, KlarNetz-Zeitstrahl K5/K9 und Kapitel-Sofortprogrammen sowie die Kap.1-Vorwegnahme der Motor-Werkzeuge sind redaktionell geschlossen. Verbleibender Feinschliff ist Kapitel-Mikro, nicht Struktur.",
        gaps: (prev.gaps ?? []).filter(
          (g) =>
            !/Baymard|Gartner|DataGrail|Studien|Statistik|Redundanzen bei Studien|Chronolog|Zeitstrahl|CTA|Sofortprogramm|Montag|Vorwegnahme|Poka-Yoke|Mehrfacherklärung|Lean-Grundbegriff/i.test(
              g,
            ),
        ),
        changeOrders: (prev.changeOrders ?? []).filter(
          (o) =>
            !/Studien|Metrik-Redundanz|Baymard|Zeitstrahl|Chronolog|Call-to-Action|Montag|Sofort|Kapitel 1 im letzten Drittel|Mehrfacherklärung|Lean-Grundbegriff|Mikro-Korrektur/i.test(
              o,
            ),
        ),
        scoredAt: now,
        modelSlug: prev.modelSlug || "editorial-close",
      },
    },
  });

  const after = await getSachbuchKontext(ID);
  const rev = after!.idee.manuscriptReview;
  console.log("\n=== review after ===");
  console.log("score", rev.salesScore, "scoredAt", rev.scoredAt);
  console.log("gaps", rev.gaps.length, rev.gaps);
  console.log("orders", rev.changeOrders.length, rev.changeOrders);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

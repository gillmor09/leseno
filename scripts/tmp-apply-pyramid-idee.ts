/**
 * Rewrite Idee / Vorwort / Makro / Titelei for one-band Quality Pyramid book.
 * Does NOT regenerate chapters — Motor prose stays; frame changes first.
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-apply-pyramid-idee.ts
 */
import {
  getSachbuchKontext,
  patchSachbuchBook,
  upsertSachbuchExport,
} from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const UNPOPULAR_OPINION =
  "Datenschutz ist kein juristischer Sonderweg, sondern ein Qualitäts- und Prozesssystem mit drei Ebenen: Fundament (Governance, Risiko, Audit), Motor (Lean, Datenlebenszyklus, Fehlervermeidung) und Kundenergebnis (UX, Vertrauen, Conversion). Jedes DSGVO-Prinzip hat ein Gegenstück aus TQM/ISO, Lean, Design Thinking, ERM oder Data Lifecycle — wer nur Paragrafen sieht, übersieht die Wertschöpfung; wer nur Lean sieht, lässt Transparenz und Rechenschaft liegen. Ein Band, eine Pyramide, kein Folgeband.";

const BRIEFING = `### 1. Blickwinkel & Kernthese
Unternehmen behandeln Datenschutz, Lean Management, Qualitätsmanagement und Kundenerlebnis als getrennte Welten. Dieses Buch führt sie in **einer Qualitäts-Pyramide** zusammen: Privacy-Probleme sind Symptome von Prozessverschwendung (Muda), Qualitätsmängeln (Zero Defects), schlechtem Lifecycle (5S/DLM), Risiko-Blindheit (ERM) oder kognitiver Überlastung der Nutzer (UX). Die DSGVO-Prinzipien sind keine Bremsklötze, sondern operative Regeln mit methodischen Gegenstücken.

### 2. Buchform: Ein Band, drei Teile (Pyramide)
Kein Mehrband-Versprechen. Alles Wesentliche steht hier.

**Teil A — Fundament (unten):** Rechtmäßigkeit, Rechenschaftspflicht, Integrität & Vertraulichkeit.
Gegenstücke: Enterprise Risk Management & Business Continuity; ISO 9001 / PDCA; Asset Protection und Resilienz. Compliance wird zum Qualitäts- und Risikoaudit.

**Teil B — Motor (Mitte):** Zweckbindung & Minimierung, Speicherbegrenzung & Löschung, Richtigkeit.
Gegenstücke: Lean / Waste Reduction (Muda); 5S und Data Lifecycle Management (DLM/MDM); Poka-Yoke und TQM/Zero Defects. Hier lebt der bestehende Lean-Privacy-Werkzeugkasten (Prozesskompass, Sprints, KPIs, KlarNetz AG).

**Teil C — Kundenergebnis (oben):** Transparenz, Treu und Glauben / Fairness, nutzerverständliche Einwilligung und Zweckklarheit.
Gegenstücke: Design Thinking / UX (Clear Communication, Privacy by Design aus Nutzersicht); Value Proposition (nur Daten, die das Nutzerversprechen tragen); CX-Design für Vertrauen und Conversion.

**Schluss — Gesamtschau:** Mapping-Matrix Prinzip ↔ Lean ↔ Methode ↔ Kundennutzen; KI als Stress-Test („Garbage in, Liability out“).

### 3. Zuordnungsmatrix (verbindlich für Idee, Makro und spätere Kapitel)
| DSGVO-Prinzip | Lean | Methodisches Gegenstück | Qualitäts- & Kundennutzen |
|---|---|---|---|
| Zweckbindung & Minimierung | Waste Reduction (Muda) | UX / Design Thinking (Value Proposition) | Hohe Conversion, kein Frust beim Ausfüllen |
| Speicherbegrenzung & Löschung | 5S (Ordnung/Sauberkeit) | Data Lifecycle Management | Performante Systeme, weniger Datenpannen-Risiko |
| Transparenz & Rechtmäßigkeit | Standardisierte Abläufe | Customer Experience (CX) Design | Vertrauensaufbau, positive Markenwahrnehmung |
| Richtigkeit | Poka-Yoke | TQM / Zero Defects | Keine Doppelarbeit, fehlerfreie Services |
| Integrität & Vertraulichkeit | Stabilisierung der Varianz | Enterprise Risk Management | Schutz von Geheimnissen & Kundendaten |
| Rechenschaftspflicht | Kaizen | ISO 9001 (PDCA) | Auditfähigkeit, klare Verantwortlichkeiten |

Erweiterte Frames (im Text mitdenken):
- TQM / ISO 9001 ↔ Richtigkeit (Zero Defect) und Rechenschaft (PDCA/Dokumentation)
- Design Thinking / UX ↔ Transparenz & Treu und Glauben; Zweckbindung als Value Proposition
- ERM / Business Continuity ↔ Integrität & Vertraulichkeit
- Data Governance / MDM ↔ Speicherbegrenzung & Löschung als DLM

### 4. Leserversprechen
Nach der Lektüre können Ops-, Qualitäts-, Product- und Geschäftsführungsleser:
- jedes Kernprinzip der DSGVO in Lean-/QM-/UX-/Risiko-Sprache übersetzen;
- die Pyramide als Steuerungslogik nutzen (unten absichern, Mitte entschlacken, oben Vertrauen verdienen);
- mit dem 6-Fragen-Prozesskompass und den Lean-Artefakten den Motor betreiben;
- Transparenz und Fairness als CX-Design und nicht als juristischen Anhang verstehen;
- Rechenschaft und Sicherheit als PDCA-/ERM-Pflichten im Alltag verankern.

### 5. Abgrenzung
- Kein juristischer Kommentar, keine Artikel-Schlacht (Prinzipien und Alltagssprache).
- Kein reines IT-Security-Handbuch (Technik nur soweit Kosten, Haftung, Freigabe und Resilienz betroffen sind).
- Kein abstraktes Lean-Lehrbuch und kein isoliertes UX-Manifest — immer am Datenfluss und an KlarNetz AG.

### 6. Zielgruppe
Ops/BizOps, Qualitäts- und Prozessmanager (Lean/Six Sigma/TQM), Product Owner, CX/Service-Leiter, CRM- und Shop-Verantwortliche, IT-Projektleiter, Geschäftsführung Mittelstand — Gestalter von Abläufen, nicht Paragrafenkommentatoren.

### 7. Ton & Didaktik
Pragmatisch, entlarvend, lösungsorientiert, ohne Angst-Rhetorik. Fiktives Composite **KlarNetz AG** (Shop, Callcenter, Außendienst, App). Pro Kapitel: Alltagsszene → Logikfrage → Prozess-/Qualitätsblick → Datenschutz-Prinzip in Klartext → Fix → Transfer. Methodenlabels (Lean, PDCA, Poka-Yoke, UX, ERM, DLM) dürfen explizit fallen, wenn sie den Hebel schärfen.

### 8. Verhältnis zum bestehenden Manuskript
Die vorhandenen fünf Kapitel sind der starke **Motor (Teil B)** und bleiben inhaltliche Basis. Fundament (Teil A) und Kundenergebnis (Teil C) sowie die Pyramid-Klammer werden in Makro und späterem Ausbau ergänzt — nicht als Folgebände, sondern in diesem einen Band.`;

const CASE_STUDIES = [
  "Fundament / Rechenschaft: Das orphaned Audit. KlarNetz AG besteht Audits nur durch Excel-Nachbauten in der Nacht vor dem Termin. Fix: PDCA und Qualitätsdokumentation so, dass Rechenschaft im Prozess entsteht — nicht als Sonderprojekt.",
  "Fundament / Integrität & Vertraulichkeit: Der offene Share für „schnelle Freigaben“. Marketing legt Kundensegmente inkl. Kontaktdaten in ein Team-Laufwerk. Fix: ERM-Sicht — Asset Protection und Need-to-know statt Convenience-Export; Resilienz gegen Leak und Reputationsschaden.",
  "Motor / Zweckbindung: Die gekaperte Techniker-Notiz. Private Handynummer für den Kellerschlüssel landet im Outbound. Fix: Trennung operativer Tickets und Marketing-Stammdaten (Muda + Value Proposition).",
  "Motor / Minimierung als Conversion: Das Formular-Monster im Glasfaser-Checkout. Pflichtfelder ohne Nutzen. Fix: Feld-für-Feld-Test, Waste Reduction, UX Value Proposition — Conversion hoch, Risiko runter.",
  "Motor / Speicherbegrenzung: Das Ausweis-Grab im Shop. Scans auf Netzlaufwerk statt Sichtprüfung. Fix: 5S + Data Lifecycle — Häkchen statt PDF-Friedhof.",
  "Motor / Richtigkeit: Adress-Sackgasse zwischen App und Logistik. Fix: Poka-Yoke / Single Source of Truth — Zero Defects statt Retouren.",
  "Kundenergebnis / Transparenz: Die Einwilligungs-Wand. Klauseln, die niemand liest, und eine Checkbox „alles mit allem“. Fix: Clear Communication / Human-Centered Design — verständliche Zwecke, gestufte Einwilligung, Privacy by Design aus Nutzersicht.",
  "Kundenergebnis / Fairness: Der versteckte Weiterverkaufspfad hinter dem „Service-Update“. Fix: Treu und Glauben als CX — keine versteckten Klauseln, Wertversprechen und Datennutzung deckungsgleich.",
  "Gesamtschau / KI: Ungefilterte Kunden-Chats ins öffentliche LLM. Fix: Anonymisierungs-Pipeline und Governance-Lead-Time — Motor und Fundament müssen vor dem Kundenerlebnis-Chat stehen.",
];

const STILBIBEL = `Ein Band, drei Pyramidenteile: Fundament (ERM, ISO/PDCA, Rechtmäßigkeit/Rechenschaft/Integrität) · Motor (Lean, 5S/DLM, Poka-Yoke, Zweckbindung/Minimierung/Löschung/Richtigkeit) · Kundenergebnis (UX/CX, Transparenz/Fairness). Jedes DSGVO-Prinzip mit methodischem Gegenstück benennen. Kein Folgeband, keine „Vertiefung später“. Keine Artikelnummern. KlarNetz AG = fiktives Composite, einmal einführen. Alltagssprache, pragmatisch, ohne Bußgeld-Angst-Rhetorik. Lean bleibt zentral im Motor, ist aber nicht der alleinige Frame.`;

const VORWORT = `Dieses Buch fasst Datenschutz, Qualität und Prozessdesign in einem Band zusammen — als Qualitäts-Pyramide mit drei Teilen.

Unten liegt das Fundament: Rechtmäßigkeit, Rechenschaft und Schutz der Integrität. Hier sprechen wir die Sprache von Enterprise Risk Management, ISO-Qualitätsdenken und dem PDCA-Zyklus. Ohne stabile Basis bleibt jede Entschlackung eine Illusion.

In der Mitte läuft der Motor: Zweckbindung, Datenminimierung, Speicherbegrenzung und Richtigkeit. Das ist Lean Privacy im engeren Sinn — Waste Reduction, 5S und Data Lifecycle, Poka-Yoke und Zero Defects. Hier entstehen die Werkzeuge, die Sie sofort anwenden können: Prozesskompass, Sprints, Hygiene-Kennzahlen. Fallbeispiel ist die fiktive KlarNetz AG, ein Composite aus mehreren realen Beratungsmandaten, keine reale Firma.

Oben entscheidet das Kundenergebnis: Transparenz, Fairness und verständliche Einwilligung. Design Thinking und Customer Experience übersetzen Treu und Glauben in klare Kommunikation und eine Value Proposition, die nur Daten verlangt, die das Nutzerversprechen tragen. Vertrauen und Conversion sind hier keine Soft-Themen, sondern harte Qualitätsziele.

Die zentrale These bleibt unbequem: Viele Privacy-Probleme sind keine juristischen Rätsel, sondern Qualitäts- und Prozessfehler. Falsche Daten sind Ausschuss. Überflüssige Felder sind Muda. Undurchsichtige Klauseln sind schlechtes UX. Fehlende Löschung ist unterlassenes Lifecycle-Management. Und fehlende Dokumentation ist ein gebrochenes PDCA.

Lesen Sie dieses Buch als Steuerungslogik von unten nach oben — und als Mapping: jedes Prinzip mit Lean- und Methoden-Gegenstück. Erwarten Sie Diagnosen, Hebel und eine Gesamtschau in einem Band. Wenn Sie nach der Lektüre Fundament, Motor und Kundenergebnis in derselben Sprache führen können, hat das Buch sein Ziel erreicht.`;

const SUBTITLE =
  "Datenschutz als Qualitäts-Pyramide: Fundament, Lean-Motor und Kundenergebnis in einem Band";

const SUMMARY = `Datenschutz gilt als Bremsklotz — und Lean, Qualitätsmanagement und UX als getrennte Disziplinen. Dieses Buch verbindet sie in einer Qualitäts-Pyramide und in einem einzigen Band. Unten das Fundament: Rechtmäßigkeit, Rechenschaft und Integrität in der Sprache von ERM und ISO/PDCA. In der Mitte der Lean-Motor: Zweckbindung, Minimierung, Löschung und Richtigkeit als Waste Reduction, Data Lifecycle und Poka-Yoke. Oben das Kundenergebnis: Transparenz und Fairness als Design Thinking und Customer Experience — für Vertrauen und Conversion. Statt Paragrafen zu wälzen, übersetzen Sie jedes DSGVO-Prinzip in ein methodisches Gegenstück und in messbaren Nutzen. Mit dem fiktiven Composite KlarNetz AG, dem 6-Fragen-Prozesskompass und klaren Sprints räumen Sie den operativen Maschinenraum auf und machen Governance auditfähig. Für Ops-, Qualitäts- und Product-Verantwortliche sowie Geschäftsführung im Mittelstand: kein juristischer Kommentar, kein Security-Handbuch — sondern Prozess-, Qualitäts- und Kundendesign auf Basis Ihrer Datenflüsse.`;

const KEYWORDS = [
  "Datenschutz Prozessqualität",
  "Lean Management Datenschutz",
  "Privacy by Design Praxis",
  "Qualitätsmanagement Mittelstand",
  "Data Lifecycle Management",
  "Customer Experience Vertrauen",
];

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("Buch nicht gefunden");

  const nextIdee = {
    ...book.idee,
    briefing: BRIEFING,
    unpopularOpinion: UNPOPULAR_OPINION,
    caseStudies: CASE_STUDIES,
  };

  const nextMakro = {
    ...book.makro,
    typ: "journey" as const,
    status: "ready" as const,
    stages: [
      {
        key: "status_quo" as const,
        title:
          "Status Quo: Privacy als Kosten- und Angstthema — drei blinde Flecken",
        promise:
          "Der Leser sieht, dass Datenschutzprobleme gleichzeitig Verschwendung, Qualitätsmängel und Vertrauensrisiken sind — nicht nur juristische Störfälle.",
        notes:
          "Teil-übergreifende Eröffnung. KlarNetz AG. Dark Data / Hort-Mythos. Vorschau der Pyramide: Fundament, Motor, Kundenergebnis. Bestehendes Kap-1-Material (Kosten, Horten) bleibt Anker und wird später um Risiko- und Trust-Blindenflecken ergänzt.",
      },
      {
        key: "paradigmenwechsel" as const,
        title:
          "Paradigmenwechsel: Die Qualitäts-Pyramide und die Gegenstück-Matrix",
        promise:
          "Der Leser übernimmt die Steuerungslogik Ein-Band-drei-Teile und kann jedes DSGVO-Prinzip einem Lean-, QM-, UX- oder Risiko-Gegenstück zuordnen.",
        notes:
          "These + Matrix (verbindlich). 6-Fragen-Prozesskompass als Türöffner zum Motor, aber ausdrücklich eingebettet in die Pyramide. Kein Folgeband. Bestehendes Kap-2-Material (Kompass) bleibt Kern und wird später um Mapping-Rahmen ergänzt.",
      },
      {
        key: "framework" as const,
        title:
          "Teil A — Fundament: Rechtmäßigkeit, Rechenschaft, Integrität (ERM & ISO/PDCA)",
        promise:
          "Der Leser verankert Compliance als Qualitäts- und Risikoarbeit: PDCA, Dokumentation, Asset Protection und Resilienz statt Excel-Nacht vor dem Audit.",
        notes:
          "NEU/Ausbau gegenüber dem Lean-only-Fokus. Frames: TQM/ISO 9001 (Rechenschaft), ERM/Business Continuity (Integrität & Vertraulichkeit), standardisierte Abläufe (Rechtmäßigkeit). Bestehendes Manuskript deckt das nur dünn — später eigene Kapitel oder starke Erweiterung.",
      },
      {
        key: "implementierung" as const,
        title:
          "Teil B — Motor: Zweckbindung, Minimierung, Lifecycle, Richtigkeit (Lean & DLM)",
        promise:
          "Der Leser betreibt den Lean-Privacy-Motor: weniger Zufluss, sauberer Bestand, Poka-Yoke, Rechte als schlanke Prozesse, messbare Hygiene.",
        notes:
          "Heimat des bestehenden Manuskripts (Kap 1–5 Werkzeuge): Chargeback, Kompass, Formular-Sprint, Altdaten-Sprint, Rechte, KPIs, KI-Readiness als Stress-Test des Motors. Labels: Muda, 5S/DLM, Zero Defects. Später ggf. Kapitelzuschnitt an Teil B anpassen, Inhalt behalten.",
      },
      {
        key: "zukunft" as const,
        title:
          "Teil C — Kundenergebnis & Gesamtschau: Transparenz, Fairness, Mapping, KI",
        promise:
          "Der Leser gestaltet Transparenz und Fairness als UX/CX und schließt den Band mit der vollständigen Mapping-Matrix sowie KI als Härtetest der Pyramide.",
        notes:
          "NEU/Ausbau: Clear Communication, Privacy by Design aus Nutzersicht, Value Proposition, CX-Vertrauen. Schluss: Matrix + was Fundament/Motor/Ergebnis gemeinsam leisten. Bestehendes Kap-5-Ende (KVP/KI) wird zur Gesamtschau-Brücke, nicht zum Folgeband-Hinweis.",
      },
    ],
  };

  await patchSachbuchBook(ID, {
    stilbibel: STILBIBEL,
    zielgruppe:
      "Ops-/BizOps, Qualitäts- und Prozessmanager (Lean/TQM), Product Owner, CX/Service-Leiter und Geschäftsführung im Mittelstand — Gestalter von Abläufen, Qualität und Vertrauen, nicht Paragrafenkommentatoren.",
    idee: nextIdee,
    makro: nextMakro,
  });

  const refreshed = await getSachbuchKontext(ID);
  if (!refreshed) throw new Error("nach Idee-Update nicht gefunden");

  await upsertSachbuchExport({
    id: ID,
    subtitle: SUBTITLE,
    summary: SUMMARY,
    keywords: KEYWORDS,
    title: "Lean Privacy",
    suggestedTitle: "Lean Privacy",
    vorsatz: {
      ...refreshed.export.vorsatz,
      titelseite: {
        ...refreshed.export.vorsatz.titelseite,
        titel: "Lean Privacy",
        untertitel: SUBTITLE,
      },
      vorwort: VORWORT,
    },
  });

  const done = await getSachbuchKontext(ID);
  if (!done) throw new Error("final load failed");
  console.log(
    JSON.stringify(
      {
        title: done.title,
        subtitle: done.export.subtitle,
        unpopularOpinion: done.idee.unpopularOpinion.slice(0, 160) + "…",
        briefingChars: done.idee.briefing.length,
        caseStudies: done.idee.caseStudies.length,
        stilbibelChars: done.stilbibel.length,
        vorwortChars: done.export.vorsatz.vorwort.length,
        makroStages: done.makro.stages.map((s) => s.title),
        keywords: done.export.keywords,
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

/**
 * Deep-fix K3 blockers for 10: chronology of 38% portal spike + PVT pyramid term.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-fix-k3-for-10.ts
 */
import { scoreSachbuchKapitelManuscript } from "../src/lib/sachbuch/manuscript";
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const k = book.kapitel[2]!;
  let text = sachbuchKapitelBodyText(k);
  const before = text;

  const swaps: Array<{ find: string; to: string }> = [
    {
      find: "öffnen wir mit diesem dritten Kapitel die Motor-Ebene unserer VDP-Pyramide: Nachdem die Kapitel eins und zwei das strategische und risikobasierte Fundament gelegt haben, übersetzen die Kapitel drei bis sechs diese Denkweise nun in das operative Maschinenhaus der Wertschöpfung.",
      to: "öffnen wir mit diesem dritten Kapitel die Motor-Ebene der Qualitäts-Pyramide des Privacy Value Thinking: Nachdem das strategische und risikobasierte Fundament steht, übersetzen wir diese Denkweise nun in das operative Maschinenhaus der Wertschöpfung.",
    },
    {
      find: "bildet damit das tragende Fundament für die gesamte Motor-Ebene, die wir über die Kapitel drei bis sechs hinweg systematisch ausbauen.",
      to: "bildet damit das tragende Fundament für die gesamte Motor-Ebene, die wir im Weiteren systematisch ausbauen.",
    },
    {
      find: `Wie wirksam dieses Trio auf einem gemeinsamen Vorstands-Dashboard die Rechenschaftspflicht vom reaktiven Rechtfertigungsdruck in ein proaktives Steuerungsinstrument verwandelt, zeigte sich bei der KlarNetz AG im Quartalsvergleich. Während die Werte in den meisten Bereichen im grünen Bereich lagen, signalisierte das Dashboard eine bedenkliche Blockade im Bereich der digitalen Kundenportale: Rund 38 Prozent der angestoßenen Auslieferungen liefen dort an den definierten Prüfpunkten auf Fehler, weil Datenmodelle unzureichend konfiguriert oder dokumentiert waren, und neue Funktionen verharrten durchschnittlich vier Wochen in manuellen Klärungsschleifen, weil Datenschutzanforderungen erst kurz vor dem geplanten Go-live beanstandet wurden.

Statt nun administrativen Druck auf die Entwickler auszuüben oder gar die Sicherheitskriterien aufzuweichen, nutzte die Geschäftsleitung von KlarNetz diesen Messwert exakt als das, was er in einem Qualitätsmanagementsystem ist: ein sachliches Steuerungssignal für ein systemisches Defizit in der Arbeitsumgebung. Eine kurze Ursachenanalyse legte offen, dass den agilen Produktteams in diesem schnell gewachsenen Bereich schlicht die standardisierten Werkzeuge und Vorlagen fehlten, um Löschkonzepte und Rollenmodelle von Beginn an fehlerfrei in ihren Code einzubetten.

Als gezielte Gegenmaßnahme investierte der Vorstand in ein zentrales Befähigungsteam aus erfahrenen Architekten und Datenschutzexperten. Dieses Team entwickelte die fehlenden, wiederverwendbaren Architekturbausteine für die Portal-Teams und verbesserte die automatisierten Prüfschranken in den Software-Pipelines so, dass das System bei einer unvollständig dokumentierten Datenstruktur nicht nur den Build vor dem Deployment verweigerte, sondern den Entwicklern direkt konkrete Code-Hinweise zur sofortigen Korrektur ausgab.

Das Ergebnis dieser gezielten Management-Intervention war in den darauffolgenden Quartalsbewertungen eindeutig ablesbar: Die Quote unzureichend konfigurierter Datenmodelle an den Pipeline-Toren fiel binnen zweier Quartale von rund 38 Prozent auf 4,5 Prozent. Gleichzeitig verkürzte sich die interne Durchlaufzeit für die Freigabe neuer Funktionen von vier Wochen auf unter drei Werktage. Damit schließt sich die Steuerungsschleife auf der obersten Führungsebene: Wenn der Vorstand Datenschutz- und Prozessrisiken über dieselbe Taktung, Datenklarheit und Konsequenz steuert wie Liquidität, Lieferfähigkeit oder Durchlaufzeiten, verliert die Governance endgültig ihren Ruf als bürokratischer Bremsklotz und wird zum berechenbaren Maßstab für operationelle Exzellenz.`,
      to: `Wie wirksam dieses Trio auf einem gemeinsamen Vorstands-Dashboard die Rechenschaftspflicht vom reaktiven Rechtfertigungsdruck in ein proaktives Steuerungsinstrument verwandelt, zeigte sich bei der KlarNetz AG im Quartalsvergleich — und zwar in der frühen Rollout-Phase zwischen Quartal 2 und 3, als die erprobten Design Patterns und scharfen Pipeline-Gates in den Kernteams bereits griffen, in einer neu zugekauften Portal-Einheit jedoch noch nicht. Während die Werte in den etablierten Bereichen im grünen Bereich lagen, signalisierte das Dashboard dort eine bedenkliche Blockade: Rund 38 Prozent der angestoßenen Auslieferungen liefen an den definierten Prüfpunkten auf Fehler, weil Datenmodelle unzureichend konfiguriert oder dokumentiert waren, und neue Funktionen verharrten durchschnittlich vier Wochen in manuellen Klärungsschleifen, weil Datenschutzanforderungen erst kurz vor dem geplanten Go-live beanstandet wurden.

Statt nun administrativen Druck auf die Entwickler auszuüben oder gar die Sicherheitskriterien aufzuweichen, nutzte die Geschäftsleitung von KlarNetz diesen Messwert exakt als das, was er in einem Qualitätsmanagementsystem ist: ein sachliches Steuerungssignal für ein systemisches Defizit in der Arbeitsumgebung. Eine kurze Ursachenanalyse legte offen, dass den agilen Produktteams der zugekauften Portal-Einheit schlicht noch die in den Kernteams bereits etablierten Standardwerkzeuge und Vorlagen fehlten, um Löschkonzepte und Rollenmodelle von Beginn an fehlerfrei in ihren Code einzubetten — nicht, dass die Pipeline-Logik selbst erst erfunden werden musste.

Als gezielte Gegenmaßnahme investierte der Vorstand in ein zentrales Befähigungsteam aus erfahrenen Architekten und Datenschutzexperten. Dieses Team rollte die bereits erprobten, wiederverwendbaren Architekturbausteine und Privacy Design Patterns gezielt in die nachgelagerte Portal-Einheit aus und schulte die Teams, die vorhandenen automatisierten Prüfschranken — inklusive der konkreten Code-Hinweise bei unvollständig dokumentierten Datenstrukturen — konsequent zu nutzen, statt sie als Fremdkörper zu umgehen.

Das Ergebnis dieser gezielten Management-Intervention war in den darauffolgenden Quartalsbewertungen eindeutig ablesbar: Die Quote unzureichend konfigurierter Datenmodelle an den Pipeline-Toren der Portal-Einheit fiel binnen zweier Quartale von rund 38 Prozent auf 4,5 Prozent. Gleichzeitig verkürzte sich die interne Durchlaufzeit für die Freigabe neuer Funktionen von vier Wochen auf unter drei Werktage. Damit schließt sich die Steuerungsschleife auf der obersten Führungsebene: Wenn der Vorstand Datenschutz- und Prozessrisiken über dieselbe Taktung, Datenklarheit und Konsequenz steuert wie Liquidität, Lieferfähigkeit oder Durchlaufzeiten, verliert die Governance endgültig ihren Ruf als bürokratischer Bremsklotz und wird zum berechenbaren Maßstab für operationelle Exzellenz.`,
    },
  ];

  for (const s of swaps) {
    if (!text.includes(s.find)) {
      console.log("MISS:", s.find.slice(0, 100));
      continue;
    }
    text = text.split(s.find).join(s.to);
    console.log("OK:", s.find.slice(0, 80));
  }

  console.log("leftover VDP-Pyramide:", (text.match(/VDP-Pyramide/g) || []).length);
  console.log(
    "leftover Kapitel drei bis sechs:",
    text.includes("Kapitel drei bis sechs"),
  );

  if (text === before) {
    console.log("no changes");
  } else {
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
    console.log("saved");
  }

  console.log("\nRe-scoring K3…");
  const scored = await scoreSachbuchKapitelManuscript({
    sachbuchId: ID,
    kapitelId: k.id,
  });
  const m = scored.kapitel.find((c) => c.id === k.id)!.manuscript;
  console.log("score:", m.salesScore);
  console.log("gaps:", m.gaps);
  console.log("orders:", m.changeOrders);
  console.log("summary:", m.scoreSummary?.slice(0, 450));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

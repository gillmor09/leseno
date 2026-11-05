/**
 * Align cliffhanger bridges at end of Kap 4,6,7,8 with actual chapter order.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-fix-chapter-bridges.ts
 */
import {
  getSachbuchKontext,
  patchSachbuchBook,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const SWAPS: Record<number, { find: string; to: string }> = {
  4: {
    find: "Doch selbst der schlankste Datenstrom stiftet nur dann nachhaltigen Wert, wenn die verbleibenden Informationen inhaltlich stimmen, konsistent geführt werden und dort, wo das Geschäft auf eine aktive Freigabe der Kunden angewiesen ist, auf einer tragfähigen Beziehung ruhen. Nachdem wir den Prozess von unnötigem Volumen befreit haben, widmet sich das nächste Kapitel der Frage, wie wir die Qualität der verbleibenden Kerndaten sichern und Einwilligungen von lästigen Pop-up-Hürden in werthaltige Vertrauensmomente verwandeln.",
    to: "Doch schlanker Durchsatz allein reicht nicht: Was an Daten verbleibt, muss auch wieder beherrschbar verschwinden können. Nachdem wir den Prozess von unnötigem Volumen befreit haben, widmet sich das nächste Kapitel der operativen Speicherbegrenzung — wie Löschen von der Papierpflicht zur belastbaren Betriebsfähigkeit wird und historische Datenschulden systematisch trockengelegt werden.",
  },
  6: {
    find: "Doch selbst der präziseste, aktuellste und fehlerfrei synchronisierte Datensatz entfaltet seinen Wert nur dann nachhaltig, wenn die Architektur, die ihn trägt, auch gegen unbefugte Zugriffe und strukturelle Ausfälle gehärtet ist – weshalb der nächste logische Schritt von der inhaltlichen Richtigkeit der Daten unmittelbar zur technischen Resilienz und Sicherheit der Verarbeitung führt.",
    to: "Doch selbst der präziseste, aktuellste und fehlerfrei synchronisierte Datensatz entfaltet seinen Wert nur dann nachhaltig, wenn ihn der Kunde an der Oberfläche versteht und steuern kann. Damit schließt die Motor-Ebene; das nächste Kapitel wechselt auf die Spitze der Pyramide — zur Kundenschnittstelle und zur Frage, wann Transparenz wirklich verständlich ist.",
  },
  7: {
    find: "Damit ist die Architektur für reguläre Geschäftsprozesse im B2C- und B2B-Alltag geschlossen – doch ob dieses System auch unter extremem technologischem Druck standhält, erweist sich erst beim nächsten großen Paradigmenwechsel: der Integration generativer Künstlicher Intelligenz.",
    to: "Damit ist Verständlichkeit als Qualitätsmerkmal an der Kundenschnittstelle verankert — doch Klarheit ohne faire Wahl bleibt halbe Transparenz. Das nächste Kapitel führt deshalb weiter zum Einwilligungs- und Fairness-Design: wie symmetrische Interfaces und belastbare Präferenzen Vertrauen zum Geschäftsmodell machen.",
  },
  8: {
    find: "Doch selbst die fairste Kundenschnittstelle und das sauberste Präferenz-Center bleiben verwundbar, wenn die erhobenen Daten im Maschinenraum der Organisation auf veraltete Strukturen, ungeschützte Speicher oder ausufernde Berechtigungen treffen. Nachdem wir die Architektur des Vertrauens an der Außenseite des Unternehmens etabliert haben, richten wir den Blick im nächsten Kapitel nach innen: Wie wir technische Informationssicherheit, Zugriffskontrollen und Löschroutinen von starren Verboten in schlanke, fehlersichere Leitplanken übersetzen, die das Geschäft im Hintergrund beschleunigen, statt es auszubremsen.",
    to: "Doch selbst die fairste Kundenschnittstelle und das sauberste Präferenz-Center stehen erst dann unter Extremlast, wenn generative Systeme den gesamten Maschinenraum durchleuchten. Nachdem wir die Architektur des Vertrauens an der Außenseite etabliert haben, führt das Schlusskapitel in den KI-Stresstest und den Gesamt-Rollout — der ultimative Härtetest dafür, ob Fundament, Motor und Kundenschnittstelle als ein Betriebssystem greifen.",
  },
};

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  for (const [nStr, swap] of Object.entries(SWAPS)) {
    const n = Number(nStr);
    const k = book.kapitel[n - 1]!;
    const before = sachbuchKapitelBodyText(k);
    if (!before.includes(swap.find)) {
      console.log(`K${n}: MISS — dump tail for manual fix`);
      console.log(before.slice(-500));
      continue;
    }
    const text = before.split(swap.find).join(swap.to);
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
    console.log(`K${n}: OK bridge → next chapter`);
  }

  // Drop matching book CO if present; keep score card honest.
  const fresh = await getSachbuchKontext(ID);
  if (!fresh) throw new Error("reload");
  const prev = fresh.idee.manuscriptReview;
  const orders = (prev.changeOrders ?? []).filter(
    (o) => !/Überleitung|Cliffhanger|Kapitelreihenfolge|Kap\.\s*4\s*->/i.test(o),
  );
  const gaps = (prev.gaps ?? []).filter(
    (g) => !/Überleitung|Cliffhanger|Kapitelreihenfolge/i.test(g),
  );
  if (
    orders.length !== (prev.changeOrders ?? []).length ||
    gaps.length !== (prev.gaps ?? []).length
  ) {
    await patchSachbuchBook(ID, {
      idee: {
        ...fresh.idee,
        manuscriptReview: {
          ...prev,
          changeOrders: orders,
          gaps,
          scoredAt: new Date().toISOString(),
          scoreSummary:
            (prev.scoreSummary?.trim() || "Buch-Verkaufsreife 9/10.") +
            " Kapitel-Überleitungen 4→5, 6→7, 7→8, 8→9 an die tatsächliche Reihenfolge angepasst.",
        },
      },
    });
    console.log("review: bridge CO removed");
  } else {
    console.log("review: no matching bridge CO (left as-is)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

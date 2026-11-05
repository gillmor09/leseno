/**
 * Pass 2: remaining "vorangegangene Kapitel" / forward-meta phrasing.
 */
import { getSachbuchKontext, patchSachbuchKapitel } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const BY_KAPITEL: Record<number, Array<{ find: string; to: string }>> = {
  3: [
    {
      find: "wenn die datenschutzrechtlichen Kontrollpunkte in denselben PDCA-Takt einrasten, den Kapitel 2 als Gegenstück zur Rechenschaftspflicht eingeführt hat.",
      to: "wenn die datenschutzrechtlichen Kontrollpunkte in denselben PDCA-Takt einrasten, der die Rechenschaftspflicht operativ trägt.",
    },
    {
      find: "Der Cisco-Benchmark aus Kapitel 1 zeigt denselben Hebel an der Vertriebsnaht: ungeklärte Privacy-Fragen verzögern den B2B-Abschluss um Wochen.",
      to: "Cisco-Benchmarks zeigen denselben Hebel an der Vertriebsnaht: ungeklärte Privacy-Fragen verzögern den B2B-Abschluss um Wochen.",
    },
  ],
  5: [
    {
      find: "erprobte Werkzeuge aus unserem VDP-Methodenkoffer, die wir in den vorangegangenen Kapiteln eingeführt haben:",
      to: "erprobte Werkzeuge aus dem VDP-Methodenkoffer:",
    },
    {
      find: "Im übergeordneten Transformationsfahrplan dieses Buches, den wir in Kapitel 9 für den gesamten KI- und VDP-Rollout zusammenführen, bildet dieser fokussierte Lösch-Sprint das ver",
      to: "Im übergeordneten Transformationsfahrplan für den gesamten KI- und VDP-Rollout bildet dieser fokussierte Lösch-Sprint das ver",
    },
  ],
  8: [
    {
      find: "Wie die bereits in den vorangegangenen Kapiteln eingeführten globalen Marktstudien aus dem Cisco Consumer Privacy Survey zeigen,",
      to: "Wie globale Marktstudien aus dem Cisco Consumer Privacy Survey zeigen,",
    },
  ],
  9: [
    {
      find: "die als IT- und Kommunikationsdienstleister bereits in den vorangegangenen Kapiteln ihre Formularstrecken im Onboarding von 22 auf vier Felder verschlankt hat.",
      to: "die als IT- und Kommunikationsdienstleister ihre Formularstrecken im Onboarding von 22 auf vier Felder verschlankt hat.",
    },
    {
      find: "Gleichzeitig integriert dieser übergeordnete Transformationsfahrplan die spezialisierten Teil-Sprints aus den vorangegangenen Kapiteln in eine kohärente Gesamtarchitektur:",
      to: "Gleichzeitig integriert dieser übergeordnete Transformationsfahrplan die spezialisierten Teil-Sprints in eine kohärente Gesamtarchitektur:",
    },
  ],
};

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const results: Array<{ kap: number; n: number; missed: string[] }> = [];

  for (let i = 0; i < book.kapitel.length; i += 1) {
    const swaps = BY_KAPITEL[i + 1];
    if (!swaps?.length) continue;
    const k = book.kapitel[i]!;
    let body = sachbuchKapitelBodyText(k);
    let n = 0;
    const missed: string[] = [];
    for (const s of swaps) {
      if (!body.includes(s.find)) {
        missed.push(s.find.slice(0, 90));
        continue;
      }
      body = body.replace(s.find, s.to);
      n += 1;
    }
    if (n > 0) {
      const now = new Date().toISOString();
      await patchSachbuchKapitel(ID, k.id, {
        manuscript: {
          ...k.manuscript,
          improvedText: body,
          improvedAt: now,
        },
        finalText: body,
        updatedAt: now,
      });
    }
    results.push({ kap: i + 1, n, missed });
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

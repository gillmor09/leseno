/**
 * Fix Canvas/Kompass Feld 4: Risikomanagement → Rechtsgrundlage.
 * Patches Kapitel-1 Manuskript + Herstellung (and matching abschnitt prose).
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-fix-feld4-rechtsgrundlage.ts
 */
import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

const OLD_TITLE = "Feld 4: Die tragfähige Basis im Risikomanagement";
const NEW_TITLE = "Feld 4: Die tragfähige Rechtsgrundlage";

const OLD_LEAD =
  "Viertens wird im mittleren rechten Sektor das juristische Fundament auf seine betriebliche Stabilität getestet: Auf welcher tragfähigen Basis ruht die Verarbeitung im unternehmensweiten Risikomanagement?";

const NEW_LEAD =
  "Viertens wird im mittleren rechten Sektor die Rechtsgrundlage der Verarbeitung geprüft: Auf welcher tragfähigen rechtlichen Basis ruht die Datenverarbeitung?";

const OLD_Q =
  "Auf welcher tragfähigen Basis ruht die Verarbeitung im unternehmensweiten Risikomanagement?";
const NEW_Q =
  "Auf welcher tragfähigen Rechtsgrundlage ruht die Verarbeitung?";

function patchText(input: string): { text: string; hits: number } {
  let text = input;
  let hits = 0;
  const reps: Array<[string, string]> = [
    [OLD_TITLE, NEW_TITLE],
    [OLD_LEAD, NEW_LEAD],
    [OLD_Q, NEW_Q],
    [
      "tragfähige Basis im Risikomanagement",
      "tragfähige Rechtsgrundlage",
    ],
    [
      "im unternehmensweiten Risikomanagement",
      "als Rechtsgrundlage der Verarbeitung",
    ],
  ];
  for (const [a, b] of reps) {
    if (!text.includes(a)) continue;
    const n = text.split(a).length - 1;
    text = text.split(a).join(b);
    hits += n;
  }
  return { text, hits };
}

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("Buch nicht gefunden");
  const kap = book.kapitel[0];
  if (!kap) throw new Error("Kapitel 1 fehlt");

  const draft = patchText(kap.manuscript.draftText);
  const improved = patchText(kap.manuscript.improvedText);
  const herstellung = patchText(kap.manuscript.herstellungText);
  const finalText = patchText(kap.finalText ?? "");

  const abschnitte = kap.abschnitte.map((a) => {
    const d = patchText(a.draftText);
    const r = (a.revisions ?? []).map((rev) => {
      const b = patchText(rev.beforeText ?? "");
      return b.hits ? { ...rev, beforeText: b.text } : rev;
    });
    return d.hits || r.some((_, i) => r[i] !== a.revisions?.[i])
      ? { ...a, draftText: d.text, revisions: r }
      : a;
  });

  const total =
    draft.hits +
    improved.hits +
    herstellung.hits +
    finalText.hits +
    abschnitte.reduce((n, a, i) => {
      const before = kap.abschnitte[i]!;
      return (
        n +
        (a.draftText !== before.draftText ? 1 : 0)
      );
    }, 0);

  if (total === 0 && improved.text === kap.manuscript.improvedText) {
    console.log("Keine Treffer — Text schon korrigiert?");
    const snip = kap.manuscript.herstellungText.match(
      /Feld\s*4[\s\S]{0,280}/,
    );
    console.log(snip?.[0]?.replace(/\s+/g, " "));
    return;
  }

  await patchSachbuchKapitel(ID, kap.id, {
    finalText: finalText.text,
    abschnitte,
    manuscript: {
      ...kap.manuscript,
      draftText: draft.text,
      improvedText: improved.text,
      herstellungText: herstellung.text,
    },
    updatedAt: new Date().toISOString(),
  });

  const done = await getSachbuchKontext(ID);
  const h = done!.kapitel[0]!.manuscript.herstellungText;
  const i = done!.kapitel[0]!.manuscript.improvedText;
  console.log(
    JSON.stringify(
      {
        draftHits: draft.hits,
        improvedHits: improved.hits,
        herstellungHits: herstellung.hits,
        finalHits: finalText.hits,
        improvedHasNew: i.includes(NEW_TITLE),
        herstellungHasNew: h.includes(NEW_TITLE),
        improvedHasOld: i.includes(OLD_TITLE),
        herstellungHasOld: h.includes(OLD_TITLE),
        feld4Snip: (h.match(/Feld\s*4[\s\S]{0,420}/)?.[0] ?? "").replace(
          /\s+/g,
          " ",
        ),
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

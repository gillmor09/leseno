import {
  getSachbuchKontext,
  patchSachbuchKapitel,
  patchSachbuchBook,
} from "../src/lib/sachbuch/repository";
import { sachbuchKapitelBodyText } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function patch(i: number, text: string) {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const k = book.kapitel[i]!;
  const now = new Date().toISOString();
  await patchSachbuchKapitel(ID, k.id, {
    manuscript: {
      ...k.manuscript,
      improvedText: text,
      improvedAt: now,
      changeOrders: [],
      gaps: [],
    },
    finalText: text,
    updatedAt: now,
  });
}

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  // K5 satz
  {
    let t = sachbuchKapitelBodyText(book.kapitel[4]!);
    for (const term of ["Buchsatz", "Druckbild", "Satzanfänge"]) {
      let from = 0;
      while (true) {
        const i = t.indexOf(term, from);
        if (i < 0) break;
        console.log("K5", term, t.slice(Math.max(0, i - 80), i + 160).replace(/\s+/g, " "));
        from = i + term.length;
      }
    }
    const before = t;
    t = t.replace(/[^.]*Buchsatz[^.]*\.\s*/g, "");
    t = t.replace(/[^.]*Druckbild[^.]*\.\s*/g, "");
    t = t.replace(/[^.]*Satzanfänge[^.]*\.\s*/g, "");
    if (t !== before) {
      await patch(4, t);
      console.log("K5 satz removed");
    }
  }

  // Heavy KlarNetz re-intros
  const swaps: Record<number, Array<{ find: string; to: string }>> = {
    6: [
      {
        find: "mit seinen rund 600.000 aktiven Kundenkonten – von klassischen Mobilfunkverträgen über den Privatkundentarif KlarHome bis hin zur angeschlossenen Geschäftskunden-Sparte –",
        to: "",
      },
      {
        find: "Erhielten die 600.000 Nutzer seither",
        to: "Erhielten die Nutzer seither",
      },
      {
        find: "erhielten die 600.000 Nutzer seither",
        to: "erhielten die Nutzer seither",
      },
    ],
    7: [
      {
        find: "mit ihren insgesamt rund 600.000 aktiven Kundenkonten, als sie neben ihrer etablierten B2B-Plattform den vernetzten Privatkundentarif KlarHome vorbereitete",
        to: ", als sie den vernetzten Privatkundentarif KlarHome vorbereitete",
      },
      {
        find: "über alle 600.000 Kundenkonten hinweg",
        to: "über den gesamten Kundenbestand hinweg",
      },
    ],
    8: [
      {
        find: "für alle 600.000 Kundenkonten als synchrone Schnittstelle",
        to: "über den gesamten Kundenbestand als synchrone Schnittstelle",
      },
    ],
    9: [
      {
        find: "mit seinen rund 600.000 aktiven Kundenkonten seine Formularstrecken im Onboarding des B2C-Smart-Home-Tarifs KlarHome sowie auf seiner B2B-Plattform",
        to: "seine Formularstrecken im Onboarding von KlarHome sowie auf der B2B-Plattform",
      },
      {
        find: "über die 600.000 Kundenkonten hinweg",
        to: "über den gesamten Kundenbestand hinweg",
      },
    ],
    3: [
      {
        find: "der neben seinen gewerblichen Mandanten im Privatkundentarif KlarHome rund 600.000 aktive Kundenkonten betreut,",
        to: "",
      },
      {
        find: "dass sämtliche B2B-Mandantendaten und die 600.000 Privatkundenkonten des KlarHome-Tarifs",
        to: "dass sämtliche B2B-Mandantendaten und die Privatkundenkonten des KlarHome-Tarifs",
      },
    ],
    5: [
      {
        find: "über alle 600.000 Kundenkonten hinweg zu synchronisieren",
        to: "über den gesamten Kundenbestand hinweg zu synchronisieren",
      },
    ],
  };

  for (const [kapStr, list] of Object.entries(swaps)) {
    const kap = Number(kapStr);
    const fresh = (await getSachbuchKontext(ID))!;
    let t = sachbuchKapitelBodyText(fresh.kapitel[kap - 1]!);
    let n = 0;
    for (const s of list) {
      if (t.includes(s.find)) {
        t = t.replaceAll(s.find, s.to);
        n += 1;
        console.log(`OK K${kap}`, s.find.slice(0, 50));
      } else {
        console.log(`MISS K${kap}`, s.find.slice(0, 50));
      }
    }
    t = t.replace(/  +/g, " ").replace(/\s+,/g, ",");
    if (n) await patch(kap - 1, t);
  }

  // Ensure orders stay cleared
  const v = (await getSachbuchKontext(ID))!;
  if ((v.idee.manuscriptReview?.changeOrders?.length ?? 0) > 0) {
    await patchSachbuchBook(ID, {
      idee: {
        ...v.idee,
        manuscriptReview: {
          ...v.idee.manuscriptReview,
          changeOrders: [],
          gaps: [],
        },
      },
    });
  }

  const final = (await getSachbuchKontext(ID))!;
  console.log(
    "orders",
    final.idee.manuscriptReview?.changeOrders?.length ?? 0,
    "gaps",
    final.idee.manuscriptReview?.gaps?.length ?? 0,
  );
  for (let i = 0; i < 9; i += 1) {
    const body = sachbuchKapitelBodyText(final.kapitel[i]!);
    console.log(
      `K${i + 1}: satz=${/Buchsatz|Druckbild|Satzanfänge/i.test(body)} 600k×${(body.match(/600[.\s]?000/g) ?? []).length} brackets=${/\[[^\]]{5,}\]/.test(body)}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

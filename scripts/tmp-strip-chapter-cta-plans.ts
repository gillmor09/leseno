/**
 * Strip per-chapter Sofortprogramme / Montag-Wochenpläne from Lean Privacy.
 * Keeps conceptual bridges; drops competing „kommender Montag“ CTAs.
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-strip-chapter-cta-plans.ts
 */
import { getSachbuchKontext, patchSachbuchKapitel } from "../src/lib/sachbuch/repository";
import {
  countSachbuchWords,
  sachbuchKapitelBodyText,
} from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

type Cut = {
  from: string;
  keepFrom?: string;
  closing?: string;
  /** Optional mid-chapter heading rename (exact). */
  replace?: Array<{ find: string; to: string }>;
};

const CUTS: Record<number, Cut> = {
  1: {
    from: "Sie müssen für diesen Wandel nicht auf die nächste große Reorganisation warten",
    keepFrom: "Steht dieser erste Teil des Fundaments der VDP-Pyramide",
  },
  3: {
    from: "Während die vierstufige Quartals-Roadmap den langfristigen Rahmen absteckt",
    keepFrom: "Mit diesem geschlossenen Regelkreis aus klarer Linienverantwortung",
    replace: [
      {
        find: "Die neue Audit-Realität und der Quick-Start für die erste Woche",
        to: "Die neue Audit-Realität nach der Transformation",
      },
    ],
  },
  4: {
    from: "Starten Sie in der kommenden Woche nicht mit einer neuen Richtlinie",
    keepFrom: "Wer seine Datenflüsse mit dieser industriellen Disziplin",
  },
  5: {
    from: "Management-Takeaway – Die drei unmittelbaren Hebel für operative Löschfähigkeit",
  },
  6: {
    from: "Für Ihre eigene Organisation lässt sich dieser Wandel morgen mit drei konkreten Schritten einleiten:",
    keepFrom: "Wer Fehler auf diese Weise an der Quelle verhindert",
  },
  7: {
    from: "Nehmen Sie sich für die kommende Arbeitswoche Ihren wichtigsten digitalen Registrierungs- oder Kaufprozess vor",
    keepFrom: "Genau hier zeigt sich im Rückblick auf das gesamte Kapitel",
  },
  8: {
    from: "Um diesen strategischen Vorsprung in Ihrer eigenen Organisation vom Konzept in messbare Ergebnisse zu überführen",
    keepFrom: "Wer dieses Werkzeugsystem konsequent an den Schnittstellen verankert",
  },
  9: {
    from: "Jetzt liegt der Ball in Ihrem Spielfeld.",
    closing:
      "Value-Driven Privacy liefert das methodische Betriebssystem und die Werkzeuge, um Privacy Value Thinking bei jedem Sprint einzulösen: schlanke Prozesse, sichere Innovation und belastbares Kundenvertrauen — ohne neun parallele Montagspläne, sondern mit einem gemeinsamen Betriebssystem über das gesamte Buch.",
  },
};

function applyCut(body: string, cut: Cut): { text: string; ok: boolean; note: string } {
  let working = body;
  for (const r of cut.replace ?? []) {
    if (working.includes(r.find)) {
      working = working.split(r.find).join(r.to);
    }
  }

  const start = working.indexOf(cut.from);
  if (start < 0) {
    const onlyRename = (cut.replace ?? []).length > 0 && working !== body;
    return {
      text: working,
      ok: onlyRename,
      note: onlyRename ? "rename-only" : `missing from: ${cut.from.slice(0, 70)}`,
    };
  }

  if (cut.keepFrom) {
    const keepIdx = working.indexOf(cut.keepFrom, start);
    if (keepIdx < 0) {
      return {
        text: working,
        ok: false,
        note: `missing keepFrom: ${cut.keepFrom.slice(0, 70)}`,
      };
    }
    const head = working.slice(0, start).replace(/\n{3,}$/g, "\n\n");
    const kept = working.slice(keepIdx);
    return {
      text: `${head}${kept}`.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n",
      ok: true,
      note: "kept bridge",
    };
  }

  const head = working.slice(0, start).replace(/\s+$/g, "");
  const closing = cut.closing?.trim() ?? "";
  const text = closing ? `${head}\n\n${closing}\n` : `${head}\n`;
  return {
    text: text.replace(/\n{3,}/g, "\n\n"),
    ok: true,
    note: closing ? "cut+closing" : "cut-to-eof",
  };
}

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");

  for (let i = 0; i < book.kapitel.length; i += 1) {
    const cut = CUTS[i + 1];
    if (!cut) {
      console.log(`K${i + 1}: skip (no cut)`);
      continue;
    }
    const k = book.kapitel[i]!;
    const before = sachbuchKapitelBodyText(k);
    const { text, ok, note } = applyCut(before, cut);
    if (!ok) {
      console.log(`K${i + 1}: FAIL ${note}`);
      continue;
    }
    if (text === before) {
      console.log(`K${i + 1}: unchanged (${note})`);
      continue;
    }
    const now = new Date().toISOString();
    const wordsBefore = countSachbuchWords(before);
    const wordsAfter = countSachbuchWords(text);
    await patchSachbuchKapitel(ID, k.id, {
      manuscript: {
        ...k.manuscript,
        improvedText: text,
        draftText: k.manuscript.draftText || before,
        improvedAt: now,
      },
      updatedAt: now,
    });
    console.log(
      `K${i + 1}: OK ${note} · ${wordsBefore} → ${wordsAfter} Wörter (−${wordsBefore - wordsAfter})`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

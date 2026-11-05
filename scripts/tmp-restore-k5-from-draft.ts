import {
  getSachbuchKontext,
  patchSachbuchKapitel,
} from "../src/lib/sachbuch/repository";
import { countSachbuchWords } from "../src/lib/sachbuch/parse";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const book = await getSachbuchKontext(ID);
  if (!book) throw new Error("missing");
  const k = book.kapitel[4]!;
  const improved = k.manuscript.improvedText;
  const draft = k.manuscript.draftText;
  console.log({
    improvedWords: countSachbuchWords(improved),
    draftWords: countSachbuchWords(draft),
    draftHasAkkumulation: draft.includes("Ungesteuerte Akkumulation"),
    draftHasHebel: draft.includes("unmittelbaren Hebel"),
    draftHasBuchsatz: /Buchsatz/.test(draft),
    improvedHasAkkumulation: improved.includes("Ungesteuerte Akkumulation"),
  });

  if (!draft.includes("Ungesteuerte Akkumulation")) {
    console.log("draft also missing — cannot auto-restore stages");
    // show neighborhood in improved around Reifegradmodell
    const i = improved.indexOf("Reifegradmodell");
    console.log(improved.slice(i, i + 1200).replace(/\s+/g, " "));
    return;
  }

  // Extract from draft the blocks that were wiped, surgically merge
  // Strategy: take improved as base, but if draft has the Reifegrad stages section
  // and improved lost "Ungesteuerte Akkumulation", splice draft section in.

  const draftStart = draft.indexOf("Kennzahlen und das vierstufige Reifegradmodell");
  const draftAlt = draft.indexOf("Ungesteuerte Akkumulation");
  const improvedStart = improved.indexOf("Kennzahlen und das vierstufige Reifegradmodell");

  console.log({ draftStart, draftAlt, improvedStart });

  // Find the Takeaway / checklist block in draft
  const takeStart = draft.indexOf("Management-Takeaway");
  const takeAlt = draft.indexOf("Die drei unmittelbaren Hebel für operative Löschfähigkeit");
  console.log({ takeStart, takeAlt });

  if (takeStart >= 0 || takeAlt >= 0) {
    const s = takeStart >= 0 ? takeStart : takeAlt;
    console.log("DRAFT TAKEAWAY:\n", draft.slice(s, s + 900).replace(/\s+/g, " "));
  }

  if (draftAlt >= 0) {
    const s = Math.max(0, draft.lastIndexOf("\n\n", draftAlt));
    console.log("DRAFT STAGE:\n", draft.slice(s, s + 1200).replace(/\s+/g, " "));
  }

  // Safer restore: rebuild improved from draft with only satz instructions removed (precise)
  let restored = draft;
  restored = restored.replace(
    /Für den Buchsatz und das Druckbild[^.!?]*[.!?]\s*/g,
    "",
  );
  restored = restored.replace(/Für den Buchsatz[^.!?]*[.!?]\s*/g, "");
  restored = restored.replace(/Auch hier gilt für den Buchsatz[^.!?]*[.!?]\s*/g, "");
  restored = restored.replace(/,\s*deren Satzanfänge im Druckbild[^.]*\./g, ".");
  // Convert setzer captions that say "im Buchsatz als ... setzen" into clean figure titles
  restored = restored.replace(
    /\[?Übersichtskasten:\s*([^\]]+?)\s+im Buchsatz als[^\]]*\]?/gi,
    "Übersichtskasten: $1",
  );
  restored = restored.replace(
    /\[?([^\]]{10,200}?)\s+im Buchsatz als[^\].]*\]?/gi,
    (m) => {
      // keep short title before "im Buchsatz"
      const i = m.toLowerCase().indexOf("im buchsatz");
      if (i < 0) return m;
      let title = m.slice(0, i).replace(/^\[/, "").trim();
      if (title.endsWith("–") || title.endsWith("-")) title = title.slice(0, -1).trim();
      return title;
    },
  );
  restored = restored.replace(/\[((?:Abbildung|Tabelle)[^\]]*)\]/g, "$1");
  // apply KlarNetz softenings from current improved where possible
  restored = restored.replace(
    /,\s*mit ihren rund\s*600[.\s]?000\s*aktiven Kundenkonten/gi,
    "",
  );
  restored = restored.replace(
    /\s+mit ihren rund\s*600[.\s]?000\s*aktiven Kundenkonten/gi,
    "",
  );
  restored = restored.replace(
    /über alle 600[.\s]?000 Kundenkonten hinweg zu synchronisieren/gi,
    "über den gesamten Kundenbestand hinweg zu synchronisieren",
  );
  restored = restored.replace(/  +/g, " ");

  // Prefer keeping architecture bridge from current improved end if draft has montag plan
  const montag = restored.indexOf("Tage 1 bis 30");
  const praxis = restored.indexOf("Praxis-Checkliste");
  if (praxis >= 0) {
    restored = restored.slice(0, praxis).replace(/\s+$/g, "") + "\n";
  }

  // Keep RAG short teaser from improved if present
  const ragShort =
    "In Retrieval-Augmented-Generation-Systemen rächt sich eine digitale Messie-Kultur unmittelbar: Ungereinigte Ticket-Archive und Netzlaufwerke im Vektorraum erzeugen Halluzinationen auf veralteter Faktenbasis. Den großen Härtetest dafür liefert Kapitel 9.";
  if (restored.includes("Retrieval-Augmented-Generation") && restored.includes(ragShort) === false) {
    const long = restored.indexOf(
      "In modernen Architekturen zur informationsgestützten Textgenerierung",
    );
    if (long >= 0) {
      const end = restored.indexOf("\n\n", long);
      restored =
        restored.slice(0, long) +
        ragShort +
        (end > 0 ? restored.slice(end) : "");
    }
  }

  console.log({
    restoredWords: countSachbuchWords(restored),
    hasAkkumulation: restored.includes("Ungesteuerte Akkumulation"),
    hasHebel: /Hebel für operative|unmittelbaren Hebel/i.test(restored),
    hasBuchsatz: /Buchsatz|Druckbild/.test(restored),
  });

  const now = new Date().toISOString();
  await patchSachbuchKapitel(ID, k.id, {
    manuscript: {
      ...k.manuscript,
      improvedText: restored,
      improvedAt: now,
      changeOrders: [],
      gaps: [],
    },
    finalText: restored,
    updatedAt: now,
  });
  console.log("K5 restored from draft with clean satz scrub");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

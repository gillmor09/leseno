/**
 * Align Motto + Untertitel with privacyvalue.de (hero + Merksatz voice).
 *
 * Usage: npx tsx --env-file=.env.local scripts/tmp-align-motto-subtitle.ts
 */
import {
  getSachbuchKontext,
  upsertSachbuchExport,
} from "../src/lib/sachbuch/repository";

const FULL_ID = "1640c419-5f83-4c62-a25b-d57190727fa4";
const COMPACT_ID = "47194844-8130-4938-91ae-d6cddd14abe4";
const TEASER_ID = "34128455-4057-4ce4-bee2-3f5dc0f96e62";

/** Epigraph: punchy claim (Vorwort + Site-These), one line. */
const MOTTO =
  "Viele Privacy-Probleme sind keine juristischen Rätsel, sondern Qualitäts- und Prozessfehler.";

/** Site hero — book subtitle for the Hauptband. */
const SUBTITLE_FULL = "Mindset und Praxis für wertschöpfenden Datenschutz";

/** Kompakt: same brand promise + format role. */
const SUBTITLE_COMPACT =
  "Executive Briefing — Mindset und Praxis in kompakter Form";

/** Teaser: appetizer role + same brand promise. */
const SUBTITLE_TEASER =
  "Appetizer — Mindset und Praxis zum Kennenlernen";

async function patch(
  id: string,
  subtitle: string,
): Promise<Record<string, string>> {
  const book = await getSachbuchKontext(id);
  if (!book) throw new Error(`Buch nicht gefunden: ${id}`);

  await upsertSachbuchExport({
    id,
    subtitle,
    vorsatz: {
      ...book.export.vorsatz,
      motto: MOTTO,
      titelseite: {
        ...book.export.vorsatz.titelseite,
        untertitel: subtitle,
      },
    },
  });

  const done = await getSachbuchKontext(id);
  if (!done) throw new Error(`reload failed: ${id}`);
  return {
    edition: done.idee.edition,
    subtitle: done.export.subtitle,
    untertitel: done.export.vorsatz.titelseite.untertitel,
    motto: done.export.vorsatz.motto,
  };
}

async function main() {
  const results = [
    await patch(FULL_ID, SUBTITLE_FULL),
    await patch(COMPACT_ID, SUBTITLE_COMPACT),
    await patch(TEASER_ID, SUBTITLE_TEASER),
  ];
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

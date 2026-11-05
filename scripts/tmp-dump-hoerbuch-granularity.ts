import {
  buildSachbuchHoerbuchTracks,
  estimateSpokenDurationSec,
} from "../src/lib/sachbuch/hoerbuch";
import { getSachbuchKontext } from "../src/lib/sachbuch/repository";
import { sachbuchKapitelExportBody } from "../src/lib/sachbuch/parse";
import { sachbuchSpokenPlainText } from "../src/lib/sachbuch/hoerbuch";

async function main() {
  const id = "1640c419-5f83-4c62-a25b-d57190727fa4";
  const b = await getSachbuchKontext(id);
  if (!b) throw new Error("missing");
  const tracks = buildSachbuchHoerbuchTracks(b);
  const chars = tracks.map((t) => t.charCount);
  const avg = chars.reduce((a, c) => a + c, 0) / Math.max(1, chars.length);
  const kapStats = b.kapitel.map((k, i) => {
    const body = sachbuchSpokenPlainText(sachbuchKapitelExportBody(k));
    return {
      n: i + 1,
      title: k.title.slice(0, 60),
      abschnitte: k.abschnitte.length,
      kapChars: body.length,
      kapMin: Math.round(estimateSpokenDurationSec(body.length) / 60 * 10) / 10,
    };
  });
  console.log(
    JSON.stringify(
      {
        kapitel: b.kapitel.length,
        tracksNow: tracks.length,
        avgTrackChars: Math.round(avg),
        avgTrackMin:
          Math.round((estimateSpokenDurationSec(avg) / 60) * 10) / 10,
        kapStats,
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

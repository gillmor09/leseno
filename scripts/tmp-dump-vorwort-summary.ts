import { getSachbuchKontext } from "../src/lib/sachbuch/repository";

const ids = [
  "1640c419-5f83-4c62-a25b-d57190727fa4",
  "47194844-8130-4938-91ae-d6cddd14abe4",
  "34128455-4057-4ce4-bee2-3f5dc0f96e62",
];

async function main() {
  for (const id of ids) {
    const b = await getSachbuchKontext(id);
    if (!b) {
      console.log(id, "MISSING");
      continue;
    }
    console.log("\n====", b.idee.edition, b.title, "====");
    console.log("--- VORWORT ---");
    console.log(b.export.vorsatz.vorwort || "(leer)");
    console.log("--- SUMMARY ---");
    console.log(b.export.summary || "(leer)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

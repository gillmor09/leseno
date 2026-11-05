import { getSachbuchKontext } from "../src/lib/sachbuch/repository";

const ID = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const t = Date.now();
  const b = await getSachbuchKontext(ID);
  console.log("ok", b?.kapitel?.length, "ms", Date.now() - t);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

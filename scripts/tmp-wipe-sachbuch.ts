import { deleteSachbuchKontext, listSachbuchKontexte } from "@/lib/sachbuch/repository";
async function main() {
  const list = await listSachbuchKontexte();
  console.log("before", list.length);
  for (const b of list) {
    await deleteSachbuchKontext(b.id);
    console.log("deleted", b.id, b.title);
  }
  const after = await listSachbuchKontexte();
  console.log("after", after.length);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });

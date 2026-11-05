import { getSachbuchKontext } from "../src/lib/sachbuch/repository";

async function main() {
  for (const id of [
    "1640c419-5f83-4c62-a25b-d57190727fa4",
    "47194844-8130-4938-91ae-d6cddd14abe4",
    "34128455-4057-4ce4-bee2-3f5dc0f96e62",
  ]) {
    const b = await getSachbuchKontext(id);
    if (!b) {
      console.log(id, "MISSING");
      continue;
    }
    console.log(
      JSON.stringify(
        {
          edition: b.idee.edition,
          title: b.title,
          suggested: b.export.suggestedTitle,
          subtitle: b.export.subtitle,
          titeleiUntertitel: b.export.vorsatz.titelseite.untertitel,
          motto: b.export.vorsatz.motto,
        },
        null,
        2,
      ),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

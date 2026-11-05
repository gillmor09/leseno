import { createNapkinVisualRequest } from "../src/lib/ai/napkin";

async function main() {
  console.log("NAPKIN_API_KEY set:", Boolean(process.env.NAPKIN_API_KEY?.trim()));
  console.log("len:", process.env.NAPKIN_API_KEY?.trim().length ?? 0);
  try {
    const id = await createNapkinVisualRequest({
      content:
        "Test: drei Säulen Zweckbindung, Minimierung, Löschen als Betriebsfähigkeit.",
      context: "Privacy Value Thinking",
      format: "png",
      language: "de-DE",
      numberOfVisuals: 1,
    });
    console.log("OK request id:", id);
  } catch (e) {
    console.error("ERR:", e instanceof Error ? e.message : e);
  }
}

main();

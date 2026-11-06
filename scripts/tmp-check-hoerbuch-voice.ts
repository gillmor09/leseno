/**
 * Usage: npx tsx --env-file=.env.local scripts/tmp-check-hoerbuch-voice.ts
 */
import { getSachbuchKontextAdminShell } from "../src/lib/sachbuch/repository";

const HELMUT = "Cqbq4nsuUe1we6J45miU";
const id = "1640c419-5f83-4c62-a25b-d57190727fa4";

async function main() {
  const b = await getSachbuchKontextAdminShell(id);
  if (!b) throw new Error("missing");
  const h = b.idee.hoerbuch;
  const withAudio = (h.tracks || [])
    .filter((t) => t.audio)
    .sort((a, b) =>
      String(b.audio?.generatedAt || "").localeCompare(
        String(a.audio?.generatedAt || ""),
      ),
    );
  console.log(
    JSON.stringify(
      {
        prefs: { provider: h.provider, voiceId: h.voiceId },
        latest: withAudio.slice(0, 12).map((t) => ({
          order: t.order,
          title: t.title,
          voiceId: t.audio?.voiceId,
          isHelmut: t.audio?.voiceId === HELMUT,
          model: t.audio?.modelSlug,
          at: t.audio?.generatedAt,
        })),
        helmutCount: withAudio.filter((t) => t.audio?.voiceId === HELMUT)
          .length,
        total: withAudio.length,
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

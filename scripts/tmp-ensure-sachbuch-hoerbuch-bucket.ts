/**
 * Ensure private Storage bucket `sachbuch-hoerbuch` exists.
 * Usage: npx tsx --env-file=.env.local scripts/tmp-ensure-sachbuch-hoerbuch-bucket.ts
 */
import { createServiceClient } from "../src/lib/supabase/service";
import { SACHBUCH_HOERBUCH_BUCKET } from "../src/lib/sachbuch/hoerbuch-storage";

async function main() {
  const supabase = createServiceClient(null);
  const { data: existing, error: listError } =
    await supabase.storage.listBuckets();
  if (listError) throw listError;
  if (existing?.some((b) => b.id === SACHBUCH_HOERBUCH_BUCKET)) {
    console.log(JSON.stringify({ ok: true, existed: true }));
    return;
  }
  const { data, error } = await supabase.storage.createBucket(
    SACHBUCH_HOERBUCH_BUCKET,
    {
      public: false,
      fileSizeLimit: 104857600,
      allowedMimeTypes: ["audio/mpeg"],
    },
  );
  if (error) throw error;
  console.log(JSON.stringify({ ok: true, created: data }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

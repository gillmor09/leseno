import { createServiceClient } from "@/lib/supabase/service";

async function main() {
  const novelId = "30799e75-bafc-4b33-8fa9-9edf7f28a4a5";

  const leseno = createServiceClient("leseno");
  const select = await leseno
    .from("chapters")
    .select("id,chapter_number")
    .eq("novel_id", novelId)
    .gt("chapter_number", 24);
  console.log("leseno.chapters select:", JSON.stringify(select, null, 2));

  const pub = createServiceClient(null);
  const rpc = await pub.rpc("admin_delete_chapters_above", {
    p_novel_id: novelId,
    p_max_chapter_number: 99,
  });
  console.log("rpc:", JSON.stringify(rpc, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

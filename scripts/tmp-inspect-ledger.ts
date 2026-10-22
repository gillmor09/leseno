import { LOGIC_LEDGER_KEY, novelLogicLedgerSchema } from "@/lib/novel/logic-ledger";
import { getNovelBundle } from "@/lib/novel/repository";

async function main() {
  const b = await getNovelBundle("ac0a5f69-87b6-4b2d-b854-fc20d7c7dd22");
  if (!b) throw new Error("nf");
  const raw = b.knowledgeGraph?.entityStates?.[LOGIC_LEDGER_KEY];
  console.log("raw type", typeof raw, Array.isArray(raw));
  console.log("raw keys", raw && typeof raw === "object" ? Object.keys(raw as object) : null);
  console.log("raw preview", JSON.stringify(raw)?.slice(0, 1500));
  const parsed = novelLogicLedgerSchema.safeParse(raw);
  console.log("parse ok", parsed.success);
  if (!parsed.success) console.log(parsed.error.issues.slice(0, 8));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

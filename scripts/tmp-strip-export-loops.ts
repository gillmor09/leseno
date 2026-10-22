import { readFileSync, writeFileSync } from "node:fs";

const path = "src/components/features/admin/roman-novel-export-panel.tsx";
let s = readFileSync(path, "utf8");

s = s.replace(
  `/**
 * Export tab: Abnahmecheck (Haiku Lektor 1–10), marketing, cover,
 * PDF (cover + Titelei), ePub (Titelei, no cover).
 */`,
  `/**
 * Export tab: Abnahmecheck (Haiku Lektor 1–10), marketing, cover,
 * PDF (cover + Titelei), ePub (Titelei, no cover).
 * Post-Abnahme rewrite loops (assisted fix / short re-run / outline revision) removed.
 */`,
);

s = s.replace(
  `import {
  generateNovelCoverAction,
  generateNovelMarketingAction,
  reviseOutlineFromAbnahmeAction,
  runNovelAbnahmeAction,
  saveNovelExportAction,
  startAssistedFixesAction,
  startShortRerunAction,
} from "@/app/actions/roman-novel";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  ASSISTED_FIX_MAX_CHAPTERS,
  getAssistedFixState,
  suggestChaptersForAssistedFix,
} from "@/lib/novel/assisted-fix";
import {
  getShortRerunPlan,
  SHORT_RERUN_CHAPTER_COUNT,
} from "@/lib/novel/outline-revision";
`,
  `import {
  generateNovelCoverAction,
  generateNovelMarketingAction,
  runNovelAbnahmeAction,
  saveNovelExportAction,
} from "@/app/actions/roman-novel";
`,
);

// Drop ConfirmDeleteDialog import if unused — already removed above.

writeFileSync(path, s);
console.log("imports updated");

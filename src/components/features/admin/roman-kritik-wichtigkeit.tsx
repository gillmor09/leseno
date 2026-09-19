/**
 * Shared Wichtigkeit badge + Nice-to-have banner for critique/feedback lists.
 */

import {
  KRITIK_WICHTIGKEIT_LABEL,
  onlyNiceToHavePrompts,
  type RomanAenderungsPrompt,
  type RomanKritikWichtigkeit,
} from "@/lib/roman/editorial";
import { cn } from "@/lib/utils";

export function wichtigkeitBadgeClass(w: RomanKritikWichtigkeit): string {
  if (w === "kritisch") {
    return "bg-rose-50 text-rose-950 ring-rose-200";
  }
  if (w === "nice_to_have") {
    return "bg-zinc-100 text-zinc-600 ring-zinc-200";
  }
  return "bg-amber-50 text-amber-950 ring-amber-200";
}

export function KritikWichtigkeitBadge({
  wichtigkeit,
}: {
  wichtigkeit: RomanKritikWichtigkeit;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[10px] font-bold ring-1",
        wichtigkeitBadgeClass(wichtigkeit),
      )}
    >
      {KRITIK_WICHTIGKEIT_LABEL[wichtigkeit]}
    </span>
  );
}

export function NiceToHaveOnlyBanner({
  prompts,
}: {
  prompts: RomanAenderungsPrompt[];
}) {
  if (prompts.length === 0) {
    return (
      <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-950 ring-1 ring-emerald-200">
        Keine Pflichtpunkte — hier ist nichts einzuarbeiten.
      </div>
    );
  }
  if (!onlyNiceToHavePrompts(prompts)) return null;
  return (
    <div className="rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-bold text-zinc-700 ring-1 ring-zinc-950/10">
      Nur Nice-to-have — Einarbeiten ist dafür nicht vorgesehen.
    </div>
  );
}

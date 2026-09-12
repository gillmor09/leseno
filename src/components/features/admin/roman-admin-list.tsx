"use client";

/**
 * Admin list + create entry for the novel writing pipeline.
 */

import Link from "next/link";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteRomanAction } from "@/app/actions/roman-admin";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import type { RomanKontextSummary } from "@/lib/roman/types";
import { cn } from "@/lib/utils";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("de-DE", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export function RomanAdminList({
  initialRomane,
  canSave,
  readOnlyNotice,
}: {
  initialRomane: RomanKontextSummary[];
  canSave: boolean;
  readOnlyNotice?: string;
}) {
  const [romane, setRomane] = useState(initialRomane);
  const [deleteTarget, setDeleteTarget] = useState<RomanKontextSummary | null>(
    null,
  );
  const [deletePending, setDeletePending] = useState(false);

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeletePending(true);
    const result = await deleteRomanAction({ romanId: deleteTarget.id });
    setDeletePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Löschen fehlgeschlagen.");
      return;
    }
    setRomane((current) =>
      current.filter((roman) => roman.id !== deleteTarget.id),
    );
    setDeleteTarget(null);
    toast.success("Roman gelöscht.");
  }

  return (
    <div className="space-y-6">
      {readOnlyNotice ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
          {readOnlyNotice}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-zinc-600">
          {romane.length} Roman{romane.length === 1 ? "" : "e"}
        </p>
        <Link
          href="/admin/roman/neu"
          className={cn(
            "inline-flex items-center gap-2 rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-orange-800",
            !canSave && "pointer-events-none opacity-50",
          )}
        >
          <Plus className="size-4" aria-hidden />
          Neuer Roman
        </Link>
      </div>

      {romane.length === 0 ? (
        <p className="rounded-2xl bg-white px-5 py-8 text-center text-sm font-semibold text-zinc-500 ring-1 ring-zinc-950/10">
          Noch kein Roman. Manuskript hochladen und Phase 0 (Szenen-Roadmap)
          starten.
        </p>
      ) : (
        <ul className="space-y-3">
          {romane.map((roman) => (
            <li
              key={roman.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-4 ring-1 ring-zinc-950/10 sm:px-5"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/roman/${roman.id}`}
                  className="text-lg font-extrabold text-zinc-950 hover:text-orange-800"
                >
                  {roman.title}
                </Link>
                <p className="mt-1 text-xs font-semibold text-zinc-500">
                  {formatDate(roman.updatedAt)} · {roman.szenenCompleted}/
                  {roman.szenenTotal} fertig · {roman.szenenReady} bereit
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/admin/roman/${roman.id}`}
                  className="rounded-full bg-gray-100 px-4 py-2 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-white"
                >
                  Öffnen
                </Link>
                <button
                  type="button"
                  disabled={!canSave}
                  onClick={() => setDeleteTarget(roman)}
                  className="inline-flex size-10 items-center justify-center rounded-full text-zinc-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                  aria-label="Löschen"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        title="Roman löschen?"
        description={
          deleteTarget
            ? `„${deleteTarget.title}“ und alle Szenen werden unwiderruflich gelöscht.`
            : ""
        }
        pending={deletePending}
        onCancel={() => {
          if (!deletePending) setDeleteTarget(null);
        }}
        onConfirm={() => void handleConfirmDelete()}
      />
    </div>
  );
}

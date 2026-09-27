"use client";

/**
 * Sachbuch admin list: create + delete books.
 */

import Link from "next/link";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteSachbuchAction } from "@/app/actions/sachbuch-admin";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import type { SachbuchKontextSummary } from "@/lib/sachbuch/types";
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

export function SachbuchAdminList({
  initialBooks,
  canSave,
  readOnlyNotice,
}: {
  initialBooks: SachbuchKontextSummary[];
  canSave: boolean;
  readOnlyNotice?: string;
}) {
  const [books, setBooks] = useState(initialBooks);
  const [deleteTarget, setDeleteTarget] =
    useState<SachbuchKontextSummary | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeletePending(true);
    const result = await deleteSachbuchAction({ id: deleteTarget.id });
    setDeletePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Löschen fehlgeschlagen.");
      return;
    }
    setBooks((current) => current.filter((b) => b.id !== deleteTarget.id));
    setDeleteTarget(null);
    toast.success("Sachbuch gelöscht.");
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
          {books.length === 1 ? "1 Sachbuch" : `${books.length} Sachbücher`}
        </p>
        <Link
          href="/admin/sachbuch/neu"
          className={cn(
            "inline-flex items-center gap-2 rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-orange-800",
            !canSave && "pointer-events-none opacity-50",
          )}
        >
          <Plus className="size-4" aria-hidden />
          Neues Sachbuch
        </Link>
      </div>

      {books.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm font-semibold text-zinc-500 ring-1 ring-zinc-950/10">
          Noch kein Sachbuch. Mit „Neues Sachbuch“ anlegen.
        </p>
      ) : (
        <ul className="space-y-3">
          {books.map((book) => (
            <li
              key={book.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-4 ring-1 ring-zinc-950/10 sm:px-5"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/sachbuch/${book.id}`}
                  className="text-lg font-extrabold text-zinc-950 hover:text-orange-800"
                >
                  {book.title}
                </Link>
                <p className="mt-1 text-xs font-semibold text-zinc-500">
                  {book.kapitelCount} Kapitel · {formatDate(book.updatedAt)}
                </p>
              </div>
              <button
                type="button"
                disabled={!canSave}
                onClick={() => setDeleteTarget(book)}
                className="inline-flex size-10 items-center justify-center rounded-full text-orange-800 transition hover:bg-orange-50 disabled:opacity-50"
                aria-label={`„${book.title}“ löschen`}
                title="Löschen"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        title="Sachbuch löschen?"
        description={
          deleteTarget
            ? `„${deleteTarget.title}“ und alle Kapitel werden unwiderruflich gelöscht.`
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

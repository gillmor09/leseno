"use client";

/**
 * Admin inbox for `leseno.contact_requests` — search, expand message, delete.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteContactRequestAction } from "@/app/actions/contact-admin";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import type { ContactRequestAdminRow } from "@/lib/contact/repository";
import { cn } from "@/lib/utils";

function formatCreatedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("de-DE", {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(date);
}

export function ContactRequestsAdminView({
  rows: initialRows,
  loadNotice = null,
}: {
  rows: ContactRequestAdminRow[];
  loadNotice?: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContactRequestAdminRow | null>(
    null,
  );
  const [pendingDelete, startDelete] = useTransition();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return initialRows;
    return initialRows.filter((row) => {
      const haystack = [
        row.email,
        row.message,
        formatCreatedAt(row.createdAt),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [initialRows, query]);

  function handleConfirmDelete() {
    if (!deleteTarget) return;
    startDelete(async () => {
      const result = await deleteContactRequestAction({ id: deleteTarget.id });
      if (!result.success) {
        toast.error(result.error ?? "Löschen hat nicht geklappt.");
        return;
      }
      toast.success("Anfrage gelöscht.");
      setDeleteTarget(null);
      setExpandedId((current) =>
        current === deleteTarget.id ? null : current,
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {loadNotice ? (
        <p className="rounded-[1.75rem] bg-orange-50 p-6 text-sm font-semibold text-orange-900 ring-1 ring-orange-700/10">
          {loadNotice}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-sm font-semibold text-zinc-600">
          {filtered.length} von {initialRows.length} Anfragen
        </p>
        <label className="block w-full sm:max-w-xs">
          <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
            Suche
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="E-Mail oder Text…"
            className="mt-1 w-full rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:ring-2 focus:ring-orange-700"
          />
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-[1.75rem] bg-white p-8 text-sm font-semibold text-zinc-600 shadow-xl ring-1 ring-zinc-950/10">
          {initialRows.length === 0
            ? "Noch keine Kontaktanfragen."
            : "Keine Treffer für diese Suche."}
        </p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((row) => {
            const open = expandedId === row.id;
            const preview =
              row.message.length > 140
                ? `${row.message.slice(0, 137)}…`
                : row.message;
            return (
              <li
                key={row.id}
                className="overflow-hidden rounded-[1.75rem] bg-white shadow-xl ring-1 ring-zinc-950/10"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedId((current) =>
                      current === row.id ? null : row.id,
                    )
                  }
                  className="flex w-full flex-col gap-1 px-5 py-4 text-left transition-colors hover:bg-gray-50 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-extrabold text-zinc-950">
                      <a
                        href={`mailto:${row.email}`}
                        onClick={(event) => event.stopPropagation()}
                        className="text-orange-700 underline-offset-2 hover:underline"
                      >
                        {row.email}
                      </a>
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-600">
                      {open ? row.message : preview}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs font-semibold text-zinc-500">
                    {formatCreatedAt(row.createdAt)}
                  </p>
                </button>
                {open ? (
                  <div className="flex flex-wrap items-center gap-2 border-t border-zinc-950/5 px-5 py-3">
                    <a
                      href={`mailto:${encodeURIComponent(row.email)}?subject=${encodeURIComponent("Re: Deine Nachricht an Leseno")}`}
                      className="inline-flex rounded-full bg-orange-700 px-4 py-2 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800"
                    >
                      Per E-Mail antworten
                    </a>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(row)}
                      className={cn(
                        "inline-flex rounded-full bg-white px-4 py-2 text-sm font-bold text-red-700 ring-1 ring-red-700/20 transition-all duration-200 ease-in-out hover:bg-red-50",
                      )}
                    >
                      Löschen
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        title="Kontaktanfrage löschen?"
        description={
          deleteTarget
            ? `Die Anfrage von ${deleteTarget.email} vom ${formatCreatedAt(deleteTarget.createdAt)} wird unwiderruflich gelöscht.`
            : ""
        }
        confirmLabel="Endgültig löschen"
        pending={pendingDelete}
        onCancel={() => {
          if (!pendingDelete) setDeleteTarget(null);
        }}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

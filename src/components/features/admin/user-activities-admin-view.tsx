"use client";

/**
 * Admin UI: activity counts overview + searchable, paginated activity table.
 * Delete: remove all rows older than a chosen calendar date (confirm dialog).
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteActivitiesBeforeAction } from "@/app/actions/user-activities-admin";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import type {
  UserActivityActionCount,
  UserActivityAdminRow,
} from "@/lib/users/activity";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

function formatCreatedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("de-DE", {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(date);
}

function formatDateDe(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? isoDate
    : new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(date);
}

function metadataPreview(metadata: Record<string, unknown>): string {
  const keys = Object.keys(metadata);
  if (keys.length === 0) return "—";
  try {
    const text = JSON.stringify(metadata);
    return text.length > 80 ? `${text.slice(0, 77)}…` : text;
  } catch {
    return "—";
  }
}

export function UserActivitiesAdminView({
  rows: initialRows,
  counts: initialCounts,
  loadNotice = null,
}: {
  rows: UserActivityAdminRow[];
  counts: UserActivityActionCount[];
  loadNotice?: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [beforeDate, setBeforeDate] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDelete, startDelete] = useTransition();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return initialRows.filter((row) => {
      if (actionFilter && row.action !== actionFilter) return false;
      if (!needle) return true;
      const haystack = [
        row.action,
        row.label,
        row.path,
        row.email ?? "",
        row.userId ?? "",
        metadataPreview(row.metadata),
        formatCreatedAt(row.createdAt),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [actionFilter, initialRows, query]);

  const filteredCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of filtered) {
      map.set(row.action, (map.get(row.action) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count || a.action.localeCompare(b.action));
  }, [filtered]);

  const overviewCounts =
    query.trim() || actionFilter ? filteredCounts : initialCounts;

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  useEffect(() => {
    setPage(1);
  }, [query, actionFilter]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  function openDeleteConfirm() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(beforeDate)) {
      toast.error("Bitte ein Datum wählen.");
      return;
    }
    setConfirmOpen(true);
  }

  function handleConfirmDelete() {
    startDelete(async () => {
      const result = await deleteActivitiesBeforeAction({ beforeDate });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Löschen fehlgeschlagen.");
        return;
      }
      toast.success(
        `${result.data.deleted.toLocaleString("de-DE")} Aktivitäten gelöscht.`,
      );
      setConfirmOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      {loadNotice ? (
        <p className="rounded-[1.75rem] bg-orange-50 p-6 text-sm font-semibold text-orange-900 ring-1 ring-orange-700/10">
          {loadNotice}
        </p>
      ) : null}

      <section className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
              Übersicht
            </p>
            <h2 className="mt-1 text-xl font-extrabold text-zinc-950">
              Anzahl je Aktivität
            </h2>
          </div>
          <p className="text-sm font-semibold text-zinc-500">
            {filtered.length.toLocaleString("de-DE")} von{" "}
            {initialRows.length.toLocaleString("de-DE")} Einträgen
          </p>
        </div>

        {overviewCounts.length === 0 ? (
          <p className="mt-6 text-sm font-semibold text-zinc-600">
            Noch keine Aktivitäten vorhanden.
          </p>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {overviewCounts.map((item) => {
              const active = actionFilter === item.action;
              return (
                <li key={item.action}>
                  <button
                    type="button"
                    onClick={() =>
                      setActionFilter((current) =>
                        current === item.action ? null : item.action,
                      )
                    }
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left ring-1 transition-all duration-200 ease-in-out",
                      active
                        ? "bg-yellow-400 text-zinc-950 ring-yellow-400"
                        : "bg-gray-100 text-zinc-950 ring-zinc-950/10 hover:bg-white",
                    )}
                  >
                    <span className="min-w-0 truncate text-sm font-bold">
                      {item.action}
                    </span>
                    <span className="shrink-0 text-lg font-extrabold">
                      {item.count.toLocaleString("de-DE")}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {actionFilter ? (
          <button
            type="button"
            onClick={() => setActionFilter(null)}
            className="mt-4 text-sm font-bold text-orange-800 underline-offset-2 hover:underline"
          >
            Filter „{actionFilter}“ entfernen
          </button>
        ) : null}
      </section>

      <section className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8">
        <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
          Aufräumen
        </p>
        <h2 className="mt-1 text-xl font-extrabold text-zinc-950">
          Ältere Aktivitäten löschen
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600">
          Löscht alle Einträge mit Zeitstempel vor dem gewählten Datum (0:00
          Uhr). Neuere bleiben erhalten.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block min-w-[12rem]">
            <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
              Älter als
            </span>
            <input
              type="date"
              value={beforeDate}
              onChange={(event) => setBeforeDate(event.target.value)}
              className="mt-1 w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
            />
          </label>
          <button
            type="button"
            onClick={openDeleteConfirm}
            disabled={pendingDelete}
            className="inline-flex items-center justify-center rounded-full bg-orange-700 px-5 py-3 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800 disabled:opacity-70"
          >
            Ältere löschen …
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-[1.75rem] bg-white shadow-xl ring-1 ring-zinc-950/10">
        <div className="border-b border-zinc-950/10 bg-gray-100 px-6 py-4 sm:px-8">
          <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
            Einzelaktivitäten
          </p>
          <h2 className="mt-1 text-xl font-extrabold text-zinc-950">
            Chronologische Liste
          </h2>
          <label className="mt-4 block max-w-xl">
            <span className="sr-only">Suche</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Suche nach Aktion, E-Mail, Pfad …"
              className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:ring-2 focus:ring-orange-700"
            />
          </label>
        </div>

        {filtered.length === 0 ? (
          <p className="px-6 py-8 text-sm font-semibold text-zinc-600 sm:px-8">
            Keine Einträge für diese Suche.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-zinc-950/10 bg-gray-50 text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                  <tr>
                    <th className="px-4 py-3 sm:px-6">Zeit</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Aktion</th>
                    <th className="px-4 py-3">Label</th>
                    <th className="px-4 py-3">Pfad</th>
                    <th className="px-4 py-3 sm:px-6">Meta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-950/5">
                  {pageRows.map((row) => (
                    <tr key={row.id} className="align-top text-zinc-700">
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-950 sm:px-6">
                        {formatCreatedAt(row.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-zinc-950">
                          {row.email ?? "—"}
                        </p>
                        {row.userId ? (
                          <p className="mt-0.5 font-mono text-[11px] text-zinc-400">
                            {row.userId.slice(0, 8)}…
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 font-bold text-zinc-950">
                        {row.action}
                      </td>
                      <td className="px-4 py-3">{row.label || "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {row.path || "—"}
                      </td>
                      <td className="max-w-[14rem] truncate px-4 py-3 font-mono text-xs text-zinc-500 sm:px-6">
                        {metadataPreview(row.metadata)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-950/10 px-4 py-4 sm:px-6">
              <p className="text-sm font-semibold text-zinc-500">
                Seite {safePage.toLocaleString("de-DE")} von{" "}
                {pageCount.toLocaleString("de-DE")} ·{" "}
                {PAGE_SIZE} je Seite
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="inline-flex rounded-full bg-zinc-800 px-4 py-2 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-zinc-900 disabled:opacity-40"
                >
                  Zurück
                </button>
                <button
                  type="button"
                  disabled={safePage >= pageCount}
                  onClick={() =>
                    setPage((current) => Math.min(pageCount, current + 1))
                  }
                  className="inline-flex rounded-full bg-zinc-800 px-4 py-2 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-zinc-900 disabled:opacity-40"
                >
                  Weiter
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <ConfirmDeleteDialog
        open={confirmOpen}
        pending={pendingDelete}
        title="Ältere Aktivitäten löschen?"
        description={`Alle Einträge vor dem ${formatDateDe(beforeDate)} (0:00 Uhr) werden unwiderruflich gelöscht. Neuere Aktivitäten bleiben erhalten.`}
        confirmLabel="Endgültig löschen"
        onCancel={() => {
          if (!pendingDelete) setConfirmOpen(false);
        }}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

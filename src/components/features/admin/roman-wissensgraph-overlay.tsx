"use client";

/**
 * Read-only overlay for `editorial.wissensGraph` on Gerüst / Szenenplot /
 * Manuskript tabs — nodes by kind, relations, hard invariants.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Network, X } from "lucide-react";
import type {
  RomanWissensGraph,
  RomanWissensGraphNodeKind,
} from "@/lib/roman/editorial";
import { lockBodyScroll } from "@/lib/ui/body-scroll-lock";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<RomanWissensGraphNodeKind, string> = {
  person: "Personen",
  place: "Orte",
  prop: "Props",
  fact: "Fakten",
  secret: "Geheimnisse",
  thread: "Threads",
  rule: "Regeln",
  tone: "Ton",
  motif: "Motive",
  event: "Events",
  concept: "Konzepte",
};

const KIND_ORDER: RomanWissensGraphNodeKind[] = [
  "person",
  "place",
  "prop",
  "event",
  "secret",
  "thread",
  "fact",
  "rule",
  "motif",
  "tone",
  "concept",
];

function formatUpdatedAt(iso: string): string {
  const d = Date.parse(iso);
  if (!Number.isFinite(d)) return iso;
  return new Date(d).toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function RomanWissensgraphTrigger({
  graph,
  className,
}: {
  graph: RomanWissensGraph | null | undefined;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const hasNodes = Boolean(graph?.nodes?.length);

  if (!hasNodes || !graph) {
    return (
      <p className={cn("text-sm font-semibold text-zinc-600", className)}>
        Wissensgraph noch leer — entsteht beim Gerüst-Erzeugen und wächst bei
        Szenenplot, Manuskript und Verbessern.
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex w-full items-center justify-between gap-3 rounded-2xl bg-zinc-50 px-3 py-2 text-left text-sm font-semibold text-zinc-700 ring-1 ring-zinc-950/8 transition-colors hover:bg-zinc-100 hover:text-zinc-950",
          className,
        )}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <Network className="size-4 shrink-0 text-orange-700" aria-hidden />
          <span className="min-w-0 truncate">
            Wissensgraph: {graph.nodes.length} Knoten · {graph.edges.length}{" "}
            Relationen · {graph.hardInvariants.length} Invarianten
            {graph.seededFrom?.length
              ? ` · Seed: ${graph.seededFrom.join(", ")}`
              : ""}
          </span>
        </span>
        <span className="shrink-0 text-xs font-extrabold tracking-wide text-orange-800 uppercase">
          Ansehen
        </span>
      </button>
      <RomanWissensgraphOverlay
        open={open}
        graph={graph}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

export function RomanWissensgraphOverlay({
  open,
  graph,
  onClose,
}: {
  open: boolean;
  graph: RomanWissensGraph;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] =
    useState<RomanWissensGraphNodeKind | "all">("all");

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setKindFilter("all");
    }
  }, [open]);

  const labelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of graph.nodes) map.set(n.id, n.label);
    return map;
  }, [graph.nodes]);

  const filteredNodes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return graph.nodes.filter((n) => {
      if (kindFilter !== "all" && n.kind !== kindFilter) return false;
      if (!q) return true;
      const attrs = Object.entries(n.attrs)
        .map(([k, v]) => `${k} ${v}`)
        .join(" ");
      return `${n.label} ${n.summary} ${n.id} ${attrs}`
        .toLowerCase()
        .includes(q);
    });
  }, [graph.nodes, kindFilter, query]);

  const nodesByKind = useMemo(() => {
    const groups = new Map<RomanWissensGraphNodeKind, typeof filteredNodes>();
    for (const n of filteredNodes) {
      const list = groups.get(n.kind) ?? [];
      list.push(n);
      groups.set(n.kind, list);
    }
    return KIND_ORDER.filter((k) => groups.has(k)).map((k) => ({
      kind: k,
      nodes: groups.get(k)!,
    }));
  }, [filteredNodes]);

  const filteredEdges = useMemo(() => {
    const q = query.trim().toLowerCase();
    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    return graph.edges.filter((e) => {
      if (!nodeIds.has(e.from) && !nodeIds.has(e.to) && q) {
        // When searching, also keep edges whose note/rel match even if ends filtered.
        const hay = `${e.rel} ${e.note} ${labelById.get(e.from) ?? ""} ${labelById.get(e.to) ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      } else if (q || kindFilter !== "all") {
        if (!nodeIds.has(e.from) && !nodeIds.has(e.to)) return false;
      }
      return true;
    });
  }, [graph.edges, filteredNodes, query, kindFilter, labelById]);

  const filteredInvariants = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return graph.hardInvariants;
    return graph.hardInvariants.filter((line) =>
      line.toLowerCase().includes(q),
    );
  }, [graph.hardInvariants, query]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="roman-wissensgraph-title"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-2xl ring-1 ring-zinc-950/10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold tracking-wide text-zinc-500 uppercase">
              Continuity · {graph.nodes.length} Knoten · {graph.edges.length}{" "}
              Relationen
            </p>
            <h2
              id="roman-wissensgraph-title"
              className="text-lg font-extrabold text-zinc-950"
            >
              Wissensgraph
            </h2>
            <p className="mt-1 text-xs font-semibold text-zinc-500">
              {graph.modelLabel ? `${graph.modelLabel} · ` : ""}
              Stand {formatUpdatedAt(graph.updatedAt)}
              {graph.seededFrom?.length
                ? ` · Seed: ${graph.seededFrom.join(", ")}`
                : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-gray-100 hover:text-zinc-950"
            aria-label="Schließen"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-zinc-100 px-5 py-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suchen …"
            className="min-w-[12rem] flex-1 rounded-2xl bg-gray-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700"
          />
          <select
            value={kindFilter}
            onChange={(e) =>
              setKindFilter(
                e.target.value as RomanWissensGraphNodeKind | "all",
              )
            }
            className="rounded-2xl bg-gray-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700"
          >
            <option value="all">Alle Arten</option>
            {KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-6 overflow-y-auto px-5 py-4">
          {nodesByKind.length === 0 ? (
            <p className="text-sm font-semibold text-zinc-600">
              Keine Knoten für diesen Filter.
            </p>
          ) : (
            nodesByKind.map(({ kind, nodes }) => (
              <section key={kind} className="space-y-2">
                <h3 className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                  {KIND_LABELS[kind]} · {nodes.length}
                </h3>
                <ul className="space-y-2">
                  {nodes.map((n) => (
                    <li
                      key={n.id}
                      className="rounded-2xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-950/8"
                    >
                      <p className="text-sm font-extrabold text-zinc-950">
                        {n.label}
                        {n.sinceChapter > 0 ? (
                          <span className="ml-2 text-xs font-semibold text-zinc-500">
                            ab Kap. {n.sinceChapter}
                          </span>
                        ) : null}
                      </p>
                      {n.summary.trim() ? (
                        <p className="mt-0.5 text-xs font-semibold text-zinc-600">
                          {n.summary}
                        </p>
                      ) : null}
                      {Object.keys(n.attrs).length > 0 ? (
                        <p className="mt-1 text-[11px] font-semibold text-zinc-500">
                          {Object.entries(n.attrs)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(" · ")}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}

          {filteredEdges.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                Relationen · {filteredEdges.length}
              </h3>
              <ul className="space-y-1.5 text-sm font-semibold text-zinc-700">
                {filteredEdges.map((e) => (
                  <li key={e.id}>
                    <span className="text-zinc-950">
                      {labelById.get(e.from) ?? e.from}
                    </span>
                    <span className="mx-1.5 text-zinc-400">→</span>
                    <span className="text-orange-800">{e.rel}</span>
                    <span className="mx-1.5 text-zinc-400">→</span>
                    <span className="text-zinc-950">
                      {labelById.get(e.to) ?? e.to}
                    </span>
                    {e.chapter != null ? (
                      <span className="ml-2 text-xs text-zinc-500">
                        Kap. {e.chapter}
                      </span>
                    ) : null}
                    {e.note.trim() ? (
                      <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                        {e.note}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {filteredInvariants.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
                Hard Invariants · {filteredInvariants.length}
              </h3>
              <ul className="space-y-1.5">
                {filteredInvariants.map((line, i) => (
                  <li
                    key={`${i}-${line.slice(0, 24)}`}
                    className="rounded-2xl bg-amber-50/80 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200/70"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

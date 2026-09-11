"use client";

/**
 * Admin form: edit help texts per member page + slot (Quill HTML).
 */

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { saveHelpTextAction } from "@/app/actions/help-admin";
import { RichHtmlEditor } from "@/components/ui/rich-html-editor";
import {
  HELP_PAGES,
  getHelpSlot,
  type HelpPageId,
} from "@/lib/help/catalog";
import { getHelpDefault } from "@/lib/help/defaults";
import type { HelpText } from "@/lib/help/types";
import { cn } from "@/lib/utils";

type Draft = { title: string; htmlBody: string };

function draftKey(pageId: string, slotId: string) {
  return `${pageId}::${slotId}`;
}

function buildInitialDrafts(texts: HelpText[]): Record<string, Draft> {
  const map: Record<string, Draft> = {};
  for (const page of HELP_PAGES) {
    for (const slot of page.slots) {
      const existing = texts.find(
        (row) => row.pageId === page.id && row.slotId === slot.id,
      );
      const fallback = getHelpDefault(page.id, slot.id);
      map[draftKey(page.id, slot.id)] = {
        title:
          existing?.title?.trim() ||
          fallback?.title ||
          slot.defaultTitle,
        // Stored row wins (incl. empty = intentionally cleared); else built-in default.
        htmlBody:
          existing != null
            ? (existing.htmlBody ?? "")
            : (fallback?.htmlBody ?? ""),
      };
    }
  }
  return map;
}

export function HelpAdminForm({
  initialTexts,
  canSave,
  readOnlyNotice,
}: {
  initialTexts: HelpText[];
  canSave: boolean;
  readOnlyNotice?: string;
}) {
  const [pageId, setPageId] = useState<HelpPageId>("geschichte");
  const [drafts, setDrafts] = useState(() => buildInitialDrafts(initialTexts));
  const [openSlotId, setOpenSlotId] = useState<string | null>("page");
  const [pendingSlot, setPendingSlot] = useState<string | null>(null);

  const page = useMemo(
    () => HELP_PAGES.find((entry) => entry.id === pageId)!,
    [pageId],
  );

  function patchDraft(slotId: string, patch: Partial<Draft>) {
    const key = draftKey(pageId, slotId);
    setDrafts((current) => ({
      ...current,
      [key]: { ...current[key]!, ...patch },
    }));
  }

  async function handleSave(slotId: string) {
    if (!canSave) {
      toast.error(
        "Speichern ist noch nicht verfügbar — Migration oder Service-Role prüfen.",
      );
      return;
    }
    const draft = drafts[draftKey(pageId, slotId)];
    if (!draft) return;
    setPendingSlot(slotId);
    const result = await saveHelpTextAction({
      pageId,
      slotId,
      title: draft.title,
      htmlBody: draft.htmlBody,
    });
    setPendingSlot(null);
    if (!result.success) {
      toast.error(result.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    toast.success("Hilfetext gespeichert.");
    if (result.data?.text) {
      patchDraft(slotId, {
        title: result.data.text.title,
        htmlBody: result.data.text.htmlBody,
      });
    }
  }

  return (
    <div className="space-y-6">
      {!canSave && readOnlyNotice ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 ring-1 ring-amber-700/20">
          {readOnlyNotice}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {HELP_PAGES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => {
              setPageId(entry.id);
              setOpenSlotId("page");
            }}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-bold ring-1 transition-colors",
              pageId === entry.id
                ? "bg-orange-700 text-white ring-orange-800"
                : "bg-white text-zinc-800 ring-zinc-950/10 hover:bg-zinc-50",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <p className="text-sm text-zinc-600">
        Route:{" "}
        <span className="font-semibold text-zinc-800">{page.route}</span>
        {" · "}
        Seitenhilfe + Cards. Leere Texte blenden das Info-Icon in der App aus.
      </p>

      <div className="space-y-3">
        {page.slots.map((slot) => {
          const key = draftKey(pageId, slot.id);
          const draft = drafts[key] ?? {
            title: slot.defaultTitle,
            htmlBody: "",
          };
          const open = openSlotId === slot.id;
          const catalogSlot = getHelpSlot(pageId, slot.id);
          const busy = pendingSlot === slot.id;
          return (
            <section
              key={slot.id}
              className="overflow-hidden rounded-[1.5rem] bg-white shadow-lg ring-1 ring-zinc-950/10"
            >
              <button
                type="button"
                aria-expanded={open}
                onClick={() =>
                  setOpenSlotId((current) =>
                    current === slot.id ? null : slot.id,
                  )
                }
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
              >
                <div>
                  <p className="font-extrabold text-zinc-950">{slot.label}</p>
                  <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                    {slot.kind === "page" ? "Seitenhilfe" : "Card"} ·{" "}
                    <code className="rounded bg-zinc-100 px-1">{slot.id}</code>
                    {draft.htmlBody.trim() ? "" : " · leer"}
                  </p>
                </div>
                <ChevronDown
                  className={cn(
                    "size-5 shrink-0 text-zinc-500 transition-transform",
                    open && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>

              {open ? (
                <div className="space-y-3 border-t border-zinc-950/10 px-5 pb-5 pt-4">
                  <label className="block text-xs font-bold tracking-wide text-zinc-500 uppercase">
                    Dialog-Titel
                    <input
                      type="text"
                      disabled={busy || !canSave}
                      value={draft.title}
                      onChange={(e) =>
                        patchDraft(slot.id, { title: e.target.value })
                      }
                      className="mt-1 w-full rounded-xl border border-zinc-950/10 bg-gray-100 px-3 py-2 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-orange-700 disabled:opacity-60"
                      placeholder={catalogSlot?.defaultTitle}
                    />
                  </label>
                  <div>
                    <p className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                      Inhalt
                    </p>
                    <RichHtmlEditor
                      value={draft.htmlBody}
                      disabled={busy || !canSave}
                      placeholder="Hilfetext schreiben …"
                      onChange={(html) =>
                        patchDraft(slot.id, { htmlBody: html })
                      }
                    />
                  </div>
                  <button
                    type="button"
                    disabled={busy || !canSave}
                    onClick={() => void handleSave(slot.id)}
                    className="rounded-full bg-zinc-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-zinc-900 disabled:opacity-60"
                  >
                    {busy ? "Speichern …" : "Speichern"}
                  </button>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

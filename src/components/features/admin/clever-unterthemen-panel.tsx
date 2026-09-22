"use client";

/**
 * Clever erzählt Unterthemen: Wissenssammler → Kapitel + Fakten (altersabhängig);
 * Faktenchecker → per-chapter ok / Nacharbeit.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  cleverUnterthemenFaktenCheckKapitelAction,
  cleverUnterthemenFaktenErsetzenKapitelAction,
  cleverUnterthemenGenerateAction,
  cleverUnterthemenKapitelAddAction,
  cleverUnterthemenKapitelFaktenFillAction,
  cleverUnterthemenKapitelTitelUpdateAction,
} from "@/app/actions/clever-unterthemen";
import { RomanSceneWaitDialog } from "@/components/features/admin/roman-scene-wait-dialog";
import {
  CLEVER_KAPITEL_MAX,
  cleverFaktenProKapitel,
  cleverKapitelSoll,
  kapitelNeedsCriticalReplace,
  type CleverUnterthemen,
} from "@/lib/roman/clever-unterthemen";
import type {
  CleverFaktCheckStatus,
  CleverKapitelCheckStatus,
  CleverUnterthemaKapitel,
  RomanEditorial,
} from "@/lib/roman/editorial";
import type { RomanKontext } from "@/lib/roman/types";
import { cn } from "@/lib/utils";

function kapitelBadge(status: CleverKapitelCheckStatus) {
  switch (status) {
    case "ok":
      return {
        label: "Fakten ok",
        className: "bg-emerald-100 text-emerald-900 ring-emerald-200",
      };
    case "nacharbeit":
      return {
        label: "Nacharbeit",
        className: "bg-amber-100 text-amber-950 ring-amber-200",
      };
    default:
      return {
        label: "Ungeprüft",
        className: "bg-zinc-100 text-zinc-600 ring-zinc-200",
      };
  }
}

function faktBadge(status: CleverFaktCheckStatus) {
  switch (status) {
    case "ok":
      return "ok";
    case "korrigiert":
      return "korrigiert";
    case "unsicher":
      return "unsicher";
    case "fehlerhaft":
      return "fehlerhaft";
  }
}

export function CleverUnterthemenPanel({
  romanId,
  thema,
  editorial,
  value,
  canSave,
  disabled,
  onComplete,
}: {
  romanId: string;
  thema: string;
  editorial: RomanEditorial;
  value: CleverUnterthemen | null;
  canSave: boolean;
  disabled?: boolean;
  onComplete: (result: {
    roman: RomanKontext;
    unterthemen: CleverUnterthemen;
  }) => void;
}) {
  const [pendingGenerate, setPendingGenerate] = useState(false);
  const [pendingCheck, setPendingCheck] = useState(false);
  const [pendingReplace, setPendingReplace] = useState(false);
  const [pendingAdd, setPendingAdd] = useState(false);
  const [pendingFill, setPendingFill] = useState(false);
  const [checkProgress, setCheckProgress] = useState<string | null>(null);
  const faktenSoll = cleverFaktenProKapitel(editorial);
  const kapitelSoll = cleverKapitelSoll(editorial);
  const busy = Boolean(
    disabled ||
      pendingGenerate ||
      pendingCheck ||
      pendingReplace ||
      pendingAdd ||
      pendingFill,
  );

  const checkedCount =
    value?.kapitel.filter((k) => k.checkStatus !== "ungeprueft").length ?? 0;
  const nacharbeitCount =
    value?.kapitel.filter((k) => k.checkStatus === "nacharbeit").length ?? 0;
  const okCount =
    value?.kapitel.filter((k) => k.checkStatus === "ok").length ?? 0;

  async function handleGenerate() {
    if (!canSave || busy) return;
    if (!thema.trim()) {
      toast.error("Zuerst ein Thema in Basics setzen.");
      return;
    }
    setPendingGenerate(true);
    const result = await cleverUnterthemenGenerateAction({ romanId });
    setPendingGenerate(false);
    if (!result.success) {
      toast.error(result.error ?? "Erzeugen fehlgeschlagen.");
      return;
    }
    onComplete(result.data!);
    toast.success(
      value
        ? `${kapitelSoll} Unterthemen gespeichert · bestehende Geschichten gelöscht.`
        : `${kapitelSoll} Unterthemen gespeichert.`,
    );
  }

  async function handleAddKapitel() {
    if (!canSave || busy || !value?.kapitel.length) return;
    if (value.kapitel.length >= CLEVER_KAPITEL_MAX) {
      toast.error(`Maximal ${CLEVER_KAPITEL_MAX} Kapitel.`);
      return;
    }
    setPendingAdd(true);
    const result = await cleverUnterthemenKapitelAddAction({ romanId });
    setPendingAdd(false);
    if (!result.success) {
      toast.error(result.error ?? "Kapitel hinzufügen fehlgeschlagen.");
      return;
    }
    onComplete(result.data!);
    const n =
      result.data!.unterthemen.kapitel[
        result.data!.unterthemen.kapitel.length - 1
      ]?.nummer;
    toast.success(
      n != null ? `Kapitel ${n} hinzugefügt.` : "Kapitel hinzugefügt.",
    );
  }

  async function handleSaveTitel(kapitelNummer: number, titel: string) {
    if (!canSave || busy) return;
    const trimmed = titel.trim();
    if (trimmed.length < 2) {
      toast.error("Titel zu kurz.");
      return;
    }
    const current = value?.kapitel.find((k) => k.nummer === kapitelNummer);
    if (current && current.titel === trimmed) return;
    setPendingAdd(true);
    const result = await cleverUnterthemenKapitelTitelUpdateAction({
      romanId,
      kapitelNummer,
      titel: trimmed,
    });
    setPendingAdd(false);
    if (!result.success) {
      toast.error(result.error ?? "Titel speichern fehlgeschlagen.");
      return;
    }
    onComplete(result.data!);
    toast.success(`Kapitel ${kapitelNummer}: Titel gespeichert.`);
  }

  async function handleFillFakten(kapitelNummer: number) {
    if (!canSave || busy) return;
    setPendingFill(true);
    const result = await cleverUnterthemenKapitelFaktenFillAction({
      romanId,
      kapitelNummer,
    });
    setPendingFill(false);
    if (!result.success) {
      toast.error(result.error ?? "Fakten erzeugen fehlgeschlagen.");
      return;
    }
    onComplete(result.data!);
    const titel =
      result.data!.unterthemen.kapitel.find((k) => k.nummer === kapitelNummer)
        ?.titel ?? "";
    toast.success(
      titel
        ? `Kapitel ${kapitelNummer}: „${titel.slice(0, 48)}${titel.length > 48 ? "…" : ""}“ + Fakten.`
        : `Kapitel ${kapitelNummer}: Titel und Fakten erzeugt.`,
    );
  }

  async function handleCheckAll() {
    if (!canSave || busy || !value?.kapitel.length) return;
    setPendingCheck(true);
    let latest = value;
    const failed: string[] = [];
    const total = value.kapitel.length;
    const maxAttempts = 3;

    async function checkKapitelWithRetries(
      kapitelNummer: number,
      titel: string,
    ): Promise<boolean> {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        setCheckProgress(
          attempt === 1
            ? `Kapitel ${kapitelNummer}/${total}: „${titel.slice(0, 36)}“…`
            : `Kapitel ${kapitelNummer}/${total}: erneut (Versuch ${attempt}/${maxAttempts})…`,
        );
        const result = await cleverUnterthemenFaktenCheckKapitelAction({
          romanId,
          kapitelNummer,
        });
        if (result.success && result.data) {
          latest = result.data.unterthemen;
          onComplete(result.data);
          return true;
        }
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 1_200 * attempt));
        } else {
          failed.push(
            `Kapitel ${kapitelNummer}: ${result.error ?? "fehlgeschlagen"}`,
          );
        }
      }
      return false;
    }

    try {
      // Pass 1: every chapter with facts, in order.
      for (const kap of value.kapitel) {
        if (kap.fakten.length === 0) continue;
        await checkKapitelWithRetries(kap.nummer, kap.titel);
      }

      // Pass 2: mop up anything still ungeprüft (transient misses / race).
      const stillOpen =
        latest?.kapitel.filter(
          (k) => k.checkStatus === "ungeprueft" && k.fakten.length > 0,
        ) ?? [];
      if (stillOpen.length > 0) {
        setCheckProgress(
          `Nachzug: ${stillOpen.length} ausgelassene Kapitel …`,
        );
        for (const kap of stillOpen) {
          // Remove prior failure note if we recover.
          const recovered = await checkKapitelWithRetries(kap.nummer, kap.titel);
          if (recovered) {
            const idx = failed.findIndex((f) =>
              f.startsWith(`Kapitel ${kap.nummer}:`),
            );
            if (idx >= 0) failed.splice(idx, 1);
          }
        }
      }

      const checked =
        latest?.kapitel.filter((k) => k.checkStatus !== "ungeprueft").length ??
        0;
      const bad =
        latest?.kapitel.filter((k) => k.checkStatus === "nacharbeit")
          .length ?? 0;
      const ungeprueft =
        latest?.kapitel.filter((k) => k.checkStatus === "ungeprueft")
          .length ?? 0;
      const openNums =
        latest?.kapitel
          .filter((k) => k.checkStatus === "ungeprueft")
          .map((k) => k.nummer)
          .join(", ") ?? "";

      if (ungeprueft > 0 || failed.length > 0) {
        toast.error(
          `${checked}/${total} Kapitel geprüft` +
            (ungeprueft > 0 ? ` · noch offen: ${openNums}` : "") +
            (failed[0] ? ` · ${failed[0]}` : ""),
        );
      } else {
        toast.success(
          bad > 0
            ? `Faktencheck fertig · alle ${total} Kapitel · ${bad} brauchen Nacharbeit.`
            : `Faktencheck fertig · alle ${total} Kapitel ok.`,
        );
      }
    } finally {
      setPendingCheck(false);
      setCheckProgress(null);
    }
  }

  async function handleCheckOne(kapitelNummer: number) {
    if (!canSave || busy) return;
    setPendingCheck(true);
    setCheckProgress(`Kapitel ${kapitelNummer} wird geprüft …`);
    const result = await cleverUnterthemenFaktenCheckKapitelAction({
      romanId,
      kapitelNummer,
    });
    setPendingCheck(false);
    setCheckProgress(null);
    if (!result.success) {
      toast.error(result.error ?? "Faktencheck fehlgeschlagen.");
      return;
    }
    onComplete(result.data!);
    const kap = result.data!.unterthemen.kapitel.find(
      (k) => k.nummer === kapitelNummer,
    );
    toast.success(
      kap?.checkStatus === "nacharbeit"
        ? `Kapitel ${kapitelNummer}: Nacharbeit nötig.`
        : `Kapitel ${kapitelNummer}: Fakten ok.`,
    );
  }

  async function handleReplaceCritical(kapitelNummer: number) {
    if (!canSave || busy) return;
    setPendingReplace(true);
    setCheckProgress(`Kapitel ${kapitelNummer}: kritische Fakten ersetzen …`);
    const result = await cleverUnterthemenFaktenErsetzenKapitelAction({
      romanId,
      kapitelNummer,
    });
    setPendingReplace(false);
    setCheckProgress(null);
    if (!result.success) {
      toast.error(result.error ?? "Ersetzen fehlgeschlagen.");
      return;
    }
    onComplete({
      roman: result.data!.roman,
      unterthemen: result.data!.unterthemen,
    });
    toast.success(
      `${result.data!.replacedCount} kritische Fakten ersetzt · Geschichte ${kapitelNummer} gelöscht — bitte erneut prüfen.`,
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-700 ring-1 ring-zinc-950/10">
        <p>
          Thema:{" "}
          <span className="font-extrabold text-zinc-950">
            {thema.trim() || "—"}
          </span>
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Wissenssammler: {kapitelSoll} Unterthemen · je {faktenSoll} Fakten ·
          danach Faktenchecker je Kapitel (ok / Nacharbeit). Manuell bis{" "}
          {CLEVER_KAPITEL_MAX} Kapitel.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canSave || busy || !thema.trim()}
          onClick={() => void handleGenerate()}
          className={cn(
            "rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50",
          )}
        >
          {pendingGenerate
            ? "Wissenssammler arbeitet …"
            : value
              ? "Unterthemen neu erzeugen"
              : "Unterthemen erzeugen"}
        </button>
        {value && value.kapitel.length > 0 ? (
          <button
            type="button"
            disabled={
              !canSave || busy || value.kapitel.length >= CLEVER_KAPITEL_MAX
            }
            onClick={() => void handleAddKapitel()}
            className={cn(
              "rounded-full bg-white px-5 py-2.5 text-sm font-bold text-zinc-900 ring-1 ring-zinc-950/15 hover:bg-zinc-50 disabled:opacity-50",
            )}
          >
            {pendingAdd ? "Wird hinzugefügt …" : "Kapitel hinzufügen"}
          </button>
        ) : null}
        {value && value.kapitel.length > 0 ? (
          <button
            type="button"
            disabled={!canSave || busy}
            onClick={() => void handleCheckAll()}
            className={cn(
              "rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50",
            )}
          >
            {pendingCheck
              ? checkProgress ?? "Faktenchecker …"
              : "Alle Fakten prüfen"}
          </button>
        ) : null}
      </div>

      {value && value.kapitel.length > 0 ? (
        <p className="text-xs font-semibold text-zinc-500">
          Geprüft: {checkedCount}/{value.kapitel.length}
          {checkedCount > 0
            ? ` · ok ${okCount} · Nacharbeit ${nacharbeitCount}`
            : ""}
        </p>
      ) : null}

      {value && value.kapitel.length > 0 ? (
        <ul className="space-y-4">
          {value.kapitel.map((k) => (
            <CleverKapitelCard
              key={k.nummer}
              kapitel={k}
              canSave={canSave}
              busy={busy}
              onSaveTitel={(titel) => void handleSaveTitel(k.nummer, titel)}
              onFillFakten={
                k.fakten.length === 0
                  ? () => void handleFillFakten(k.nummer)
                  : undefined
              }
              onCheck={() => void handleCheckOne(k.nummer)}
              onReplaceCritical={
                kapitelNeedsCriticalReplace(k)
                  ? () => void handleReplaceCritical(k.nummer)
                  : undefined
              }
            />
          ))}
          {value.modelLabel ? (
            <p className="text-xs font-semibold text-zinc-500">
              Wissenssammler: {value.modelLabel}
              {value.generatedAt
                ? ` · ${new Date(value.generatedAt).toLocaleString("de-DE")}`
                : ""}
              {value.checkModelLabel
                ? ` · Faktenchecker: ${value.checkModelLabel}`
                : ""}
            </p>
          ) : null}
        </ul>
      ) : (
        <p className="text-sm font-semibold text-zinc-500">
          Noch keine Unterthemen — Wissenssammler starten.
        </p>
      )}

      <RomanSceneWaitDialog
        open={pendingGenerate}
        variant="clever-unterthemen"
      />
      <RomanSceneWaitDialog
        open={pendingFill}
        variant="clever-unterthemen"
      />
      <RomanSceneWaitDialog
        open={pendingCheck || pendingReplace}
        variant={
          pendingReplace ? "clever-fakten-ersetzen" : "clever-faktencheck"
        }
        progressLabel={checkProgress}
      />
    </div>
  );
}

function CleverKapitelCard({
  kapitel: k,
  canSave,
  busy,
  onSaveTitel,
  onFillFakten,
  onCheck,
  onReplaceCritical,
}: {
  kapitel: CleverUnterthemaKapitel;
  canSave: boolean;
  busy: boolean;
  onSaveTitel: (titel: string) => void;
  onFillFakten?: () => void;
  onCheck: () => void;
  onReplaceCritical?: () => void;
}) {
  const [draftTitel, setDraftTitel] = useState(k.titel);
  const badge = kapitelBadge(k.checkStatus);
  const titelDirty = draftTitel.trim() !== k.titel;

  useEffect(() => {
    setDraftTitel(k.titel);
  }, [k.titel]);

  return (
    <li className="rounded-2xl bg-white px-4 py-3 ring-1 ring-zinc-950/10">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <label className="block text-xs font-bold text-zinc-500">
            Kapitel {k.nummer}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={draftTitel}
              disabled={!canSave || busy}
              onChange={(e) => setDraftTitel(e.target.value)}
              onBlur={() => {
                if (titelDirty && draftTitel.trim().length >= 2) {
                  onSaveTitel(draftTitel);
                } else {
                  setDraftTitel(k.titel);
                }
              }}
              className="min-w-0 flex-1 rounded-xl bg-zinc-50 px-3 py-2 text-sm font-extrabold text-zinc-950 ring-1 ring-zinc-950/10 outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-50"
            />
            {titelDirty ? (
              <button
                type="button"
                disabled={!canSave || busy || draftTitel.trim().length < 2}
                onClick={() => onSaveTitel(draftTitel)}
                className="rounded-full bg-orange-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-800 disabled:opacity-50"
              >
                Speichern
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-extrabold ring-1",
              badge.className,
            )}
          >
            {badge.label}
          </span>
          <button
            type="button"
            disabled={!canSave || busy || k.fakten.length === 0}
            onClick={onCheck}
            className="text-xs font-bold text-orange-800 hover:underline disabled:opacity-50"
          >
            Prüfen
          </button>
          {onReplaceCritical ? (
            <button
              type="button"
              disabled={!canSave || busy}
              onClick={onReplaceCritical}
              className="text-xs font-bold text-amber-900 hover:underline disabled:opacity-50"
              title="Fehlerhafte/unsichere Fakten neu erzeugen"
            >
              Ersetzen
            </button>
          ) : null}
        </div>
      </div>
      {k.checkHinweis ? (
        <p className="mt-2 text-xs font-semibold text-zinc-600">
          {k.checkHinweis}
        </p>
      ) : null}
      {k.fakten.length === 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="text-xs font-semibold text-zinc-500">
            Noch keine Fakten für dieses Kapitel.
          </p>
          {onFillFakten ? (
            <button
              type="button"
              disabled={!canSave || busy}
              onClick={onFillFakten}
              className="text-xs font-bold text-orange-800 hover:underline disabled:opacity-50"
            >
              Fakten erzeugen
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="mt-2 space-y-2 text-sm font-semibold text-zinc-700">
          {k.fakten.map((f, i) => {
            const check = k.faktChecks[i];
            const showCheck = k.checkStatus !== "ungeprueft" && check;
            return (
              <li key={`${k.nummer}-${i}`} className="list-none">
                <div className="flex gap-2">
                  <span className="text-zinc-400">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <p>{f}</p>
                    {showCheck ? (
                      <p
                        className={cn(
                          "mt-0.5 text-xs font-bold",
                          check.status === "ok" && "text-emerald-800",
                          check.status === "korrigiert" && "text-sky-800",
                          check.status === "unsicher" && "text-amber-800",
                          check.status === "fehlerhaft" && "text-red-800",
                        )}
                      >
                        {faktBadge(check.status)}
                        {check.hinweis ? ` — ${check.hinweis}` : ""}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

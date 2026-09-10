"use client";

/**
 * Admin UI: create / update / delete promo codes (Stripe-synced).
 */

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createPromoAction,
  deletePromoAction,
  updatePromoAction,
} from "@/app/actions/promo-admin";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { buildPromoUrl } from "@/lib/promo/marketing";
import type { Promo } from "@/lib/promo/types";
import { PAID_MEMBERSHIP_PACKAGE_IDS } from "@/lib/stripe/config";
import { cn } from "@/lib/utils";

const PACKAGE_LABELS: Record<(typeof PAID_MEMBERSHIP_PACKAGE_IDS)[number], string> =
  {
    plus: "Plus",
    pro: "Familie",
    ultimate: "Komplett",
  };

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function discountSummary(promo: Promo): string {
  if (promo.discountKind === "free") return "100 % gratis";
  if (promo.discountKind === "percent") return `${promo.percentOff} %`;
  return `${promo.amountOffEur} €`;
}

function durationSummary(promo: Promo): string {
  if (promo.durationKind === "once") return "1. Rechnung";
  if (promo.durationKind === "forever") return "dauerhaft";
  return `${promo.durationMonths} Monate`;
}

export function PromosAdminForm({
  promos: initial,
  canSave,
  readOnlyNotice,
}: {
  promos: Promo[];
  canSave: boolean;
  readOnlyNotice: string;
}) {
  const [promos, setPromos] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [discountKind, setDiscountKind] = useState<"percent" | "amount" | "free">(
    "percent",
  );
  const [percentOff, setPercentOff] = useState("50");
  const [amountOffEur, setAmountOffEur] = useState("5");
  const [durationKind, setDurationKind] = useState<
    "once" | "repeating" | "forever"
  >("repeating");
  const [durationMonths, setDurationMonths] = useState("3");
  const [packageIds, setPackageIds] = useState<string[]>([
    ...PAID_MEMBERSHIP_PACKAGE_IDS,
  ]);
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [notes, setNotes] = useState("");

  const deleteTarget = useMemo(
    () => promos.find((p) => p.id === deleteId) ?? null,
    [promos, deleteId],
  );

  function togglePackage(id: string) {
    setPackageIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    startTransition(async () => {
      const result = await createPromoAction({
        code,
        label,
        discountKind,
        percentOff:
          discountKind === "percent" ? Number(percentOff) : null,
        amountOffEur:
          discountKind === "amount" ? Number(amountOffEur) : null,
        durationKind,
        durationMonths:
          durationKind === "repeating" ? Number(durationMonths) : null,
        packageIds,
        active: true,
        startsAt: null,
        endsAt: fromLocalInput(endsAt),
        maxRedemptions: maxRedemptions.trim()
          ? Number(maxRedemptions)
          : null,
        notes: notes.trim() || null,
      });
      if (!result.success) {
        toast.error(result.error ?? "Anlegen fehlgeschlagen.");
        return;
      }
      toast.success(`Promo angelegt. Link: ${result.data?.link ?? ""}`);
      setCode("");
      setLabel("");
      setNotes("");
      // Refresh list from server via reload is simplest
      window.location.reload();
    });
  }

  function handleSaveRow(promo: Promo) {
    if (!canSave) return;
    startTransition(async () => {
      const result = await updatePromoAction({
        id: promo.id,
        label: promo.label,
        packageIds: promo.packageIds,
        active: promo.active,
        startsAt: promo.startsAt,
        endsAt: promo.endsAt,
        maxRedemptions: promo.maxRedemptions,
        notes: promo.notes,
      });
      if (!result.success) {
        toast.error(result.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      toast.success("Gespeichert.");
      setPromos((prev) =>
        prev.map((p) => (p.id === promo.id ? promo : p)),
      );
    });
  }

  function handleConfirmDelete() {
    if (!deleteId || !canSave) return;
    startTransition(async () => {
      const result = await deletePromoAction({ id: deleteId });
      if (!result.success) {
        toast.error(result.error ?? "Löschen fehlgeschlagen.");
        return;
      }
      toast.success("Promo gelöscht.");
      setPromos((prev) => prev.filter((p) => p.id !== deleteId));
      setDeleteId(null);
    });
  }

  return (
    <div className="space-y-10">
      {!canSave ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 ring-1 ring-amber-700/20">
          {readOnlyNotice}
        </p>
      ) : null}

      <form
        noValidate
        onSubmit={handleCreate}
        className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10"
      >
        <h2 className="text-xl font-extrabold text-zinc-950">Neuer Promo-Code</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          Legt Coupon + Promotion Code in Stripe an. Link:{" "}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">
            /registrieren?promo=CODE
          </code>
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-zinc-700">
            Code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-950/10 bg-gray-100 px-3 py-2.5 font-mono text-sm"
              placeholder="familie-mai"
              required
            />
          </label>
          <label className="block text-sm font-semibold text-zinc-700">
            Bezeichnung
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-950/10 bg-gray-100 px-3 py-2.5 text-sm"
              placeholder="Influencer Mai"
              required
            />
          </label>

          <label className="block text-sm font-semibold text-zinc-700">
            Rabatt-Art
            <select
              value={discountKind}
              onChange={(e) =>
                setDiscountKind(e.target.value as typeof discountKind)
              }
              className="mt-1 w-full rounded-xl border border-zinc-950/10 bg-gray-100 px-3 py-2.5 text-sm"
            >
              <option value="percent">Prozent</option>
              <option value="amount">Betrag (€)</option>
              <option value="free">Kostenlos (100 %)</option>
            </select>
          </label>

          {discountKind === "percent" ? (
            <label className="block text-sm font-semibold text-zinc-700">
              Prozent
              <input
                type="number"
                min={1}
                max={100}
                value={percentOff}
                onChange={(e) => setPercentOff(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-950/10 bg-gray-100 px-3 py-2.5 text-sm"
              />
            </label>
          ) : null}
          {discountKind === "amount" ? (
            <label className="block text-sm font-semibold text-zinc-700">
              Euro nachlassen
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={amountOffEur}
                onChange={(e) => setAmountOffEur(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-950/10 bg-gray-100 px-3 py-2.5 text-sm"
              />
            </label>
          ) : null}
          {discountKind === "free" ? (
            <p className="self-end text-sm text-zinc-600">
              100 % Rabatt für die gewählte Dauer.
            </p>
          ) : null}

          <label className="block text-sm font-semibold text-zinc-700">
            Dauer
            <select
              value={durationKind}
              onChange={(e) =>
                setDurationKind(e.target.value as typeof durationKind)
              }
              className="mt-1 w-full rounded-xl border border-zinc-950/10 bg-gray-100 px-3 py-2.5 text-sm"
            >
              <option value="once">Nur erste Rechnung</option>
              <option value="repeating">Mehrere Monate</option>
              <option value="forever">Dauerhaft</option>
            </select>
          </label>
          {durationKind === "repeating" ? (
            <label className="block text-sm font-semibold text-zinc-700">
              Monate
              <input
                type="number"
                min={1}
                max={36}
                value={durationMonths}
                onChange={(e) => setDurationMonths(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-950/10 bg-gray-100 px-3 py-2.5 text-sm"
              />
            </label>
          ) : null}

          <label className="block text-sm font-semibold text-zinc-700">
            Max. Einlösungen (optional)
            <input
              type="number"
              min={1}
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-950/10 bg-gray-100 px-3 py-2.5 text-sm"
              placeholder="unbegrenzt"
            />
          </label>
          <label className="block text-sm font-semibold text-zinc-700">
            Gültig bis (optional)
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-950/10 bg-gray-100 px-3 py-2.5 text-sm"
            />
          </label>
        </div>

        <fieldset className="mt-4">
          <legend className="text-sm font-semibold text-zinc-700">
            Gilt für Pakete
          </legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {PAID_MEMBERSHIP_PACKAGE_IDS.map((id) => (
              <label
                key={id}
                className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-800"
              >
                <input
                  type="checkbox"
                  checked={packageIds.includes(id)}
                  onChange={() => togglePackage(id)}
                />
                {PACKAGE_LABELS[id]}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="mt-4 block text-sm font-semibold text-zinc-700">
          Notiz (intern)
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded-xl border border-zinc-950/10 bg-gray-100 px-3 py-2.5 text-sm"
          />
        </label>

        <button
          type="submit"
          disabled={!canSave || pending}
          className={cn(
            "mt-6 inline-flex rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800",
            pending && "opacity-70",
          )}
        >
          {pending ? "Wird angelegt …" : "Anlegen & in Stripe syncen"}
        </button>
      </form>

      <div className="space-y-4">
        <h2 className="text-xl font-extrabold text-zinc-950">Bestehende Promos</h2>
        {promos.length === 0 ? (
          <p className="text-sm text-zinc-600">Noch keine Promos.</p>
        ) : (
          promos.map((promo) => (
            <article
              key={promo.id}
              className="rounded-[1.75rem] bg-white p-5 shadow-xl ring-1 ring-zinc-950/10"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-lg font-extrabold text-zinc-950">
                    {promo.code}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">
                    {discountSummary(promo)} · {durationSummary(promo)} ·{" "}
                    {promo.redemptionCount}
                    {promo.maxRedemptions != null
                      ? ` / ${promo.maxRedemptions}`
                      : ""}{" "}
                    Einlösungen
                  </p>
                  <p className="mt-1 break-all text-xs text-zinc-500">
                    {buildPromoUrl(promo.code, "/registrieren")}
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={promo.active}
                    disabled={!canSave || pending}
                    onChange={(e) => {
                      const next = {
                        ...promo,
                        active: e.target.checked,
                      };
                      setPromos((prev) =>
                        prev.map((p) => (p.id === promo.id ? next : p)),
                      );
                      handleSaveRow(next);
                    }}
                  />
                  Aktiv
                </label>
              </div>

              <label className="mt-4 block text-sm font-semibold text-zinc-700">
                Bezeichnung
                <input
                  value={promo.label}
                  disabled={!canSave || pending}
                  onChange={(e) =>
                    setPromos((prev) =>
                      prev.map((p) =>
                        p.id === promo.id
                          ? { ...p, label: e.target.value }
                          : p,
                      ),
                    )
                  }
                  className="mt-1 w-full rounded-xl border border-zinc-950/10 bg-gray-100 px-3 py-2 text-sm"
                />
              </label>

              <div className="mt-3 flex flex-wrap gap-3">
                {PAID_MEMBERSHIP_PACKAGE_IDS.map((id) => (
                  <label
                    key={id}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-800"
                  >
                    <input
                      type="checkbox"
                      disabled={!canSave || pending}
                      checked={promo.packageIds.includes(id)}
                      onChange={() => {
                        const nextIds = promo.packageIds.includes(id)
                          ? promo.packageIds.filter((x) => x !== id)
                          : [...promo.packageIds, id];
                        if (nextIds.length === 0) return;
                        setPromos((prev) =>
                          prev.map((p) =>
                            p.id === promo.id
                              ? { ...p, packageIds: nextIds }
                              : p,
                          ),
                        );
                      }}
                    />
                    {PACKAGE_LABELS[id]}
                  </label>
                ))}
              </div>

              <label className="mt-3 block text-sm font-semibold text-zinc-700">
                Gültig bis
                <input
                  type="datetime-local"
                  disabled={!canSave || pending}
                  value={toLocalInput(promo.endsAt)}
                  onChange={(e) =>
                    setPromos((prev) =>
                      prev.map((p) =>
                        p.id === promo.id
                          ? { ...p, endsAt: fromLocalInput(e.target.value) }
                          : p,
                      ),
                    )
                  }
                  className="mt-1 w-full rounded-xl border border-zinc-950/10 bg-gray-100 px-3 py-2 text-sm sm:max-w-xs"
                />
              </label>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!canSave || pending}
                  onClick={() => handleSaveRow(promo)}
                  className="inline-flex rounded-full bg-zinc-800 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-900 disabled:opacity-70"
                >
                  Speichern
                </button>
                <button
                  type="button"
                  disabled={!canSave || pending}
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      buildPromoUrl(promo.code, "/registrieren"),
                    );
                    toast.success("Link kopiert.");
                  }}
                  className="inline-flex rounded-full bg-gray-100 px-4 py-2 text-sm font-bold text-zinc-950 ring-1 ring-zinc-950/10 hover:bg-gray-200"
                >
                  Link kopieren
                </button>
                <button
                  type="button"
                  disabled={!canSave || pending}
                  onClick={() => setDeleteId(promo.id)}
                  className="inline-flex rounded-full bg-red-50 px-4 py-2 text-sm font-bold text-red-800 ring-1 ring-red-200 hover:bg-red-100"
                >
                  Löschen
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        title="Promo löschen?"
        description={
          deleteTarget
            ? `Code „${deleteTarget.code}“ wird gelöscht und in Stripe deaktiviert. Bereits eingelöste Abos bleiben bestehen.`
            : ""
        }
        pending={pending}
        onCancel={() => {
          if (!pending) setDeleteId(null);
        }}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

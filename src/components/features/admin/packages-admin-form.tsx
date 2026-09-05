"use client";

/**
 * Admin editor for `leseno.membership_packages` (label, price, credits, features).
 */

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { saveMembershipPackagesAction } from "@/app/actions/package-admin";
import {
  PACKAGE_FEATURE_IDS,
  PACKAGE_FEATURE_LABELS,
  type MembershipPackage,
  type PackageFeatureId,
} from "@/lib/users/packages";
import { cn } from "@/lib/utils";

type DraftPackage = {
  id: MembershipPackage["id"];
  label: string;
  priceEur: string;
  credits: string;
  features: PackageFeatureId[];
  sortOrder: number;
};

function toDrafts(packages: MembershipPackage[]): DraftPackage[] {
  return packages.map((pkg) => ({
    id: pkg.id,
    label: pkg.label,
    priceEur: String(pkg.priceEur),
    credits: String(pkg.credits),
    features: [...pkg.features],
    sortOrder: pkg.sortOrder,
  }));
}

export function PackagesAdminForm({
  packages: initialPackages,
  canSave,
  readOnlyNotice,
}: {
  packages: MembershipPackage[];
  canSave: boolean;
  readOnlyNotice?: string;
}) {
  const [drafts, setDrafts] = useState(() => toDrafts(initialPackages));
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  function patchDraft(
    id: DraftPackage["id"],
    patch: Partial<Omit<DraftPackage, "id">>,
  ) {
    setDrafts((current) =>
      current.map((pkg) => (pkg.id === id ? { ...pkg, ...patch } : pkg)),
    );
  }

  function toggleFeature(id: DraftPackage["id"], feature: PackageFeatureId) {
    setDrafts((current) =>
      current.map((pkg) => {
        if (pkg.id !== id) return pkg;
        const has = pkg.features.includes(feature);
        return {
          ...pkg,
          features: has
            ? pkg.features.filter((entry) => entry !== feature)
            : PACKAGE_FEATURE_IDS.filter(
                (fid) => fid === feature || pkg.features.includes(fid),
              ),
        };
      }),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) {
      toast.error(
        "Speichern ist noch nicht verfügbar, bis die Migration `membership_packages` ausgeführt ist.",
      );
      return;
    }

    setFieldError(null);
    setPending(true);

    const result = await saveMembershipPackagesAction({
      packages: drafts.map((pkg) => ({
        id: pkg.id,
        label: pkg.label,
        priceEur: pkg.priceEur,
        credits: pkg.credits,
        features: pkg.features,
        sortOrder: pkg.sortOrder,
      })),
    });

    setPending(false);

    if (!result.success) {
      setFieldError(result.error ?? "Speichern hat nicht geklappt.");
      toast.error(result.error ?? "Speichern hat nicht geklappt.");
      return;
    }

    toast.success("Pakete gespeichert.");
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-8">
      {!canSave ? (
        <p className="rounded-[1.75rem] bg-orange-50 p-6 text-sm font-semibold text-orange-900 ring-1 ring-orange-700/10">
          {readOnlyNotice ??
            "Vorschau: Die Pakete konnten evtl. nicht geladen werden. Bitte die Migration `membership_packages` ausführen."}
        </p>
      ) : null}

      {drafts.map((pkg) => (
        <section
          key={pkg.id}
          className="overflow-hidden rounded-[1.75rem] bg-white shadow-xl ring-1 ring-zinc-950/10"
        >
          <div className="border-b border-zinc-950/10 bg-gray-100 px-6 py-4">
            <h2 className="text-lg font-extrabold text-zinc-950">
              {pkg.label || pkg.id}
            </h2>
            <p className="text-sm text-zinc-600">
              Interne ID: <span className="font-semibold">{pkg.id}</span>
            </p>
          </div>

          <div className="grid gap-4 px-6 py-5 sm:grid-cols-3">
            <label className="block sm:col-span-1">
              <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                Bezeichnung
              </span>
              <input
                type="text"
                disabled={!canSave || pending}
                value={pkg.label}
                onChange={(event) =>
                  patchDraft(pkg.id, { label: event.target.value })
                }
                className="mt-1 w-full rounded-2xl bg-gray-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                Preis (€ / Monat)
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                disabled={!canSave || pending}
                value={pkg.priceEur}
                onChange={(event) =>
                  patchDraft(pkg.id, { priceEur: event.target.value })
                }
                className="mt-1 w-full rounded-2xl bg-gray-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                Anzahl Credits
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={100}
                disabled={!canSave || pending}
                value={pkg.credits}
                onChange={(event) =>
                  patchDraft(pkg.id, { credits: event.target.value })
                }
                className="mt-1 w-full rounded-2xl bg-gray-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
              />
            </label>
          </div>

          <div className="border-t border-zinc-950/5 px-6 py-5">
            <p className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
              Funktionen
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PACKAGE_FEATURE_IDS.map((featureId) => {
                const checked = pkg.features.includes(featureId);
                return (
                  <li key={featureId}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold ring-1 transition-all duration-200 ease-in-out",
                        checked
                          ? "bg-orange-50 text-zinc-950 ring-orange-700/20"
                          : "bg-gray-100 text-zinc-700 ring-zinc-950/10",
                        (!canSave || pending) && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <input
                        type="checkbox"
                        disabled={!canSave || pending}
                        checked={checked}
                        onChange={() => toggleFeature(pkg.id, featureId)}
                        className="size-4 rounded border-zinc-300 text-orange-700 focus:ring-orange-700"
                      />
                      {PACKAGE_FEATURE_LABELS[featureId]}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ))}

      {fieldError ? (
        <p className="text-sm font-semibold text-red-700" role="alert">
          {fieldError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!canSave || pending}
        className={cn(
          "inline-flex rounded-full bg-orange-700 px-6 py-3 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800",
          (!canSave || pending) && "cursor-not-allowed opacity-60",
        )}
      >
        {pending ? "Speichern…" : "Speichern"}
      </button>
    </form>
  );
}

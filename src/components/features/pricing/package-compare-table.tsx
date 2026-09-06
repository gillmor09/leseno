/**
 * Feature matrix: Basis / Plus / Pro / Ultimate from `membership_packages`.
 */

import { Check, Minus } from "lucide-react";
import {
  PACKAGE_COMPARE_FEATURE_HINTS,
  PACKAGE_COMPARE_FEATURE_IDS,
  featureLabel,
} from "@/lib/users/package-marketing";
import {
  packageHasFeature,
  type MembershipPackage,
} from "@/lib/users/packages";
import { cn } from "@/lib/utils";

export function PackageCompareTable({
  packages,
}: {
  packages: MembershipPackage[];
}) {
  const columns = packages.filter((pkg) =>
    ["basis", "plus", "pro", "ultimate"].includes(pkg.id),
  );

  return (
    <section
      aria-labelledby="paket-vergleich-heading"
      className="mt-14 overflow-hidden rounded-[1.75rem] bg-white shadow-xl ring-1 ring-zinc-950/10"
    >
      <div className="border-b border-zinc-950/10 bg-gray-100 px-6 py-5 sm:px-8">
        <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
          Vergleich
        </p>
        <h2
          id="paket-vergleich-heading"
          className="mt-1 text-2xl font-extrabold tracking-tight text-zinc-950"
        >
          Was steckt in welchem Paket?
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600">
          Thema, Lesestufe, Ton und Textlänge gibt’s in jedem Paket.
          Die Tabelle zeigt die Extra-Funktionen — Stand aus der
          Paketverwaltung.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-950/10">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-white px-4 py-3 font-extrabold text-zinc-950 sm:px-6"
              >
                Funktion
              </th>
              {columns.map((pkg) => (
                <th
                  key={pkg.id}
                  scope="col"
                  className="px-3 py-3 text-center font-extrabold text-zinc-950"
                >
                  {pkg.label}
                  <span className="mt-0.5 block text-xs font-semibold text-zinc-500">
                    {pkg.priceEur === 0
                      ? "0 €"
                      : `${pkg.priceEur} € / Monat`}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-zinc-950/5 bg-gray-50/80">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-gray-50 px-4 py-3 font-semibold text-zinc-800 sm:px-6"
              >
                Credits inklusive
                <span className="mt-0.5 block text-xs font-medium text-zinc-500">
                  Zum Erzeugen von Geschichten
                </span>
              </th>
              {columns.map((pkg) => (
                <td
                  key={`${pkg.id}-credits`}
                  className="px-3 py-3 text-center font-extrabold tabular-nums text-zinc-950"
                >
                  {pkg.credits > 0 ? pkg.credits : "—"}
                </td>
              ))}
            </tr>
            {PACKAGE_COMPARE_FEATURE_IDS.map((featureId) => (
              <tr
                key={featureId}
                className="border-b border-zinc-950/5 last:border-b-0"
              >
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-white px-4 py-3 font-semibold text-zinc-800 sm:px-6"
                >
                  {featureLabel(featureId)}
                  {PACKAGE_COMPARE_FEATURE_HINTS[featureId] ? (
                    <span className="mt-0.5 block text-xs font-medium text-zinc-500">
                      {PACKAGE_COMPARE_FEATURE_HINTS[featureId]}
                    </span>
                  ) : null}
                </th>
                {columns.map((pkg) => {
                  const on = packageHasFeature(pkg, featureId);
                  return (
                    <td
                      key={`${pkg.id}-${featureId}`}
                      className="px-3 py-3 text-center"
                    >
                      <span className="inline-flex items-center justify-center">
                        {on ? (
                          <Check
                            className="size-5 text-orange-700"
                            aria-label="enthalten"
                          />
                        ) : (
                          <Minus
                            className="size-5 text-zinc-300"
                            aria-label="nicht enthalten"
                          />
                        )}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function packageCardTone(id: string): "light" | "dark" {
  return id === "pro" ? "dark" : "light";
}

export function isFeaturedPackage(id: string): boolean {
  return id === "pro";
}

/** Shared card shell classes for paid package columns. */
export function packageCardClassName(input: {
  dark: boolean;
  featured: boolean;
}): string {
  return cn(
    "flex flex-col rounded-[1.75rem] p-8 shadow-xl",
    input.dark
      ? "bg-zinc-800 text-white"
      : "bg-white text-zinc-950 ring-1 ring-zinc-950/10",
    input.featured && "lg:-translate-y-1 lg:ring-2 lg:ring-yellow-400",
  );
}

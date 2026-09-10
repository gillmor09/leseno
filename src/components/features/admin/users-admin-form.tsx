"use client";

/**
 * Admin users list: email, credits, package role, billing history, delete.
 * Changing the role and saving writes a package booking (or ends it for admin).
 */

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { History, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  deleteUserAdminAction,
  getUserBillingHistoryAction,
  saveUsersAdminAction,
} from "@/app/actions/user-admin";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { USER_ROLE_OPTIONS, type UserAdminRow } from "@/lib/users/catalog";
import type { UserPackageBooking } from "@/lib/users/packages";
import { USER_PACKAGE_LABELS } from "@/lib/users/packages";
import type { UserPromoRedemption } from "@/lib/users/billing";
import { cn } from "@/lib/utils";

function formatDeDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function packageLabel(packageId: string): string {
  if (packageId in USER_PACKAGE_LABELS) {
    return USER_PACKAGE_LABELS[packageId as keyof typeof USER_PACKAGE_LABELS];
  }
  return packageId;
}

function UserBillingHistoryDialog({
  open,
  email,
  pending,
  bookings,
  promos,
  onClose,
}: {
  open: boolean;
  email: string;
  pending: boolean;
  bookings: UserPackageBooking[];
  promos: UserPromoRedemption[];
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-history-title"
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-zinc-950/55 p-4 backdrop-blur-sm sm:py-16"
      onClick={onClose}
    >
      <section
        className="w-full max-w-2xl rounded-[2rem] bg-white p-6 shadow-2xl ring-1 ring-zinc-950/10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Verlauf
            </p>
            <h2
              id="user-history-title"
              className="mt-1 text-xl font-extrabold text-zinc-950"
            >
              {email}
            </h2>
          </div>
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-full text-zinc-500 hover:bg-gray-100 hover:text-zinc-950"
            onClick={onClose}
          >
            <X className="size-5" aria-hidden />
            <span className="sr-only">Schließen</span>
          </button>
        </div>

        {pending ? (
          <p className="mt-8 flex items-center gap-2 text-sm font-semibold text-zinc-600">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Lädt …
          </p>
        ) : (
          <div className="mt-6 space-y-8">
            <div>
              <h3 className="text-sm font-extrabold tracking-wide text-zinc-500 uppercase">
                Paket-Buchungen
              </h3>
              {bookings.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-600">Keine Buchungen.</p>
              ) : (
                <ul className="mt-3 divide-y divide-zinc-950/5 rounded-2xl ring-1 ring-zinc-950/10">
                  {bookings.map((booking) => (
                    <li key={booking.id} className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-extrabold text-zinc-950">
                          {packageLabel(booking.packageId)}
                          {!booking.endedAt ? (
                            <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-900">
                              aktiv
                            </span>
                          ) : null}
                        </p>
                        <p className="tabular-nums text-zinc-600">
                          {booking.actualPrice.toFixed(2)} €
                          {booking.actualPrice !== booking.monthlyPrice
                            ? ` (Liste ${booking.monthlyPrice.toFixed(2)} €)`
                            : ""}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        {formatDeDate(booking.startedAt)}
                        {booking.endedAt
                          ? ` – ${formatDeDate(booking.endedAt)}`
                          : " – laufend"}
                        {booking.notes ? ` · ${booking.notes}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-sm font-extrabold tracking-wide text-zinc-500 uppercase">
                Promo-Einlösungen
              </h3>
              {promos.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-600">Keine Promos.</p>
              ) : (
                <ul className="mt-3 divide-y divide-zinc-950/5 rounded-2xl ring-1 ring-zinc-950/10">
                  {promos.map((promo) => (
                    <li key={promo.id} className="px-4 py-3 text-sm">
                      <p className="font-extrabold text-zinc-950">
                        <span className="font-mono">{promo.promoCode}</span>
                        <span className="ml-2 font-semibold text-zinc-600">
                          {promo.promoLabel}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {formatDeDate(promo.redeemedAt)} · Paket{" "}
                        {packageLabel(promo.packageId)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}

export function UsersAdminForm({
  users: initialUsers,
  canSave = true,
  readOnlyNotice = null,
  currentUserId = null,
}: {
  users: UserAdminRow[];
  canSave?: boolean;
  readOnlyNotice?: string | null;
  /** Signed-in admin — cannot delete self. */
  currentUserId?: string | null;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserAdminRow | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [historyUser, setHistoryUser] = useState<UserAdminRow | null>(null);
  const [historyPending, setHistoryPending] = useState(false);
  const [historyBookings, setHistoryBookings] = useState<UserPackageBooking[]>(
    [],
  );
  const [historyPromos, setHistoryPromos] = useState<UserPromoRedemption[]>([]);

  function patchUser(
    userId: string,
    patch: Partial<Pick<UserAdminRow, "email" | "role" | "credits">>,
  ) {
    setUsers((current) =>
      current.map((user) => {
        if (user.userId !== userId) return user;
        const next = { ...user, ...patch };
        if (next.role === "admin") {
          next.credits = 0;
        }
        return next;
      }),
    );
  }

  async function openHistory(user: UserAdminRow) {
    setHistoryUser(user);
    setHistoryPending(true);
    setHistoryBookings([]);
    setHistoryPromos([]);
    const result = await getUserBillingHistoryAction({ userId: user.userId });
    setHistoryPending(false);
    if (!result.success || !result.data) {
      toast.error(result.error ?? "Verlauf konnte nicht geladen werden.");
      setHistoryUser(null);
      return;
    }
    setHistoryBookings(result.data.bookings);
    setHistoryPromos(result.data.promos);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) {
      toast.error(
        "Speichern ist nicht verfügbar — Service-Role oder Verbindung prüfen.",
      );
      return;
    }
    setFieldError(null);
    setPending(true);

    const result = await saveUsersAdminAction({ users });

    setPending(false);

    if (!result.success) {
      setFieldError(result.error ?? "Speichern hat nicht geklappt.");
      toast.error(result.error ?? "Speichern hat nicht geklappt.");
      return;
    }

    toast.success("User gespeichert.");
  }

  async function handleConfirmDelete() {
    if (!deleteTarget || deletePending) return;
    setDeletePending(true);
    const result = await deleteUserAdminAction({
      userId: deleteTarget.userId,
    });
    setDeletePending(false);

    if (!result.success) {
      toast.error(result.error ?? "Löschen hat nicht geklappt.");
      return;
    }

    setUsers((current) =>
      current.filter((user) => user.userId !== deleteTarget.userId),
    );
    toast.success("User gelöscht.");
    setDeleteTarget(null);
  }

  return (
    <>
      <form noValidate onSubmit={handleSubmit} className="space-y-8">
        {readOnlyNotice ? (
          <p className="rounded-[1.75rem] bg-orange-50 p-6 text-sm font-semibold text-orange-900 ring-1 ring-orange-700/10">
            {readOnlyNotice}
          </p>
        ) : null}

        <section className="overflow-hidden rounded-[1.75rem] bg-white shadow-xl ring-1 ring-zinc-950/10">
          <div className="border-b border-zinc-950/10 bg-gray-100 px-6 py-4">
            <h2 className="text-lg font-extrabold text-zinc-950">User</h2>
            <p className="text-sm text-zinc-600">
              Rolle = Paket (Basis / Plus / Familie / Komplett) oder Admin. Beim
              Speichern wird ein Rollenwechsel in der Buchungs-Historie
              festgehalten. Admins haben keine Credits und liegen außerhalb der
              Bezahlung.
            </p>
          </div>

          {users.length === 0 ? (
            <p className="px-6 py-5 text-sm font-semibold text-zinc-600">
              {readOnlyNotice
                ? "Keine User geladen."
                : "Noch keine User vorhanden."}
            </p>
          ) : (
            <div className="divide-y divide-zinc-950/5">
              {users.map((user) => {
                const isSelf = currentUserId === user.userId;
                const isAdminRole = user.role === "admin";
                return (
                  <div
                    key={user.userId}
                    className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-end"
                  >
                    <label className="block min-w-0 flex-1">
                      <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                        E-Mail
                      </span>
                      <input
                        type="email"
                        value={user.email}
                        disabled={!canSave}
                        onChange={(event) =>
                          patchUser(user.userId, {
                            email: event.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-2xl bg-gray-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700 disabled:opacity-60"
                      />
                    </label>

                    <label className="block w-full shrink-0 lg:w-28">
                      <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                        Credits
                      </span>
                      {isAdminRole ? (
                        <p className="mt-1 rounded-2xl bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-500 ring-1 ring-zinc-950/10">
                          —
                        </p>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          value={user.credits}
                          disabled={!canSave}
                          onChange={(event) => {
                            const next = Number(event.target.value);
                            patchUser(user.userId, {
                              credits:
                                Number.isFinite(next) && next >= 0
                                  ? Math.floor(next)
                                  : 0,
                            });
                          }}
                          className="mt-1 w-full rounded-2xl bg-gray-100 px-3 py-2 text-sm font-extrabold tabular-nums text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700 disabled:opacity-60"
                        />
                      )}
                    </label>

                    <label className="block w-full shrink-0 lg:w-44">
                      <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                        Paket / Rolle
                      </span>
                      <select
                        value={user.role}
                        disabled={!canSave}
                        onChange={(event) =>
                          patchUser(user.userId, {
                            role: event.target
                              .value as UserAdminRow["role"],
                          })
                        }
                        className="mt-1 w-full rounded-2xl bg-gray-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700 disabled:opacity-60"
                      >
                        {USER_ROLE_OPTIONS.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="flex shrink-0 gap-2 self-end">
                      <button
                        type="button"
                        disabled={pending || deletePending}
                        title="Buchungs- und Promo-Verlauf"
                        onClick={() => {
                          void openHistory(user);
                        }}
                        className="inline-flex size-11 items-center justify-center rounded-full bg-white text-zinc-800 ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out hover:bg-gray-100 disabled:opacity-40"
                      >
                        <History className="size-4" aria-hidden />
                        <span className="sr-only">
                          Verlauf für {user.email}
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={
                          !canSave || isSelf || pending || deletePending
                        }
                        title={
                          isSelf
                            ? "Eigenes Konto kann hier nicht gelöscht werden"
                            : "User löschen"
                        }
                        onClick={() => setDeleteTarget(user)}
                        className="inline-flex size-11 items-center justify-center rounded-full bg-white text-orange-800 ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out hover:bg-orange-50 disabled:opacity-40"
                      >
                        <Trash2 className="size-4" aria-hidden />
                        <span className="sr-only">
                          {user.email} löschen
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {fieldError ? (
          <p className="text-sm font-semibold text-orange-800">{fieldError}</p>
        ) : null}

        <button
          type="submit"
          disabled={!canSave || pending || deletePending}
          className={cn(
            "inline-flex rounded-full bg-orange-700 px-6 py-3 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800",
            (!canSave || pending || deletePending) && "opacity-70",
          )}
        >
          {pending ? "Speichert …" : "Speichern"}
        </button>
      </form>

      <UserBillingHistoryDialog
        open={Boolean(historyUser)}
        email={historyUser?.email ?? ""}
        pending={historyPending}
        bookings={historyBookings}
        promos={historyPromos}
        onClose={() => setHistoryUser(null)}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        title="User löschen?"
        description={
          deleteTarget
            ? `Der Account „${deleteTarget.email}“ wird endgültig aus Supabase Auth entfernt. Rolle, Credits, Buchungen, Meine-Welt-Profile und zugehörige App-Daten entfallen. Das lässt sich nicht rückgängig machen.`
            : ""
        }
        confirmLabel="Endgültig löschen"
        pending={deletePending}
        onCancel={() => {
          if (!deletePending) setDeleteTarget(null);
        }}
        onConfirm={() => {
          void handleConfirmDelete();
        }}
      />
    </>
  );
}

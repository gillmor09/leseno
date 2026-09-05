"use client";

import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteUserAdminAction,
  saveUsersAdminAction,
} from "@/app/actions/user-admin";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { USER_ROLE_OPTIONS, type UserAdminRow } from "@/lib/users/catalog";
import { cn } from "@/lib/utils";

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

  function patchUser(
    userId: string,
    patch: Partial<Pick<UserAdminRow, "email" | "role" | "credits">>,
  ) {
    setUsers((current) =>
      current.map((user) =>
        user.userId === userId ? { ...user, ...patch } : user,
      ),
    );
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
              Neue Registrierungen starten automatisch mit der Rolle Basis und
              den Credits aus dem Basis-Paket. Löschen entfernt den Account in
              Supabase Auth inklusive zugehöriger App-Daten.
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
                    </label>

                    <label className="block w-full shrink-0 lg:w-44">
                      <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                        Rolle
                      </span>
                      <select
                        value={user.role}
                        disabled={!canSave}
                        onChange={(event) =>
                          patchUser(user.userId, {
                            role: event.target.value as UserAdminRow["role"],
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

                    <button
                      type="button"
                      disabled={!canSave || isSelf || pending || deletePending}
                      title={
                        isSelf
                          ? "Eigenes Konto kann hier nicht gelöscht werden"
                          : "User löschen"
                      }
                      onClick={() => setDeleteTarget(user)}
                      className="inline-flex size-11 shrink-0 items-center justify-center self-end rounded-full bg-white text-orange-800 ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out hover:bg-orange-50 disabled:opacity-40"
                    >
                      <Trash2 className="size-4" aria-hidden />
                      <span className="sr-only">
                        {user.email} löschen
                      </span>
                    </button>
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

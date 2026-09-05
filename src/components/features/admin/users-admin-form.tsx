"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { saveUsersAdminAction } from "@/app/actions/user-admin";
import { USER_ROLE_OPTIONS, type UserAdminRow } from "@/lib/users/catalog";
import { cn } from "@/lib/utils";

function formatCreatedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("de-DE", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

export function UsersAdminForm({
  users: initialUsers,
  canSave = true,
  readOnlyNotice = null,
}: {
  users: UserAdminRow[];
  canSave?: boolean;
  readOnlyNotice?: string | null;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  function patchUser(
    userId: string,
    field: "email" | "role",
    value: string,
  ) {
    setUsers((current) =>
      current.map((user) =>
        user.userId === userId ? { ...user, [field]: value } : user,
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

  return (
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
            Neue Registrierungen starten automatisch mit der Rolle Basis.
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
            {users.map((user) => (
              <div
                key={user.userId}
                className="grid gap-4 px-6 py-5 sm:grid-cols-[minmax(0,1.4fr)_8rem_12rem]"
              >
                <div className="grid gap-2">
                  <label className="block">
                    <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                      E-Mail
                    </span>
                    <input
                      type="email"
                      value={user.email}
                      disabled={!canSave}
                      onChange={(event) =>
                        patchUser(user.userId, "email", event.target.value)
                      }
                      className="mt-1 w-full rounded-2xl bg-gray-100 px-3 py-2 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700 disabled:opacity-60"
                    />
                  </label>
                  <p className="text-xs text-zinc-500">
                    Angelegt am {formatCreatedAt(user.createdAt)}
                  </p>
                </div>

                <div>
                  <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                    Credits
                  </span>
                  <p className="mt-1 rounded-2xl bg-gray-100 px-3 py-2 text-sm font-extrabold text-zinc-950 ring-1 ring-zinc-950/10">
                    {user.credits}
                  </p>
                </div>

                <label className="block">
                  <span className="text-xs font-bold tracking-wide text-zinc-500 uppercase">
                    Rolle
                  </span>
                  <select
                    value={user.role}
                    disabled={!canSave}
                    onChange={(event) =>
                      patchUser(user.userId, "role", event.target.value)
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
              </div>
            ))}
          </div>
        )}
      </section>

      {fieldError ? (
        <p className="text-sm font-semibold text-orange-800">{fieldError}</p>
      ) : null}

      <button
        type="submit"
        disabled={!canSave || pending}
        className={cn(
          "inline-flex rounded-full bg-orange-700 px-6 py-3 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800",
          (!canSave || pending) && "opacity-70",
        )}
      >
        {pending ? "Speichert …" : "Speichern"}
      </button>
    </form>
  );
}

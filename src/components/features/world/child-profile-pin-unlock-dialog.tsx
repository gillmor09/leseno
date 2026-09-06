"use client";

/**
 * Dialog to unlock a PIN-protected child profile (Eltern-PIN).
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { unlockChildProfilePinAction } from "@/app/actions/user-world";

type ChildProfilePinUnlockDialogProps = {
  open: boolean;
  profileId: string;
  profileName: string;
  onCancel: () => void;
  onUnlocked: () => void;
};

export function ChildProfilePinUnlockDialog({
  open,
  profileId,
  profileName,
  onCancel,
  onUnlocked,
}: ChildProfilePinUnlockDialogProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setPin("");
    setError(null);
    setPending(false);
  }, [open, profileId]);

  useEffect(() => {
    if (!open || pending) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onCancel]);

  if (!open || !mounted) return null;

  async function handleSubmit() {
    setPending(true);
    setError(null);
    const result = await unlockChildProfilePinAction({ profileId, pin });
    setPending(false);
    if (!result.success) {
      setError(result.error ?? "Entsperren fehlgeschlagen.");
      return;
    }
    onUnlocked();
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-pin-unlock-title"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!pending) onCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-zinc-950/10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2
            id="profile-pin-unlock-title"
            className="text-xl font-extrabold text-zinc-950"
          >
            Eltern-PIN
          </h2>
          <button
            type="button"
            disabled={pending}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-all duration-200 ease-in-out hover:bg-gray-100 hover:text-zinc-950 disabled:opacity-50"
            onClick={onCancel}
          >
            <X className="size-5" aria-hidden />
            <span className="sr-only">Schließen</span>
          </button>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600">
          Das Profil „{profileName}“ ist geschützt. Bitte gib die Eltern-PIN
          ein, um fortzufahren.
        </p>
        <label className="mt-5 block space-y-1.5">
          <span className="text-xs font-bold tracking-wide text-zinc-600 uppercase">
            PIN
          </span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={pin}
            disabled={pending}
            onChange={(event) => setPin(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder="4–8 Ziffern"
            className="w-full rounded-2xl border-0 bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-950/10"
          />
        </label>
        {error ? (
          <p className="mt-3 text-sm font-semibold text-orange-800">{error}</p>
        ) : null}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            disabled={pending || !/^\d{4,8}$/.test(pin.trim())}
            onClick={() => void handleSubmit()}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800 disabled:opacity-70"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            Entsperren
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

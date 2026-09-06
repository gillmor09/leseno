"use client";

/**
 * Optional parent PIN settings on an existing child profile.
 */

import { useState } from "react";
import { Loader2, Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";
import {
  lockChildProfilePinAction,
  removeChildProfilePinAction,
  setChildProfilePinAction,
} from "@/app/actions/user-world";
import { cn } from "@/lib/utils";

type ChildProfilePinSettingsProps = {
  profileId: string;
  hasPin: boolean;
  onHasPinChange: (hasPin: boolean) => void;
  onLocked?: () => void;
};

export function ChildProfilePinSettings({
  profileId,
  hasPin,
  onHasPinChange,
  onLocked,
}: ChildProfilePinSettingsProps) {
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSetPin() {
    setPending(true);
    const result = await setChildProfilePinAction({
      profileId,
      pin,
      pinConfirm,
      currentPin: hasPin ? currentPin : undefined,
    });
    setPending(false);
    if (!result.success) {
      toast.error(result.error ?? "PIN speichern fehlgeschlagen.");
      return;
    }
    toast.success(hasPin ? "PIN geändert." : "Eltern-PIN aktiv.");
    setPin("");
    setPinConfirm("");
    setCurrentPin("");
    onHasPinChange(true);
  }

  async function handleRemovePin() {
    setPending(true);
    const result = await removeChildProfilePinAction({
      profileId,
      currentPin,
    });
    setPending(false);
    if (!result.success) {
      toast.error(result.error ?? "PIN entfernen fehlgeschlagen.");
      return;
    }
    toast.success("Eltern-PIN entfernt.");
    setPin("");
    setPinConfirm("");
    setCurrentPin("");
    onHasPinChange(false);
  }

  async function handleLockNow() {
    setPending(true);
    const result = await lockChildProfilePinAction({ profileId });
    setPending(false);
    if (!result.success) {
      toast.error(result.error ?? "Sperren fehlgeschlagen.");
      return;
    }
    toast.success("Profil wieder gesperrt.");
    onLocked?.();
  }

  return (
    <section className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-yellow-400 text-zinc-950">
          {hasPin ? (
            <Lock className="size-5" aria-hidden />
          ) : (
            <LockOpen className="size-5" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
            Eltern-PIN
          </p>
          <h2 className="mt-1 text-xl font-extrabold text-zinc-950">
            {hasPin ? "Profil ist geschützt" : "Optional absichern"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            Mit einer PIN (4–8 Ziffern) können Kinder das Profil nicht einfach
            bearbeiten oder für persönliche Geschichten auswählen. Die PIN gilt
            nur für dieses Profil.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {hasPin ? (
          <label className="block space-y-1.5 sm:col-span-2">
            <span className="text-xs font-bold tracking-wide text-zinc-600 uppercase">
              Aktuelle PIN
            </span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={currentPin}
              disabled={pending}
              onChange={(event) => setCurrentPin(event.target.value)}
              placeholder="Zum Ändern oder Entfernen"
              className="w-full rounded-2xl border-0 bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-950/10"
            />
          </label>
        ) : null}
        <label className="block space-y-1.5">
          <span className="text-xs font-bold tracking-wide text-zinc-600 uppercase">
            {hasPin ? "Neue PIN" : "PIN"}
          </span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={pin}
            disabled={pending}
            onChange={(event) => setPin(event.target.value)}
            placeholder="4–8 Ziffern"
            className="w-full rounded-2xl border-0 bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-950/10"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-bold tracking-wide text-zinc-600 uppercase">
            PIN wiederholen
          </span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            value={pinConfirm}
            disabled={pending}
            onChange={(event) => setPinConfirm(event.target.value)}
            placeholder="Nochmals PIN"
            className="w-full rounded-2xl border-0 bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-950/10"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={
            pending ||
            !/^\d{4,8}$/.test(pin.trim()) ||
            pin.trim() !== pinConfirm.trim() ||
            (hasPin && !/^\d{4,8}$/.test(currentPin.trim()))
          }
          onClick={() => void handleSetPin()}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800 disabled:opacity-70",
          )}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          {hasPin ? "PIN ändern" : "PIN setzen"}
        </button>
        {hasPin ? (
          <>
            <button
              type="button"
              disabled={pending || !/^\d{4,8}$/.test(currentPin.trim())}
              onClick={() => void handleRemovePin()}
              className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-bold text-zinc-700 ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out hover:bg-gray-100 disabled:opacity-70"
            >
              PIN entfernen
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => void handleLockNow()}
              className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-bold text-orange-800 ring-1 ring-orange-700/20 transition-all duration-200 ease-in-out hover:bg-orange-50 disabled:opacity-70"
            >
              Jetzt sperren
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}

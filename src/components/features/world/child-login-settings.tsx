"use client";

/**
 * Child Kennung + password set/change/clear (parent Meine Welt).
 */

import { useEffect, useState } from "react";
import { Copy, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  checkChildLoginCodeAction,
  clearChildLoginPasswordAction,
  setChildLoginCodeAction,
  setChildLoginPasswordAction,
} from "@/app/actions/user-world";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { HelpTitleRow } from "@/components/features/help/help-trigger";
import { cn } from "@/lib/utils";

type LoginCodeStatus = "idle" | "checking" | "available" | "taken" | "invalid";

type ChildLoginSettingsProps = {
  profileId: string;
  loginCode: string | null;
  hasPassword: boolean;
  onHasPasswordChange: (hasPassword: boolean) => void;
  onLoginCodeChange?: (loginCode: string) => void;
};

export function ChildLoginSettings({
  profileId,
  loginCode,
  hasPassword,
  onHasPasswordChange,
  onLoginCodeChange,
}: ChildLoginSettingsProps) {
  const [codeDraft, setCodeDraft] = useState(loginCode ?? "");
  const [savedCode, setSavedCode] = useState(loginCode ?? "");
  const [loginCodeStatus, setLoginCodeStatus] =
    useState<LoginCodeStatus>("idle");
  const [loginCodeMessage, setLoginCodeMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [pendingCode, setPendingCode] = useState(false);
  const [pendingPassword, setPendingPassword] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  const pending = pendingCode || pendingPassword;
  const codeDirty =
    codeDraft.trim().toLowerCase() !== savedCode.trim().toLowerCase();

  useEffect(() => {
    setCodeDraft(loginCode ?? "");
    setSavedCode(loginCode ?? "");
    setLoginCodeStatus("idle");
    setLoginCodeMessage(null);
  }, [profileId, loginCode]);

  async function handleCopyCode() {
    const value = savedCode.trim() || codeDraft.trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Kennung kopiert.");
    } catch {
      toast.error("Kopieren hat nicht geklappt.");
    }
  }

  async function handleLoginCodeBlur() {
    const code = codeDraft.trim();
    if (!code) {
      setLoginCodeStatus("idle");
      setLoginCodeMessage(null);
      return;
    }
    if (!codeDirty) {
      setLoginCodeStatus("idle");
      setLoginCodeMessage(null);
      return;
    }

    setLoginCodeStatus("checking");
    setLoginCodeMessage(null);
    const result = await checkChildLoginCodeAction({
      loginCode: code,
      excludeProfileId: profileId,
    });
    if (!result.success || !result.data) {
      setLoginCodeStatus("invalid");
      setLoginCodeMessage(result.error ?? "Kennung ungültig.");
      return;
    }
    if (!result.data.available) {
      setLoginCodeStatus("taken");
      setLoginCodeMessage("Diese Kennung ist schon vergeben.");
      return;
    }
    setLoginCodeStatus("available");
    setLoginCodeMessage("Kennung ist frei.");
  }

  async function handleSaveCode() {
    if (!codeDirty) return;
    setPendingCode(true);
    const result = await setChildLoginCodeAction({
      profileId,
      loginCode: codeDraft,
    });
    setPendingCode(false);
    if (!result.success || !result.data) {
      toast.error(result.error ?? "Kennung speichern fehlgeschlagen.");
      setLoginCodeStatus("taken");
      setLoginCodeMessage(result.error ?? "Kennung speichern fehlgeschlagen.");
      return;
    }
    const next = result.data.loginCode;
    setSavedCode(next);
    setCodeDraft(next);
    setLoginCodeStatus("idle");
    setLoginCodeMessage(null);
    onLoginCodeChange?.(next);
    toast.success("Kennung gespeichert.");
  }

  async function handleSetPassword() {
    setPendingPassword(true);
    const result = await setChildLoginPasswordAction({
      profileId,
      password,
      passwordConfirm,
    });
    setPendingPassword(false);
    if (!result.success) {
      toast.error(result.error ?? "Passwort speichern fehlgeschlagen.");
      return;
    }
    toast.success(
      hasPassword ? "Passwort geändert." : "Kind-Login ist aktiv.",
    );
    setPassword("");
    setPasswordConfirm("");
    onHasPasswordChange(true);
  }

  async function handleClearPassword() {
    setPendingPassword(true);
    const result = await clearChildLoginPasswordAction({ profileId });
    setPendingPassword(false);
    if (!result.success) {
      toast.error(result.error ?? "Passwort entfernen fehlgeschlagen.");
      return;
    }
    toast.success("Kind-Login-Passwort entfernt.");
    setClearOpen(false);
    onHasPasswordChange(false);
  }

  return (
    <section className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-10 items-center justify-center rounded-2xl bg-orange-50 text-orange-800 ring-1 ring-orange-700/10">
          <KeyRound className="size-5" aria-hidden />
        </span>
        <div>
          <HelpTitleRow
            title="Kind-Login"
            slotId="kind-login"
            as="h2"
            titleClassName="text-lg font-extrabold text-zinc-950"
          />
          <p className="mt-1 text-sm leading-relaxed text-zinc-600">
            Mit Kennung und Passwort meldet sich dein Kind selbst an — ohne
            E-Mail und ohne Zugriff auf Meine Welt. Ohne Passwort bleibt der
            Kind-Login aus.
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <div>
          <label className="block">
            <span className="text-sm font-bold text-zinc-800">Kennung</span>
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={codeDraft}
              onChange={(event) => {
                setCodeDraft(event.target.value);
                setLoginCodeStatus("idle");
                setLoginCodeMessage(null);
              }}
              onBlur={() => {
                void handleLoginCodeBlur();
              }}
              className="mt-1.5 w-full rounded-2xl border-0 bg-gray-100 px-4 py-3 font-mono text-sm font-semibold tracking-wide text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:ring-2 focus:ring-orange-700/40"
              placeholder="z. B. leo"
            />
          </label>
          {loginCodeStatus === "checking" ? (
            <p className="mt-1.5 text-xs font-semibold text-zinc-500">
              Prüft Kennung …
            </p>
          ) : loginCodeMessage ? (
            <p
              className={cn(
                "mt-1.5 text-xs font-semibold",
                loginCodeStatus === "available"
                  ? "text-green-800"
                  : "text-orange-800",
              )}
            >
              {loginCodeMessage}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={
                pending ||
                !codeDirty ||
                codeDraft.trim().length < 4 ||
                loginCodeStatus === "taken" ||
                loginCodeStatus === "invalid" ||
                loginCodeStatus === "checking"
              }
              onClick={() => void handleSaveCode()}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800",
                pendingCode && "opacity-70",
              )}
            >
              {pendingCode ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              Kennung speichern
            </button>
            {savedCode ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => void handleCopyCode()}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-zinc-700 ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out hover:bg-gray-50"
              >
                <Copy className="size-3.5" aria-hidden />
                Kopieren
              </button>
            ) : null}
          </div>
        </div>

        <label className="block">
          <span className="text-sm font-bold text-zinc-800">
            {hasPassword ? "Neues Passwort" : "Passwort setzen"}
          </span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1.5 w-full rounded-2xl border-0 bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:ring-2 focus:ring-orange-700/40"
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold text-zinc-800">
            Passwort wiederholen
          </span>
          <input
            type="password"
            autoComplete="new-password"
            value={passwordConfirm}
            onChange={(event) => setPasswordConfirm(event.target.value)}
            className="mt-1.5 w-full rounded-2xl border-0 bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:ring-2 focus:ring-orange-700/40"
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={
              pending ||
              password.trim().length < 8 ||
              password !== passwordConfirm
            }
            onClick={() => void handleSetPassword()}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-full bg-orange-700 px-5 py-2.5 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800",
              pendingPassword && "opacity-70",
            )}
          >
            {pendingPassword ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {hasPassword ? "Passwort ändern" : "Passwort speichern"}
          </button>
          {hasPassword ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => setClearOpen(true)}
              className="inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-bold text-orange-800 ring-1 ring-orange-700/20 transition-all duration-200 ease-in-out hover:bg-orange-50"
            >
              Passwort entfernen
            </button>
          ) : null}
        </div>
      </div>

      <ConfirmDeleteDialog
        open={clearOpen}
        title="Kind-Login-Passwort entfernen?"
        description="Dein Kind kann sich danach nicht mehr mit Kennung und Passwort anmelden, bis du ein neues Passwort setzt. Die Kennung bleibt erhalten."
        confirmLabel="Passwort entfernen"
        pending={pendingPassword}
        onCancel={() => {
          if (!pendingPassword) setClearOpen(false);
        }}
        onConfirm={() => void handleClearPassword()}
      />
    </section>
  );
}

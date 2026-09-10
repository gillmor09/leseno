"use client";

/**
 * Two-step dialog to create a child profile: name/stage → Kennung/password.
 * Close via X (no Abbrechen). Primary footer action only.
 * Kennung is checked for uniqueness on blur (no autofill from name).
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  checkChildLoginCodeAction,
  createChildProfileOnboardingAction,
} from "@/app/actions/user-world";
import type { ChildProfile } from "@/lib/world/catalog";
import {
  STORY_SCHOOL_STAGES,
  type StorySchoolStageId,
} from "@/lib/stories/options";
import { cn } from "@/lib/utils";

type CreateChildProfileDialogProps = {
  open: boolean;
  /** First profile becomes the story-composer default. */
  makeDefault: boolean;
  onClose: () => void;
  onCreated: (profile: ChildProfile) => void;
};

type LoginCodeStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export function CreateChildProfileDialog({
  open,
  makeDefault,
  onClose,
  onCreated,
}: CreateChildProfileDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [displayName, setDisplayName] = useState("");
  const [schoolStage, setSchoolStage] =
    useState<StorySchoolStageId>("klasse_3");
  const [loginCode, setLoginCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [loginCodeStatus, setLoginCodeStatus] =
    useState<LoginCodeStatus>("idle");
  const [loginCodeMessage, setLoginCodeMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setDisplayName("");
    setSchoolStage("klasse_3");
    setLoginCode("");
    setPassword("");
    setPasswordConfirm("");
    setFieldError(null);
    setLoginCodeStatus("idle");
    setLoginCodeMessage(null);
    setPending(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open || pending) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onClose]);

  function goToLoginStep() {
    setFieldError(null);
    const name = displayName.trim();
    if (!name) {
      setFieldError("Bitte gib den Namen des Kindes ein.");
      return;
    }
    setStep(2);
  }

  async function handleLoginCodeBlur() {
    const code = loginCode.trim();
    if (!code) {
      setLoginCodeStatus("idle");
      setLoginCodeMessage(null);
      return;
    }

    setLoginCodeStatus("checking");
    setLoginCodeMessage(null);
    const result = await checkChildLoginCodeAction({ loginCode: code });
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

  async function handleCreate() {
    setFieldError(null);
    if (loginCodeStatus === "taken" || loginCodeStatus === "invalid") {
      setFieldError(
        loginCodeMessage ?? "Bitte eine andere Kennung wählen.",
      );
      return;
    }
    if (loginCodeStatus === "checking") {
      setFieldError("Kennung wird noch geprüft …");
      return;
    }

    setPending(true);
    if (loginCodeStatus !== "available") {
      const check = await checkChildLoginCodeAction({ loginCode });
      if (!check.success || !check.data) {
        setPending(false);
        setLoginCodeStatus("invalid");
        setLoginCodeMessage(check.error ?? "Kennung ungültig.");
        setFieldError(check.error ?? "Kennung ungültig.");
        return;
      }
      if (!check.data.available) {
        setPending(false);
        setLoginCodeStatus("taken");
        setLoginCodeMessage("Diese Kennung ist schon vergeben.");
        setFieldError("Diese Kennung ist schon vergeben.");
        return;
      }
      setLoginCodeStatus("available");
      setLoginCodeMessage("Kennung ist frei.");
    }

    const result = await createChildProfileOnboardingAction({
      displayName,
      schoolStage,
      loginCode,
      password,
      passwordConfirm,
      isDefault: makeDefault,
    });
    setPending(false);
    if (!result.success || !result.data) {
      setFieldError(result.error ?? "Anlegen hat nicht geklappt.");
      toast.error(result.error ?? "Anlegen hat nicht geklappt.");
      return;
    }
    toast.success("Profil angelegt.");
    onCreated(result.data.profile);
    onClose();
  }

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-child-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!pending) onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-zinc-950/10 sm:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold tracking-wide text-orange-700 uppercase">
              Schritt {step} von 2
            </p>
            <h2
              id="create-child-title"
              className="mt-1 text-xl font-extrabold text-zinc-950"
            >
              {step === 1 ? "Kind anlegen" : "Anmeldung fürs Kind"}
            </h2>
          </div>
          <button
            type="button"
            disabled={pending}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-all duration-200 ease-in-out hover:bg-gray-100 hover:text-zinc-950 disabled:opacity-50"
            onClick={onClose}
          >
            <X className="size-5" aria-hidden />
            <span className="sr-only">Schließen</span>
          </button>
        </div>

        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          {step === 1
            ? "Zuerst Name und Schulstufe — danach legst du die eigene Anmeldung fest."
            : "Mit Kennung und Passwort meldet sich dein Kind selbst an — ohne Zugriff auf Meine Welt."}
        </p>

        <form
          noValidate
          className="mt-6 space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (pending) return;
            if (step === 1) goToLoginStep();
            else void handleCreate();
          }}
        >
          {step === 1 ? (
            <>
              <label className="block">
                <span className="text-sm font-bold text-zinc-800">
                  Name des Kindes
                </span>
                <input
                  type="text"
                  autoFocus
                  maxLength={80}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="mt-1.5 w-full rounded-2xl border-0 bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:ring-2 focus:ring-orange-700/40"
                  placeholder="z. B. Leo"
                />
              </label>

              <div>
                <p className="text-sm font-bold text-zinc-800">Schulstufe</p>
                <div
                  className="mt-2 flex flex-wrap gap-2"
                  role="group"
                  aria-label="Schulstufe"
                >
                  {STORY_SCHOOL_STAGES.map((stage) => {
                    const active = schoolStage === stage.id;
                    return (
                      <button
                        key={stage.id}
                        type="button"
                        onClick={() => setSchoolStage(stage.id)}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-sm font-bold transition-all duration-200 ease-in-out",
                          active
                            ? "bg-yellow-400 text-zinc-950"
                            : "bg-gray-100 text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-white",
                        )}
                      >
                        {stage.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <>
              <label className="block">
                <span className="text-sm font-bold text-zinc-800">
                  Kennung (Benutzername)
                </span>
                <input
                  type="text"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  value={loginCode}
                  onChange={(event) => {
                    setLoginCode(event.target.value);
                    setLoginCodeStatus("idle");
                    setLoginCodeMessage(null);
                  }}
                  onBlur={() => {
                    void handleLoginCodeBlur();
                  }}
                  className="mt-1.5 w-full rounded-2xl border-0 bg-gray-100 px-4 py-3 font-mono text-sm font-semibold tracking-wide text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:ring-2 focus:ring-orange-700/40"
                  placeholder="z. B. leo"
                />
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
              </label>
              <label className="block">
                <span className="text-sm font-bold text-zinc-800">Passwort</span>
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
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setFieldError(null);
                  setStep(1);
                }}
                className="text-sm font-bold text-orange-800 underline-offset-2 hover:underline"
              >
                Zurück zu Name & Schulstufe
              </button>
            </>
          )}

          {fieldError ? (
            <p className="text-sm font-semibold text-orange-800">{fieldError}</p>
          ) : null}

          <button
            type="submit"
            disabled={
              pending ||
              (step === 2 &&
                (loginCodeStatus === "taken" ||
                  loginCodeStatus === "invalid" ||
                  loginCodeStatus === "checking"))
            }
            className={cn(
              "inline-flex w-full items-center justify-center gap-2 rounded-full bg-orange-700 px-5 py-3 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800",
              pending && "opacity-70",
            )}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {step === 1
              ? "Weiter"
              : pending
                ? "Legt an …"
                : "Profil anlegen"}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}

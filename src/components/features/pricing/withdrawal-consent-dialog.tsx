"use client";

/**
 * Pre-checkout consent for German digital-content withdrawal waiver (§ 356 BGB).
 * Close via X / Escape / outside click; primary action only when checked.
 */

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type WithdrawalConsentDialogProps = {
  open: boolean;
  pending?: boolean;
  title?: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: () => void;
};

export function WithdrawalConsentDialog({
  open,
  pending = false,
  title = "Bevor es weitergeht",
  confirmLabel = "Weiter zur Zahlung",
  onClose,
  onConfirm,
}: WithdrawalConsentDialogProps) {
  const titleId = useId();
  const consentId = useId();
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (!open) {
      setAgreed(false);
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open || pending) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
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
          <h2
            id={titleId}
            className="text-xl font-extrabold tracking-tight text-zinc-950"
          >
            {title}
          </h2>
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

        <p className="mt-3 text-sm leading-relaxed text-zinc-600">
          Leseno liefert digitale Inhalte und Zugang sofort nach erfolgreicher
          Zahlung. Dafür brauchen wir deine ausdrückliche Zustimmung zum
          vorzeitigen Beginn — sonst bleibt das gesetzliche Widerrufsrecht
          bestehen.
        </p>

        <label
          htmlFor={consentId}
          className={cn(
            "mt-5 flex cursor-pointer gap-3 rounded-2xl bg-gray-100 p-4 text-sm leading-relaxed text-zinc-800 ring-1 ring-zinc-950/10",
            pending && "cursor-not-allowed opacity-60",
          )}
        >
          <input
            id={consentId}
            type="checkbox"
            checked={agreed}
            disabled={pending}
            onChange={(event) => setAgreed(event.target.checked)}
            className="mt-1 size-4 shrink-0 rounded border-zinc-300 text-orange-700 focus:ring-orange-700"
          />
          <span>
            Ich stimme zu, dass Leseno mit der Ausführung des Vertrags (sofortiger
            Zugang zu Mitgliedschaft bzw. Credits und digitalen Inhalten) vor
            Ablauf der Widerrufsfrist beginnt. Mir ist bekannt, dass ich dadurch
            mein Widerrufsrecht für diese Leistungen verliere. Es gelten die{" "}
            <a
              href="/agb"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-orange-700 underline-offset-2 hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              AGB
            </a>{" "}
            und die{" "}
            <a
              href="/widerruf"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-orange-700 underline-offset-2 hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              Widerrufsbelehrung
            </a>
            .
          </span>
        </label>

        <button
          type="button"
          disabled={pending || !agreed}
          onClick={onConfirm}
          className={cn(
            "mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-orange-700 px-5 py-3 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800",
            (pending || !agreed) && "cursor-not-allowed opacity-60",
          )}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          {pending ? "Weiter…" : confirmLabel}
        </button>
      </div>
    </div>,
    document.body,
  );
}

"use client";

/**
 * Invisible honeypot + form start timestamp for bot protection.
 * Keep visually hidden; do not use `display:none` alone (some bots skip those).
 */

import { useId, useState } from "react";
import type { BotGuardClientPayload } from "@/lib/security/bot-guard";

export function useBotGuardFields() {
  const [website, setWebsite] = useState("");
  const [formStartedAt] = useState(() => Date.now());

  function getBotGuardPayload(): BotGuardClientPayload {
    return { website, formStartedAt };
  }

  return {
    website,
    setWebsite,
    formStartedAt,
    getBotGuardPayload,
  };
}

export function BotGuardFields({
  website,
  onWebsiteChange,
  formStartedAt,
}: {
  website: string;
  onWebsiteChange: (value: string) => void;
  formStartedAt: number;
}) {
  const id = useId();

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-[-10000px] top-auto h-px w-px overflow-hidden opacity-0"
    >
      <label htmlFor={`${id}-website`}>Website</label>
      <input
        id={`${id}-website`}
        name="website"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={website}
        onChange={(event) => onWebsiteChange(event.target.value)}
      />
      <input type="hidden" name="formStartedAt" value={String(formStartedAt)} readOnly />
    </div>
  );
}

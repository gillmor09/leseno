"use client";

/**
 * Client context: help texts for one member page (slot → title/html).
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { HelpTextMap } from "@/lib/help/types";

const HelpTextsContext = createContext<HelpTextMap>({});

export function HelpTextsProvider({
  texts,
  children,
}: {
  texts: HelpTextMap;
  children: ReactNode;
}) {
  const value = useMemo(() => texts, [texts]);
  return (
    <HelpTextsContext.Provider value={value}>
      {children}
    </HelpTextsContext.Provider>
  );
}

export function useHelpTexts(): HelpTextMap {
  return useContext(HelpTextsContext);
}

export function useHelpSlot(
  slotId: string,
): { title: string; htmlBody: string } | null {
  const texts = useHelpTexts();
  const entry = texts[slotId];
  if (!entry?.htmlBody?.trim()) return null;
  return entry;
}

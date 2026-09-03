"use client";

import { Toaster } from "sonner";

/** Client island for toasts — imported from the server root layout. */
export function AppToaster() {
  return <Toaster richColors position="top-center" />;
}

"use client";

import dynamic from "next/dynamic";

/**
 * Client wrapper so root layout (Server Component) can lazy-load the toaster
 * with `ssr: false` — Next forbids that option directly in Server Components.
 */
const AppToaster = dynamic(
  () =>
    import("@/components/ui/app-toaster").then((mod) => mod.AppToaster),
  { ssr: false },
);

export function LazyAppToaster() {
  return <AppToaster />;
}

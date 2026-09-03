import type { ReactNode } from "react";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";

/**
 * Shared layout for auth pages on the marketing side of the app.
 */
export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            {eyebrow}
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-600">
            {description}
          </p>
          <div className="mt-10">{children}</div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}

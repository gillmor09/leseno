/**
 * Skeleton while the Sachbuch list loads (was 20s+ with full kapitel blobs).
 */
export default function SachbuchAdminLoading() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="h-6 w-20 animate-pulse rounded-full bg-yellow-200" />
          <div className="mt-4 h-10 w-48 animate-pulse rounded-2xl bg-zinc-200" />
          <div className="mt-3 h-16 max-w-3xl animate-pulse rounded-2xl bg-zinc-100" />
          <div className="mt-8 space-y-3">
            <div className="h-20 animate-pulse rounded-3xl bg-white ring-1 ring-zinc-950/10" />
            <div className="h-20 animate-pulse rounded-3xl bg-white ring-1 ring-zinc-950/10" />
            <div className="h-20 animate-pulse rounded-3xl bg-white ring-1 ring-zinc-950/10" />
          </div>
          <p className="mt-6 text-sm font-semibold text-zinc-500">
            Sachbücher werden geladen …
          </p>
        </section>
      </main>
    </div>
  );
}

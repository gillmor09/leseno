export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <main className="w-full max-w-xl rounded-[2rem] bg-white p-10 shadow-xl ring-1 ring-zinc-950/10">
        <p className="text-sm font-bold tracking-wide text-orange-700 uppercase">
          Leseno
        </p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-950">
          Basis steht.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-zinc-600">
          Next.js App Router, TypeScript, Tailwind CSS v4, Supabase-Client und
          Cursor-Rules sind vorbereitet. Als Nächstes: Auth, Schema und erste
          Fachfunktionen.
        </p>
      </main>
    </div>
  );
}

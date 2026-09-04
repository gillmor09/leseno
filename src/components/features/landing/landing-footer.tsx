import Image from "next/image";

export function LandingFooter() {
  return (
    <footer className="bg-zinc-800 text-zinc-200">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/landing/vogel-hell.webp"
            alt=""
            width={36}
            height={36}
            className="size-9 rounded-full"
          />
          <div>
            <p className="text-lg font-extrabold tracking-tight text-white">
              leseno
            </p>
            <p className="text-sm text-zinc-400">
              Lesen, das zu dir gehört.
            </p>
          </div>
        </div>
        <p className="max-w-md text-sm leading-relaxed text-zinc-400">
          Für dich von 5 bis 10 — und für die Erwachsenen, die dich beim Lesen
          begleiten. Geschichten mit Wissen und Staunen, ohne albernen Kram.
        </p>
      </div>
    </footer>
  );
}

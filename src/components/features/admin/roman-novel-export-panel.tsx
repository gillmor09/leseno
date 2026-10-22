"use client";

/**
 * Export tab: Abnahmecheck, marketing, cover, PDF/ePub.
 * Formel-Tic: leftover chapter scrub (primary gate is per-scene in the pipeline).
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  generateNovelCoverAction,
  generateNovelMarketingAction,
  runNovelAbnahmeAction,
  saveNovelExportAction,
  startFormelTicScrubAction,
} from "@/app/actions/roman-novel";
import {
  buildNovelEpubBlob,
  buildNovelPdfBlob,
} from "@/lib/novel/export-build";
import { scanKapitelFormelTics } from "@/lib/novel/formel-tic-scrub";
import { romanCoverSizeLabel } from "@/lib/roman/cover-size";
import { NOVEL_KEYWORD_COUNT } from "@/lib/novel/export-meta";
import {
  ABNAHME_PASS_OVERALL_MIN,
  type NovelAbnahme,
  type NovelBundle,
} from "@/lib/novel/types";

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function padKeywords(list: string[]): string[] {
  const next = [...list.slice(0, NOVEL_KEYWORD_COUNT)];
  while (next.length < NOVEL_KEYWORD_COUNT) next.push("");
  return next;
}

const SCORE_LABELS: { key: keyof NovelAbnahme["scores"]; label: string }[] = [
  { key: "genre", label: "Genre" },
  { key: "tonalitaet", label: "Tonalität" },
  { key: "logik", label: "Logik" },
  { key: "dramaturgie", label: "Dramaturgie" },
  { key: "stil", label: "Stil" },
  { key: "versprechen", label: "Versprechen" },
];

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, (value / 10) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-bold text-zinc-700">{label}</span>
        <span className="tabular-nums text-zinc-900">{value}/10</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full bg-orange-600"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function AbnahmeResult({ abnahme }: { abnahme: NovelAbnahme }) {
  const when = abnahme.checkedAt
    ? new Date(abnahme.checkedAt).toLocaleString("de-DE")
    : "";
  return (
    <div className="space-y-4 rounded-xl bg-gray-50 p-4 ring-1 ring-zinc-950/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
            Gesamturteil
          </p>
          <p className="mt-0.5 text-2xl font-extrabold tabular-nums text-zinc-950">
            {abnahme.overall}
            <span className="text-base font-bold text-zinc-500">/10</span>
          </p>
        </div>
        <span
          className={
            abnahme.passed
              ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-900"
              : "rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800"
          }
        >
          {abnahme.passed ? "Bestanden" : "Nicht bestanden"}
        </span>
      </div>

      {abnahme.soundsLikeAi ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 ring-1 ring-red-200">
          Grundvoraussetzung verfehlt: klar nach KI klingend
          {abnahme.soundsLikeAiNotes
            ? ` — ${abnahme.soundsLikeAiNotes}`
            : "."}
        </p>
      ) : (
        <p className="text-xs text-emerald-800">
          KI-Klang-Gate ok · Menschlichkeit {abnahme.menschlichkeit}/10
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {SCORE_LABELS.map(({ key, label }) => (
          <ScoreBar key={key} label={label} value={abnahme.scores[key]} />
        ))}
      </div>

      <p className="leading-relaxed text-zinc-800">{abnahme.verdict}</p>

      {abnahme.strengths.length > 0 ? (
        <div>
          <p className="font-bold text-zinc-700">Stärken</p>
          <ul className="mt-1 list-disc pl-5 text-zinc-700">
            {abnahme.strengths.map((s, i) => (
              <li key={`s-${i}`}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {abnahme.weaknesses.length > 0 ? (
        <div>
          <p className="font-bold text-zinc-700">Schwächen</p>
          <ul className="mt-1 list-disc pl-5 text-zinc-700">
            {abnahme.weaknesses.map((s, i) => (
              <li key={`w-${i}`}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {abnahme.recommendations.length > 0 ? (
        <div>
          <p className="font-bold text-zinc-700">Empfehlungen</p>
          <ul className="mt-1 list-disc pl-5 text-zinc-700">
            {abnahme.recommendations.map((s, i) => (
              <li key={`r-${i}`}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-[11px] text-zinc-500">
        Lektor {abnahme.modelSlug}
        {when ? ` · ${when}` : ""} · Bestanden ab Gesamt ≥{" "}
        {ABNAHME_PASS_OVERALL_MIN} und ohne KI-Klang
      </p>
    </div>
  );
}

export function RomanNovelExportPanel({
  bundle,
  canSave,
  onBundle,
  onJobStarted,
  jobRunning,
}: {
  bundle: NovelBundle;
  canSave: boolean;
  onBundle: (next: NovelBundle) => void;
  onJobStarted?: () => void;
  /** True while any novel job is active. */
  jobRunning?: boolean;
}) {
  const [subtitle, setSubtitle] = useState(bundle.novel.subtitle);
  const [summary, setSummary] = useState(bundle.novel.summary);
  const [keywords, setKeywords] = useState(() =>
    padKeywords(bundle.novel.keywords),
  );
  const [autorName, setAutorName] = useState(bundle.novel.autorName);
  const [pending, setPending] = useState<
    "meta" | "cover" | "save" | "pdf" | "epub" | "abnahme" | "tic-scrub" | null
  >(null);

  const ticScan = useMemo(() => scanKapitelFormelTics(bundle), [bundle]);
  const scrubRunning =
    Boolean(jobRunning) &&
    bundle.novel.orchestratorStatus.phase === "formel_tic_scrub";

  useEffect(() => {
    setSubtitle(bundle.novel.subtitle);
    setSummary(bundle.novel.summary);
    setKeywords(padKeywords(bundle.novel.keywords));
    setAutorName(bundle.novel.autorName);
  }, [
    bundle.novel.id,
    bundle.novel.subtitle,
    bundle.novel.summary,
    bundle.novel.keywords,
    bundle.novel.autorName,
    bundle.novel.coverImageDataUrl,
  ]);

  const busy = Boolean(pending) || !canSave || Boolean(jobRunning);
  const hasCover = Boolean(bundle.novel.coverImageDataUrl?.trim());

  async function onFormelTicScrub() {
    if (busy) return;
    setPending("tic-scrub");
    try {
      const result = await startFormelTicScrubAction({
        novelId: bundle.novel.id,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Formel-Tic-Bereinigung fehlgeschlagen.");
        return;
      }
      onJobStarted?.();
      toast.success(
        `Formel-Tics: ${result.data.hitChapters} Kapitel (${result.data.hitTotal} Treffer) — läuft…`,
      );
    } finally {
      setPending(null);
    }
  }

  async function onAbnahme() {
    if (busy) return;
    setPending("abnahme");
    try {
      const result = await runNovelAbnahmeAction({
        novelId: bundle.novel.id,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Abnahmecheck fehlgeschlagen.");
        return;
      }
      onBundle(result.data.bundle);
      const a = result.data.abnahme;
      if (a.passed) {
        toast.success(`Abnahme bestanden (${a.overall}/10).`);
      } else if (a.soundsLikeAi) {
        toast.error("Abnahme nicht bestanden — klar nach KI klingend.");
      } else {
        toast.error(`Abnahme nicht bestanden (${a.overall}/10).`);
      }
    } finally {
      setPending(null);
    }
  }

  async function onGenerateMeta() {
    if (busy) return;
    setPending("meta");
    try {
      const result = await generateNovelMarketingAction({
        novelId: bundle.novel.id,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Texte fehlgeschlagen.");
        return;
      }
      onBundle(result.data.bundle);
      toast.success("Untertitel, Klappentext und Schlagwörter erzeugt.");
    } finally {
      setPending(null);
    }
  }

  async function onGenerateCover() {
    if (busy) return;
    setPending("cover");
    try {
      const result = await generateNovelCoverAction({
        novelId: bundle.novel.id,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Cover fehlgeschlagen.");
        return;
      }
      onBundle(result.data.bundle);
      toast.success(`Cover ${romanCoverSizeLabel()} (JPG) erzeugt.`);
    } finally {
      setPending(null);
    }
  }

  async function onSave() {
    if (busy) return;
    setPending("save");
    try {
      const result = await saveNovelExportAction({
        novelId: bundle.novel.id,
        subtitle,
        summary,
        keywords: keywords
          .map((k) => k.trim())
          .filter(Boolean)
          .slice(0, NOVEL_KEYWORD_COUNT),
        autorName,
      });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      onBundle(result.data.bundle);
      toast.success("Export-Texte gespeichert.");
    } finally {
      setPending(null);
    }
  }

  async function onPdf() {
    if (busy) return;
    setPending("pdf");
    try {
      const { blob, filename } = await buildNovelPdfBlob(bundle);
      downloadBlob(blob, filename);
      toast.success("PDF heruntergeladen (Cover + Titelei).");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "PDF-Export fehlgeschlagen.",
      );
    } finally {
      setPending(null);
    }
  }

  async function onEpub() {
    if (busy) return;
    setPending("epub");
    try {
      const { blob, filename } = await buildNovelEpubBlob(bundle);
      downloadBlob(blob, filename);
      toast.success("ePub heruntergeladen (Titelei, ohne Cover).");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "ePub-Export fehlgeschlagen.",
      );
    } finally {
      setPending(null);
    }
  }

  const abnahme = bundle.novel.abnahme;

  return (
    <div className="space-y-6 text-sm">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-extrabold text-zinc-950">Abnahmecheck</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Luna-Qualitätsprobe am fertigen Manuskript (Top-Down: Logik vor
              Stil; Abnahme ist Export-Check, kein Pipeline-Steuer).
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onAbnahme()}
            className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {pending === "abnahme" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {abnahme ? "Erneut prüfen" : "Abnahme starten"}
          </button>
        </div>
        {abnahme ? (
          <AbnahmeResult abnahme={abnahme} />
        ) : (
          <p className="text-zinc-500">
            Noch keine Abnahme — zuerst Manuskript fertigstellen, dann prüfen.
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-xl bg-amber-50/80 p-4 ring-1 ring-amber-200/70">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-extrabold text-amber-950">Formel-Tics</h3>
            <p className="mt-0.5 text-xs text-amber-900/80">
              Pro Szene greift das Tic-Gate schon nach dem Stilisten. Hier:
              Kapitel-Reste (z.&nbsp;B. Echo über Grenzen) nachwaschen, dann
              Abnahme erneut.
            </p>
          </div>
          <button
            type="button"
            disabled={busy || ticScan.length === 0}
            onClick={() => void onFormelTicScrub()}
            className="inline-flex items-center gap-2 rounded-full bg-amber-900 px-4 py-2 text-sm font-bold text-white hover:bg-amber-950 disabled:opacity-50"
          >
            {pending === "tic-scrub" || scrubRunning ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {scrubRunning
              ? "Bereinigung läuft…"
              : ticScan.length === 0
                ? "Keine Tics"
                : `Bereinigen (${ticScan.length} Kap.)`}
          </button>
        </div>
        {scrubRunning ? (
          <p className="text-xs font-bold text-amber-950">
            {bundle.novel.orchestratorStatus.label}
          </p>
        ) : null}
        {ticScan.length > 0 ? (
          <ul className="max-h-40 space-y-1 overflow-auto text-xs text-amber-950">
            {ticScan.map((row) => {
              const codes = [...new Set(row.hits.map((h) => h.code))].join(
                ", ",
              );
              return (
                <li key={`tic-${row.chapterNumber}`}>
                  Kap. {row.chapterNumber}: {codes} ({row.hits.length})
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-amber-900/70">
            Keine Formel-Tics im aktuellen Manuskript.
          </p>
        )}
      </section>

      <div className="border-t border-zinc-100 pt-4">
        <h3 className="font-extrabold text-zinc-950">Marketing &amp; Dateien</h3>
      </div>


      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onGenerateMeta()}
          className="inline-flex items-center gap-2 rounded-full bg-orange-700 px-4 py-2 text-sm font-bold text-white hover:bg-orange-800 disabled:opacity-50"
        >
          {pending === "meta" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          Texte generieren
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onGenerateCover()}
          className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {pending === "cover" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          Cover erzeugen
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onSave()}
          className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-gray-50 disabled:opacity-50"
        >
          {pending === "save" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          Speichern
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onPdf()}
          className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-gray-50 disabled:opacity-50"
        >
          {pending === "pdf" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          PDF
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onEpub()}
          className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-gray-50 disabled:opacity-50"
        >
          {pending === "epub" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          ePub
        </button>
      </div>

      <p className="text-xs text-zinc-500">
        Cover: {romanCoverSizeLabel()}, RGB, JPG · Modell gpt-image-2.5-sunburst
        · aus Zusammenfassung, genretypisch, mutig. PDF mit Cover + Titelei;
        ePub nur Titelei.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="font-bold text-zinc-700">Autor</span>
          <input
            value={autorName}
            onChange={(e) => setAutorName(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded-xl bg-gray-50 px-3 py-2 ring-1 ring-zinc-950/10"
          />
        </label>
        <label className="block">
          <span className="font-bold text-zinc-700">Untertitel</span>
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded-xl bg-gray-50 px-3 py-2 ring-1 ring-zinc-950/10"
          />
        </label>
      </div>

      <label className="block">
        <span className="font-bold text-zinc-700">
          Zusammenfassung (Klappe / Amazon)
        </span>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          disabled={busy}
          rows={6}
          className="mt-1 max-h-[30vh] w-full resize-y overflow-y-auto rounded-xl bg-gray-50 px-3 py-2 leading-relaxed ring-1 ring-zinc-950/10"
        />
      </label>

      <div>
        <p className="font-bold text-zinc-700">6 Schlagwörter</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {keywords.map((kw, i) => (
            <input
              key={`kw-${i}`}
              value={kw}
              onChange={(e) => {
                const next = [...keywords];
                next[i] = e.target.value;
                setKeywords(next);
              }}
              disabled={busy}
              placeholder={`Schlagwort ${i + 1}`}
              className="rounded-xl bg-gray-50 px-3 py-2 ring-1 ring-zinc-950/10"
            />
          ))}
        </div>
      </div>

      <div>
        <p className="font-bold text-zinc-700">Cover</p>
        {hasCover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bundle.novel.coverImageDataUrl}
            alt="Cover"
            className="mt-2 max-h-[40vh] w-auto rounded-xl ring-1 ring-zinc-950/10"
          />
        ) : (
          <p className="mt-2 text-zinc-500">
            Noch kein Cover — zuerst Texte, dann Cover erzeugen.
          </p>
        )}
      </div>
    </div>
  );
}

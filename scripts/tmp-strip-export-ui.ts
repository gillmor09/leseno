import { readFileSync, writeFileSync } from "node:fs";

const path = "src/components/features/admin/roman-novel-export-panel.tsx";
let s = readFileSync(path, "utf8");

const replacement = `  const abnahme = bundle.novel.abnahme;

  return (
    <div className="space-y-6 text-sm">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-extrabold text-zinc-950">Abnahmecheck</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Qualitätsprobe mit Draft-Tic-Gate und Craft-Klassen. Abnahme misst
              das Ergebnis — keine Nachschreib-Schleifen mehr.
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

      <div className="border-t border-zinc-100 pt-4">
        <h3 className="font-extrabold text-zinc-950">Marketing &amp; Dateien</h3>
      </div>
`;

const start = s.indexOf("  const abnahme = bundle.novel.abnahme;");
const end = s.indexOf(
  '      <div className="border-t border-zinc-100 pt-4">\n        <h3 className="font-extrabold text-zinc-950">Marketing &amp; Dateien</h3>\n      </div>',
);
if (start < 0 || end < 0) throw new Error(`markers ${start} ${end}`);

const endBlock =
  end +
  '      <div className="border-t border-zinc-100 pt-4">\n        <h3 className="font-extrabold text-zinc-950">Marketing &amp; Dateien</h3>\n      </div>'
    .length;

s = s.slice(0, start) + replacement + s.slice(endBlock);
writeFileSync(path, s);
console.log({
  fixesGone: !s.includes("Gezielte Fixes"),
  confirmGone: !s.includes("ConfirmDeleteDialog"),
  shortGone: !s.includes("shortPlan"),
});

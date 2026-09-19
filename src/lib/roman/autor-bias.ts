/**
 * Autor-Bias from character sheets: fixed reaction patterns + subtext.
 * Injected into Manuskript write/patch prompts so voices stay human and consistent.
 */

import type { RomanCharakter } from "@/lib/roman/types";

const CLIP_FIELD = 280;

function clip(s: string, max = CLIP_FIELD): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Build a binding bias / subtext block from Steckbriefe.
 * Empty string when no usable characters.
 */
export function formatAutorBiasFromCharaktere(
  list: RomanCharakter[],
): string {
  const rows = list.filter(
    (c) =>
      (c.name.trim().length >= 2 || c.rolle.trim().length >= 2) &&
      (c.wesenszuege.trim() ||
        c.schwaeche.trim() ||
        c.motivation.trim() ||
        c.sprachstil.trim() ||
        c.bogen.trim()),
  );
  if (!rows.length) return "";

  const blocks = rows.map((c, i) => {
    const label =
      c.name.trim() || c.rolle.trim() || `Figur ${i + 1}`;
    const lines: string[] = [`### ${label}`];
    if (c.rolle.trim()) lines.push(`Rolle: ${clip(c.rolle, 120)}`);
    if (c.wesenszuege.trim()) {
      lines.push(`Wesenszüge (Stimme/Verhalten): ${clip(c.wesenszuege)}`);
    }
    if (c.schwaeche.trim()) {
      lines.push(
        `Default unter Druck (Bias): Reagiert über „${clip(c.schwaeche, 160)}“ — nicht mit austauschbarer Genre-Reaktion.`,
      );
    }
    if (c.motivation.trim() && c.schwaeche.trim()) {
      lines.push(
        `Subtext: Will „${clip(c.motivation, 120)}“, zeigt aber oft die Schwäche — Gesagtes ≠ Gemeintes.`,
      );
    } else if (c.motivation.trim()) {
      lines.push(`Antrieb (kann unter Dialog liegen): ${clip(c.motivation)}`);
    }
    if (c.bogen.trim()) {
      lines.push(`Bogen (nicht überspringen): ${clip(c.bogen)}`);
    }
    if (c.sprachstil.trim()) {
      lines.push(`Sprachstil (Dialog/Innenstimme): ${clip(c.sprachstil)}`);
    }
    return lines.join("\n");
  });

  return `## Autor-Bias (verbindlich — persönliche Note)
Jede Figur behält ihre Bias-Reaktion und ihren Sprachstil. Keine geglätteten „kompetenten“ Allrounder.
${blocks.join("\n\n")}
Wenn Figuren handeln oder sprechen: Bias und Subtext sichtbar machen (Handlung, Dialogbruch, Innenleben) — nicht erklären.`;
}

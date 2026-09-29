/**
 * Catalog of public mini-games under /spiele (hub cards + metadata).
 * Keep UI chrome in `src/components/features/spiele`; game logic in `src/lib/spiele/<game>`.
 */

export type SpieleGameCard = {
  href: `/spiele/${string}`;
  title: string;
  eyebrow: string;
  blurb: string;
  accent: string;
  titleColor: string;
};

export const SPIELE_GAMES: readonly SpieleGameCard[] = [
  {
    href: "/spiele/memory",
    title: "Tier-Memory",
    eyebrow: "Gedächtnis",
    blurb:
      "Karten aufdecken und Tierpaare finden. Drei Schwierigkeitsstufen, Züge und Zeit.",
    accent: "bg-sky-50 ring-sky-200 hover:ring-sky-400",
    titleColor: "text-sky-950",
  },
  {
    href: "/spiele/escape",
    title: "Bibliothek-Escape",
    eyebrow: "Rätsel · Escape",
    blurb:
      "Vier Räume lösen: Suchsel, Reihenfolge, Zahlencode und Geheimwort — wie ein Escape Room.",
    accent: "bg-amber-50 ring-amber-200 hover:ring-amber-400",
    titleColor: "text-amber-950",
  },
  {
    href: "/spiele/bauwelt",
    title: "Bauwelt",
    eyebrow: "Bauen · Top-Seller",
    blurb:
      "Blöcke setzen und fünf Bau-Missionen nachbauen — der Kinder-Klassiker als Solo-Browsergame.",
    accent: "bg-emerald-50 ring-emerald-200 hover:ring-emerald-400",
    titleColor: "text-emerald-950",
  },
  {
    href: "/spiele/sternenlauf",
    title: "Sternenlauf",
    eyebrow: "Geschick · Phaser",
    blurb:
      "Spring über Hindernisse, sammle Sterne — Endlos-Parcours mit Tempo-Steigerung.",
    accent: "bg-orange-50 ring-orange-200 hover:ring-orange-400",
    titleColor: "text-orange-950",
  },
] as const;

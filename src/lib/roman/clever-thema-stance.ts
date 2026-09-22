/**
 * Clever erzählt: book-level Themen-Stance (pedagogical orientation).
 * One schema + three archetypes. Adventure stays; stance steers tone.
 */

export type CleverStanceArchetype =
  | "entdecken"
  | "digital_muendig"
  | "sozial_schuetzen";

export type CleverSensibilisierungsModus = "erleben" | "mitgeben";

export type CleverThemaStance = {
  archetype: CleverStanceArchetype;
  /** Child motivation we honor (not shame). */
  kindMotiv: string;
  /** What “smart / strong” looks like after the adventure. */
  orientierungsZiel: string;
  /** How orientation lands — never preach. */
  sensibilisierungsModus: CleverSensibilisierungsModus;
  darf: string[];
  mussNicht: string[];
  rotlinien: string[];
};

export type CleverStanceArchetypeMeta = {
  id: CleverStanceArchetype;
  label: string;
  help: string;
  preset: Omit<CleverThemaStance, "archetype">;
};

/** Three presets that cover classic knowledge, digital life, and social protection. */
export const CLEVER_STANCE_ARCHETYPES: readonly CleverStanceArchetypeMeta[] = [
  {
    id: "entdecken",
    label: "Entdecken",
    help: "Klassisches Wissens-Abenteuer: Staunen, Mitfiebern, Fakten erleben.",
    preset: {
      kindMotiv: "Neugier und Entdeckerlust — die Welt verstehen wollen",
      orientierungsZiel:
        "Am Ende weiß das Kind etwas Spannendes über das Thema und will mehr entdecken",
      sensibilisierungsModus: "erleben",
      darf: [
        "Abenteuer, Humor, Staunen",
        "Fachliches Wissen im Plot erleben",
        "Klare, freundliche Erkenntnis am Ende",
      ],
      mussNicht: [
        "Lehrbuch-Ton oder Vortrags-Absätze",
        "Angstmachen oder Schock-Effekte",
        "Erhobener Zeigefinger",
      ],
      rotlinien: [
        "Keine Pseudofakten",
        "Keine Grauen-Szenen ohne Altersbezug",
      ],
    },
  },
  {
    id: "digital_muendig",
    label: "Digital mündig",
    help: "Digitale Lebenswelt: Motivation würdigen, Orientierung als Skill — ohne Glamour-only und ohne Verbotspredigt.",
    preset: {
      kindMotiv:
        "Dazugehören, gesehen werden, mitspielen, kreativ sein, mitreden wollen",
      orientierungsZiel:
        "Selbstbestimmt und klug handeln können — ohne das Thema schlechtzureden",
      sensibilisierungsModus: "erleben",
      darf: [
        "Motivation und Spaß am Digitalen ernst nehmen",
        "Spannung und Abenteuer rund um digitale Situationen",
        "Kluge Moves als souveräne Lösung im Plot",
        "Freundlicher Empowerment-Ton",
      ],
      mussNicht: [
        "Plattformen pauschal verteufeln",
        "Alles als cool und risikofrei glänzen lassen",
        "Moralpredigt oder Verbotsparolen",
        "Angst- oder Scham-Ende",
      ],
      rotlinien: [
        "Keine detaillierten Anleitungen zu riskanten Tricks oder Umgehungen",
        "Keine realen Account-Namen / Marken-Hypes als Vorbild-Druck",
        "Keine sexualisierten oder extremen Online-Inhalte",
      ],
    },
  },
  {
    id: "sozial_schuetzen",
    label: "Sozial schützen",
    help: "Soziale Härtefälle (z. B. Mobbing): Schutz, Empathie, Handlungsmacht — ohne Scham und ohne Predigt.",
    preset: {
      kindMotiv:
        "Gesehen und fair behandelt werden wollen; dazugehören und sicher fühlen",
      orientierungsZiel:
        "Sich schützen, Hilfe holen und andere stärken können — als Stärke, nicht als Schwäche",
      sensibilisierungsModus: "erleben",
      darf: [
        "Empathie und Mut im Abenteuer",
        "Klare Hilfewege als souveräne Handlung",
        "Wertschätzung der Gefühle der Betroffenen",
      ],
      mussNicht: [
        "Victim-Blaming („selbst schuld“)",
        "Täter-Tricks detailliert nachspielbar machen",
        "Angst- oder Scham-Finale",
        "Erhobener Zeigefinger statt Handlungsmacht",
      ],
      rotlinien: [
        "Keine detaillierten Anleitungen für Mobbing oder Ausgrenzung",
        "Keine Verharmlosung von Gewalt oder Demütigung",
        "Härte der Szenen altersgerecht halten",
        "Hilfeholen immer als Stärke zeigen",
      ],
    },
  },
] as const;

const ARCHETYPE_IDS = new Set<string>(
  CLEVER_STANCE_ARCHETYPES.map((a) => a.id),
);

export function cleverStanceArchetypeMeta(
  id: CleverStanceArchetype,
): CleverStanceArchetypeMeta {
  return (
    CLEVER_STANCE_ARCHETYPES.find((a) => a.id === id) ??
    CLEVER_STANCE_ARCHETYPES[0]!
  );
}

/** Build a full stance from an archetype preset (optionally overridden). */
export function stanceFromArchetype(
  archetype: CleverStanceArchetype,
  overrides?: Partial<Omit<CleverThemaStance, "archetype">>,
): CleverThemaStance {
  const meta = cleverStanceArchetypeMeta(archetype);
  return {
    archetype,
    kindMotiv: overrides?.kindMotiv?.trim() || meta.preset.kindMotiv,
    orientierungsZiel:
      overrides?.orientierungsZiel?.trim() || meta.preset.orientierungsZiel,
    sensibilisierungsModus:
      overrides?.sensibilisierungsModus ?? meta.preset.sensibilisierungsModus,
    darf:
      overrides?.darf && overrides.darf.length > 0
        ? overrides.darf
        : [...meta.preset.darf],
    mussNicht:
      overrides?.mussNicht && overrides.mussNicht.length > 0
        ? overrides.mussNicht
        : [...meta.preset.mussNicht],
    rotlinien:
      overrides?.rotlinien && overrides.rotlinien.length > 0
        ? overrides.rotlinien
        : [...meta.preset.rotlinien],
  };
}

/**
 * Keyword heuristic: suggest archetype from the book theme title.
 * Mobbing → sozial_schuetzen; digital life → digital_muendig; else entdecken.
 */
export function suggestCleverStanceArchetype(thema: string): CleverStanceArchetype {
  const t = thema.trim().toLowerCase();
  if (!t) return "entdecken";

  if (
    /mobbing|cybermobbing|ausgrenz|hänsel|haensel|diskrimin|gewalt\s*unter\s*kind|bullying/.test(
      t,
    )
  ) {
    return "sozial_schuetzen";
  }

  if (
    /social\s*media|soziale\s*medien|instagram|tiktok|snapchat|whatsapp|influencer|gaming|metaverse|minecraf|fortnite|roblox|youtube|short[\s-]*form|shorts|creator|künstliche\s*intelligenz|kuenstliche\s*intelligenz|\bki\b|chatgpt|generative|smartphone|smartwatch|handy|bildschirmzeit|internet|digitale\s*welt|online/.test(
      t,
    )
  ) {
    return "digital_muendig";
  }

  return "entdecken";
}

/** Prefill stance for a new Clever book from its theme. */
export function buildCleverThemaStanceForThema(thema: string): CleverThemaStance {
  return stanceFromArchetype(suggestCleverStanceArchetype(thema));
}

function asStringList(raw: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const s = String(item ?? "")
      .trim()
      .slice(0, maxLen);
    if (!s) continue;
    out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** Tolerant parse from editorial jsonb. */
export function parseCleverThemaStanceField(
  raw: unknown,
): CleverThemaStance | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const arch = String(row.archetype ?? "").trim();
  if (!ARCHETYPE_IDS.has(arch)) return null;
  const archetype = arch as CleverStanceArchetype;
  const meta = cleverStanceArchetypeMeta(archetype);
  const modusRaw = String(row.sensibilisierungsModus ?? "").trim();
  const sensibilisierungsModus: CleverSensibilisierungsModus =
    modusRaw === "mitgeben" ? "mitgeben" : "erleben";

  return {
    archetype,
    kindMotiv:
      String(row.kindMotiv ?? "")
        .trim()
        .slice(0, 400) || meta.preset.kindMotiv,
    orientierungsZiel:
      String(row.orientierungsZiel ?? "")
        .trim()
        .slice(0, 400) || meta.preset.orientierungsZiel,
    sensibilisierungsModus,
    darf: (() => {
      const list = asStringList(row.darf, 8, 160);
      return list.length > 0 ? list : [...meta.preset.darf];
    })(),
    mussNicht: (() => {
      const list = asStringList(row.mussNicht, 8, 160);
      return list.length > 0 ? list : [...meta.preset.mussNicht];
    })(),
    rotlinien: (() => {
      const list = asStringList(row.rotlinien, 8, 200);
      return list.length > 0 ? list : [...meta.preset.rotlinien];
    })(),
  };
}

/**
 * Prompt block for Wissenssammler / Faktenchecker / Erzähler.
 * Empty string when stance is missing.
 */
export function formatCleverThemaStanceBrief(
  stance: CleverThemaStance | null | undefined,
): string {
  if (!stance) return "";
  const meta = cleverStanceArchetypeMeta(stance.archetype);
  const bullets = (items: string[]) =>
    items.map((s) => `– ${s}`).join("\n") || "– (keine)";

  const extraSchutz =
    stance.archetype === "sozial_schuetzen"
      ? [
          "Zusatz Sozial schützen:",
          "– Kein Victim-Blaming; Hilfeholen ist Stärke.",
          "– Keine nachspielbaren Täter-Tricks; Härte altersgerecht.",
        ].join("\n")
      : "";

  return [
    `# Themen-Haltung (verbindlich · ${meta.label})`,
    meta.help,
    ``,
    `Kind-Motiv (würdigen): ${stance.kindMotiv}`,
    `Orientierungsziel: ${stance.orientierungsZiel}`,
    `Sensibilisierung: ${stance.sensibilisierungsModus === "mitgeben" ? "freundlicher Impuls im Plot" : "als erlebte Handlung / Konsequenz im Abenteuer"} — nie predigen.`,
    ``,
    `Kernregeln für ALLE Clever-Kapitel:`,
    `– Abenteuer-Spannung und Spaß bleiben Pflicht.`,
    `– Kind-Motiv wertschätzen, nicht beschämen.`,
    `– Sensibilisierung als souveräne Handlungsmacht im Plot — kein erhobener Zeigefinger.`,
    `– Ende mit Klarheit + Handlungsmacht, nicht mit Angst oder Scham.`,
    ``,
    `Darf:`,
    bullets(stance.darf),
    ``,
    `Muss nicht:`,
    bullets(stance.mussNicht),
    ``,
    `Rotlinien:`,
    bullets(stance.rotlinien),
    extraSchutz ? `\n${extraSchutz}` : "",
  ]
    .filter((line) => line !== undefined)
    .join("\n")
    .trim();
}

/** One-line list editor helper: newline-separated → string[]. */
export function parseStanceListText(text: string, maxItems = 8): string[] {
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^[-–•*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((s) => s.slice(0, 160));
}

export function formatStanceListText(items: string[]): string {
  return items.map((s) => s.trim()).filter(Boolean).join("\n");
}

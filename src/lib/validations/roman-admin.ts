import "@/lib/validations/configure-zod";
import { z, type ZodError } from "zod";

/** German field labels for the first Zod issue path (Roman admin toasts). */
const ROMAN_FIELD_LABELS: Record<string, string> = {
  title: "Titel",
  genre: "Genre",
  praemisse: "Prämisse",
  perspektive: "Perspektive",
  zeitform: "Zeitform",
  tonalitaet: "Tonalität",
  stilbibel: "Stilbibel",
  kiRegelwerk: "KI-Regelwerk",
  manuskriptRaw: "Outline/Manuskript",
  weltSchauplaetze: "Hauptschauplätze",
  weltRegeln: "Regeln & Grenzen",
  fanPersonaName: "Fan-Name",
  fanPersonaProfil: "Fan-Profil",
  userMessage: "Nachricht",
  reviewText: "Kritiktext",
  name: "Name",
  alter: "Alter",
  rolle: "Rolle",
  motivation: "Motivation",
  schwaeche: "Schwäche",
  bogen: "Bogen",
  sprachstil: "Sprachstil",
};

/**
 * First Zod issue as toast text, with field name when known.
 * Avoids the bare "Eingabe ist zu lang." without context.
 */
export function firstZodMessage(
  error: ZodError,
  fallback = "Angaben ungültig.",
): string {
  const issue = error.issues[0];
  if (!issue) return fallback;
  const path = issue.path.map(String);
  let label: string | null = null;
  if (path[0] === "charaktere" && path.length >= 3) {
    const field = ROMAN_FIELD_LABELS[path[2]] ?? path[2];
    label = `Figur ${Number(path[1]) + 1} · ${field}`;
  } else if (path[0] === "editorial" && path.length >= 2) {
    const last = path[path.length - 1]!;
    label = ROMAN_FIELD_LABELS[last] ?? `Editorial · ${last}`;
  } else if (path.length > 0) {
    label = ROMAN_FIELD_LABELS[path[0]!] ?? null;
  }
  const base = issue.message || fallback;
  if (issue.code === "too_big" && "maximum" in issue && issue.maximum != null) {
    const withMax = `${base.replace(/\.$/, "")} (max. ${String(issue.maximum)}).`;
    return label ? `${label}: ${withMax}` : withMax;
  }
  return label ? `${label}: ${base}` : base;
}

const charakterSchema = z.object({
  name: z.string().max(200),
  alter: z.string().max(80),
  rolle: z.string().max(200),
  wesenszuege: z.string().max(4000).optional().default(""),
  motivation: z.string().max(4000),
  schwaeche: z.string().max(4000),
  bogen: z.string().max(4000).optional().default(""),
  sprachstil: z.string().max(2000),
});

const szenenRasterSchema = z.object({
  szeneId: z.string().max(80),
  ort: z.string().max(500),
  figuren: z.string().max(1000),
  szenenziel: z.string().max(4000),
  emotionalStart: z.string().max(500),
  emotionalEnd: z.string().max(500),
  kapitelNr: z.number().int().min(1).max(500).optional(),
});

const editorialChecklistSchema = z.object({
  ideeKlar: z.boolean(),
  fundamentVoll: z.boolean(),
  regelnHart: z.boolean(),
  umfangGesetzt: z.boolean(),
  outlineGeprueft: z.boolean(),
  roadmapGeprueft: z.boolean(),
  stilStichprobe: z.boolean(),
  coverOk: z.boolean(),
  vorsatzOk: z.boolean(),
  readyToPublish: z.boolean(),
});

const romanGateChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(20_000),
});

const romanGateStateSchema = z.object({
  reviewedAt: z.string().max(80).nullable(),
  reviewText: z.string().max(50_000),
  freigegebenAt: z.string().max(80).nullable(),
  chat: z.array(romanGateChatMessageSchema).max(60).default([]),
});

export const romanEditorialSchema = z.object({
  buchTyp: z.enum([
    "unbekannt",
    "belletristik",
    "serie_welt",
    "sachbuch",
    "clever_erzaehlt",
  ]),
  ideeKurz: z.string().max(50_000),
  handlungsArchitektur: z.string().max(100_000),
  weltBibel: z.string().max(100_000),
  serienBibel: z.string().max(100_000),
  sachbuchStruktur: z.string().max(100_000),
  manuskriptText: z.string().max(500_000).default(""),
  klappentext: z.string().max(4_000).optional().default(""),
  einzeiler: z.string().max(120).optional().default(""),
  gates: z.object({
    idee: romanGateStateSchema,
    fundament: romanGateStateSchema,
    struktur: romanGateStateSchema,
    outline: romanGateStateSchema,
  }),
  zielAlterMin: z.number().int().min(0).max(120).nullable(),
  zielAlterMax: z.number().int().min(0).max(120).nullable(),
  lesestufe: z.string().max(500),
  zielWortzahlRoman: z.number().int().min(500).max(500_000).nullable(),
  zielWortzahlSzeneMin: z.number().int().min(100).max(20_000).nullable(),
  zielWortzahlSzeneMax: z.number().int().min(100).max(20_000).nullable(),
  cleverGeschichteMinuten: z
    .union([z.literal(5), z.literal(10), z.null()])
    .optional()
    .default(null),
  serieTitel: z.string().max(300),
  bandNr: z.number().int().min(1).max(99).nullable(),
  mehrteilerForm: z.enum([
    "unbekannt",
    "einzelband",
    "duologie",
    "trilogie",
    "serie",
  ]),
  mehrteilerNotizen: z.string().max(20_000),
  mehrteilerBeratung: z.string().max(50_000),
  grobRegeln: z.string().max(50_000).default(""),
  richtungen: z
    .array(z.string().max(40))
    .max(2)
    .optional()
    .default([]),
  harteRegeln: z.array(z.string().max(2000)).max(40),
  checklist: editorialChecklistSchema,
  marktanalyse: z
    .object({
      genre: z.string().max(120),
      zielgruppe: z.string().max(200),
      richtungen: z.array(z.string().max(80)).max(2).optional().default([]),
      scannedAt: z.string().max(80),
      books: z
        .array(
          z.object({
            title: z.string().max(200),
            author: z.string().max(120),
            whyPopular: z.string().max(500).default(""),
            critiquePoints: z.array(z.string().max(400)).max(5),
            strengthPoints: z
              .array(z.string().max(400))
              .max(5)
              .optional()
              .default([]),
            worstReviewsConsidered: z.number().int().min(1).max(20).optional(),
            bestReviewsConsidered: z.number().int().min(1).max(20).optional(),
          }),
        )
        .max(5),
      topCritiqueThemes: z.array(z.string().max(400)).max(5).default([]),
      neglectedNeed: z.string().max(2_000),
      topStrengthThemes: z
        .array(z.string().max(400))
        .max(5)
        .optional()
        .default([]),
      fulfilledNeed: z.string().max(2_000).optional().default(""),
      modelLabel: z.string().max(120).default(""),
      sources: z
        .array(
          z.object({
            title: z.string().max(200),
            uri: z.string().max(2_000),
          }),
        )
        .max(24)
        .optional(),
      searchSuggestionsHtml: z.string().max(50_000).optional(),
      webSearchQueries: z.array(z.string().max(500)).max(12).optional(),
    })
    .nullable()
    .optional()
    .default(null),
  reifegrade: z
    .record(
      z.string(),
      z.object({
        regelnPct: z.number().min(0).max(100),
        erfuelltesBeduerfnisPct: z.number().min(0).max(100),
        vernachlaessigtesBeduerfnisPct: z.number().min(0).max(100),
        stilPct: z.number().min(0).max(100).optional().default(0),
        dramaturgiePct: z.number().min(0).max(100).optional().default(0),
        leseflussPct: z.number().min(0).max(100).optional().default(0),
        gesamtPct: z.number().min(0).max(100),
        regelnStatus: z.enum(["nicht_erfuellt", "teilweise", "erfuellt"]),
        erfuelltesBeduerfnisStatus: z.enum([
          "nicht_erfuellt",
          "teilweise",
          "erfuellt",
        ]),
        vernachlaessigtesBeduerfnisStatus: z.enum([
          "nicht_erfuellt",
          "teilweise",
          "erfuellt",
        ]),
        stilStatus: z
          .enum(["nicht_erfuellt", "teilweise", "erfuellt"])
          .optional()
          .default("nicht_erfuellt"),
        dramaturgieStatus: z
          .enum(["nicht_erfuellt", "teilweise", "erfuellt"])
          .optional()
          .default("nicht_erfuellt"),
        leseflussStatus: z
          .enum(["nicht_erfuellt", "teilweise", "erfuellt"])
          .optional()
          .default("nicht_erfuellt"),
        freigabe: z.enum([
          "keine_freigabe",
          "freigabe_bedenken",
          "freigabe",
        ]),
        assessedAt: z.string().max(80),
        modelLabel: z.string().max(120),
      }),
    )
    .optional()
    .default({}),
  /** Manual Fertig flags per pipeline tab. */
  pipelineFertig: z
    .record(z.string(), z.boolean())
    .optional()
    .default({}),
  // Keep server-side / newer editorial keys (Leser-Feedback, Continuity, …)
  // from being stripped on Speichern.
}).passthrough();

/** Save foundation and/or manuscript — entry open at any stage. */
export const romanUpsertSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  title: z
    .string()
    .trim()
    .min(1, { message: "Titel angeben." })
    .max(200),
  manuskriptRaw: z.string().max(500_000),
  stilbibel: z.string().max(100_000),
  genre: z.string().max(200),
  praemisse: z.string().max(4000),
  perspektive: z.string().max(2000),
  zeitform: z.string().max(120),
  tonalitaet: z.string().max(2000),
  charaktere: z.array(charakterSchema).max(40),
  weltSchauplaetze: z.string().max(50_000),
  weltRegeln: z.string().max(50_000),
  szenenRaster: z.array(szenenRasterSchema).max(200),
  kiRegelwerk: z.string().max(50_000),
  fanPersonaName: z.string().max(200),
  fanPersonaProfil: z.string().max(20_000),
  editorial: romanEditorialSchema.optional(),
});

export const romanIdSchema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Roman-ID." }),
});

/** Generate cover from saved kontext + optional art direction. */
export const romanCoverGenerateSchema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Roman-ID." }),
  extraInstruction: z.string().max(2000).optional(),
});

export const romanCoverSaveSchema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Roman-ID." }),
  /** Optional; preferred path uses server-side pending stash from generate. */
  coverPrompt: z.string().max(20_000).optional(),
});

/** Generate Amazon Klappentext + Einzeiler from saved book materials. */
export const romanMarketingCopyGenerateSchema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Roman-ID." }),
});

/** Persist only Verkaufstexte (no full kontext upsert). */
export const romanMarketingCopySaveSchema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Roman-ID." }),
  klappentext: z.string().max(4_000),
  einzeiler: z.string().max(120),
});

const buchrueckenSchema = z.object({
  titelKurz: z.string().max(200),
  autorZeile: z.string().max(200),
  verlagZeile: z.string().max(200),
  gestaltungshinweise: z.string().max(8000),
});

const vorsatzSchema = z.object({
  titelseite: z.object({
    titel: z.string().max(300),
    untertitel: z.string().max(500),
    autor: z.string().max(200),
    imprint: z.string().max(200),
  }),
  impressum: z.object({
    jahr: z.string().max(20),
    rechteinhaber: z.string().max(300),
    hinweis: z.string().max(2000),
    disclaimer: z.string().max(4000),
  }),
  widmung: z.string().max(2000),
  motto: z.string().max(4000),
});

/** Generate spine + front matter from saved kontext. */
export const romanFrontMatterGenerateSchema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Roman-ID." }),
});

/** Persist spine + front matter after generate/edit. */
export const romanFrontMatterSaveSchema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Roman-ID." }),
  autorName: z.string().max(200),
  buchruecken: buchrueckenSchema,
  vorsatz: vorsatzSchema,
});

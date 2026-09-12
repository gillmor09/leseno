import "@/lib/validations/configure-zod";
import { z } from "zod";

const charakterSchema = z.object({
  name: z.string().max(200),
  alter: z.string().max(80),
  rolle: z.string().max(200),
  motivation: z.string().max(4000),
  schwaeche: z.string().max(4000),
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
  perspektive: z.string().max(200),
  zeitform: z.string().max(120),
  tonalitaet: z.string().max(2000),
  charaktere: z.array(charakterSchema).max(40),
  weltSchauplaetze: z.string().max(50_000),
  weltRegeln: z.string().max(50_000),
  szenenRaster: z.array(szenenRasterSchema).max(200),
  kiRegelwerk: z.string().max(50_000),
  fanPersonaName: z.string().max(200),
  fanPersonaProfil: z.string().max(20_000),
});

/** Phase 0 needs enough story raw material (manuscript and/or foundation). */
export const romanPhase0Schema = romanUpsertSchema.superRefine((data, ctx) => {
  const manuskript = data.manuskriptRaw.trim();
  const hasManuskript = manuskript.length >= 80;
  const hasFundament =
    data.praemisse.trim().length >= 20 ||
    data.szenenRaster.some((r) => r.szenenziel.trim().length >= 10) ||
    data.charaktere.some((c) => c.name.trim() && c.motivation.trim());

  if (!hasManuskript && !hasFundament) {
    ctx.addIssue({
      code: "custom",
      message:
        "Für Phase 0 brauchst du ein Manuskript (mind. ca. 80 Zeichen) oder Fundament (Prämisse / Figuren / Szenen-Raster).",
      path: ["manuskriptRaw"],
    });
  }
});

export const romanIdSchema = z.object({
  romanId: z.string().uuid({ message: "Ungültige Roman-ID." }),
});

export const szeneIdSchema = z.object({
  szeneId: z.string().uuid({ message: "Ungültige Szenen-ID." }),
});

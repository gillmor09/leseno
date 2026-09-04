import "@/lib/validations/configure-zod";
import { z } from "zod";

export const storyLengthLimitUpdateSchema = z.object({
  id: z.string().uuid({ message: "Ungültiger Datensatz." }),
  anzahlWoerter: z.coerce
    .number({ message: "Wortanzahl angeben." })
    .int({ message: "Wortanzahl muss ganzzahlig sein." })
    .min(1, { message: "Wortanzahl muss mindestens 1 sein." }),
  factCount: z.coerce
    .number({ message: "Faktenanzahl angeben." })
    .int({ message: "Faktenanzahl muss ganzzahlig sein." })
    .min(1, { message: "Faktenanzahl muss mindestens 1 sein." }),
});

export const storyLengthLimitsFormSchema = z.object({
  limits: z
    .array(storyLengthLimitUpdateSchema)
    .min(1, { message: "Keine Werte zum Speichern." }),
});

export type StoryLengthLimitsFormInput = z.input<
  typeof storyLengthLimitsFormSchema
>;

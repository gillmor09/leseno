import "@/lib/validations/configure-zod";
import { z } from "zod";

export const storyLengthLimitUpdateSchema = z
  .object({
    id: z.string().uuid({ message: "Ungültiger Datensatz." }),
    minWords: z.coerce
      .number({ message: "Mindestwortzahl angeben." })
      .int({ message: "Mindestwortzahl muss ganzzahlig sein." })
      .min(1, { message: "Mindestwortzahl muss mindestens 1 sein." }),
    factCount: z.coerce
      .number({ message: "Faktenanzahl angeben." })
      .int({ message: "Faktenanzahl muss ganzzahlig sein." })
      .min(1, { message: "Faktenanzahl muss mindestens 1 sein." }),
    maxWords: z.union([
      z.literal(""),
      z.null(),
      z.coerce
        .number({ message: "Höchstwortzahl angeben." })
        .int({ message: "Höchstwortzahl muss ganzzahlig sein." })
        .min(1, { message: "Höchstwortzahl muss mindestens 1 sein." }),
    ]),
  })
  .transform((value) => ({
    id: value.id,
    minWords: value.minWords,
    factCount: value.factCount,
    maxWords: value.maxWords === "" || value.maxWords === null ? null : value.maxWords,
  }))
  .refine((value) => value.maxWords === null || value.maxWords >= value.minWords, {
    message: "Höchstwortzahl muss mindestens so groß sein wie die Mindestwortzahl.",
    path: ["maxWords"],
  });

export const storyLengthLimitsFormSchema = z.object({
  limits: z.array(storyLengthLimitUpdateSchema).min(1, { message: "Keine Werte zum Speichern." }),
});

export type StoryLengthLimitsFormInput = z.input<typeof storyLengthLimitsFormSchema>;

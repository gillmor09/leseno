import "@/lib/validations/configure-zod";
import { z } from "zod";
import { botGuardInputSchema } from "@/lib/security/bot-guard";

const schoolStageSchema = z.enum([
  "vorschule",
  "klasse_1",
  "klasse_2",
  "klasse_3",
  "klasse_4",
  "hoeher",
]);

export const factWhySchema = botGuardInputSchema.extend({
  fact: z
    .string()
    .trim()
    .min(3, { message: "Der Fakt fehlt." })
    .max(500, { message: "Der Fakt ist zu lang." }),
  schoolStage: schoolStageSchema,
});

export const factWhyMoreSchema = factWhySchema.extend({
  background: z
    .string()
    .trim()
    .min(3, { message: "Der Hintergrund fehlt." })
    .max(8000, { message: "Der Hintergrund ist zu lang." }),
});

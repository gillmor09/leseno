import "@/lib/validations/configure-zod";
import { z } from "zod";

export const promptModelSchema = z.object({
  id: z.string().min(1, { message: "Modell-ID fehlt." }),
  label: z.string().trim().min(1, { message: "Modellname fehlt." }),
  provider: z.string().trim().min(1, { message: "Provider fehlt." }),
  modelSlug: z.string().trim().min(1, { message: "Model-Slug fehlt." }),
  supportsSystemPrompt: z.boolean(),
  supportsJsonOutput: z.boolean(),
  isActive: z.boolean(),
  notes: z.string().trim().nullable(),
});

export const promptTemplateSchema = z.object({
  id: z.string().min(1, { message: "Prompt-ID fehlt." }),
  key: z.string().min(1, { message: "Prompt-Key fehlt." }),
  label: z.string().trim().min(1, { message: "Prompt-Name fehlt." }),
  purpose: z.string().trim().min(1, { message: "Zweck fehlt." }),
  stageOrder: z.coerce.number().int().min(1),
  modelId: z.string().trim().nullable(),
  systemTemplate: z
    .string()
    .trim()
    .min(1, { message: "System-Prompt darf nicht leer sein." }),
  userTemplate: z
    .string()
    .trim()
    .min(1, { message: "User-Prompt darf nicht leer sein." }),
  placeholders: z.array(z.string().trim().min(1)).min(1, {
    message: "Mindestens ein Platzhalter angeben.",
  }),
  assemblyNotes: z.string().trim().nullable(),
  outputContract: z.string().trim().nullable(),
});

export const promptAdminFormSchema = z.object({
  models: z.array(promptModelSchema).min(1, { message: "Keine Modelle gefunden." }),
  prompts: z.array(promptTemplateSchema).min(1, {
    message: "Keine Prompt-Stufen gefunden.",
  }),
});

export const aiModelsFormSchema = z.object({
  models: z.array(promptModelSchema).min(1, { message: "Keine Modelle gefunden." }),
});

export const promptTemplatesFormSchema = z.object({
  prompts: z.array(promptTemplateSchema).min(1, {
    message: "Keine Prompt-Stufen gefunden.",
  }),
});

export type PromptAdminFormInput = z.input<typeof promptAdminFormSchema>;

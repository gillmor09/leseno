/**
 * Prompt-admin catalog for the two-stage story pipeline.
 * Templates are split by stage so the app can later assemble final prompts
 * from topic, school stage, mood, text length, word range, and fetched facts.
 */

export type AiModelConfig = {
  id: string;
  label: string;
  provider: string;
  modelSlug: string;
  supportsSystemPrompt: boolean;
  supportsJsonOutput: boolean;
  isActive: boolean;
  notes: string | null;
};

export type PromptTemplateConfig = {
  id: string;
  key: string;
  label: string;
  purpose: string;
  stageOrder: number;
  modelId: string | null;
  systemTemplate: string;
  userTemplate: string;
  placeholders: string[];
  assemblyNotes: string | null;
  outputContract: string | null;
};

export type PromptAdminCatalog = {
  models: AiModelConfig[];
  prompts: PromptTemplateConfig[];
};

export const FALLBACK_AI_MODELS: AiModelConfig[] = [
  {
    id: "facts-default",
    label: "Faktenmodell Standard",
    provider: "openai-compatible",
    modelSlug: "gpt-4.1-mini",
    supportsSystemPrompt: true,
    supportsJsonOutput: true,
    isActive: true,
    notes:
      "Sammelt belastbare Fakten. Später austauschbar gegen günstigere oder schnellere Modelle.",
  },
  {
    id: "story-default",
    label: "Geschichtenmodell Standard",
    provider: "openai-compatible",
    modelSlug: "gpt-4.1",
    supportsSystemPrompt: true,
    supportsJsonOutput: false,
    isActive: true,
    notes:
      "Formuliert aus Thema, Fakten und Auswahlfeldern die finale Geschichte.",
  },
];

export const FALLBACK_PROMPT_TEMPLATES: PromptTemplateConfig[] = [
  {
    id: "fallback-facts-research",
    key: "facts-research",
    label: "Fakten zum Thema",
    purpose: "Holt kindgerechte, korrekte Fakten passend zu Thema und Textlänge.",
    stageOrder: 1,
    modelId: "facts-default",
    systemTemplate:
      "Du bist ein sorgfältiger Recherche-Assistent für Bildungsinhalte. Gib ausschließlich sachlich korrekte Aussagen zurück. Halte sie präzise, altersgerecht und konkret.",
    userTemplate:
      "Thema: {{topic}}\nSchulstufe: {{school_stage}}\nGeschichts-Stimmung: {{story_mood}}\nTextlängen-Stufe: {{length_step}}\nGewünschte Faktenanzahl: {{fact_count}}\nGib {{fact_count}} kurze Fakten zurück, die korrekt, spezifisch und gut für eine Kindergeschichte verwendbar sind. Keine Duplikate. Wenn ein Fakt unsicher ist, lass ihn weg.",
    placeholders: [
      "topic",
      "school_stage",
      "story_mood",
      "length_step",
      "fact_count",
    ],
    assemblyNotes:
      "Der spätere Builder setzt hier Thema, Schulstufe, Stimmung und die aus der Textlänge abgeleitete Faktenanzahl ein.",
    outputContract: "Bevorzugt JSON-Liste oder klar trennbare Faktenzeilen.",
  },
  {
    id: "fallback-story-write",
    key: "story-write",
    label: "Geschichte ausformulieren",
    purpose:
      "Verarbeitet Thema, Auswahlfelder und recherchierte Fakten zu einer vollständigen Geschichte.",
    stageOrder: 2,
    modelId: "story-default",
    systemTemplate:
      "Du schreibst warmherzige, fantasievolle Geschichten auf Deutsch für Kinder. Baue die Fakten natürlich in die Geschichte ein und achte darauf, dass der Ton zur gewünschten Stimmung passt.",
    userTemplate:
      "Thema: {{topic}}\nSchulstufe: {{school_stage}}\nGeschichts-Stimmung: {{story_mood}}\nTextlängen-Stufe: {{length_step}}\nZiel-Wortspanne: {{target_word_range}}\nEinzubauende Fakten:\n{{facts_block}}\nSchreibe eine vollständige Geschichte auf Deutsch. Die Fakten sollen inhaltlich korrekt, fließend eingebettet und laut vorlesbar sein.",
    placeholders: [
      "topic",
      "school_stage",
      "story_mood",
      "length_step",
      "target_word_range",
      "facts_block",
    ],
    assemblyNotes:
      "Der spätere Builder übergibt hier die bereits geholten Fakten als Block und ergänzt die aus der DB geladene Wortspanne.",
    outputContract: "Lange, zusammenhängende Geschichte als Fließtext.",
  },
];

export const FALLBACK_PROMPT_ADMIN_CATALOG: PromptAdminCatalog = {
  models: FALLBACK_AI_MODELS,
  prompts: FALLBACK_PROMPT_TEMPLATES,
};

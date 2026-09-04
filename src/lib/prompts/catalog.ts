/**
 * Prompt-admin catalog for the story pipeline.
 * Stages: facts → (FLUX images || story) → Mistral layout with text wrap.
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
    provider: "gemini",
    modelSlug: "gemini-3.6-flash",
    supportsSystemPrompt: true,
    supportsJsonOutput: true,
    isActive: true,
    notes:
      "Sammelt belastbare Fakten über Gemini. Später austauschbar gegen andere Provider.",
  },
  {
    id: "story-default",
    label: "Geschichtenmodell Standard",
    provider: "gemini",
    modelSlug: "gemini-3.6-flash",
    supportsSystemPrompt: true,
    supportsJsonOutput: false,
    isActive: true,
    notes:
      "Formuliert aus Thema, Fakten und Auswahlfeldern die Geschichte als HTML.",
  },
  {
    id: "images-default",
    label: "Illustrationsmodell (FLUX.2)",
    provider: "ionos-image",
    modelSlug: "black-forest-labs/FLUX.2-klein-4B",
    supportsSystemPrompt: false,
    supportsJsonOutput: false,
    isActive: true,
    notes:
      "Erzeugt Illustrationen direkt über IONOS FLUX.2-klein (256×256). Anzahl: ≤300 Wörter 1 Bild, ≤1000 zwei, darüber drei.",
  },
  {
    id: "layout-default",
    label: "Layoutmodell (Mistral)",
    provider: "openai-compatible",
    modelSlug: "mistralai/Mistral-Small-24B-Instruct",
    supportsSystemPrompt: true,
    supportsJsonOutput: false,
    isActive: true,
    notes:
      "Betten Illustrationen ein; Text fließt mit 1rem Abstand um die Bilder.",
  },
  {
    id: "tts-default",
    label: "Vorlesen (OpenAI TTS)",
    provider: "openai-tts",
    modelSlug: "tts-1",
    supportsSystemPrompt: false,
    supportsJsonOutput: false,
    isActive: true,
    notes:
      "Liest die Geschichte vor über OpenAI `/v1/audio/speech` (`OPENAI_API_KEY`, Stimme nova).",
  },
];

const LAYOUT_SYSTEM =
  "Du bist Layout-Redakteur für Kindergeschichten. Du bettest fertige Illustrationen in bestehendes HTML ein, ohne den Textsinn zu ändern. Der Text muss um die Bilder fließen. Abstände setzt das CSS (1rem) — setze kein style-Attribut. Behalte h1, p, strong, em und alle span.silbe / silbe--a / silbe--b unverändert. Gib nur HTML zurück — keine Markdown-Codeblöcke, keine Erklärungen.";

const LAYOUT_USER =
  "Thema: {{topic}}\nSchulstufe: {{school_stage}}\nGeschichts-Stimmung: {{story_mood}}\n\nVerfügbare Illustrationen (nutze genau diese Attribute):\n{{images_manifest}}\n\nGeschichten-HTML:\n{{story_html}}\n\nAufgabe:\n- Betten jede Illustration genau einmal so ein, dass das <img> das erste Kind seines <p> ist und der Umfließ-Text im selben <p> direkt danach folgt:\n  <p><img src=\"__ILL_id__\" alt=\"…\" width=\"256\" height=\"256\" class=\"story-illustration story-illustration--left\" />Text der auf gleicher Höhe wie die Bildoberkante beginnt und rechts/links umfließt…</p>\n- Nutze die Manifest-Klasse (--left oder --right).\n- Kein alleinstehendes Bild zwischen zwei leeren Absätzen; Text und Bild gehören in denselben Absatz.\n- Kein style-Attribut; Abstände (1rem oben und seitlich) kommen aus CSS.\n- Ändere den Textinhalt nicht — insbesondere Silben-<span class=\"silbe …\"> und deren Klassen beibehalten.\n- Gib ausschließlich das vollständige HTML zurück.";

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
      "Der Builder setzt hier Thema, Schulstufe, Stimmung und die Faktenanzahl ein.",
    outputContract: "Bevorzugt JSON-Liste oder klar trennbare Faktenzeilen.",
  },
  {
    id: "fallback-facts-research-personal",
    key: "facts-research-personal",
    label: "Fakten (ganz persönlich)",
    purpose:
      "Holt Fakten zum persönlichen Kern aus Meine Welt (Interesse oder Wunsch-Erlebnis).",
    stageOrder: 11,
    modelId: "facts-default",
    systemTemplate:
      "Du bist ein sorgfältiger Recherche-Assistent für Bildungsinhalte. Gib ausschließlich sachlich korrekte Aussagen zurück. Halte sie präzise, altersgerecht und konkret. Der persönliche Kern ist ein Interesse oder ein Wunsch („Das möchte ich mal erleben“) — recherchiere dazu echte Fakten, keine erfundenen.",
    userTemplate:
      "{{personal_block}}\nSchulstufe: {{school_stage}}\nGeschichts-Stimmung: {{story_mood}}\nTextlängen-Stufe: {{length_step}}\nGewünschte Faktenanzahl: {{fact_count}}\nGib {{fact_count}} kurze Fakten zurück, die zum persönlichen Kern („{{topic}}“) passen, korrekt, spezifisch und gut für eine Kindergeschichte mit der Hauptfigur {{protagonist_name}} verwendbar sind. Keine Duplikate. Wenn ein Fakt unsicher ist, lass ihn weg.",
    placeholders: [
      "personal_block",
      "topic",
      "protagonist_name",
      "school_stage",
      "story_mood",
      "length_step",
      "fact_count",
    ],
    assemblyNotes:
      "Nur bei „Ganz persönlich“. Topic kommt zufällig aus Interessen oder Wunsch-Erlebnissen.",
    outputContract: "Bevorzugt JSON-Liste oder klar trennbare Faktenzeilen.",
  },
  {
    id: "fallback-story-write",
    key: "story-write",
    label: "Geschichte ausformulieren",
    purpose:
      "Verarbeitet Thema, Auswahlfelder und recherchierte Fakten zu einer vollständigen HTML-Geschichte.",
    stageOrder: 2,
    modelId: "story-default",
    systemTemplate:
      "Du schreibst warmherzige, fantasievolle Geschichten auf Deutsch für Kinder. Baue die Fakten natürlich in die Geschichte ein und achte darauf, dass der Ton zur gewünschten Stimmung passt. Gib ausschließlich HTML aus: eine Überschrift (h1) und Absätze (p). Keine Bilder, keine Markdown-Codeblöcke.",
    userTemplate:
      "Thema: {{topic}}\nSchulstufe: {{school_stage}}\nGeschichts-Stimmung: {{story_mood}}\nTextlängen-Stufe: {{length_step}}\nZiel-Wortspanne: {{target_word_range}}\nEinzubauende Fakten:\n{{facts_block}}\n{{syllable_help_block}}\nSchreibe eine vollständige Geschichte auf Deutsch als HTML. Die Fakten sollen inhaltlich korrekt, fließend eingebettet und laut vorlesbar sein. Nur HTML-Tags h1 und p (optional strong/em). Keine Silben-spans.",
    placeholders: [
      "topic",
      "school_stage",
      "story_mood",
      "length_step",
      "target_word_range",
      "facts_block",
      "syllable_help_block",
    ],
    assemblyNotes:
      "Silbenhilfe: syllable_help_block steuert nur Schreibregeln; Spans setzt die Pipeline nach dem Layout.",
    outputContract:
      "Vollständige Geschichte als HTML (h1, p, ggf. strong/em). Keine Bilder, keine Silben-spans.",
  },
  {
    id: "fallback-story-write-personal",
    key: "story-write-personal",
    label: "Geschichte (ganz persönlich)",
    purpose:
      "Schreibt eine HTML-Geschichte mit dem Kind als Protagonist:in und Freunden aus Meine Welt.",
    stageOrder: 12,
    modelId: "story-default",
    systemTemplate:
      "Du schreibst warmherzige, fantasievolle Geschichten auf Deutsch für Kinder. Die genannte Hauptfigur ist die zentrale Protagonist:in und behält genau diesen Namen. Freundesnamen aus der Liste darfst du als Freund:innen einbauen. Baue die Fakten natürlich ein. Gib ausschließlich HTML aus: eine Überschrift (h1) und Absätze (p). Keine Bilder, keine Markdown-Codeblöcke.",
    userTemplate:
      "{{personal_block}}\nSchulstufe: {{school_stage}}\nGeschichts-Stimmung: {{story_mood}}\nTextlängen-Stufe: {{length_step}}\nZiel-Wortspanne: {{target_word_range}}\nEinzubauende Fakten:\n{{facts_block}}\n{{syllable_help_block}}\nSchreibe eine vollständige Geschichte auf Deutsch als HTML. {{protagonist_name}} ist die Hauptfigur. Weitere Namen falls sinnvoll: {{friends_list}}. Die Fakten sollen inhaltlich korrekt, fließend eingebettet und laut vorlesbar sein. Nur HTML-Tags h1 und p (optional strong/em). Keine Silben-spans.",
    placeholders: [
      "personal_block",
      "topic",
      "protagonist_name",
      "friends_list",
      "school_stage",
      "story_mood",
      "length_step",
      "target_word_range",
      "facts_block",
      "syllable_help_block",
    ],
    assemblyNotes:
      "Silbenhilfe: syllable_help_block steuert nur Schreibregeln; Spans setzt die Pipeline nach dem Layout.",
    outputContract:
      "Vollständige Geschichte als HTML (h1, p, ggf. strong/em). Keine Bilder, keine Silben-spans.",
  },
  {
    id: "fallback-story-layout",
    key: "story-layout",
    label: "Bilder in HTML einbetten",
    purpose:
      "Setzt Illustrationen so ein, dass der Text mit 1rem Abstand um die Bilder fließt.",
    stageOrder: 3,
    modelId: "layout-default",
    systemTemplate: LAYOUT_SYSTEM,
    userTemplate: LAYOUT_USER,
    placeholders: [
      "topic",
      "school_stage",
      "story_mood",
      "images_manifest",
      "story_html",
    ],
    assemblyNotes:
      "Bildanzahl: ≤300 Wörter → 1, ≤1000 → 2, darüber → 3 (aus Textlängen-Limit). Pipeline ersetzt __ILL_*__ durch data-URLs.",
    outputContract:
      "Vollständiges HTML mit floatenden img-Tags (256×256, 1rem Abstand) und __ILL_*-Platzhaltern.",
  },
];

export const FALLBACK_PROMPT_ADMIN_CATALOG: PromptAdminCatalog = {
  models: FALLBACK_AI_MODELS,
  prompts: FALLBACK_PROMPT_TEMPLATES,
};

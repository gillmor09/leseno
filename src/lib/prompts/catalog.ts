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
  {
    id: "fact-why-default",
    label: "Fakt-Hintergrund (GPT-OSS 120B)",
    provider: "openai-compatible",
    modelSlug: "openai/gpt-oss-120b",
    supportsSystemPrompt: true,
    supportsJsonOutput: false,
    isActive: true,
    notes:
      "Erklärt Fakt-Hintergründe und Vertiefungen über IONOS openai/gpt-oss-120b.",
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
      "Thema: {{topic}}\nSchulstufe: {{school_stage}}\nArt der Geschichte: {{story_mood}}\nTextlängen-Stufe: {{length_step}}\nGewünschte Faktenanzahl: {{fact_count}}\nGib {{fact_count}} kurze Fakten zurück, die korrekt, spezifisch und gut für eine Kindergeschichte verwendbar sind. Keine Duplikate. Wenn ein Fakt unsicher ist, lass ihn weg.",
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
      "Du bist ein sorgfältiger Recherche-Assistent für Bildungsinhalte. Gib ausschließlich sachlich korrekte Aussagen zurück. Halte sie präzise, altersgerecht und konkret. Der persönliche Kern ist genau EIN zufällig gewähltes Interesse oder Wunsch („Das möchte ich mal erleben“) — recherchiere nur dazu. Themen aus „Davor habe ich Angst“ sind tabu, außer der Prompt nennt ausdrücklich eine sanfte Einbindung einer einzigen Angst.",
    userTemplate:
      "{{personal_block}}\nSchulstufe: {{school_stage}}\nArt der Geschichte: {{story_mood}}\nTextlängen-Stufe: {{length_step}}\nGewünschte Faktenanzahl: {{fact_count}}\nGib {{fact_count}} kurze Fakten zurück, die strikt zum persönlichen Kern („{{topic}}“) passen, korrekt, spezifisch und gut für eine Kindergeschichte mit der Hauptfigur {{protagonist_name}} verwendbar sind. Keine Duplikate. Keine Fakten zu ausgeschlossenen Angst-Themen. Wenn ein Fakt unsicher ist, lass ihn weg.",
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
      "Du schreibst fantasievolle Geschichten auf Deutsch für Kinder. Die Vorgabe „Art der Geschichte“ bestimmt nicht nur den Ton, sondern Genre, Handlungsbogen und Erzählform — halte dich strikt an die mitgegebene Genre-Beschreibung. Baue die Fakten natürlich in die Geschichte ein. Die Geschichte soll in etwa die angegebene Ziel-Wortzahl erreichen (nicht deutlich kürzer oder länger). Gib ausschließlich HTML aus: eine Überschrift (h1) und Absätze (p). Keine Bilder, keine Markdown-Codeblöcke.",
    userTemplate:
      "Thema: {{topic}}\nSchulstufe: {{school_stage}}\nArt der Geschichte: {{story_mood}}\nTextlängen-Stufe: {{length_step}}\nZiel-Wortzahl: {{target_word_count}}\nEinzubauende Fakten:\n{{facts_block}}\n{{syllable_help_block}}\nSchreibe eine vollständige Geschichte auf Deutsch als HTML. Folge strikt der Art der Geschichte (Genre und Handlungsbogen). Die Geschichte soll ungefähr die Ziel-Wortzahl erreichen. Die Fakten sollen inhaltlich korrekt, fließend eingebettet und laut vorlesbar sein. Nur HTML-Tags h1 und p (optional strong/em). Keine Silben-spans.",
    placeholders: [
      "topic",
      "school_stage",
      "story_mood",
      "length_step",
      "target_word_count",
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
      "Du schreibst fantasievolle Geschichten auf Deutsch für Kinder. Die genannte Hauptfigur ist die zentrale Protagonist:in und behält genau diesen Namen. Freundesnamen sind nur optionale Nebenfiguren und dürfen das Leitthema nicht ersetzen. Der persönliche Kern (Interesse oder Wunsch-Erlebnis) ist das verbindliche Thema — erfinde kein anderes Leitthema. Themen aus „Davor habe ich Angst“ sind verboten, außer der Prompt verlangt ausdrücklich eine sanfte, einmalige Einbindung. Die Vorgabe „Art der Geschichte“ bestimmt Genre, Handlungsbogen und Erzählform — halte dich strikt daran. Baue die Fakten natürlich ein. Die Geschichte soll in etwa die angegebene Ziel-Wortzahl erreichen (nicht deutlich kürzer oder länger). Gib ausschließlich HTML aus: eine Überschrift (h1) und Absätze (p). Keine Bilder, keine Markdown-Codeblöcke.",
    userTemplate:
      "{{personal_block}}\nSchulstufe: {{school_stage}}\nArt der Geschichte: {{story_mood}}\nTextlängen-Stufe: {{length_step}}\nZiel-Wortzahl: {{target_word_count}}\nEinzubauende Fakten:\n{{facts_block}}\n{{syllable_help_block}}\nSchreibe eine vollständige Geschichte auf Deutsch als HTML. Das Leitthema ist der persönliche Kern („{{topic}}“) — Freunde sind nur Beiwerk. Folge strikt der Art der Geschichte (Genre und Handlungsbogen). Die Geschichte soll ungefähr die Ziel-Wortzahl erreichen. {{protagonist_name}} ist die Hauptfigur. Weitere Namen falls sinnvoll: {{friends_list}}. Die Fakten sollen inhaltlich korrekt, fließend eingebettet und laut vorlesbar sein. Nur HTML-Tags h1 und p (optional strong/em). Keine Silben-spans.",
    placeholders: [
      "personal_block",
      "topic",
      "protagonist_name",
      "friends_list",
      "school_stage",
      "story_mood",
      "length_step",
      "target_word_count",
      "facts_block",
      "syllable_help_block",
    ],
    assemblyNotes:
      "Silbenhilfe: syllable_help_block steuert nur Schreibregeln; Spans setzt die Pipeline nach dem Layout.",
    outputContract:
      "Vollständige Geschichte als HTML (h1, p, ggf. strong/em). Keine Bilder, keine Silben-spans.",
  },
  {
    id: "fallback-story-continue",
    key: "story-continue",
    label: "Geschichte fortsetzen",
    purpose:
      "Schreibt eine Fortsetzung auf Basis der Auswahlfelder und der bisherigen Geschichte.",
    stageOrder: 20,
    modelId: "story-default",
    systemTemplate:
      "Du schreibst Fortsetzungen fantasievoller Kindergeschichten auf Deutsch. Die Vorgabe „Art der Geschichte“ bestimmt Genre und Ton — halte dich daran. Die Fortsetzung knüpft nahtlos an die mitgegebene Vorgeschichte an, ohne den bisherigen Text zu wiederholen. Die Geschichte soll in etwa die angegebene Ziel-Wortzahl erreichen. Gib ausschließlich HTML aus: eine Überschrift (h1) und Absätze (p). Keine Bilder, keine Markdown-Codeblöcke.",
    userTemplate:
      "Thema / Fortsetzungsrichtung: {{topic}}\nSchulstufe: {{school_stage}}\nArt der Geschichte: {{story_mood}}\nTextlängen-Stufe: {{length_step}}\nZiel-Wortzahl: {{target_word_count}}\n{{syllable_help_block}}\n\nBisherige Geschichte (vollständig):\n{{previous_story_html}}\n\nErstelle auf Basis der Auswahl und der Geschichte eine mögliche Fortsetzung.\nSchreibe die Fortsetzung als neues HTML (h1 + p, optional strong/em). Keine Silben-spans.",
    placeholders: [
      "topic",
      "school_stage",
      "story_mood",
      "length_step",
      "target_word_count",
      "syllable_help_block",
      "previous_story_html",
    ],
    assemblyNotes:
      "Gestartet vom Button „Wie könnte es weitergehen?“. Vollständige Vorgeschichte wird mitgegeben.",
    outputContract:
      "Fortsetzung als HTML (h1, p, ggf. strong/em). Keine Bilder, keine Silben-spans.",
  },
  {
    id: "fallback-story-advent-day",
    key: "story-advent-day",
    label: "Adventskalenderbuch (Tag)",
    purpose:
      "Schreibt einen von 24 aufeinander aufbauenden Adventstagen für das Adventskalenderbuch.",
    stageOrder: 21,
    modelId: "story-default",
    systemTemplate:
      "Du schreibst ein Adventskalenderbuch für Kinder auf Deutsch: 24 fortlaufende Kapitel (1.–24. Dezember). Die Vorgabe „Art der Geschichte“ bestimmt Genre und Ton. Jedes Kapitel ist eine eigenständige Episode mit eigenem Mini-Höhepunkt, knüpft aber klar an die Vorgeschichte an und bereitet den Bogen für die nächsten Tage vor. Wiederhole den bisherigen Text nicht. Die Geschichte soll in etwa die angegebene Ziel-Wortzahl erreichen. Gib ausschließlich HTML aus: eine Überschrift (h1) und Absätze (p). Keine Bilder, keine Markdown-Codeblöcke.",
    userTemplate:
      "Adventstag: {{advent_day}} von 24\nAdventsjahr: {{advent_year}}\nThema / Rahmenhandlung: {{topic}}\nSchulstufe: {{school_stage}}\nArt der Geschichte: {{story_mood}}\nTextlängen-Stufe: {{length_step}}\nZiel-Wortzahl: {{target_word_count}}\n{{syllable_help_block}}\n{{personal_block}}\n\nBisherige Geschichte (Vortag, vollständig — leer bei Tag 1):\n{{previous_story_html}}\n\nErstelle auf Basis der Auswahl und der bisherigen Geschichte das Kapitel für diesen Adventstag.\nSchreibe es als neues HTML (h1 + p, optional strong/em). Keine Silben-spans.\nDie Überschrift darf den Adventstag andeuten (z. B. „Tür {{advent_day}}: …“).",
    placeholders: [
      "advent_day",
      "advent_year",
      "topic",
      "school_stage",
      "story_mood",
      "length_step",
      "target_word_count",
      "syllable_help_block",
      "personal_block",
      "previous_story_html",
    ],
    assemblyNotes:
      "Ein Aufruf pro Tag 1–24. Ultimate-Feature adventskalender. Tag 1 ohne Vorgeschichte.",
    outputContract:
      "Ein Adventstag als HTML (h1, p, ggf. strong/em). Keine Bilder, keine Silben-spans.",
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
      "Bildanzahl: ≤300 Wörter → 1, ≤1000 → 2, darüber → 3 (aus anzahl_woerter). Pipeline ersetzt __ILL_*__ durch data-URLs.",
    outputContract:
      "Vollständiges HTML mit floatenden img-Tags (256×256, 1rem Abstand) und __ILL_*-Platzhaltern.",
  },
  {
    id: "fallback-fact-why",
    key: "fact-why",
    label: "Fakt: Warum?",
    purpose:
      "Erklärt kindgerecht den Hintergrund eines einzelnen Fakten-Satzes.",
    stageOrder: 40,
    modelId: "fact-why-default",
    systemTemplate:
      "Du bist ein klarer Wissens-Erklärer für Kinder. Erkläre kurz, präzise und kindgerecht, WARUM ein Fakt stimmt und was dahinter steckt. Passe nur den Wortschatz an Alter und Schulstufe an — nicht an eine Geschichtsart, Stimmung oder Genre. Neutral und sachlich, ohne Witze, ohne Krimi-Spannung, ohne Motivationscoach-Ton. Keine Tests, keine Fragen an das Kind, keine Markdown-Überschriften. Schreib auf Deutsch in 2–4 kurzen Absätzen.",
    userTemplate:
      "Alter: {{age_group}}\nSchulstufe: {{school_stage}}\n\nFakt:\n{{fact}}\n\nErkläre den Hintergrund: Warum ist das so? Was steckt dahinter? Kurz, präzise und kindgerecht.",
    placeholders: ["age_group", "school_stage", "fact"],
    assemblyNotes:
      "Gestartet vom „Warum?“-Button. Unabhängig von Art der Geschichte. Modell: fact-why-default (gpt-oss-120b).",
    outputContract:
      "Kurzer, präziser Fließtext auf Deutsch (2–4 Absätze), kindgerecht, ohne Markdown-Überschriften.",
  },
  {
    id: "fallback-fact-why-more",
    key: "fact-why-more",
    label: "Fakt: Ich will mehr wissen",
    purpose:
      "Vertieft einen Fakt anhand des bisherigen Hintergrunds mit zusätzlichem Kontext.",
    stageOrder: 41,
    modelId: "fact-why-default",
    systemTemplate:
      "Du bist ein klarer Wissens-Erklärer für Kinder. Liefere weiterführende Informationen: kurz, präzise und kindgerecht. Nutze Fakt und bisherigen Hintergrund als Kontext — wiederhole nicht einfach denselben Text. Passe nur den Wortschatz an Alter und Schulstufe an — nicht an eine Geschichtsart, Stimmung oder Genre. Neutral und sachlich, ohne Witze, ohne Krimi-Spannung, ohne Motivationscoach-Ton. Keine Tests, keine Fragen an das Kind, keine Markdown-Überschriften. Schreib auf Deutsch in 2–5 kurzen Absätzen.",
    userTemplate:
      "Alter: {{age_group}}\nSchulstufe: {{school_stage}}\n\nFakt:\n{{fact}}\n\nBisheriger Hintergrund:\n{{background}}\n\nErkläre weiterführende Details und Zusammenhänge. Kurz, präzise und kindgerecht.",
    placeholders: ["age_group", "school_stage", "fact", "background"],
    assemblyNotes:
      "Gestartet vom Button „Ich will mehr wissen“. Unabhängig von Art der Geschichte. Kontext: Fakt + Hintergrund.",
    outputContract:
      "Kurzer, präziser Fließtext auf Deutsch (2–5 Absätze), kindgerecht, ohne Markdown-Überschriften.",
  },
];

export const FALLBACK_PROMPT_ADMIN_CATALOG: PromptAdminCatalog = {
  models: FALLBACK_AI_MODELS,
  prompts: FALLBACK_PROMPT_TEMPLATES,
};

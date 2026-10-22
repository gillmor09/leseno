/**
 * Run one orchestrator hop. Caller persists progress and self-kicks on continue.
 */
export async function runNovelOrchestratorHop(
  hop: NovelJobHop,
): Promise<NovelJobOutcome> {
  const novelId = hop.novelId;
  try {
    const step = hop.step || "style_guide";

    // Manual pause — stop racing self-kicks.
    {
      const live = await getNovelBundle(novelId);
      if (
        live?.novel.status === "paused" ||
        live?.novel.orchestratorStatus.error === "manual_pause_for_queue_reset"
      ) {
        return { outcome: "ok" };
      }
    }

    // Former Heavy-only steps → skip (single write path).
    if (
      step === "review" ||
      step === "manuscript_review" ||
      step === "revision_plan" ||
      step === "targeted_rewrite" ||
      step === "global_recheck" ||
      step === "timeline_pass" ||
      step === "formula_pass" ||
      step === "voice_rewrite" ||
      step === "state_sync"
    ) {
      const live = await getNovelBundle(novelId);
      if (!live) throw new Error("Roman nicht gefunden.");
      if (step === "review") {
        const chapterNumber = hop.chapterNumber ?? 1;
        const chapter = live.chapters.find(
          (c) => c.chapterNumber === chapterNumber,
        );
        if (chapter) {
          const text = (chapter.rawDraft || chapter.finalText).trim();
          await upsertChapter({
            ...chapter,
            rawDraft: text || chapter.rawDraft,
            finalText: text || chapter.finalText,
            status: "approved",
          });
        }
        return continueHop({
          novelId,
          step: "wave_chapter_done",
          chapterNumber,
        });
      }
      if (step === "state_sync") {
        const wavePrev = getWaveState(live);
        const flush = hop.waveSync
          ? wavePrev.activeChapters
          : [hop.chapterNumber ?? 0].filter((n) => n >= 1);
        const syncDone = [...new Set([...wavePrev.syncDone, ...flush])];
        const waveNext: WaveBatchState = {
          ...wavePrev,
          syncDone,
          waveIndex: wavePrev.waveIndex + 1,
          activeChapters: [],
          reviewDone: [],
          status: "idle",
          updatedAt: new Date().toISOString(),
        };
        await upsertKnowledgeGraph({
          novelId,
          entityStates: entityStatesWithWave(
            live.knowledgeGraph?.entityStates ?? {},
            waveNext,
          ),
          timelineEvents: live.knowledgeGraph?.timelineEvents ?? [],
        });
        return continueHop({ novelId, step: "wave_dispatch" });
      }
      await status(
        novelId,
        {
          phase: "completed",
          label:
            "Qualitätsprobe fertig — Buch-Passes entfallen. Abnahme unter Export.",
          step: "completed",
        },
        "completed",
      );
      return { outcome: "ok" };
    }

    if (step === "style_guide") {
      await status(
        novelId,
        {
          phase: "style_guide",
          label: "Lektor erstellt Styleguide (ohne finale Stimme)…",
          step: "style_guide",
        },
        "setup",
      );
      const bundle = await getNovelBundle(novelId);
      if (!bundle) throw new Error("Roman nicht gefunden.");
      const raw = await generateAsEditorJson({
        userText: `Analysiere die High-Concept-Idee und erzeuge einen Styleguide OHNE finale Stimmkarte.
Die Stimme wird danach durch Schreibproben ermittelt — hier nur Genre, Perspektive, Handwerk.
Antwort NUR als JSON:
{"genre":"…","subgenre":"…","primaryTone":"…","narrativePerspective":"…","styleRules":{"dos":["…"],"donts":["…"],"notes":"…"},"suggestedTitle":"…"}

Idee:
${bundle.novel.highConceptIdea}`,
      });
      const data = await parseStructuredJson(
        raw,
        styleGuideExtractSchema,
        "Styleguide",
        '{"genre":"","subgenre":"","primaryTone":"","narrativePerspective":"","styleRules":{}}',
      );
      const now = new Date().toISOString();
      await upsertStyleGuide({
        novelId,
        genre: data.genre,
        subgenre: data.subgenre ?? "",
        primaryTone: data.primaryTone,
        narrativePerspective: data.narrativePerspective,
        styleRules: mergeMandatoryProseRules(data.styleRules ?? {}),
        createdAt: now,
        updatedAt: now,
      });
      if (data.suggestedTitle?.trim()) {
        await updateNovel({
          id: novelId,
          title: data.suggestedTitle.trim().slice(0, 120),
        });
      }
      return continueHop({ novelId, step: "voice_discovery" });
    }

    if (step === "voice_discovery") {
      await status(novelId, {
        phase: "voice_discovery",
        label: "Autor schreibt drei Stimm-Varianten…",
        step: "voice_discovery",
      });
      const bundle = await getNovelBundle(novelId);
      if (!bundle) throw new Error("Roman nicht gefunden.");
      const raw = await generateAsAuthor({
        cacheablePrefix: formatCanonPrefix(bundle),
        userText: `${VOICE_DISCOVERY_SCENE_A}

Idee:
${bundle.novel.highConceptIdea.slice(0, 6_000)}`,
      });
      const data = await parseStructuredJson(
        raw,
        voiceVariantsBundleSchema,
        "Stimm-Varianten",
        '{"sceneBrief":"","variants":[]}',
      );
      await upsertKnowledgeGraph({
        novelId,
        entityStates: entityStatesWithVoiceDiscovery(
          bundle.knowledgeGraph?.entityStates ?? {},
          {
            sceneBrief: data.sceneBrief,
            variants: data.variants,
          },
        ),
        timelineEvents: bundle.knowledgeGraph?.timelineEvents ?? [],
      });
      return continueHop({ novelId, step: "voice_critique" });
    }

    if (step === "voice_critique") {
      await status(novelId, {
        phase: "voice_discovery",
        label: "Lektor vergleicht Stimm-Varianten blind…",
        step: "voice_critique",
      });
      const bundle = await getNovelBundle(novelId);
      if (!bundle) throw new Error("Roman nicht gefunden.");
      const vd = getVoiceDiscoveryState(bundle);
      if (!vd.variants?.length) {
        throw new Error("Keine Stimm-Varianten für Kritik.");
      }
      const raw = await generateAsEditorJson({
        userText: voiceCriticPrompt(JSON.stringify(vd.variants)),
      });
      const data = await parseStructuredJson(
        raw,
        voiceCriticSchema,
        "Stimm-Kritik",
        '{"winnerId":"A","runnerUpId":"B","comparisons":[],"verdict":""}',
      );
      await upsertKnowledgeGraph({
        novelId,
        entityStates: entityStatesWithVoiceDiscovery(
          bundle.knowledgeGraph?.entityStates ?? {},
          {
            ...vd,
            winnerId: data.winnerId,
            runnerUpId: data.runnerUpId,
            criticVerdict: data.verdict,
          },
        ),
        timelineEvents: bundle.knowledgeGraph?.timelineEvents ?? [],
      });
      return continueHop({ novelId, step: "voice_lock" });
    }

    if (step === "voice_lock") {
      await status(novelId, {
        phase: "voice_discovery",
        label: "Autor schreibt zweite Szene und sperrt Stimme…",
        step: "voice_lock",
      });
      const bundle = await getNovelBundle(novelId);
      if (!bundle) throw new Error("Roman nicht gefunden.");
      const vd = getVoiceDiscoveryState(bundle);
      const winner =
        vd.variants?.find((v) => v.id === vd.winnerId) ?? vd.variants?.[0];
      if (!winner) throw new Error("Keine Gewinner-Variante für Voice-Lock.");
      const second = await generateAsAuthor({
        cacheablePrefix: formatCanonPrefix(bundle),
        userText: secondSceneAuthorPrompt({
          idea: bundle.novel.highConceptIdea,
          stanceLabel: winner.stanceLabel,
          winningProse: winner.prose,
        }),
      });
      const raw = await generateAsEditorJson({
        userText: voiceLockPrompt({
          stanceLabel: winner.stanceLabel,
          firstProse: winner.prose,
          secondProse: second,
        }),
      });
      const data = await parseStructuredJson(
        raw,
        voiceLockSchema,
        "Voice-Lock",
        '{"confirmed":true,"useRunnerUp":false,"notes":"","referenceExcerpts":["…","…"],"voiceCard":{"toneLabel":"","traits":[],"doWrite":[],"sampleLines":[],"endingRotation":[]}}',
      );
      let card = data.voiceCard;
      if (!data.confirmed && data.useRunnerUp && vd.runnerUpId) {
        const runner = vd.variants?.find((v) => v.id === vd.runnerUpId);
        if (runner) {
          card = {
            ...card,
            toneLabel: card.toneLabel || runner.stanceLabel,
          };
        }
      }
      const samples = [
        ...(card.sampleLines ?? []),
        ...(data.referenceExcerpts ?? []),
      ].slice(0, 4);
      const guide = bundle.styleGuide;
      if (!guide) throw new Error("Styleguide fehlt vor Voice-Lock.");
      await upsertStyleGuide({
        ...guide,
        styleRules: mergeMandatoryProseRules({
          ...guide.styleRules,
          voiceCard: {
            ...card,
            sampleLines: samples.length ? samples : card.sampleLines,
          },
        }),
        updatedAt: new Date().toISOString(),
      });
      return continueHop({ novelId, step: "world_building" });
    }

    if (step === "world_building") {
      await status(novelId, {
        phase: "world_building",
        label: "Lektor baut Welt & Wissensgraph…",
        step: "world_building",
      });
      const bundle = await getNovelBundle(novelId);
      if (!bundle) throw new Error("Roman nicht gefunden.");
      const raw = await generateAsEditorJson({
        cacheablePrefix: formatCanonPrefix(bundle),
        userText: `Aus Idee + Styleguide: Weltenbau und initialer Wissensgraph.
Antwort NUR als JSON:
{"characters":[{"name":"…","role":"…","goals":["…"],"initialKnowledge":["…"],"summary":"…"}],"loreRules":[],"locations":[],"entityStates":{},"timelineEvents":[]}`,
      });
      const data = await parseStructuredJson(
        raw,
        worldBuildingExtractSchema,
        "Weltenbau",
        '{"characters":[],"loreRules":[],"locations":[],"entityStates":{},"timelineEvents":[]}',
      );
      const now = new Date().toISOString();
      await upsertWorldBuilding({
        novelId,
        characters: data.characters,
        loreRules: data.loreRules ?? [],
        locations: data.locations ?? [],
        createdAt: now,
        updatedAt: now,
      });
      await upsertKnowledgeGraph({
        novelId,
        entityStates: data.entityStates ?? {},
        timelineEvents: data.timelineEvents ?? [],
        createdAt: now,
        updatedAt: now,
      });
      return continueHop({ novelId, step: "outline" });
    }

    if (step === "outline") {
      await status(
        novelId,
        {
          phase: "outline",
          label: "Autor entwirft Kapitel-Outline…",
          step: "outline",
        },
        "outlining",
      );
      const bundle = await getNovelBundle(novelId);
      if (!bundle) throw new Error("Roman nicht gefunden.");
      const genreHint = bundle.styleGuide
        ? `${bundle.styleGuide.genre}${
            bundle.styleGuide.subgenre
              ? ` / ${bundle.styleGuide.subgenre}`
              : ""
          } · Ton: ${bundle.styleGuide.primaryTone}`
        : "Genre aus der Idee ableiten";
      const prose = await generateAsAuthor({
        cacheablePrefix: formatCanonPrefix(bundle),
        userText: `Erstelle eine Kapitel-Outline für diesen Roman (3-Akt-Dramaturgie).

QUALITÄTSPROBE: Exakt ${QUALITY_PROBE_CHAPTER_COUNT} Kapitel (chapterNumber 1…${QUALITY_PROBE_CHAPTER_COUNT}).
Kein längerer Autopilot — Stimme und Anti-Formel müssen hier schon tragen.
Genre/Ton als Kontext: ${genreHint}.
Jedes Kapitel braucht eine klare Story-Aufgabe (job) und neuen Konflikt/Information.

Dramatic Jobs (genau eines pro Kapitel, Enum-Wert als job):
${formatJobTaxonomyForOutline()}

Verteilung:
- Kap. 1: setup oder incite
- Letztes Kapitel: denouement (davor oft climax)
- Mittelteil: escalate / reveal / confront / comic / decision — keine Verfahrens-Wiederholung

Schreibe in jedes outline-Feld den Story-Beat explizit mit (ein Satz: „Beat: …“).
Zusätzlich: must (1–2), mustNot (1–2), endingFunction (kurz), optional mood.

Antwort NUR als JSON:
{"chapters":[{"chapterNumber":1,"title":"…","outline":"2–4 Sätze Kern inkl. Beat: …","job":"setup","must":["…"],"mustNot":["…"],"endingFunction":"…","mood":"…"}…],
"lengthRationale":"1–2 Sätze: warum die Qualitätsprobe mit ${QUALITY_PROBE_CHAPTER_COUNT} Kapiteln den Stoff trägt"}`,
      });
      const data = await parseStructuredJson(
        prose,
        outlineExtractSchema,
        "Outline",
        '{"chapters":[{"chapterNumber":1,"title":"","outline":"","job":"setup"}],"lengthRationale":""}',
      );
      if (data.chapters.length !== QUALITY_PROBE_CHAPTER_COUNT) {
        throw new Error(
          `Outline: erwartet ${QUALITY_PROBE_CHAPTER_COUNT} Kapitel (Qualitätsprobe), erhalten ${data.chapters.length}.`,
        );
      }
      for (const ch of data.chapters) {
        const contract = normalizeChapterContract(
          {
            job: ch.job ?? "escalate",
            must: ch.must,
            mustNot: ch.mustNot,
            endingFunction: ch.endingFunction,
            mood: ch.mood,
          },
          ch.chapterNumber,
        );
        await upsertChapter({
          novelId,
          chapterNumber: ch.chapterNumber,
          title: ch.title,
          outline: ch.outline,
          contract,
          scenePlan: [],
          rawDraft: "",
          finalText: "",
          status: "planned",
        });
      }
      // Seed logic ledger lightly from outline.
      try {
        const outlineDigest = data.chapters
          .map(
            (c) =>
              `Kap.${c.chapterNumber} [${c.job ?? "?"}]: ${c.title} — ${c.outline}`,
          )
          .join("\n");
        const ledgerRaw = await generateAsEditorJson({
          cacheablePrefix: formatCanonPrefix(bundle),
          userText: `Erzeuge ein Logic-Ledger (Zeitachse + Geld/Forderungen + offene Fragen).
Antwort NUR als JSON:
{"timeline":[{"chapter":1,"dateLabel":"…","event":"…"}],"money":[],"openQuestions":[]}

Outline:
${outlineDigest.slice(0, 12_000)}`,
        });
        const ledgerData = await parseStructuredJson(
          ledgerRaw,
          logicLedgerSeedSchema,
          "Logic-Ledger",
          '{"timeline":[],"money":[],"openQuestions":[]}',
        );
        const live = await getNovelBundle(novelId);
        await upsertKnowledgeGraph({
          novelId,
          entityStates: entityStatesWithLedger(
            live?.knowledgeGraph?.entityStates ?? {},
            {
              timeline: ledgerData.timeline ?? [],
              money: ledgerData.money ?? [],
              openQuestions: ledgerData.openQuestions ?? [],
              anchors: deriveAnchorsFromTimeline(ledgerData.timeline ?? []),
            },
          ),
          timelineEvents: live?.knowledgeGraph?.timelineEvents ?? [],
        });
      } catch (ledgerErr) {
        console.warn("[novel/outline] ledger seed failed", ledgerErr);
      }
      return continueHop({ novelId, step: "wave_dispatch" });
    }

    if (step === "outline_revision") {
      throw new Error(
        "Outline-Revision aus Abnahme wurde entfernt — Qualitätsprobe mit Tic-Gate statt Nachschreib-Schleifen.",
      );
    }

    if (step === "wave_dispatch") {
      const bundle = await getNovelBundle(novelId);
      if (!bundle) throw new Error("Roman nicht gefunden.");
      const waveSize = resolveWaveSize();
      const prev = getWaveState(bundle);
      const pending = pendingChapterNumbers(bundle);
      if (pending.length === 0) {
        await status(
          novelId,
          {
            phase: "completed",
            label:
              "Qualitätsprobe fertig — Abnahme unter Export. Bei KI-Gate: nicht nachschreiben, Prozess prüfen.",
            step: "completed",
          },
          "completed",
        );
        return { outcome: "ok" };
      }
      const activeChapters = pickNextWave(pending, waveSize);
      const wave = {
        ...prev,
        waveSize,
        waveIndex: prev.waveIndex,
        activeChapters,
        reviewDone: [] as number[],
        syncDone: prev.syncDone,
        status: "running" as const,
        updatedAt: new Date().toISOString(),
      };
      await upsertKnowledgeGraph({
        novelId,
        entityStates: entityStatesWithWave(
          bundle.knowledgeGraph?.entityStates ?? {},
          wave,
        ),
        timelineEvents: bundle.knowledgeGraph?.timelineEvents ?? [],
      });
      await status(novelId, {
        phase: "wave_dispatch",
        label: `Welle ${wave.waveIndex + 1}: Kap. ${activeChapters.join(", ")} parallel…`,
        step: "wave_dispatch",
        chapterNumber: activeChapters[0] ?? null,
      });
      const hops: NovelJobHop[] = activeChapters.map((chapterNumber) => ({
        novelId,
        step: "scene_plan",
        chapterNumber,
        iteration: 1,
        repairCycle: 0,
      }));
      const kicked = await kickNovelJobsParallel({
        hops,
        staggerMs: 500,
      });
      if (kicked === 0) {
        throw new Error(
          "Wave-Dispatch: kein Kapitel-Job gestartet (Kick fehlgeschlagen).",
        );
      }
      return continueHop({
        novelId,
        step: "wave_barrier",
        delayMs: 8_000,
      });
    }

    if (step === "wave_chapter_done") {
      const chapterNumber = hop.chapterNumber ?? 1;
      const bundle = await getNovelBundle(novelId);
      if (!bundle) throw new Error("Roman nicht gefunden.");
      const wave = getWaveState(bundle);
      const reviewDone = [...new Set([...wave.reviewDone, chapterNumber])];
      await upsertKnowledgeGraph({
        novelId,
        entityStates: entityStatesWithWave(
          bundle.knowledgeGraph?.entityStates ?? {},
          { ...wave, reviewDone, updatedAt: new Date().toISOString() },
        ),
        timelineEvents: bundle.knowledgeGraph?.timelineEvents ?? [],
      });
      return continueHop({ novelId, step: "wave_barrier" });
    }

    if (step === "wave_barrier") {
      const bundle = await getNovelBundle(novelId);
      if (!bundle) throw new Error("Roman nicht gefunden.");
      let wave = getWaveState(bundle);
      await status(novelId, {
        phase: "wave_barrier",
        label: formatWaveLabel(wave),
        step: "wave_barrier",
        chapterNumber: wave.activeChapters[0] ?? null,
      });
      if (wave.activeChapters.length === 0) {
        return continueHop({ novelId, step: "wave_dispatch" });
      }
      if (!waveReviewComplete(wave, bundle)) {
        return continueHop({
          novelId,
          step: "wave_barrier",
          delayMs: 10_000,
        });
      }
      const syncDone = [
        ...new Set([...wave.syncDone, ...wave.activeChapters]),
      ];
      const waveNext: WaveBatchState = {
        ...wave,
        syncDone,
        waveIndex: wave.waveIndex + 1,
        activeChapters: [],
        reviewDone: [],
        status: "idle",
        updatedAt: new Date().toISOString(),
      };
      await upsertKnowledgeGraph({
        novelId,
        entityStates: entityStatesWithWave(
          bundle.knowledgeGraph?.entityStates ?? {},
          waveNext,
        ),
        timelineEvents: bundle.knowledgeGraph?.timelineEvents ?? [],
      });
      return continueHop({ novelId, step: "wave_dispatch" });
    }

    if (step === "scene_plan") {
      const chapterNumber = hop.chapterNumber ?? 1;
      await status(
        novelId,
        {
          phase: "scene_plan",
          label: `Autor plant Szenen für Kapitel ${chapterNumber}…`,
          step: "scene_plan",
          chapterNumber,
        },
        "writing",
      );
      const bundle = await getNovelBundle(novelId);
      if (!bundle) throw new Error("Roman nicht gefunden.");
      const chapter = bundle.chapters.find(
        (c) => c.chapterNumber === chapterNumber,
      );
      if (!chapter) throw new Error(`Kapitel ${chapterNumber} fehlt.`);
      const contractBlock = formatContractForAuthor(chapter.contract);
      const job = hasChapterContract(chapter.contract)
        ? chapter.contract.job
        : "escalate";
      const { chain, block: chainBlock } = formatBeatChainMandate(
        job,
        chapterNumber,
      );
      const craft = assignCraftClassesForChapter(bundle, chapterNumber);
      const craftState = getCraftClassesState(bundle);
      await upsertKnowledgeGraph({
        novelId,
        entityStates: entityStatesWithCraftClasses(
          bundle.knowledgeGraph?.entityStates ?? {},
          {
            byChapter: {
              ...craftState.byChapter,
              [String(chapterNumber)]: craft,
            },
            updatedAt: new Date().toISOString(),
          },
        ),
        timelineEvents: bundle.knowledgeGraph?.timelineEvents ?? [],
      });
      const prose = await generateAsAuthor({
        cacheablePrefix: formatCanonPrefix(bundle),
        userText: `Kapitel ${chapterNumber} — ${chapter.title}
Outline: ${chapter.outline}
${contractBlock ? `\n${contractBlock}\n` : ""}
${chainBlock}

${formatCraftClassesForAuthor(craft)}

Erstelle einen Szenenplan als JSON mit GENAU ${chain.length} Szenen in der vorgeschriebenen Beat-Reihenfolge.
Letzte Szene muss die Kapitelende-Klasse ${craft.endingClass} vorbereiten.

Beat-Bedeutung:
${formatSceneBeatTaxonomy()}

{"scenes":[{"summary":"…","location":"…","characters":["…"],"beat":"${chain[0]}"}…]}`,
      });
      const data = await parseStructuredJson(
        prose,
        scenePlanExtractSchema,
        "Szenenplan",
        `{"scenes":[${chain.map((b) => `{"summary":"","beat":"${b}"}`).join(",")}]}`,
      );
      await upsertChapter({
        ...chapter,
        scenePlan: normalizeScenePlan(data.scenes, { chain }),
        status: "scene_planning",
      });
      return continueHop({
        novelId,
        step: "draft",
        chapterNumber,
        iteration: 1,
        repairCycle: hop.repairCycle,
      });
    }

    if (step === "draft") {
      const chapterNumber = hop.chapterNumber ?? 1;
      const iteration = Math.min(
        MAX_DRAFT_TIC_ITERS,
        Math.max(1, hop.iteration ?? 1),
      );
      await status(novelId, {
        phase: "draft",
        label:
          iteration > 1
            ? `Autor behebt Tic-Gate Kap. ${chapterNumber} (${iteration}/${MAX_DRAFT_TIC_ITERS})…`
            : `Autor schreibt Kapitel ${chapterNumber}…`,
        step: "draft",
        chapterNumber,
        iteration,
      });
      const bundle = await getNovelBundle(novelId);
      if (!bundle) throw new Error("Roman nicht gefunden.");
      const chapter = bundle.chapters.find(
        (c) => c.chapterNumber === chapterNumber,
      );
      if (!chapter) throw new Error(`Kapitel ${chapterNumber} fehlt.`);

      const voice = getVoiceCard(bundle);
      const endingType = chapterEndingHint(
        chapter.contract,
        voiceEndingHint(voice, chapterNumber),
      );
      const contractBlock = formatContractForAuthor(chapter.contract);
      const sceneBlock = formatScenePlanForAuthor(chapter.scenePlan);
      const craft =
        getCraftClassesState(bundle).byChapter[String(chapterNumber)] ??
        assignCraftClassesForChapter(bundle, chapterNumber);
      const craftBlock = formatCraftClassesForAuthor(craft);
      const priorTexts = bundle.chapters
        .filter((c) => c.chapterNumber < chapterNumber)
        .sort((a, b) => a.chapterNumber - b.chapterNumber)
        .map((c) => (c.finalText || c.rawDraft).trim())
        .filter((t) => t.length >= 80);
      const priorEnds = priorTexts
        .map((t) => t.slice(-180).replace(/\s+/g, " "))
        .slice(-5);
      const endingBudget = formatEndingGestureBudget(priorTexts);

      let userText = `Schreibe Kapitel ${chapterNumber} („${chapter.title}“) als erzählende Prosa in der Zielstimme (Stimmkarte oben).
Outline: ${chapter.outline}
${sceneBlock || `Szenenplan: ${JSON.stringify(chapter.scenePlan)}`}
${contractBlock ? `\n${contractBlock}\n` : ""}
${craftBlock}
${endingBudget}

Schreibe die Szenen in Reihenfolge; jede Szene erfüllt ihren Beat und ihr Register unter dem Kapitel-Job.
Logic-Ledger (im Kanon) nicht widersprechen.
Kapitelende-Typ: ${endingType} — und Klasse ${craft.endingClass} einhalten.
${priorEnds.length ? `Frühere Kapitelenden (nicht nachahmen):\n- ${priorEnds.join("\n- ")}` : ""}
${NOVEL_AUTHOR_CHAPTER_END_REMINDER}

Gib NUR den Kapiteltext (ohne „Kapitel N“-Überschrift).`;

      if (iteration > 1) {
        const lastFb = [...bundle.editorFeedbacks]
          .filter((f) => f.chapterId === chapter.id)
          .sort((a, b) => b.iteration - a.iteration)[0];
        const issues = lastFb?.issues ?? [];
        if (isDraftTicFeedback(issues)) {
          const hits = scanDraftProseTics({
            text: chapter.rawDraft,
            priorChapterTexts: priorTexts,
          });
          userText = `Überarbeite Kapitel ${chapterNumber} — nur Tic-Gate-Treffer.

${formatDraftTicRewriteBrief(hits)}

${craftBlock}
${contractBlock ? `\n${contractBlock}\n` : ""}
${sceneBlock ? `\n${sceneBlock}\n` : ""}

Bisheriger Text:
${chapter.rawDraft.slice(0, 40_000)}

Gib NUR den vollständigen neuen Kapiteltext.`;
        } else {
          userText = `Überarbeite Kapitel ${chapterNumber} in der Zielstimme.

Bisheriger Text:
${chapter.rawDraft.slice(0, 40_000)}

Issues:
${issues.map((i) => `- ${i}`).join("\n") || "- (keine)"}
${craftBlock}
${endingBudget}
${NOVEL_AUTHOR_CHAPTER_END_REMINDER}

Gib NUR den vollständigen neuen Kapiteltext.`;
        }
      }

      const draft = await generateAsAuthor({
        cacheablePrefix: formatCanonPrefix(bundle, { chapterNumber }),
        userText,
      });

      const ticHits = scanDraftProseTics({
        text: draft,
        priorChapterTexts: priorTexts,
      });
      if (ticHits.length > 0) {
        await upsertChapter({
          ...chapter,
          rawDraft: draft,
          status: "drafting",
        });
        await insertEditorFeedback({
          chapterId: chapter.id,
          iteration,
          score: 40,
          toneAlignmentScore: 40,
          issues: draftTicIssueLines(ticHits),
          approved: false,
        });
        if (iteration < MAX_DRAFT_TIC_ITERS) {
          return continueHop({
            novelId,
            step: "draft",
            chapterNumber,
            iteration: iteration + 1,
            repairCycle: hop.repairCycle,
          });
        }
        throw new Error(
          `Draft-Tic-Gate Kap. ${chapterNumber}: nach ${MAX_DRAFT_TIC_ITERS} Versuchen noch ${ticHits.length} Treffer (${ticHits.map((h) => h.code).join(", ")}).`,
        );
      }

      await upsertChapter({
        ...chapter,
        rawDraft: draft,
        finalText: draft,
        status: "approved",
      });
      const waveNow = getWaveState(bundle);
      if (
        waveNow.activeChapters.length > 0 &&
        waveNow.activeChapters.includes(chapterNumber)
      ) {
        return continueHop({
          novelId,
          step: "wave_chapter_done",
          chapterNumber,
        });
      }
      return continueHop({ novelId, step: "wave_dispatch" });
    }

    if (step === "assisted_fix") {
      throw new Error(
        "Gezielte Fixes wurden entfernt — Draft-Tic-Gate ersetzt Nachbesserungs-Wellen.",
      );
    }

    throw new Error(`Unbekannter Orchestrator-Schritt: ${step}`);

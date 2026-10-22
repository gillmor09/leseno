# Leseno architecture

Short map for humans and agents. Product rules live in `.cursor/rules/`; ops in `docs/supabase-coolify-checkliste.md`.

## Layers

| Layer | Path | Role |
|-------|------|------|
| Routes | `src/app/` | Pages, layouts, Server Actions |
| UI | `src/components/features/` | Client forms / chrome — call actions only |
| Domain | `src/lib/` | AI pipeline, auth, stories, world, prompts, validations |
| Data | `supabase/migrations/` | Schema `leseno` + public RPCs (PostgREST does not expose `leseno` directly) |

Flow: **UI → Server Action (Zod + guards) → `lib` → Supabase / AI providers**.

Blog create via JSON: **`POST /api/blog/posts`** (API key) — see [blog-api.md](blog-api.md).

## Story pipeline

`generateFreeStoryAction` → `generateStoryPipeline`:

1. **Facts** — Gemini (or configured model); personal mode uses Meine-Welt seed  
2. **Story HTML ∥ FLUX images** — parallel; images via IONOS FLUX (256×256 data URLs)  
3. **Layout** — Mistral embeds `__ILL_*__` placeholders; server sanitizes HTML (DOMPurify)

Personal mode: topic/cast resolved **server-side** from the selected `child_profiles` row (never trust client cast).

**Silbenhilfe:** optional toggle → prompt reminds normal capitalization (no spans from the model); after layout, `applySyllableHelpMarkup` wraps syllables via German hyphenation (`hyphen/de`) as `<span class="silbe silbe--a|b">`.

## Auth & admin

- Session: Supabase Auth; role in `app_metadata.role` (`admin`, `basis`, `paket1`–`paket3`; 1:1 with `/basis`…`/paket3`)  
- `/admin/*`: `src/app/admin/layout.tsx` + `denyUnlessAdmin()` on write actions  
- Prompt/model catalogs: **service role only** (not anon) — see migration `20260904120000_restrict_prompt_catalog_rpc.sql`
- Auth emails: templates in `leseno.auth_email_templates`; hooks at `/hooks/auth/send-email` (unified), `/hooks/auth/register` (signup), `/hooks/auth/forget` (recovery). Env: `AUTH_EMAIL_HOOK_SECRET`, `SMTP_*`.
- Billing / usage: `user_profiles.credits`; `membership_packages` (Admin `/admin/pakete`); `user_package_bookings`; `credit_grants` (monthly invoice grants); `user_activities`. **Stripe Checkout** (card + PayPal): `/preise` → Checkout; webhook `/api/stripe/webhook` syncs role + monthly credits on anniversary — see [docs/stripe.md](stripe.md) and [docs/billing.md](billing.md). **Promo-Codes** (Admin `/admin/promo`): Stripe coupons + `?promo=` capture — see stripe.md §5. **Social Media** (Admin `/admin/social-media`): Instagram calendar; captions from manifesto + one motivation angle (`/motivation`); Gemini 3.8 Flash for caption + scene plan → FLUX.2. **Buch** (Admin `/admin/roman`, internal): see **Buch (Admin)** below. **Sachbuch** (Admin `/admin/sachbuch`, internal): greenfield module — see **Sachbuch (Admin)** below.

## Sachbuch (Admin)

Route `/admin/sachbuch`: own table `leseno.sachbuch_kontext`. **Guided wizard** (`idee.guide`, hard gates in `guide.ts`):

1. **Rohkonzept** — Paste oder Interview  
2. **Verfeinern** — Agentic Haiku (`claude-haiku-5-5`) ↔ Luna (`gpt-6-luna`), 2–3 Auto-Runden → HITL Freigabe (`ideaApprovedAt`)  
3. **Buchtyp** — Vorschlag aus Konzept (Katalog), nicht beim Anlegen  
4. **Evidenz** — Google Search claims map (no RAG)  
5. **Makro** — Stages nach Typ → Kapitelgerüst  
6. **Schreiben** — Context Graph + Abschnitte (400–700 Wörter); Ziel ca. 8.000 Wörter/Kapitel, ca. 40.000 Wörter/Buch  

Ohne Freigabe: Evidenz/Makro/Schreiben UI- und Server-gesperrt (bestehende Abschnitte bleiben lesbar). Agents: interviewer, researcher, architect, writer, critic, stylist. Defaults: Luna (Interviewer/Architect/Critic/Stylist), Gemini Flash (Researcher + Search, Writer); Refine: Haiku + Luna. Env: `DEEPGRAM_API_KEY`. Migrations `20260925150000_sachbuch_kontext.sql`, `20260925160000_sachbuch_phases.sql`.

## Buch (Admin) — Roman greenfield

Route `/admin/roman`: **Top-Down-Orchestrator** auf `leseno.novels` (+ `chapters`, `scenes` mit `manifest`/`logic_notes`, `scene_states`, `skeleton`/`state_matrix` auf dem Novel). Code: `src/lib/novel/` (`tree-pipeline.ts`, `novelOrchestrator.ts`). Hardwired: **Architekt/Auditor** `gpt-6-luna`, **Draft/Stilist** `claude-haiku-5-5`. Phasen: `architect_acts` → `skeleton_audit_acts` → `architect_chapters` → `skeleton_audit_chapters` → `architect_manifests` → `skeleton_audit_manifests` → HITL `skeleton_gate` / `structure_gate` → pro Szene Draft → Logik → Stil → Tic → State-Commit → `chapter_audit` → `scene_dispatch`. Pyramid + Ton-Vertrag. HITL: `pilot_mode` `auto` | `pause_after_scene`. Jobs: `POST /api/admin/roman/novel-job`. Plan: `docs/roman-top-down-modul.md`.

**Clever erzählt** bleibt unter `/admin/clever-erzaehlt` auf Legacy `roman_kontext` / `src/lib/roman/*` (noch nicht vollständig nach `clever-erzaehlt/` umgezogen).

### Legacy fiction pipeline (Clever / alte Notes)

Früher `/admin/roman` Belletristik: freigabegeführter Prozess **Idee → Rahmen → Fundament → Exposé → Wissensgraph → Plot → Szenen → Manuskript**. MVP-Checkliste: [roman-process-mvp.md](roman-process-mvp.md).

**Freigabe vs Hard-Gate vs Fertig:** Hard-Gates (`stage-hard-gates.ts`) prüfen Qualität/Struktur; `pipelineFertig` ist Soft-Chrome; **`editorial.phaseState[phase].approved` + fingerprint** ist Kanon für Downstream-KI (`phase-state.ts`, `phase-fingerprints.ts`, action `roman-phase-freigabe.ts`). Upstream-Änderung markiert Downstream als `stale` (kein Auto-Wipe freigegebener Artefakte) — Wipe nur bei explizitem Neu-Erzeugen / Cascade-Confirm.

**Pipeline-Stufen** (`PIPELINE_STAGES` in `pipeline/stages.ts`): Rahmen = früheres Basics (Genre/`tonalitaet`/`grobRegeln`, optional Alter; Ableitung `suggest-basics-from-idee`). Fundament = Charaktere+Welt. Exposé separat. **Wissensgraph** (eigene Stage vor Plot): Seed + Konkretisierung aus dem gesamten Upstream-Kanon (Regeln & Grenzen + Fundament + Exposé + Idee, `seedWissensGraphFromSources` + `enrichWissensGraphConcreteDetails`); Gate gegen dünne Knoten. **Plot** = Ereignisplan (`kapitelGeruestStructured` / Gerüst mit props/events/`centralArcs`): gebaut aus dem **Gesamt-Kanon** (Regeln & Grenzen + Figuren + Welt + Exposé + Wissensgraph gemeinsam in `suggest-kapitelgeruest.ts`). **Szenen** = Szenenverträge (`szenenplotStructured`) aus freigegebenem Plot+Graph. Legacy-IDs (`feinplot`, `feingeruest`, `spec`, …) normalisieren auf die kanonischen Stages.

**Manuskript:** Prerequisite = freigegebene Szenen + Hard-Gate. Chapter packet + slim canon unverändert; Stimmprobe = Einzelkapitel vor Vollbuch. Override: `stageGateOverrides` („Trotzdem weiter“), nicht Fertig. Soft-Migration bestehender Bücher: `migrateEditorialPhaseState` (konservativ: lieber neu freigeben).

**Einzelkapitel (Manuskript):** UI wählen Kap. N → **Erzeugen / Verbessern / Gegenlesen** (`src/lib/roman/manuskript-chapter.ts`, actions `roman-manuskript-chapter.ts`). Same Continuity stack: structured Kapitelgerüst beats + Vorgänger-Ende + storyState before N + seam mandate, so isolated chapter work still reads as one book. History trigger `manuskript_chapter`.

**Manuskript contracts** (`src/lib/roman/manuskript-contracts.ts`): Erzeugen enforces per-chapter word band (~85–120% of average) and a book floor (~90% of `zielWortzahlRoman`); soft ceiling ~110% — expand stops when near/over Ziel. Marktanalyse-Bedürfnis-MUSS is temporarily disabled in Erzeugen / Verbessern / Feedback-einarbeiten (Marktanalyse rewrite pending). **Verbessern / Feedback / Dimension patches** may delete Duplikate, but `apply.ts` keeps **chapterMin** as hard floor and expands elsewhere (does not re-insert deleted doubles). When already near Ziel, non-craft patches prefer tighten and reject strong growth. **Leser-Feedback** (Idee / Spec / Gerüst / Plot / Manuskript): Testleser JSON → `editorial.leserFeedbackByStage[stage]` (+ legacy `leserFeedback` for Manuskript). **Feedback einarbeiten**: Idee → `ideeKurz`; Spec → Charaktere+Welt+Exposé; Gerüst/Plot/Manuskript → `aenderungsPrompts` (`scope` lokal/buchweit), book-wide batched ≤24; danach **Reifegrad neu** (Bewerter, wie Dimensions-Einarbeiten). Alle Analysen/Gegenlesen/Leser-Feedback: **max. 3** Punkte mit `wichtigkeit` kritisch|wichtig|nice_to_have; Nice-to-have nur wenn nichts Härteres übrig (UI-Banner, kein Einarbeiten). See `ROMAN_CRITIQUE_FOCUS_MANDATE`, `leser-feedback-collect.ts`, `leser-feedback-apply.ts`.

**Idee Q&A:** Schreib-Coach confirms author **commands** (rename role/person, strike, tone); Ideen-Redakteur applies them consistently in `ideeKurz` (no chapter outlines). Migration `20260918124500_idee_coach_commands.sql`.

**Anti-Sterilität (light):** Autor-Bias from Steckbriefe (`src/lib/roman/autor-bias.ts`) is injected into Manuskript write/patch context. Key chapters (first/last/Wendepunkt, max 4) get an A/B beat via Co-Autor micro-call — Path B forced (`src/lib/roman/manuskript-ab.ts`). Continuity Memory light: `src/lib/roman/manuskript-continuity.ts`. No extra KI role.

**Canon + Style + Timeline (Manuskript hardening):** Thin ledgers on the existing spine (packet → post-draft gates → continuity apply → freigabe). **Hard Freigabe** (block Feinschliff): `canon`, `ledger`, deterministic Nahtdopplung (`seam_dup` via `manuskript-nahtdopp-scan.ts`), Comedy-Humor when tonalitätRequiresComedyHard. **Soft / advisory** (never block): Assist Seam/Emotion/Timeline/Plot-Truth + Style phrase hits — Assist rewords forever; settled suppressions survive „Erneut prüfen“ by default (`clearSettled` to wipe). **Canon:** continuity identity scan (`manuskript-continuity-pass.ts`). Who-did-X via `CLAIM` + soft Freigabe `plot_truth`. **Timeline:** packet Zeitrahmen-MUSS; Assist seam timeline is soft. **Style:** phrase-frequency → soft Freigabe (`manuskript-phrase-freq.ts`). Soft findings do **not** block Roman Verbessern (`hardManuskriptFreigabeFindings` / `isHardFreigabeFinding`).

**Who-did-X already in Gerüst/Plot:** Deterministic claim extract from events/kernsatz/scenes (`geruest-plot-claims.ts`) → hard preflight error on actor conflicts before Manuskript (`szenenplot-preflight.ts`); CLAIM invariants seeded after Pass-1 graph grow; Stage Verbessern „Nur Logik“ on Gerüst/Plot gets the same block. Fix contracts there — do not paper over in Manuskript.

**Hard-Gates (Idee → Rahmen → Fundament → Exposé → Graph → Plot → Szenen → Manuskript):** Progression is blocked while the previous stage’s hard gate is red (`stage-hard-gates.ts`). Author freigabe is an additional assert in producers (`assertUpstreamFreigabe`). Basics/Rahmen Tonalität/Regeln remain **Priority-0 MUSS** in prompts (`prompt-prefix.ts`). **`pipelineFertig` is soft chrome only**. Override: „Trotzdem weiter“ (`stageGateOverrides`, history `stage_gate_override`).

**Auto-Repair (Graph/Plot/Szenen Erzeugen):** After draft + Reifegrad, `generate-job.ts` runs up to **3** internal Logik cycles until hard-gate green. Still red → job **error**. Green → optional Fertig as “gate bestanden”, not bypass.

**Absicherung / Neustart ab Idee:** Keep Basics (Tonalität, `kiRegelwerk`, Grob-/harte Regeln, Alter, Zielwortzahl). Wipe Idee + Spec→Manuskript via `resetEditorialFromIdeeKeepingBasics` / action `resetRomanPipelineFromIdeeAction` (or `scripts/reset-absicherung-from-idee.ts`). Then Erzeugen Stufe für Stufe only through green gates / Auto-Repair — no manual Gerüst-Verbessern as Soll-Pfad.

**Kontinuitäts-Pass (HITL):** UI scan/apply for Maße / Identität / Namens-Aliasse on Gerüst, Plot, or Manuskript (`roman-manuskript-continuity-control.tsx`) — surgical string fixes, not Verbessern.

**KI-Rollen (Soll):** Keep `marktanalyst`, `schreib_coach`, `ideen_redakteur`, `entwicklungslektor`, `bewerter`, `co_autor`, optional `testleser_fanbase`. Removed: `recherche_coach` / `recherche_redakteur` (Roman-Recherche-Tab), `pipeline_router`, `fachberater` (critique → Entwicklungslektor). No new role for Showrunner/A/B/Bias.

**Basics (nach Idee):** Genre/Ton/Regeln preferably derived from Idee, then editable; optional **Marktanalyse** (`marktanalyst` → Gemini + **`googleSearch` always on** + `thinking_level` from role `reasoning_effort`, default **high**) finds the **5 most-read titles in Germany** for genre/age/(optional Richtung), scores up to 20 worst + 20 best reviews each, and stores `neglectedNeed` + `fulfilledNeed` (fields kept; currently not injected as MUSS into draft/improve/feedback). Optional **Richtungen** (max 2) on `editorial.richtungen` — when set, strong MUSS rules for the whole book.

**Stage KI:** client starts a history run, kicks a **background generate job** (`POST /api/admin/roman/pipeline-generate-job` + `after()`), and keeps the wait dialog open while polling `pipeline-progress` until status `ok`/`error`. Erzeugen = draft (+ **Reifegrad** where enabled). **Verbessern** = Entwicklungslektor **Analyse** (max. 3 `aenderungsPrompts` + optional HITL) → Dialog → Co-Autor **Einarbeiten** → Reifegrad (`editorial.stageImprove[stage]`, `src/lib/roman/stage-verbessern.ts`). Spec weaves Charaktere+Welt+Exposé. No separate Gegenlesen button; no upstream router / downstream wipe. History in `leseno.roman_pipeline_history`; task→role in `leseno.roman_pipeline_aufgaben`. Chapter docs patched body-only with structure guards (`src/lib/roman/pipeline/`).

**Reifegrad:** four equal dimensions — **Logik** + three stage-specific craft axes. On **Idee**: Logik, **Schärfe**, **Versprechen**, **Alleinstellung**. On **Spec** (`expose`): Logik, **Figurenkraft**, **Weltnutzen**, **Handlungsbogen** — artifact is Charaktere+Welt+Exposé; dimension apply routes to the matching Spec part. On **Plot**: Logik, **Konkretheit**, **Übergänge**, **Abdeckung**. On **Manuskript**: Logik, Stil, Dramaturgie, Lesefluss. Dimension improve: **Analysieren** → dialog → **Einarbeiten** (`editorial.reifegradImprove[stage]`). Bewerter role. Stage Verbessern and Dimension/Leser-Feedback share the same HITL decision fields on `aenderungsPrompts`.

**Cross-stage consistency:** There is no automatic “Plot-Entscheidung → Exposé nachziehen”. After a Plot decision, open **Spec → Verbessern** (or the relevant Spec-Dimension) and state the consistency change as author decision / Auftrag — or use Schreib-Coach on Idee if the premise must move first. Downstream wipe/cascade was removed on purpose.

**Quality / tokens:** Critique and draft prompts use {@link CLIP} budgets in `quality-brief.ts` (not uncapped). **Manuskript prose** (Co-Autor / often Sonnet) gets slim canon + Gemini chapter packet only. **All other belletristik roles** resolve to Gemini 3.8 Flash via `resolveRomanKiRolle` (Spec/Gerüst drafts that reuse the co_autor prompt pass `allowProseModel: false`). **Prompt-Cache:** `buildRomanStaticBookPrefix` for assist calls; prose uses `buildRomanSlimCanon`. Live deltas stay in `userText`.

Persistence: Plot Erzeugen writes Kapitel-Gerüst → `editorial.kapitelGeruestStructured` (+ raw) and scenes (+ prop/event plan + `centralArcs`/`arcBeats`) → `editorial.szenenplotStructured` (+ markdown in `manuskript_raw`); knowledge graph → `editorial.wissensGraph` (seeded/grown during Plot; grown after each Manuskript chapter write; used + updated on Plot/Manuskript Verbessern & Einzelkapitel; survives structured clear). Manuskript prose → `editorial.manuskriptText`; optional Stil-Pass → `editorial.romanText` (no separate Roman tab). Continuity → `editorial.storyState`; legacy `editorial.canon` cleared with Manuskript. Migrations: `20260911160000_roman_pipeline.sql`, `20260916100000_roman_pipeline_vertical.sql`. Legacy Phase-0 / Grob-/Fein-/Gerüst-split / scene-table writing / gate UI has been removed.

## Meine Welt

Table `leseno.child_profiles` (1:N per auth user); RPCs `list_my_child_profiles` / `upsert_my_child_profile` / `delete_my_child_profile`.

## Mein Buchclub

Route `/mein-buchclub` (package feature `buchclub`, Plus+). Friendship code on `user_profiles`; confirmed friendships; email invite via SMTP. Share level on `user_stories.book_club_share`: `none` (private), `friends`, `public` (visible in every Buchclub). Likes via RPCs — see migrations `20260908090000_book_club.sql` and `20260908150000_book_club_share_levels.sql`.

## Spiele

Public hub `/spiele` (footer). Cards from `src/lib/spiele/catalog.ts`. Per game: route under `src/app/spiele/<game>/`, UI in `src/components/features/spiele/`, pure logic in `src/lib/spiele/<game>/`. Games that shuffle or use Phaser mount via `dynamic(..., { ssr: false })` loaders — do not import Phaser or shuffled decks from Server Components.


`src/lib/security/bot-guard.ts`: honeypot + min fill time + **in-memory** IP rate limit (per Node process). Fine for one Coolify replica; scale-out needs Redis/edge (documented in that file).

## Tests

- Smoke + admin gate: `npm run test:e2e` (`e2e/smoke.spec.ts`)  
- Full AI story (costs quota): `npx playwright test e2e/story-generate.spec.ts`  
- Dev server must be running (`npm run dev`)

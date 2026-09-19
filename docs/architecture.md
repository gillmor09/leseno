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
- Billing / usage: `user_profiles.credits`; `membership_packages` (Admin `/admin/pakete`); `user_package_bookings`; `credit_grants` (monthly invoice grants); `user_activities`. **Stripe Checkout** (card + PayPal): `/preise` → Checkout; webhook `/api/stripe/webhook` syncs role + monthly credits on anniversary — see [docs/stripe.md](stripe.md) and [docs/billing.md](billing.md). **Promo-Codes** (Admin `/admin/promo`): Stripe coupons + `?promo=` capture — see stripe.md §5. **Social Media** (Admin `/admin/social-media`): Instagram calendar; captions from manifesto + one motivation angle (`/motivation`); Gemini 3.8 Flash for caption + scene plan → FLUX.2. **Buch** (Admin `/admin/roman`, internal): see **Buch (Admin)** below.

## Buch (Admin)

Route `/admin/roman`: tabbed pipeline **Basics → Idee → Spec → Kapitelgerüst → Manuskript** (Cover/Export stubs). Spec = Charaktere + Welt + Exposé in one tab; **Erzeugen** runs all three drafts (`pipelineStepDraftSpec`). **Kapitelgerüst:** Co-Autor emits structured Szenenplot JSON (per chapter N scenes with `dramaturgy` / `information_flow` / `continuity`) → `editorial.szenenplotStructured`, plus markdown mirror in `manuskript_raw` (`src/lib/roman/szenenplot-structured.ts`, `suggest-szenenplot.ts`). **Manuskript Erzeugen:** Entwicklungslektor writes a Arbeitsbrief, then Co-Autor writes chapter-by-chapter using the structured scene beats when present. Before each chapter: **Context Assembly** (Bewerter/OSS model, fail-soft to deterministic buffer) packs Continuity-State + chapter focus + previous-chapter tail. After each chapter: **Memory extract** updates `editorial.storyState`. **Verbessern / Feedback einarbeiten** reuse the same Continuity Buffer + storyState refresh on patched chapters (`apply.ts`). No auto-polish per chapter; quality via Reifegrad + Verbessern. Soft length ceiling unchanged.

**Einzelkapitel (Manuskript):** UI wählen Kap. N → **Erzeugen / Verbessern / Gegenlesen** (`src/lib/roman/manuskript-chapter.ts`, actions `roman-manuskript-chapter.ts`). Same Continuity stack: structured Kapitelgerüst beats + Vorgänger-Ende + storyState before N + seam mandate, so isolated chapter work still reads as one book. History trigger `manuskript_chapter`.

**Manuskript contracts** (`src/lib/roman/manuskript-contracts.ts`): Erzeugen enforces per-chapter word band (~85–120% of average) and a book floor (~90% of `zielWortzahlRoman`); soft ceiling ~110% — expand stops when near/over Ziel. Marktanalyse-Bedürfnis-MUSS is temporarily disabled in Erzeugen / Verbessern / Feedback-einarbeiten (Marktanalyse rewrite pending). **Verbessern** runs Länge (only if under Ziel) → Craft; when already near Ziel, patches prefer tighten and reject further growth. **Leser-Feedback** (Idee / Spec / Kapitelgerüst / Manuskript): Testleser JSON → `editorial.leserFeedbackByStage[stage]` (+ legacy `leserFeedback` for Manuskript). **Feedback einarbeiten**: Idee → `ideeKurz`; Spec → Charaktere+Welt+Exposé; Kapitelgerüst/Manuskript → `aenderungsPrompts` (`scope` lokal/buchweit), book-wide batched ≤24; danach **Reifegrad neu** (Bewerter, wie Dimensions-Einarbeiten). Alle Analysen/Gegenlesen/Leser-Feedback: **max. 3** Punkte mit `wichtigkeit` kritisch|wichtig|nice_to_have; Nice-to-have nur wenn nichts Härteres übrig (UI-Banner, kein Einarbeiten). See `ROMAN_CRITIQUE_FOCUS_MANDATE`, `leser-feedback-collect.ts`, `leser-feedback-apply.ts`.

**Idee Q&A:** Schreib-Coach confirms author **commands** (rename role/person, strike, tone); Ideen-Redakteur applies them consistently in `ideeKurz` (no chapter outlines). Migration `20260918124500_idee_coach_commands.sql`.

**Anti-Sterilität (light):** Autor-Bias from Steckbriefe (`src/lib/roman/autor-bias.ts`) is injected into Manuskript write/patch context. Key chapters (first/last/Wendepunkt, max 4) get an A/B beat via Co-Autor micro-call — Path B forced (`src/lib/roman/manuskript-ab.ts`). Continuity Memory light: `src/lib/roman/manuskript-continuity.ts`. No extra KI role.

**KI-Rollen (Soll):** Keep `marktanalyst`, `schreib_coach`, `ideen_redakteur`, `entwicklungslektor`, `bewerter`, `co_autor`. Optional / rarely primary: `fachberater` (Sensitive Reader — merge into Entwicklungslektor when unused), `testleser_fanbase` (optional Gegenlese-Stimme — overlap with Bewerter/Reifegrad). Legacy `pipeline_router` unused (vertical cascade removed). No new role for Showrunner/A/B/Bias.

**Basics Vorab:** optional **Marktanalyse** (`marktanalyst` → Gemini + **`googleSearch` always on** + `thinking_level` from role `reasoning_effort`, default **high**) finds the **5 most-read titles in Germany** for genre/age/(optional Richtung), scores up to 20 worst + 20 best reviews each, and stores `neglectedNeed` + `fulfilledNeed` (fields kept; currently not injected as MUSS into draft/improve/feedback). Optional **Richtungen** (max 2) on `editorial.richtungen` — when set, strong MUSS rules for the whole book.

**Stage KI:** client-chained steps per tab. **Erzeugen** = draft (+ **Reifegrad** where enabled). **Verbessern** = Entwicklungslektor **Analyse** (max. 3 `aenderungsPrompts` + optional HITL) → Dialog → Co-Autor **Einarbeiten** → Reifegrad (`editorial.stageImprove[stage]`, `src/lib/roman/stage-verbessern.ts`). Spec weaves Charaktere+Welt+Exposé. No separate Gegenlesen button; no upstream router / downstream wipe. History in `leseno.roman_pipeline_history`; task→role in `leseno.roman_pipeline_aufgaben`. Chapter docs patched body-only with structure guards (`src/lib/roman/pipeline/`).

**Reifegrad:** four equal dimensions — **Logik** + three stage-specific craft axes. On **Idee**: Logik, **Schärfe**, **Versprechen**, **Alleinstellung**. On **Spec** (`expose`): Logik, **Figurenkraft**, **Weltnutzen**, **Handlungsbogen** — artifact is Charaktere+Welt+Exposé; dimension apply routes to the matching Spec part. On **Kapitelgerüst**: Logik, **Funktion**, **Dramaturgie**, **Abdeckung**. On **Manuskript**: Logik, Stil, Dramaturgie, Lesefluss. Dimension improve: **Analysieren** → dialog → **Einarbeiten** (`editorial.reifegradImprove[stage]`). Bewerter role. Stage Verbessern and Dimension/Leser-Feedback share the same HITL decision fields on `aenderungsPrompts`.

**Cross-stage consistency:** There is no automatic “Gerüst-Entscheidung → Exposé nachziehen”. After a Kapitelgerüst decision, open **Spec → Verbessern** (or the relevant Spec-Dimension) and state the consistency change as author decision / Auftrag — or use Schreib-Coach on Idee if the premise must move first. Downstream wipe/cascade was removed on purpose.

**Quality-first context:** Critique and draft prompts use generous clips and full upstream artifacts. Shared excellence mandate in `src/lib/roman/pipeline/quality-brief.ts`.

Persistence: Kapitelgerüst markdown → `manuskript_raw`; structured scenes → `editorial.szenenplotStructured` (cleared with Kapitelgerüst downstream); Manuskript prose → `editorial.manuskriptText`; continuity → `editorial.storyState`; legacy `editorial.canon` cleared with Manuskript. Migrations: `20260911160000_roman_pipeline.sql`, `20260916100000_roman_pipeline_vertical.sql`. Legacy Phase-0 / scene-table writing / gate UI has been removed.

## Meine Welt

Table `leseno.child_profiles` (1:N per auth user); RPCs `list_my_child_profiles` / `upsert_my_child_profile` / `delete_my_child_profile`.

## Mein Buchclub

Route `/mein-buchclub` (package feature `buchclub`, Plus+). Friendship code on `user_profiles`; confirmed friendships; email invite via SMTP. Share level on `user_stories.book_club_share`: `none` (private), `friends`, `public` (visible in every Buchclub). Likes via RPCs — see migrations `20260908090000_book_club.sql` and `20260908150000_book_club_share_levels.sql`.

## Bot guard

`src/lib/security/bot-guard.ts`: honeypot + min fill time + **in-memory** IP rate limit (per Node process). Fine for one Coolify replica; scale-out needs Redis/edge (documented in that file).

## Tests

- Smoke + admin gate: `npm run test:e2e` (`e2e/smoke.spec.ts`)  
- Full AI story (costs quota): `npx playwright test e2e/story-generate.spec.ts`  
- Dev server must be running (`npm run dev`)

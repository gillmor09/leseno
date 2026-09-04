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

## Meine Welt

Table `leseno.child_profiles` (1:N per auth user); RPCs `list_my_child_profiles` / `upsert_my_child_profile` / `delete_my_child_profile`.

## Bot guard

`src/lib/security/bot-guard.ts`: honeypot + min fill time + **in-memory** IP rate limit (per Node process). Fine for one Coolify replica; scale-out needs Redis/edge (documented in that file).

## Tests

- Smoke + admin gate: `npm run test:e2e` (`e2e/smoke.spec.ts`)  
- Full AI story (costs quota): `npx playwright test e2e/story-generate.spec.ts`  
- Dev server must be running (`npm run dev`)

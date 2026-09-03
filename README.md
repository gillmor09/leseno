# Leseno

Next.js (App Router) + TypeScript + Tailwind CSS v4 + Supabase. Deploy via GitHub → Coolify.

## Local development

```bash
cp .env.example .env.local
# fill NEXT_PUBLIC_SUPABASE_* when ready
npm install
npm run dev
```

Or use Cursor / VS Code tasks:

- **App starten** — Dev-Server + Simple Browser (`http://localhost:3000`)
- **App stoppen** — Port 3000 freigeben
- **GitHub-Commit** — stage, commit, push to `origin` (usually `main`)

## Stack notes

- App DB schema name: `leseno` (see `src/lib/supabase/schema.ts`)
- Cursor agent rules: `.cursor/rules/`
- SQL migrations: `supabase/migrations/`

/**
 * Writes UTF-8 SQL seed migration for help_texts defaults.
 */
import { writeFileSync } from "node:fs";
import { listHelpDefaults } from "../src/lib/help/defaults";

function esc(value: string): string {
  return value.replaceAll("'", "''");
}

const header = `-- Help texts: return all rows for a page (empty bodies = intentionally cleared).
-- Member UI falls back to built-in defaults when a slot row is missing.
-- Seed below pre-fills Admin → Hilfe (ON CONFLICT DO NOTHING).

create or replace function public.list_help_texts_for_page(p_page_id text)
returns table (
  page_id text,
  slot_id text,
  title text,
  html_body text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = leseno, public
as $$
  select
    t.page_id,
    t.slot_id,
    t.title,
    t.html_body,
    t.updated_at
  from leseno.help_texts t
  where t.page_id = p_page_id
  order by t.slot_id asc;
$$;

revoke all on function public.list_help_texts_for_page(text) from public;
grant execute on function public.list_help_texts_for_page(text) to service_role;

`;

const inserts = listHelpDefaults()
  .map(
    (row) =>
      `insert into leseno.help_texts (page_id, slot_id, title, html_body)\n` +
      `values ('${esc(row.pageId)}', '${esc(row.slotId)}', '${esc(row.title)}', '${esc(row.htmlBody)}')\n` +
      `on conflict (page_id, slot_id) do nothing;\n`,
  )
  .join("\n");

const out =
  "supabase/migrations/20260911130000_help_texts_defaults.sql";
writeFileSync(out, header + inserts, "utf8");
console.log(`Wrote ${listHelpDefaults().length} seed rows to ${out}`);

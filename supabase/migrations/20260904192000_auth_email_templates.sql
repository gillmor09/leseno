-- Auth email templates (register + forget) for Supabase Send Email hooks.

create table if not exists leseno.auth_email_templates (
  id text primary key,
  label text not null,
  description text not null default '',
  subject text not null,
  html_body text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint auth_email_templates_id_chk check (id in ('register', 'forget'))
);

drop trigger if exists auth_email_templates_set_updated_at on leseno.auth_email_templates;
create trigger auth_email_templates_set_updated_at
before update on leseno.auth_email_templates
for each row
execute function leseno.set_updated_at();

alter table leseno.auth_email_templates enable row level security;

-- No direct table access via PostgREST; service_role RPCs only.
revoke all on table leseno.auth_email_templates from anon, authenticated;
grant all on table leseno.auth_email_templates to service_role;

insert into leseno.auth_email_templates (id, label, description, subject, html_body, enabled)
values
(
  'register',
  'Registrierung',
  'Bestätigung nach der Anmeldung (Supabase email_action_type: signup).',
  'Willkommen bei Leseno — bitte bestätige deine E-Mail',
  $html$<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><title>E-Mail bestätigen</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Nunito,Segoe UI,sans-serif;color:#18181b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:24px;padding:32px;box-shadow:0 10px 30px rgba(24,24,27,.08);">
        <tr><td>
          <p style="margin:0 0 8px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#c2410c;">Leseno</p>
          <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;">Willkommen!</h1>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#52525b;">
            Hallo {{email}}, danke für deine Registrierung. Bestätige bitte deine E-Mail-Adresse, damit du starten kannst.
          </p>
          <p style="margin:0 0 24px;">
            <a href="{{confirmation_url}}" style="display:inline-block;background:#c2410c;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px;">
              E-Mail bestätigen
            </a>
          </p>
          <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#71717a;">
            Oder Code eingeben: <strong style="color:#18181b;">{{token}}</strong>
          </p>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#a1a1aa;">
            Wenn du dich nicht registriert hast, kannst du diese E-Mail ignorieren.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>$html$,
  true
),
(
  'forget',
  'Passwort vergessen',
  'Link zum Zurücksetzen des Passworts (Supabase email_action_type: recovery).',
  'Leseno — Passwort zurücksetzen',
  $html$<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><title>Passwort zurücksetzen</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Nunito,Segoe UI,sans-serif;color:#18181b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:24px;padding:32px;box-shadow:0 10px 30px rgba(24,24,27,.08);">
        <tr><td>
          <p style="margin:0 0 8px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#c2410c;">Leseno</p>
          <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;">Passwort zurücksetzen</h1>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#52525b;">
            Hallo {{email}}, du hast angefordert, dein Passwort zurückzusetzen. Nutze den Button unten — der Link ist nur eine Weile gültig.
          </p>
          <p style="margin:0 0 24px;">
            <a href="{{confirmation_url}}" style="display:inline-block;background:#c2410c;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px;">
              Neues Passwort wählen
            </a>
          </p>
          <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#71717a;">
            Oder Code eingeben: <strong style="color:#18181b;">{{token}}</strong>
          </p>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#a1a1aa;">
            Wenn du das nicht warst, ignoriere diese E-Mail — dein Passwort bleibt unverändert.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>$html$,
  true
)
on conflict (id) do nothing;

create or replace function public.list_auth_email_templates()
returns table (
  id text,
  label text,
  description text,
  subject text,
  html_body text,
  enabled boolean,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, leseno
as $$
  select
    t.id,
    t.label,
    t.description,
    t.subject,
    t.html_body,
    t.enabled,
    t.updated_at
  from leseno.auth_email_templates as t
  order by t.id;
$$;

create or replace function public.upsert_auth_email_template(
  p_id text,
  p_subject text,
  p_html_body text,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public, leseno
as $$
begin
  if p_id not in ('register', 'forget') then
    raise exception 'Unbekannte Template-ID.';
  end if;

  update leseno.auth_email_templates
  set subject = coalesce(nullif(trim(p_subject), ''), subject),
      html_body = coalesce(nullif(trim(p_html_body), ''), html_body),
      enabled = coalesce(p_enabled, enabled)
  where id = p_id;

  if not found then
    raise exception 'Template nicht gefunden.';
  end if;
end;
$$;

revoke all on function public.list_auth_email_templates() from public, anon, authenticated;
revoke all on function public.upsert_auth_email_template(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.list_auth_email_templates() to service_role;
grant execute on function public.upsert_auth_email_template(text, text, text, boolean) to service_role;

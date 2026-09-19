-- Roman-module KI roles (system prompts + model). Separate from story prompt_templates.

create table if not exists leseno.roman_ki_rollen (
  key text primary key,
  label text not null,
  purpose text not null default '',
  system_prompt text not null default '',
  user_prompt_hint text not null default '',
  model_slug text not null default 'gemini-3.8-flash',
  sort_order smallint not null default 0,
  updated_at timestamptz not null default now()
);

drop trigger if exists roman_ki_rollen_set_updated_at on leseno.roman_ki_rollen;
create trigger roman_ki_rollen_set_updated_at
before update on leseno.roman_ki_rollen
for each row
execute function leseno.set_updated_at();

alter table leseno.roman_ki_rollen enable row level security;
revoke all on table leseno.roman_ki_rollen from anon, authenticated;
grant all on table leseno.roman_ki_rollen to service_role;

insert into leseno.roman_ki_rollen (
  key, label, purpose, system_prompt, user_prompt_hint, model_slug, sort_order
) values
(
  'schreib_coach',
  'Schreib-Coach',
  'Hilft beim Formulieren, Tempo und Klarheit — ohne den Text zu übernehmen.',
  $prompt$Du bist Schreib-Coach für Buchprojekte (deutscher Markt).
Du hilfst Autor:innen, Szenen und Abschnitte klarer, lebendiger und stimmiger zu formulieren.
Regeln:
- Antworte auf Deutsch, konkret und knapp.
- Gib Alternativformulierungen und Begründungen — übernimm nicht die Autorenschaft.
- Respektiere Genre, Zielalter und bestehende Stilvorgaben, wenn sie im Kontext stehen.
- Keine Meta-Floskeln, keine kompletten Kapitel aus dem Nichts.$prompt$,
  'Kontext: Szene/Absatz + gewünschte Hilfe (Tempo, Dialog, Bildhaftigkeit …).',
  'gemini-3.8-flash',
  10
),
(
  'entwicklungslektor',
  'Entwicklungslektor',
  'Dramaturgie, Figurenbögen, Lücken und Widersprüche — strukturelles Lektorat.',
  $prompt$Du bist Entwicklungslektor:in für Bücher (deutscher Markt).
Du prüfst Struktur, Figurenbögen, Motivation, Pacing und innere Logik.
Regeln:
- Antworte auf Deutsch. Struktur: Stärken → Risiken → konkrete Nacharbeit (imperativ).
- Keine Stil-Mikrokorrekturen, außer sie blockieren Verständnis oder Charakterstimme.
- Nenne Eintragungsorte (Figur X → Bogen, Prämisse, Plot-Beat …), wenn sinnvoll.
- Maximal 5 Nacharbeitspunkte; keine Quizfragen ohne Ort.$prompt$,
  'Kontext: Prämisse, Figuren, Outline/Szene + Frage der Autor:in.',
  'claude-sonnet-5',
  20
),
(
  'co_autor',
  'Co-Autor',
  'Schreibt mit — Entwürfe in der Stimme des Projekts, editierbar.',
  $prompt$Du bist Co-Autor:in für Buchprojekte (deutscher Markt).
Du lieferst editierbare Entwürfe in der Stimme und den Vorgaben des Projekts.
Regeln:
- Antworte auf Deutsch. Keine Meta-Kommentare im Fließtext.
- Halte Perspektive, Zeitform, Tonalität und Figurenstimmen ein, wenn im Kontext.
- Bei Konflikt gewinnen harte Vorgaben / MUSS-Blöcke aus dem Kontext.
- Länge und Form an die Aufgabe anpassen (Beat, Szene, Dialogpassage).$prompt$,
  'Aufgabe + Fundament/Stil-Kontext + optionaler Entwurf zum Weiterbauen.',
  'gemini-3.8-flash',
  30
),
(
  'fachberater',
  'Fachberater (Sensitive Reader)',
  'Prüft sensible Darstellungen, Stereotypen und Fach-/Lebensrealität.',
  $prompt$Du bist Fachberater:in / Sensitive Reader für Buchtexte (deutscher Markt).
Du prüfst Darstellung von Identität, Trauma, Behinderung, Kultur, Beruf und Fachwissen auf Respekt, Plausibilität und unnötige Klischees.
Regeln:
- Antworte auf Deutsch, klar und ohne Moralpredigt.
- Trenne: (1) problematische Stellen, (2) warum, (3) konkrete Alternativen.
- Erfinde keine „Verbote“ ohne Begründung; unterscheide Härtegrad (kritisch / optional).
- Bleib im Text — keine Politik-Essays.$prompt$,
  'Textauszug + betroffene Themen / Fachfragen.',
  'claude-sonnet-5',
  40
),
(
  'testleser_fanbase',
  'Testleser / Fanbase',
  'Leserstimme: Emotion, Spannung, Weiterlesen, Vergleich zu Genre-Favoriten.',
  $prompt$Du bist begeisterte:r Stammleser:in und Testleser:in für das Genre dieses Buchs.
Du gibst ehrliches Leser-Feedback: Emotion, Spannung, Identifikation, Lesefluss — und wo es hinter Lieblingsbüchern zurückbleibt.
Regeln:
- Antworte auf Deutsch, in Ich-Perspektive als Leser:in (keine Lektorats-Checkliste).
- Nenne 2–4 konkrete Stellen oder Momente.
- Sei kritisch und konkret, aber konstruktiv.
- Du bist keine Lektor:in — dich interessiert, ob du weiterliest und empfiehlst.$prompt$,
  'Szene/Kapitel + Genre/Ton-Hinweis.',
  'gemini-3.8-flash',
  50
)
on conflict (key) do nothing;

create or replace function public.list_roman_ki_rollen()
returns table (
  key text,
  label text,
  purpose text,
  system_prompt text,
  user_prompt_hint text,
  model_slug text,
  sort_order smallint,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, leseno
as $$
  select
    r.key,
    r.label,
    r.purpose,
    r.system_prompt,
    r.user_prompt_hint,
    r.model_slug,
    r.sort_order,
    r.updated_at
  from leseno.roman_ki_rollen as r
  order by r.sort_order, r.key;
$$;

create or replace function public.upsert_roman_ki_rolle(
  p_key text,
  p_label text,
  p_purpose text,
  p_system_prompt text,
  p_user_prompt_hint text,
  p_model_slug text,
  p_sort_order smallint
)
returns void
language sql
security definer
set search_path = public, leseno
as $$
  insert into leseno.roman_ki_rollen (
    key, label, purpose, system_prompt, user_prompt_hint, model_slug, sort_order, updated_at
  ) values (
    p_key,
    p_label,
    coalesce(p_purpose, ''),
    coalesce(p_system_prompt, ''),
    coalesce(p_user_prompt_hint, ''),
    coalesce(nullif(trim(p_model_slug), ''), 'gemini-3.8-flash'),
    coalesce(p_sort_order, 0),
    now()
  )
  on conflict (key) do update set
    label = excluded.label,
    purpose = excluded.purpose,
    system_prompt = excluded.system_prompt,
    user_prompt_hint = excluded.user_prompt_hint,
    model_slug = excluded.model_slug,
    sort_order = excluded.sort_order,
    updated_at = now();
$$;

grant execute on function public.list_roman_ki_rollen() to service_role;
grant execute on function public.upsert_roman_ki_rolle(text, text, text, text, text, text, smallint) to service_role;

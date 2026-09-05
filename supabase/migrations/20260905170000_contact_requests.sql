-- Contact form submissions (email for reply + message body).

create table if not exists leseno.contact_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  message text not null,
  created_at timestamptz not null default now(),
  constraint contact_requests_email_nonempty
    check (char_length(trim(email)) > 0),
  constraint contact_requests_message_nonempty
    check (char_length(trim(message)) > 0)
);

create index if not exists contact_requests_created_idx
  on leseno.contact_requests (created_at desc);

comment on table leseno.contact_requests is
  'Public contact form: reply email + message, with created_at.';

alter table leseno.contact_requests enable row level security;

revoke all on table leseno.contact_requests from anon, authenticated;
grant all on table leseno.contact_requests to service_role;

/**
 * Insert one contact request (public form). No select for anon.
 */
create or replace function public.insert_contact_request(
  p_email text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public, leseno
as $$
declare
  v_id uuid;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_message text := trim(coalesce(p_message, ''));
begin
  if v_email is null or char_length(v_email) < 3 or position('@' in v_email) = 0 then
    raise exception 'Ungültige E-Mail-Adresse.';
  end if;
  if char_length(v_message) < 5 then
    raise exception 'Nachricht ist zu kurz.';
  end if;
  if char_length(v_message) > 5000 then
    raise exception 'Nachricht ist zu lang.';
  end if;

  insert into leseno.contact_requests (email, message)
  values (v_email, v_message)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.insert_contact_request(text, text) from public;
grant execute on function public.insert_contact_request(text, text) to anon, authenticated, service_role;

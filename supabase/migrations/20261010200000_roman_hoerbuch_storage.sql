-- Roman Hörbuch MP3s: private Storage bucket (service-role upload/signed URLs).
-- Metadata lives in roman editorial jsonb (`hoerbuchAudio`).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'roman-hoerbuch',
  'roman-hoerbuch',
  false,
  104857600,
  array['audio/mpeg']::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

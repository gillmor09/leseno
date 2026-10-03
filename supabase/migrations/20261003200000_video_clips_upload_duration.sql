-- Uploaded finished clips may be longer than Veo presets (metadata only).

alter table leseno.video_clips
  drop constraint if exists video_clips_duration_check;

alter table leseno.video_clips
  add constraint video_clips_duration_check
  check (duration_seconds >= 1 and duration_seconds <= 600);

comment on constraint video_clips_duration_check on leseno.video_clips is
  'Veo presets or approximate length for uploaded MP4s (1–600 s).';

-- Allow longer Veo clip durations in admin metadata.

alter table leseno.video_clips
  drop constraint if exists video_clips_duration_check;

alter table leseno.video_clips
  add constraint video_clips_duration_check
  check (duration_seconds in (4, 6, 8, 10, 12, 15, 20));

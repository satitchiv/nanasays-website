-- Add Thai caption support to social_posts.
--
-- `copy_th` holds the Thai translation of `copy_en`. Nullable — translation
-- is opt-in via the admin UI "Generate Thai caption" action, not auto-run
-- at album creation time. Regenerating overwrites all three columns;
-- history is not kept (if we later need it, promote to a
-- social_post_translations table).

alter table public.social_posts
  add column if not exists copy_th text;

alter table public.social_posts
  add column if not exists copy_th_generated_at timestamptz;

alter table public.social_posts
  add column if not exists copy_th_model text;

comment on column public.social_posts.copy_th is
  'Thai translation of copy_en. Written by the admin "Generate Thai caption" action; nullable when never translated.';
comment on column public.social_posts.copy_th_generated_at is
  'Timestamp of the most recent Thai caption generation.';
comment on column public.social_posts.copy_th_model is
  'Claude model slug that produced the current Thai caption (e.g. claude-sonnet-4-6).';

-- Add the verified-data gate to the parent-demand topic creator.
ALTER TABLE public.research_room_topic_catalog
  ADD COLUMN IF NOT EXISTS verified_school_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verified_coverage_percent numeric(5, 1) NOT NULL DEFAULT 0;

ALTER TABLE public.research_room_topic_creator_runs
  ADD COLUMN IF NOT EXISTS candidates_without_verified_coverage integer NOT NULL DEFAULT 0;

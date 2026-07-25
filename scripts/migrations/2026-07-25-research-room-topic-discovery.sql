-- Allow the topic creator to promote dimensions discovered from verified
-- database fields as well as repeated parent demand.
ALTER TABLE public.research_room_topic_catalog
  ADD COLUMN IF NOT EXISTS evidence_paths text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.research_room_topic_catalog
  DROP CONSTRAINT IF EXISTS research_room_topic_catalog_source_check;

ALTER TABLE public.research_room_topic_catalog
  ADD CONSTRAINT research_room_topic_catalog_source_check
  CHECK (source IN ('parent_demand', 'database_inventory'));

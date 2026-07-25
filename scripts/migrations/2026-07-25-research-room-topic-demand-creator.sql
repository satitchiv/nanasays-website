-- Research Room parent-demand topic creator
--
-- This is deliberately separate from chatbot storage. The Research Room
-- request endpoint writes here, and the scheduled creator reads only this
-- table. It promotes labels, never invents school facts or comparison cells.

CREATE TABLE IF NOT EXISTS public.research_room_topic_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key           text NOT NULL UNIQUE,
  user_id              uuid NOT NULL,
  child_id             uuid NOT NULL,
  original_query       text NOT NULL,
  topic_label          text NOT NULL,
  normalized_topic     text NOT NULL,
  school_slugs         text[] NOT NULL DEFAULT '{}'::text[],
  missing_school_slugs text[] NOT NULL DEFAULT '{}'::text[],
  reason               text NOT NULL CHECK (reason IN (
    'unsupported_topic', 'no_reliable_coverage', 'partial_coverage',
    'shortlist_school_added'
  )),
  status               text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'promoted', 'dismissed')),
  promoted_topic_id    text,
  requested_at         timestamptz NOT NULL DEFAULT now(),
  last_seen_at         timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_room_topic_requests_topic
  ON public.research_room_topic_requests (normalized_topic, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_room_topic_requests_status
  ON public.research_room_topic_requests (status, requested_at DESC);

CREATE TABLE IF NOT EXISTS public.research_room_topic_catalog (
  id                   text PRIMARY KEY,
  label                text NOT NULL UNIQUE,
  normalized_topic     text NOT NULL UNIQUE,
  demand_count         integer NOT NULL DEFAULT 0 CHECK (demand_count >= 0),
  unique_parent_count  integer NOT NULL DEFAULT 0 CHECK (unique_parent_count >= 0),
  status               text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'retired')),
  source               text NOT NULL DEFAULT 'parent_demand' CHECK (source = 'parent_demand'),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_room_topic_catalog_status
  ON public.research_room_topic_catalog (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.research_room_topic_creator_runs (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduler_key              text NOT NULL,
  run_key                    text NOT NULL,
  mode                       text NOT NULL CHECK (mode IN ('dry-run', 'apply')),
  status                     text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  started_at                 timestamptz NOT NULL DEFAULT now(),
  finished_at                timestamptz,
  requests_evaluated         integer NOT NULL DEFAULT 0,
  candidates_below_threshold integer NOT NULL DEFAULT 0,
  topics_promoted           integer NOT NULL DEFAULT 0,
  requests_marked_promoted  integer NOT NULL DEFAULT 0,
  error_message              text,
  summary                    jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT uq_research_room_topic_creator_run UNIQUE (scheduler_key, run_key)
);

CREATE INDEX IF NOT EXISTS idx_research_room_topic_creator_runs_started
  ON public.research_room_topic_creator_runs (scheduler_key, started_at DESC);

ALTER TABLE public.research_room_topic_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_room_topic_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_room_topic_creator_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.research_room_topic_requests FROM anon, authenticated;
REVOKE ALL ON public.research_room_topic_catalog FROM anon, authenticated;
REVOKE ALL ON public.research_room_topic_creator_runs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.research_room_topic_requests TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.research_room_topic_catalog TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.research_room_topic_creator_runs TO service_role;

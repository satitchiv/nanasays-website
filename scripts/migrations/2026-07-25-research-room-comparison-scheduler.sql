-- Research Room UK comparison scheduler
--
-- Re-runnable. Apply this migration before enabling the scheduled workflow.
-- The scheduler is service-role-only and only receives cells produced by the
-- database/approved Notion resolver in the repository.

CREATE TABLE IF NOT EXISTS public.research_room_comparison_scheduler_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduler_key     text NOT NULL,
  run_key           text NOT NULL,
  mode              text NOT NULL CHECK (mode IN ('dry-run', 'apply')),
  status            text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  schools_evaluated integer NOT NULL DEFAULT 0,
  rows_evaluated    integer NOT NULL DEFAULT 0,
  rows_updated      integer NOT NULL DEFAULT 0,
  cells_filled      integer NOT NULL DEFAULT 0,
  cells_preserved   integer NOT NULL DEFAULT 0,
  cells_unfilled    integer NOT NULL DEFAULT 0,
  rows_update_failed integer NOT NULL DEFAULT 0,
  error_message     text,
  summary           jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT uq_research_room_scheduler_run UNIQUE (scheduler_key, run_key)
);

CREATE INDEX IF NOT EXISTS idx_research_room_scheduler_runs_started
  ON public.research_room_comparison_scheduler_runs (scheduler_key, started_at DESC);

ALTER TABLE public.research_room_comparison_scheduler_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_room_comparison_scheduler_runs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.research_room_comparison_scheduler_runs TO service_role;

-- Atomic fill primitive. A concurrent parent/session write wins if its cell is
-- already populated; the scheduler never replaces it with its snapshot.
CREATE OR REPLACE FUNCTION public.merge_uk_comparison_row_cells(
  p_row_id uuid,
  p_cells  jsonb
) RETURNS TABLE(updated boolean, filled_count integer)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_old_cells jsonb;
  v_new_cells jsonb;
  v_filled integer := 0;
BEGIN
  -- EXECUTE is revoked from PUBLIC, anon, and authenticated below; only the
  -- service_role grant can invoke this SECURITY DEFINER merge primitive.
  IF p_row_id IS NULL OR p_cells IS NULL OR jsonb_typeof(p_cells) <> 'object' THEN
    RAISE EXCEPTION 'p_row_id and object p_cells are required' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM jsonb_each(p_cells) AS patch(key, value)
     WHERE jsonb_typeof(patch.value) <> 'object'
        OR patch.value->>'evidence_kind' <> 'nana_database'
  ) THEN
    RAISE EXCEPTION 'scheduler cells must contain nana_database evidence'
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM jsonb_object_keys(p_cells) AS patch(key)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.schools s
        WHERE s.slug = patch.key
          AND s.country = 'United Kingdom'
     )
  ) THEN
    RAISE EXCEPTION 'scheduler cells must target United Kingdom schools only'
      USING ERRCODE = '22023';
  END IF;

  SELECT cell_data INTO v_old_cells
    FROM public.comparison_rows
   WHERE id = p_row_id
     AND undone_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;
  v_old_cells := CASE
    WHEN jsonb_typeof(v_old_cells) = 'object' THEN v_old_cells
    ELSE '{}'::jsonb
  END;

  SELECT count(*)::integer INTO v_filled
    FROM jsonb_each(p_cells) AS patch(key, value)
   WHERE NOT (
     jsonb_typeof(v_old_cells -> patch.key) = 'object'
     AND nullif(btrim(v_old_cells -> patch.key ->> 'value'), '') IS NOT NULL
   );

  SELECT coalesce(jsonb_object_agg(patch.key, CASE
    WHEN jsonb_typeof(v_old_cells -> patch.key) = 'object'
         AND nullif(btrim(v_old_cells -> patch.key ->> 'value'), '') IS NOT NULL
      THEN v_old_cells -> patch.key
    ELSE patch.value
  END), '{}'::jsonb)
    INTO v_new_cells
    FROM jsonb_each(p_cells) AS patch(key, value);

  -- Merge the patch over the old object only after the per-key preservation
  -- decision above. Existing unrelated school cells remain untouched.
  UPDATE public.comparison_rows
     SET cell_data = v_old_cells || v_new_cells
   WHERE id = p_row_id
     AND undone_at IS NULL;

  RETURN QUERY SELECT true, v_filled;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_uk_comparison_row_cells(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_uk_comparison_row_cells(uuid, jsonb)
  TO service_role;

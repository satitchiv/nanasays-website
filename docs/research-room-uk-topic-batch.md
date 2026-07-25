# Research Room UK comparison-topic batch

Last verified: 2026-07-25

This scheduler scans only United Kingdom schools that already have a curated
`school_structured_data` record. It runs all 16 foundational comparison rows
and every supported parent-facing topic through the same resolver used when a
school is added to the Research Room. In apply mode it also fills missing cells
in active Research Room rows for the session's shortlisted UK schools.

## One-time database setup

Apply `scripts/migrations/2026-07-25-research-room-comparison-scheduler.sql`
with the project's normal Supabase SQL migration process before running the
manual smoke test or enabling the schedule. The migration is rerunnable and
adds the service-role-only run log plus an atomic, UK-only cell merge function.

Run:

```sh
npm run research:batch:uk-comparisons
```

Use `-- --json` for the complete per-topic missing-school lists. The default is
safe dry-run mode; it writes one run-log row but no comparison cells:

```sh
npm run research:batch:uk-comparisons -- --dry-run --json
```

After reviewing that successful manual output, an explicit apply run is:

```sh
npm run research:batch:uk-comparisons -- --apply --json
```

## Safety contract

- Dry-run is the default and performs no comparison-row writes. It records the
  run in `research_room_comparison_scheduler_runs`.
- Apply mode is explicit and uses the service-role-only atomic merge RPC.
- Populated cells are always preserved, including stronger sourced values.
- Empty cells can be filled only with `nana_database` evidence from the
  verified `schools`, `school_structured_data`, or approved Notion mirror path.
- The merge primitive rejects non-UK school keys and web-search evidence.
- The Supabase service key stays in the server-side command environment.
- Web-search evidence is rejected; this run publishes nothing from school
  websites.
- The scheduler does not read or modify chatbot routes/logs.
- Missing values remain explicit gaps and are never invented.
- A non-zero exit code means no UK schools were found, catalogue topics were
  skipped, or a resolver/evidence integrity issue was detected.

The scheduled workflow is `.github/workflows/research-room-uk-comparisons.yml`.
It runs at 00:00 and 12:00 UTC. Its manual `workflow_dispatch` input defaults
to dry-run; scheduled invocations use apply mode. A duplicate delivery in the
same UTC slot is claimed once by the unique `(scheduler_key, run_key)` key.

## First live dry run

The pre-scheduler 2026-07-25 pilot completed successfully:

- 161 comparison-ready UK schools.
- 16 foundational comparison rows.
- 26 supported comparison topics.
- 6,762 school-row checks.
- 4,896 cells ready from trusted internal data.
- 1,866 explicit data gaps.
- 0 resolver or evidence-integrity issues.
- 0 comparison-cell writes.

The foundational rows include boarding pupils, day pupils, boarding ratio,
international pupils, class size, exam results, admissions, and fees. Among
the searchable topics, annual fees, school location, and school type had
complete coverage. Every other topic had at least one verified value but still
had school-level gaps. The largest searchable-topic gaps were languages
offered (124 schools), lowest boarding entry (90), registration fee (89), and
football coaching/elite pathway (68).

# Research Room UK comparison-topic batch

Last verified: 2026-07-25

This pilot scans only United Kingdom schools that already have a curated
`school_structured_data` record. It runs all 16 foundational comparison rows
and every supported parent-facing topic through the same resolver used when a
school is added to the Research Room.

Run:

```sh
npm run research:batch:uk-comparisons
```

Use `-- --json` for the complete per-topic missing-school lists.

## Safety contract

- Dry-run only: the script contains no insert, update, delete, or RPC call.
- Passing `--apply` fails immediately.
- The Supabase service key stays in the server-side command environment.
- Web-search evidence is rejected; this run publishes nothing from school
  websites.
- Missing values remain explicit gaps and are never invented.
- A non-zero exit code means no UK schools were found, catalogue topics were
  skipped, or a resolver/evidence integrity issue was detected.

The pilot is intentionally not scheduled. Scheduler work starts only after its
live output is reviewed and approved.

## First live dry run

The 2026-07-25 pilot completed successfully:

- 161 comparison-ready UK schools.
- 16 foundational comparison rows.
- 26 supported comparison topics.
- 6,762 school-row checks.
- 4,896 cells ready from trusted internal data.
- 1,866 explicit data gaps.
- 0 resolver or evidence-integrity issues.
- 0 database writes.

The foundational rows include boarding pupils, day pupils, boarding ratio,
international pupils, class size, exam results, admissions, and fees. Among
the searchable topics, annual fees, school location, and school type had
complete coverage. Every other topic had at least one verified value but still
had school-level gaps. The largest searchable-topic gaps were languages
offered (124 schools), lowest boarding entry (90), registration fee (89), and
football coaching/elite pathway (68).

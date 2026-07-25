# Research Room add-school root-cause audit

Last verified: 2026-07-25

## Root causes

1. The branch originally read only part of the approved Notion mirror, so
   values available in `school_notion_backfill` were omitted.
2. Added schools used a broad fallback after a precise seeded comparison
   failed. This could put annual fees into a per-term row or the nearest
   airport into a Heathrow-specific row.
3. Existing seeded rows were insert-only snapshots, so newly available source
   data was not reconciled automatically.
4. The school picker searched the complete 25,250-record UK directory even
   though only curated `school_structured_data` records are safe to compare.
5. A temporary Notion-mirror read failure could reconcile an incomplete
   snapshot and remove previously verified Notion-backed cells.

## Permanent safeguards

- Both room load and add-school hydration query structured data and the
  approved Notion mirror for every selected school.
- Active seeded rows reconcile on room load only when the source snapshot is
  complete. A Notion-mirror outage preserves the last verified cells.
- Precise seeded comparisons never fall through to broader semantic matches.
- Heathrow requests require Heathrow data; another airport is never
  substituted.
- The picker and POST route allow new in-room additions only when a curated
  structured comparison record exists.
- Missing General and parent-added topics are queued to the comparison
  research backlog. Missing values remain visibly unfilled rather than being
  invented.

## Full-catalogue verification

Run:

```sh
npm run research:coverage:add-school
```

Verified result:

- 25,250 UK directory records.
- 161 UK schools currently comparison-ready in the picker.
- 322 total curated structured schools evaluated across all markets.
- 72 approved Notion-mirror records used as fallbacks.
- 16 General rows and 26 supported comparison topics evaluated for every
  curated school.
- 0 resolver failures.
- 0 curated schools with no General comparison values.
- 0 annual-fee-to-term-fee leaks.
- 0 invalid Heathrow substitutions.

Comparison-ready means the school can safely be added and the available
database fields will populate automatically. It does not mean every topic is
complete for every school; genuine field-level gaps remain in the research
backlog until verified data is added.

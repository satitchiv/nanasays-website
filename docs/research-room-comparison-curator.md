# Research Room Comparison Curator

The Research Room Comparison Curator is the operational owner for the
comparison automations. It is a deterministic software worker, not an AI
model, so its scheduled runs do not consume AI tokens.

## Responsibilities

| Job | Schedule (UTC) | Mode | Purpose |
| --- | --- | --- | --- |
| UK comparison values | 00:00 and 12:00 daily | Apply | Fill only missing UK comparison cells from verified internal data. |
| Topic demand | 00:30 and 12:30 daily | Apply | Promote database-backed topics and repeated parent demand without inventing school facts. |
| Health check | 01:15 every Sunday | Read only | Review parent demand, topic coverage, and coverage for added schools. |

The twice-daily jobs keep separate run logs and separate idempotency keys. They
are staggered so the value refresh finishes before the topic creator checks
coverage. GitHub concurrency groups prevent overlapping copies of the same
job, and the database run claims turn duplicate deliveries into logged no-ops.

## Safety boundaries

- United Kingdom schools only for comparison-value writes.
- Verified `schools`, `school_structured_data`, and approved Notion-mirror data
  only.
- Existing populated values are preserved.
- Missing facts remain gaps; the workers do not invent them.
- No school website crawling or web-search evidence.
- No AI or language-model calls.
- No chatbot routes, logs, or implementation are read or changed.
- The weekly health check cannot write to the database.

## Manual-only tools

These commands belong to the curator runbook but are intentionally not
scheduled:

- `npm run research:batch:pupil-composition`
- `npm run research:repair:current`

They are repair/backfill tools and require a reviewed dry run and an explicit
operator decision before any apply mode. Keeping them manual prevents a broad
repair from running unattended.

## Manual checks

Run all read-only curator checks locally:

```sh
npm run research:requests
npm run research:coverage
npm run research:coverage:add-school
```

In GitHub Actions, choose **Comparison Curator - weekly health check**, select
**Run workflow**, and leave the scope as **all**. The three checks are
read-only. A failed audit is visible as a failed workflow run; successful
output appears in the run log and job summary.

# Research Room parent-demand topic creator

This is the second Research Room automation. It is separate from the UK
comparison value scheduler:

- The comparison scheduler fills missing, verified UK school values in rows
  that already exist.
- The topic creator promotes repeated parent requests into the Research Room
  search catalogue so future parents can click those topics.

The topic creator does not read chatbot data, crawl school websites, or invent
school facts. Before promotion it scans the verified UK
`school_structured_data` rows and approved Notion mirror. A candidate needs
matching verified evidence for at least 10 comparison-ready UK schools. The
topic record stores that coverage count, but the creator still does not write
school cells. Research Room request events are recorded in
`research_room_topic_requests`. A topic is promoted only after at least three
requests from at least two different parents. Promotion creates a searchable
label backed by measured database coverage; it does not claim that every
school-level fact is ready.

## Safe manual test

Dry-run is the default and writes no catalogue entries:

```sh
npm run research:batch:topic-demand -- --dry-run --json
```

Apply mode is explicit and idempotent:

```sh
npm run research:batch:topic-demand -- --apply --json
```

The workflow runs at 00:30 and 12:30 UTC, after the verified comparison
refresh. Duplicate deliveries in the same UTC slot are logged no-ops.

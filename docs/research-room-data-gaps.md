# Research Room data-gap register

Last verified: 2026-07-25

Scope: current seven-school Research Room shortlist

Rule: this register records only fields that remained unavailable after checking
`schools`, `school_structured_data`, and approved `school_notion_backfill` data.
Parent-entered comparison research requests remain separately queued in
`nana_chat_logs` with backend `comparison_research_request`. Newly added
schools now queue both missing General and parent-added comparison topics to
that same backlog automatically.

## Status definitions

- `source_missing`: the current database and approved Notion sidecar contain no
  publishable value.
- `evidence_gate`: candidate data exists, but it does not yet meet the
  comparison's publication standard.

## Verified open gaps

| School | Comparison | Status | What was checked | Required next action |
|---|---|---|---|---|
| Roedean School | Wellbeing / mental-health staffing | `source_missing` | `wellbeing_staffing.team` is empty and its notes say no staffing detail was found. | Add a named team, roles, or verified staffing model from an authoritative source. |
| Roedean School | Music and performing arts | `source_missing` | The arts record has no detailed music highlights, ensembles, or teaching offer. | Add the current music/performing-arts programme with an authoritative source. |
| Abbotsholme School | Football opportunities and player development | `evidence_gate` | An official-school football/academy record exists, including a named coach, but only one unique evidence URL is stored. | Add a second independent or separately authoritative source, then re-run the evidence gate. |
| Abbotsholme School | Football strength / results | `evidence_gate` | The football record has no publishable competitive tier or result. | Add recent dated results, league/cup level, or another objective strength indicator. |
| Abbotsholme School | Travel from Heathrow | `source_missing` | No Heathrow-specific duration exists in location data or `schools.distance_airport`. | Add a Heathrow-specific drive/rail duration and source. |
| Rossall School | Travel from Heathrow | `source_missing` | No Heathrow-specific duration exists in location data or `schools.distance_airport`. | Add a Heathrow-specific drive/rail duration and source. |
| Abbotsholme School | Class size | `source_missing` | No approved normalized class-size value is available. | Add the published average/typical class size with year-group scope. |
| Wells Cathedral School | Class size | `source_missing` | No approved normalized class-size value is available. | Add the published average/typical class size with year-group scope. |
| Wycombe Abbey | Class size | `source_missing` | No approved normalized class-size value is available. | Add the published average/typical class size with year-group scope. |
| Abbotsholme School | International pupils | `source_missing` | No quantitative count or percentage is stored. | Add a current count or percentage and its reporting year. |
| Abbotsholme School | GCSE 9–7 | `source_missing` | No publishable percentage is stored in structured or approved Notion data. | Add the latest result, exam year, cohort scope, and source. |
| Abbotsholme School | A-level A*–A | `source_missing` | No publishable percentage is stored in structured or approved Notion data. | Add the latest result, exam year, cohort scope, and source. |
| Wells Cathedral School | Boarding fee per term / year | `source_missing` | No boarding fee exists in structured fees, school fee columns, or approved Notion data. | Add the current boarding fee, academic year, included/excluded items, and source. |
| Cheltenham Ladies' College | Registration fee | `source_missing` | No standard registration amount is stored. | Add the current standard amount, currency, refundability, and source. |
| Millfield School | Registration fee | `source_missing` | No standard registration amount is stored. | Add the current standard amount, currency, refundability, and source. |
| Wells Cathedral School | Registration fee | `source_missing` | No standard registration amount is stored. | Add the current standard amount, currency, refundability, and source. |
| Roedean School | Year 9 / 10 admissions timeline | `source_missing` | Entry points exist, but no registration deadline or assessment date is stored. | Add dated registration and assessment milestones for the relevant intake. |
| Wells Cathedral School | Year 9 / 10 admissions timeline | `source_missing` | Entry points exist, but no registration deadline or assessment date is stored. | Add dated registration and assessment milestones for the relevant intake. |

## Resolved by this audit

- Wells Cathedral School travel from Heathrow was recovered from
  `schools.distance_airport` (`2 hours to London Heathrow`).
- Cheltenham Ladies' College, Millfield, and Roedean Heathrow times were
  recovered from `location_profile.airports[].drive_time_min_estimate`.
- Lowest boarding entry was recovered for Cheltenham Ladies' College,
  Millfield, Roedean, Rossall, and Wycombe Abbey by strictly normalizing the
  exact `Lowest Boarding Entry Year` property from clean Notion sidecar rows.
- Rossall, Wells Cathedral, and Millfield pupil composition is read from the
  approved Notion sidecar when structured data is incomplete.
- Wells Cathedral pastoral care is publishable from its substantive structured
  pastoral profile even though `pastoral_model` is null.

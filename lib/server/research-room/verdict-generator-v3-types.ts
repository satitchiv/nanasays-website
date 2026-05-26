// VERDICT GENERATOR v3 — TYPE DEFINITIONS (sketch)
//
// All new and modified types live here. Will be inlined into verdict-generator.ts
// at the top, replacing the v2 ResearchVerdict and related types.
//
// Reviewer notes:
// - format bumps v2 → v3
// - hash payload version bumps 3 → 4 (in the main integration file)
// - ranked_schools[] kept as a derived/legacy field (R1 + R2 + R3 + R4 locked)
// - paths{A,B,C} added as overlay; not a replacement
// - couldnt_compare[] appended at the bottom of ranked_schools[] with the
//   `coverage_below_threshold` flag; consumers filter on it (R3-P1, R4-P1)
// - All v3 schema additions are NULL-SAFE so partial-data schools render gracefully

import type { ComparisonRow, RowCell } from '@/components/nana/comparison-placeholder'
import type { FramingHint } from './path-selectors'

// ── Path identity ───────────────────────────────────────────────────────

export type PathKey = 'A' | 'B' | 'C'
export type PathStatus = 'winner' | 'fallback' | 'needs_research'

// ── ContributingRow — cell-level provenance (R3-P2 + R4 cell-level mod) ─

export type ContributingRow = {
  id:                    string        // comparison_rows.id (unique per source row)
  source_lens_id:        string | null // comparison_rows.created_by_lens_id (preserved for citation)
  lens_kind:             'general' | 'child_fit' | 'chat'
  // R5-P5 FIX: per-school original cell, keyed by school slug. The v1 design
  // emitted one ContributingRow per (row, school) pair with a single
  // `original_cell` field; dedup-by-id then collapsed those entries and lost
  // per-school context. v2 emits ONE entry per source comparison_row carrying
  // a full slug→cell map, which survives dedup intact.
  original_cell_by_slug: Record<string, RowCell>
}

// Per-cluster row metadata after semantic merge.
// `selected_cell_origin_id_by_school[schoolIdx]` is the contributing row whose
// cell value WON the merge for THAT specific school. Cited prose must use the
// matching index to attribute correctly (R5-MUST-4: cell-level provenance).
export type ClusterRowMeta = {
  contributing_rows:                    ContributingRow[]
  contributing_row_count:               number            // total before truncation
  truncated:                            boolean
  selectedCellOriginIdBySchool:         (string | undefined)[]   // R5-MUST-4: per-school array, not a scalar
}

export const MAX_CONTRIBUTING_ROWS_PER_CLUSTER = 24

// ── Brief context (replaces a bare Rubric for narrative/tension passes) ─

export type BriefAnchor = {
  // 'pastoral' added 2026-05-24 (Codex Phase 1.5 r1 carry-forward). Previously
  // when rubric.topPriority='pastoral' the extractAnchors helper mapped it to
  // kind='boarding' as a workaround — losing the semantic distinction between
  // "parent wants boarding" and "parent wants pastoral support specifically".
  // The pastoral anchor preserves the parent's actual intent for downstream
  // narrative/scoring logic.
  kind:    'sport' | 'academic' | 'boarding' | 'location' | 'budget' | 'curriculum' | 'pastoral'
  source:  string                  // brief field name this anchor came from
  weight:  number                  // 0..1 — derived from the rubric
  quote?:  string                  // parent's exact phrase if applicable (e.g. goals_notes excerpt)
}

export type BriefTensionKind =
  | 'sport-vs-academic'
  | 'location-mismatch'
  | 'boarding-mismatch-per-path'
  | 'budget-stretch'
  | 'sen-coverage-gap'
  | 'gender-mismatch'
  | 'curriculum-mismatch'
  | 'year-stage-mismatch'
  | 'important-anchor-no-evidence'

export type BriefTension = {
  kind:          BriefTensionKind
  description:   string                 // user-facing sentence
  impacts_paths: PathKey[]              // which paths surface this in their cost/consider blocks
}

export type HardConstraint = {
  kind:    'gender-single-sex' | 'year-stage'
  value:   string                       // 'boy' | 'girl' | year number etc.
  source:  string                       // which brief field
}

export type BriefContext = {
  rubric:          Rubric               // existing rubric type — see verdict-generator.ts:64
  goalOrientation?: string              // existing brief field, made explicit for tension detection
  anchors:         BriefAnchor[]
  tensions:        BriefTension[]
  hardConstraints: HardConstraint[]
  goalsNotes?:     string               // SANITIZED parent free-text (see quoteBriefGoal in -brief.ts)
}

// Rubric is unchanged from v2 — re-exported for clarity. Lens fields removed elsewhere.
export type Rubric = {
  topPriority:      string | null
  boardingPref:     string | null
  homeRegion:       string | null
  budgetRange:      string | null
  budgetMaxAnnual:  number | null
  curriculumPref:   string | null
  classSizePref:    string | null
  senNeed:          string | null
  childGender:      string | null
  childYear:        number | null
}

// ── PathOverlay — one entry per path ────────────────────────────────────

export type PathOverlay = {
  framing:        string                 // e.g. "Best overall match"
  framingLong:    string                 // the italic deck
  // v3.1 (2026-05-26): which semantic lens picked this path's winner —
  // 'best_overall' = recommender #1, 'strongest_academic' = top academic
  // signal, 'most_affordable'|'least_over_budget'|'lowest_fee' = value
  // variants, 'next_best_fit_b'|'next_best_fit_c' = recommender-walk
  // fallbacks. Optional because cached overlays from earlier v3 releases
  // don't have it; readers must default to 'best_overall'.
  framingHint?:   FramingHint
  winner_slug:    string                 // points to a school in ranked_schools[]
  path_status:    PathStatus             // R4-P2: 'winner' | 'fallback' | 'needs_research'
  reasoning:      string[]               // paragraphs of advisor-voice prose
  evidence:       PathEvidenceItem[]
  costs:          PathCostItem[]
  considerations: string[]
  // status copy for non-winner statuses
  status_note?:   string                 // e.g. "No proven south-west winner yet"
  // UX iteration Phase 2 (2026-05-23): LLM-generated 3-5 paragraph advisor
  // round-up. Populated by enrichVerdictWithAdvisorRoundups() in the verdict
  // route between draft + DB upsert. Optional because (a) LLM may fail
  // (fail-open) and (b) cached verdicts predating this slice don't have it.
  // VerdictTab renders advisor_roundup ?? reasoning so the panel always
  // shows advisor-voice prose. No version-tracking field — when prompts
  // change meaningfully, users can hit Regenerate to force a fresh build.
  advisor_roundup?: string[]
}

export type PathEvidenceItem = {
  row:                  string
  value:                string
  source_url?:          string
  source_label:         string
  // Provenance — which lens originally added the row that produced this value (R4-P2 cell-level)
  cited_lens_id?:       string | null
  cited_lens_kind?:     'general' | 'child_fit' | 'chat'
}

export type PathCostItem = {
  label:  string
  detail: string
}

// ── Couldn't-compare bucket ─────────────────────────────────────────────

export type CouldntCompareSchool = {
  slug:                       string
  name:                       string
  comparison_rows_filled:     number
  comparison_rows_total:      number
  coverage_pct:               number     // 0..100
  brief_match_summary:        string     // "south-west location ✓ · co-ed · day + boarding"
  budget_warning?:            string     // when school exceeds budget cap
  critical_missing_rows:      string[]   // ["A-level results", "rugby programme strength", ...]
  highest_leverage_action?:   string     // copy for "If Path X is your direction, research this first"
}

// ── SchoolFactsForUi — UI-ready projection of SchoolFacts (P1 #4 wiring) ────
//
// The raw SchoolFacts has numbers and nullable fields the UI would otherwise
// have to format and conditional-render at every site. Server-side projection
// gives the renderer pre-composed strings + the inside_filter boolean (which
// needs uk-regions.regionInBucket against the parent's home_region).
//
// All fields nullable — partial-data schools render `--` per slot rather than
// crashing the layout.

export type SchoolFactsForUi = {
  slug:           string
  name:           string
  // Composed "Worcestershire · co-ed · full boarding · A-level" line under the
  // school heading. Empty parts get dropped, so a school with city+coed but no
  // curriculum yields "Worcestershire · co-ed".
  meta:           string
  grades: {
    a_level_label:  string | null       // "61%"
    gcse_label:     string | null       // "78% at 9-7"
    ib_label:       string | null       // "64% at 40+"
  }
  location: {
    town:           string | null       // "Bromsgrove, Worcestershire" (city + region) or just city
    region_label:   string | null       // "West Midlands · outside South West filter" — null if home_region='anywhere'
    // Codex r2 P2 #1: tri-state. boolean when a real filter is in play
    // (home_region is a concrete UK bucket); null when home_region is absent
    // / 'anywhere' / 'overseas' so the UI can omit the pill entirely instead
    // of always rendering "Outside filter" for parents with no filter.
    inside_filter:  boolean | null
    maps_embed:     string | null       // /maps...output=embed when lat/lon present
    maps_external:  string | null
    heathrow_miles: number | null       // straight-line miles, not drive time
  }
  students: {
    total_label:         string | null  // "~1,700"
    boarders_pct_label:  string | null  // "55%"
    day_pct_label:       string | null
    intl_pct_label:      string | null
    boarders_pct:        number | null  // raw 0..100 for bar width
    day_pct:             number | null
    intl_pct:            number | null
  }
  coed:        string | null            // "Co-ed" | "Girls only" | "Boys only"
  curriculum:  string | null            // already composed by SchoolFacts.curriculum
  fees: {
    annual_label: string | null         // "£11,754 – £54,342" or "£40,000" if single
    in_budget:    'fits' | 'partial' | 'over' | null    // null when no budget cap
  }
}

// ── BriefChip — derived from rubric for the verdict-tab chip strip ────────
//
// Server-side derivation so the chip strip stays a dumb renderer. `is_anchor`
// flags the chips that the parent treats as hard preferences (top_priority,
// full-boarding, explicit region filter, etc.) — they get the teal anchor
// style; other chips render in neutral grey.

export type BriefChip = {
  key:        string
  value:      string
  is_anchor?: boolean
}

// ── ResearchVerdictRankedSchool (v3 — adds two fields) ──────────────────

export type ResearchVerdictRankedSchool = {
  slug:                        string
  name:                        string
  rank:                        number
  summary:                     string
  strengths:                   string[]
  reservations:                string[]
  // NEW in v3:
  is_path_winner_for?:         PathKey[]      // R2 + R4: paths this school wins; empty array if none
  coverage_below_threshold?:   boolean        // R3-P1: true for couldnt_compare schools appended at bottom
}

// ── ResearchVerdict (v3) ────────────────────────────────────────────────

export type ResearchVerdict = {
  format:           'research_verdict_v1' | 'research_verdict_v2' | 'research_verdict_v3'
  decision_model?:  'evidence_pool_v2' | 'paths_v3'

  // Legacy fields kept for back-compat (R1 + R2):
  confidence?:      'low' | 'medium' | 'high'
  decision_factors?: string[]
  headline:         string
  ranked_schools:   ResearchVerdictRankedSchool[]   // FULL eligible scored list + couldnt_compare appended w/ flag
  dissenting_view:  string                          // kept; partner-brief reads this
  best_for_child:   string                          // kept; partner-brief reads this
  evidence_gaps:    string[]
  sources:          Array<{ url: string; label?: string; school_slug?: string }>

  // NEW v3 fields:
  paths?:                   { A: PathOverlay; B: PathOverlay; C: PathOverlay }
  couldnt_compare?:         CouldntCompareSchool[]
  brief_tensions?:          BriefTension[]
  // v3.1 (2026-05-26): `same_winner_across_paths` removed. The new
  // recommender-driven selectors enforce strict A/B/C exclusion, so two
  // paths can never share a winner. Field deletion is a clean break;
  // cached v3 records that still contain it are read-tolerant (JSONB
  // extra keys are ignored by the renderer).
  default_path?:            PathKey | null   // R5-SHOULD-FIX + R6-MUST-5: null when all paths are needs_research; omit when v2 cached
  // P1 #4 wiring (2026-05-22): server-side projection of the schoolFacts Map,
  // keyed by school slug. Carries the fact ribbon + map embed + community
  // shape data the active-path detail panel renders. Optional because the v2
  // cached records that may still flow through readers don't have it.
  school_facts?:            Record<string, SchoolFactsForUi>
  // P1 #4 wiring (2026-05-22): structured chips for the brief strip atop the
  // verdict tab. Derived server-side from the rubric.
  brief_chips?:             BriefChip[]
}

export type ResearchVerdictRecord = {
  id:            string
  input_hash:    string
  verdict_json:  ResearchVerdict
  body_markdown: string
  generated_at:  string
  cache_status?: 'current' | 'stale'
}

// ── BuildArgs — lens fields REMOVED (R2-F2 + R4 mod) ────────────────────

export type BuildArgs = {
  comparisonData: ComparisonDataWithProvenance     // see -cluster.ts — adds contributing_rows
  childName?:     string | null
  childProfile?:  Record<string, unknown> | null
  sessionId:      string
  childId:        string
  // REMOVED in v3:
  //   baseLensKind     — verdict is all-evidence, no lens scope
  //   activeLensId     — same
  //   lensWeightsByRowId — lens weights no longer drive scoring or hash
  //
  // The schoolFacts enrichment payload is plumbed here (R3-F3).
  schoolFacts:    Map<string, SchoolFacts>
}

// ── SchoolFacts — enrichment payload (R3-F3 corrected source) ───────────
//
// Sourced primarily from school_structured_data + schools tables. Optional
// fields render `--` in the UI when absent.

export type SchoolFacts = {
  slug:           string
  name:           string
  // From schools table
  city?:          string
  region?:        string
  latitude?:      number
  longitude?:     number
  gender_split?:  string                  // 'co-ed' | 'boys' | 'girls'
  // From school_structured_data.exam_results
  a_level_a_star_a_pct?: number           // e.g. 61
  gcse_9_7_pct?:         number           // e.g. 78
  ib_avg_40_plus_pct?:   number           // e.g. 64
  // From school_structured_data.student_community
  total_pupils?:         number
  boarder_pct?:          number
  day_pct?:              number
  international_pct?:    number           // optional — defer (R3-Q7)
  // From school_structured_data.fees_*
  fee_min?:              number           // annual
  fee_max?:              number           // annual
  fee_registration?:     number
  // From school_structured_data.location_profile.airports
  heathrow_miles?:       number           // computed from lat/lon if not extracted
  heathrow_drive?:       string           // free-text estimate "~2h 5m drive"
  // R8-MUST-2: derived from `schools.curriculum` (string[] | null), the
  // authoritative source per match-reasons.ts:32+86. Composed display value
  // is 'A-level' / 'IB' / 'A-level + IB' when both are present.
  curriculum?:           string
  // Safety — deferred V2 (no current source)
  // safety_headline?:   string
  // safety_detail?:     string
}

// ── ComparisonDataWithProvenance — extends existing ComparisonData ──────
//
// Adds per-row contributing_rows[] so the merge → cluster pipeline can
// carry provenance through both passes (R3-P2 + R4-P2).

import type { ComparisonData } from '@/components/nana/comparison-placeholder'

export type ComparisonRowWithProvenance = ComparisonRow & {
  contributing_rows:              ContributingRow[]
  contributing_row_count:         number
  truncated:                      boolean
  // R6-MUST-2: per-school origin id flows from loadVerdictRows merge through
  // to clusterRows semantic merge so cited evidence can attribute to the
  // exact comparison_rows row whose value was kept for THAT school.
  selectedCellOriginIdBySchool:   (string | undefined)[]
}

export type ComparisonDataWithProvenance = Omit<ComparisonData, 'rows'> & {
  rows: ComparisonRowWithProvenance[]
}

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { REGION_BUCKETS, regionInBucket, type HomeRegion } from '../uk-regions.ts'
import {
  KNOWN_DAY_ONLY_NAMES,
  KNOWN_FULL_BOARDING_NAMES,
  normalizeSchoolName,
} from '../school-name-overrides.ts'
import { DIMENSIONS } from '../server/dimensions.js'
import { loadDimFactsBundles } from '../server/tools.js'
import type { BriefProfile } from './brief-predicates.ts'
import type { BuildModeExtractionHTTP } from '../server/research-room/build-mode-schemas.ts'
import type { BuildModeIntent } from '../server/research-room/classify-build-mode-intent.ts'
import { resolveSportFocus } from './resolve-sport-focus.ts'

// Slice 8 Build 6 — Build Mode school recommender.
//
// Sits between `pickTopSchoolSlugs` (onboarding 5-question recommender) and
// the finalize LLM call. The onboarding scorer only knows the 5 dropdown
// answers in `parent_profiles`; it cannot see the rich Build Mode interview
// output (sport arrays, arts arrays, goal_orientation, anchors_notes,
// child_wants, nonnegotiables). Codex r-merge Q4 P1 flagged that reusing
// the onboarding scorer would silently ignore everything the interview
// captured — defeating the whole "ask parents about their child" loop.
//
// This module fuses BOTH inputs and returns a richer ranked list:
//   * Onboarding fields (`BriefProfile`) — budget, region, gender, age,
//     SEN, curriculum, top_priority, class_size_pref, pastoral_pref,
//     lgbtq_pref, ethos_pref.
//   * Build Mode fields (`BuildModeExtractionHTTP`) — interests_sports,
//     interests_arts, goal_orientation, anchors_notes, child_wants,
//     nonnegotiables, personality_notes, academic_notes, goals_notes.
//
// Hard filters drop a school. Soft signals rank it.
//
// Hard: country=UK + schools_status quality gate + excludeSlugs +
// budget hard cap (1.3× ceiling, NULL fees pass) + age range (NULL passes)
// + gender compat + boarding compat via name overrides.
//
// Soft: region bucket match, budget closeness, per-sport DIMENSIONS scorer,
// academic_strength (when goal_orientation = 'university_track'), pastoral
// + inclusive (when build-mode prose mentions pastoral / wellbeing /
// diversity), class size, arts strengths tag match.
//
// Returns up to `limit` candidates with `signals: string[]` chips and a
// short `rationale_seed` line for the downstream LLM prompt. The LLM picks
// the final 2-3 schools to surface as `propose_add_school` proposals.

// ── Public types ─────────────────────────────────────────────────────

export type BuildModeScorerInput = {
  parent:        BriefProfile | null
  child:         BuildModeExtractionHTTP | null
  excludeSlugs:  string[]
  childGender?:  string | null
  childYear?:    string | null
  // Phase 4 item #2 (2026-05-22) — LLM-classified intent from
  // academic_notes + goals_notes. Replaces the failed regex stack
  // (see memory `feedback_regex_wrong_tool_for_sentiment`). Optional:
  // when null/absent, only goal_orientation drives academic intent
  // (matches pre-Phase-4-item-2 behaviour). Classifier lives in
  // lib/server/research-room/classify-build-mode-intent.ts and is
  // called by the finalize route before scoreForBuildMode.
  intent?:       BuildModeIntent | null
}

export type ScoredCandidate = {
  slug:           string
  name:           string
  total_score:    number
  signals:        string[]
  rationale_seed: string
}

export type BuildModeScorerResult = {
  candidates: ScoredCandidate[]
  reason:     'ok' | 'no_candidates' | 'fetch_failed'
}

// ── Constants ────────────────────────────────────────────────────────

const GBP_TO_USD = 1.27

const BUDGET_CEILING_USD: Record<string, number | null> = {
  'under-30k': Math.round(30000 * GBP_TO_USD),
  '30k-40k':   Math.round(40000 * GBP_TO_USD),
  '40k-50k':   Math.round(50000 * GBP_TO_USD),
  'over-50k':  null,
  'bursary':   null,
}

const YEAR_TO_ENTRY_AGE: Record<string, number | null> = {
  'year-7':     11,
  'year-9':     13,
  'year-10':    14,
  'sixth-form': 16,
  'not-sure':   null,
}

const BOY_COMPAT  = new Set(['boys', 'boys only', 'co-ed', 'co-educational', 'mixed'])
const GIRL_COMPAT = new Set(['girls', 'girls only', 'co-ed', 'co-educational', 'mixed'])

// 2026-05-19 Bug 1 fix — curriculum filter parity with Picker #1
// (lib/recommend-shortlist.ts:73-80). When the parent says IB, drop
// schools whose curriculum array doesn't include any IB variant. When
// they say A-Level, keep A-Level-tagged schools AND NULL-curriculum
// schools (most UK independents teach A-Level by default but don't
// always tag it). Before this fix, Picker #2 returned Eton (curriculum
// NULL = no IB) for IB-preferring parents.
// 2026-05-24 Slice A — IB_VARIANTS / ALEVEL_VARIANTS removed. Used to back
// the SQL `overlaps('curriculum', ...)` hard filter which trusted the
// legacy schools.curriculum column. Replaced by matchesCurriculumPreference
// (row-time, prefers extracted ssd.curriculum). See helper definition above.

// Per-sport DIMENSIONS keys. The Build Mode interview captures free-text
// `interests_sports[].sport` (e.g. "football", "rugby", "tennis"); we map
// to the corresponding DIMENSIONS scorer if one exists. Synonyms map onto
// canonical scorer keys (e.g. "soccer" → football, "rugby union" → rugby).
const SPORT_SCORER_BY_LABEL: Record<string, 'football_strength' | 'cricket_strength' | 'hockey_strength' | 'tennis_strength' | 'rugby_standing'> = {
  football:       'football_strength',
  soccer:         'football_strength',
  rugby:          'rugby_standing',
  'rugby union':  'rugby_standing',
  'rugby league': 'rugby_standing',
  cricket:        'cricket_strength',
  hockey:         'hockey_strength',
  'field hockey': 'hockey_strength',
  tennis:         'tennis_strength',
}

const SPORT_TIER_LABELS: Record<string, string> = {
  'national-elite':  'elite',
  'national-strong': 'strong national',
  national:          'national',
  regional:          'regional',
}

// Phase 3 Bug #2 (2026-05-21) — parent-stated level scales the sport boost.
// Canonical vocabulary comes from `lib/server/research-room/build-mode-prompt.ts:74`
// — "(recreational | school-team | county | national | professional)" — the
// 5 answers the Build Mode interview asks for. The interview also surfaces
// the phrases "team-level", "county-level", and "more for fun" in the
// follow-up prompt at line :42, so realistic free-text answers map onto
// the same five tiers. Aliases below cover those variants:
//   • `regional` / `county-regional` / `regional-level` / `county-level` ≡ county
//     (interview prose collapses the two; hyphenated dual-tag occasionally seen)
//   • `school` / `school team` / `school team level` / `school-level` /
//     `school level` / `school_level` / `team-level` ≡ school-team
//     (existing tests use `level: 'school'`; without the alias they silently
//     fell to the 0.5 default instead of the intended 0.4. Codex r2 added
//     the rest)
//   • `for fun` / `more for fun` / `local` ≡ recreational
//     (Codex r2: "more for fun" appears verbatim in the interview prompt;
//     `local` collapses to recreational for most sports outside elite
//     organised competition)
// `club` and `district` intentionally NOT aliased — they vary by sport
// (district hockey ≠ district football) and would mis-score if forced.
// Unknown / missing level → 0.5 (mid-range) so we don't punish schools when
// the interview captured a sport but couldn't pin down level.
const SPORT_LEVEL_MULTIPLIER: Record<string, number> = {
  professional:         1.0,
  national:             1.0,
  county:               0.7,
  regional:             0.7,
  'county-regional':    0.7,
  'county-level':       0.7,
  'regional-level':     0.7,
  // Phase 2.8 — synthetic level applied when sport_focus comes from
  // the LLM prose classifier instead of the structured interests_sports
  // field. Multiplier matches county/regional (0.7) — solid signal but
  // not a confirmed national-level commitment. Distinct label so logs
  // and tests don't pretend the child literally plays at county level.
  'inferred-prose':     0.7,
  'school-team':        0.4,
  school:               0.4,
  'school team':        0.4,
  'school-level':       0.4,
  'school level':       0.4,
  'school_level':       0.4,
  'school team level':  0.4,
  'team-level':         0.4,
  recreational:         0.2,
  'for fun':            0.2,
  'more for fun':       0.2,
  local:                0.2,
}
const SPORT_LEVEL_DEFAULT = 0.5

// Phase 3 Bug #1 (2026-05-21) — total sport-boost cap per school.
// Each individual sport can still earn its full +2.5 share, but the SUM
// across all the child's mapped sports is capped here. Before this cap,
// Maya's 2 sports → +5.0, dwarfing region (-2.0) and academic (+2.0) and
// pastoral (+1.5) combined.
const SPORT_TOTAL_CAP = 3.0

// Phase 4 item #3 Codex r2 review (2026-05-22): shared boarding-pref
// resolver. Wizard wins; otherwise prose full/weekly/day/rejects fill the
// effective boarding preference, with rejects mapped to 'day' (the
// closest hard-filter equivalent — drops KNOWN_FULL_BOARDING_NAMES). Used
// by: (a) the hard-filter step below, (b) the in-budget chip in the
// pure ranker, (c) the wrapper SQL budget-column selection. Without this
// shared resolver, "weekly boarding suits us" with a null wizard would
// not filter day-only schools and would not use the boarding fee column
// for budget checks — a positive-prose-boarding asymmetry Codex r2 caught.
// No-erase rule preserved: when wizard is set, prose is ignored.
// 2026-05-24 Yoko slice — exported for unit testing. firedNonneg param added
// so explicit nonneg directives ("day school only", "boarding required")
// override stale inherited wizard values. Closes Yoko-pattern 0-candidates
// bug where contradiction between inherited boarding_pref='full' and nonneg
// "day school only" caused both filter directions to apply.
export function resolveBoardingPref(
  parent: BriefProfile | null,
  intent: BuildModeIntent | null | undefined,
  firedNonneg: NonnegFilter[],
): 'full' | 'weekly' | 'flexi' | 'day' | null {
  // Explicit nonneg directives win over wizard + prose.
  if (firedNonneg.some(f => f.name === 'no-boarding'))       return 'day'
  if (firedNonneg.some(f => f.name === 'boarding-required')) return 'full'

  const wizard = parent?.boarding_pref
  if (wizard === 'full' || wizard === 'weekly' || wizard === 'flexi' || wizard === 'day') {
    return wizard
  }
  const prose = intent?.boarding_pref_from_prose
  if (prose === 'full' || prose === 'weekly' || prose === 'day') return prose
  if (prose === 'rejects') return 'day'
  return null
}

// 2026-05-24 Yoko slice — exported. When 'must-be-london' nonneg fires,
// override stale parent.home_region. When 'no-london' fires, return null
// so the no-london predicate (not the region hard filter) owns the
// London-exclusion — avoids stale-region pool collapse where
// parent.home_region='london' + nonneg "no London" would keep only
// London schools then drop them.
export function resolveHomeRegion(
  parent: BriefProfile | null,
  firedNonneg: NonnegFilter[],
): HomeRegion | null {
  if (firedNonneg.some(f => f.name === 'no-london')) return null
  if (firedNonneg.some(f => f.name === 'must-be-london')) return 'london'

  const raw = (parent?.home_region ?? '').toLowerCase().trim()
  if (!raw || raw === 'anywhere' || raw === 'overseas') return null
  if (!Object.hasOwn(REGION_BUCKETS, raw)) return null
  return raw as HomeRegion
}

// 2026-05-24 Yoko slice — exported. When 'any-curriculum' nonneg fires,
// relax the curriculum hard filter regardless of wizard. Lets parents
// who explicitly typed "any curriculum" or "either curriculum" override
// a stale inherited curriculum_pref.
export function resolveCurriculumPref(
  parent: BriefProfile | null,
  firedNonneg: NonnegFilter[],
): 'ib' | 'a-level' | 'either' | null {
  if (firedNonneg.some(f => f.name === 'any-curriculum')) return 'either'
  const pref = parent?.curriculum_pref
  if (pref === 'ib' || pref === 'a-level' || pref === 'either') return pref
  return null
}

// Phase 4 item #3 (2026-05-22): PASTORAL_HINT_RE / INCLUSIVE_HINT_RE /
// FULL_BOARDING_HINT_RE / SMALL_CLASS_HINT_RE REMOVED. These were 4
// direction-sensitive regexes that the LLM classifier now owns. See
// classify-build-mode-intent.ts fields:
//   - pastoral_priority      → was PASTORAL_HINT_RE
//   - inclusive_priority     → was INCLUSIVE_HINT_RE
//   - boarding_pref_from_prose → was FULL_BOARDING_HINT_RE
//   - small_env_pref         → was SMALL_CLASS_HINT_RE
// Codex 2026-05-22 design review flagged regex-OR-LLM as the worst path
// (regex false positives override better classifier); we replace cleanly.
// Memory `feedback_regex_wrong_tool_for_sentiment` for the lesson.

// Recommender Phase 4 (2026-05-22): nonnegotiables hard-filter.
// Codex audit 2026-05-21 (line 6239) flagged that free-text nonnegotiables
// like "must be co-ed", "not too religious", "weekly only", "no London"
// are captured but never enforced — schools violating these constraints
// still appear in recommendations because the scorer only treats the
// blob as fodder for soft pastoral/inclusive hints.
//
// Design: per-entry pattern match (each nonneg string scanned
// independently — avoids cross-entry leakage like "boys only OR girls
// only" reading as both). When a pattern matches an entry, the matching
// filter's predicate is applied to every candidate school; violators
// are dropped before scoring.
//
// NULL-data safety: every predicate returns TRUE (school passes) when
// the relevant field is missing. Matches the existing gender-filter
// pattern (line ~407: `return !g || genderAllow.has(g)`).
//
// Schools that survive get NO per-school chip — Codex repeatedly flagged
// signal-noise risk. The filter is invisible-but-effective.

// Religious ethos labels. Mirrors the canonical vocab in
// lib/server/research-context-pack.ts:302-305 + DIMENSIONS.ethos_match
// in lib/server/dimensions.js. 'secular' is intentionally OUT — a
// "not religious" parent wants secular schools to pass through. Aliases
// 'cofe' / 'rc' added because dimensions-scorers.test.mjs shows both
// short forms appear in real data alongside the full forms.
const RELIGIOUS_ETHOS_LABELS = new Set([
  'church_of_england', 'cofe',
  'roman_catholic',    'rc',
  'christian_general',
  'methodist',
  'quaker',
  'jewish',
  'muslim',
  'mixed_faith',
])

type NonnegFilter = {
  name:      string
  pattern:   RegExp
  predicate: (s: SchoolRow, struct: StructRow | null) => boolean
}

// 2026-05-24 Yoko slice — exported for unit testing.
export const NONNEG_FILTERS: NonnegFilter[] = [
  // ── Gender ───────────────────────────────────────────────────────
  // "must be co-ed" / "co-ed only" / "coed only" / "mixed only"
  {
    name: 'must-be-coed',
    pattern: /\b(?:(?:must\s+be|need|needs|want|wants|require[sd]?|prefer|preferred|only|strictly)\s+(?:a\s+)?(?:co-?ed(?:ucational)?|coed|mixed(?:\s+gender)?(?:\s+school)?)|(?:co-?ed(?:ucational)?|coed|mixed(?:\s+gender)?)\s+(?:school\s+)?only)\b/i,
    predicate: (s) => {
      const g = (s.gender_split ?? '').trim().toLowerCase()
      if (!g) return true
      return /co-?ed|coed|mixed/.test(g)
    },
  },
  // "girls only" / "all-girls" / "single-sex girls"
  {
    name: 'girls-only',
    pattern: /\b(?:(?:must\s+be|need|needs|want|wants|require[sd]?|only|strictly)\s+(?:an?\s+)?(?:all[-\s]?girls?|girls[-\s]?only|single[-\s]sex\s+girls?)|girls[-\s]?only|all[-\s]?girls?\s+(?:school\s+)?only|single[-\s]sex\s+girls?)\b/i,
    predicate: (s) => {
      const g = (s.gender_split ?? '').trim().toLowerCase()
      if (!g) return true
      return /girls/.test(g) && !/co-?ed|coed|mixed/.test(g)
    },
  },
  // "boys only" / "all-boys" / "single-sex boys"
  {
    name: 'boys-only',
    pattern: /\b(?:(?:must\s+be|need|needs|want|wants|require[sd]?|only|strictly)\s+(?:an?\s+)?(?:all[-\s]?boys?|boys[-\s]?only|single[-\s]sex\s+boys?)|boys[-\s]?only|all[-\s]?boys?\s+(?:school\s+)?only|single[-\s]sex\s+boys?)\b/i,
    predicate: (s) => {
      const g = (s.gender_split ?? '').trim().toLowerCase()
      if (!g) return true
      return /boys/.test(g) && !/co-?ed|coed|mixed/.test(g)
    },
  },
  // ── Location ─────────────────────────────────────────────────────
  // "no London" / "not London" / "outside London" / "away from London"
  // 2026-05-24 Yoko slice — pattern expanded with school-noun bridge for
  // "no school in London" / "no day school in London" / etc. Predicate
  // upgraded to use regionInBucket so London-bucket aliases (Wimbledon,
  // Wandsworth, Richmond, Hammersmith, E10) are correctly dropped.
  {
    name: 'no-london',
    pattern: /\b(?:no\s+london|not\s+(?:in|near|within|around)?\s*london|outside\s+(?:of\s+)?london|away\s+from\s+london|anywhere\s+but\s+london|excluding\s+london|avoid(?:ing)?\s+london|no\s+(?:school|day\s+school|boarding(?:\s+school)?|independent(?:\s+school)?|prep(?:\s+school)?|college|academy|sixth\s+form)(?:\s+\w+)?\s+(?:in|near|within|around)\s+london)\b/i,
    predicate: (s) => {
      const r = (s.region ?? '').trim()
      if (!r) return true
      if (r.toLowerCase() === 'england') return true   // country-level tolerance
      return !regionInBucket('london', r)              // alias-aware
    },
  },
  // 2026-05-24 Yoko slice — positive London directive. Symmetric to no-london.
  // Negative-context safety handled via mutual exclusion + hasLondonNegativeContext
  // helper in matchedNonnegFilters below.
  {
    name: 'must-be-london',
    pattern: /\b(?:london\s+(?:zone|area|borough|catchment|or\s+(?:nearby|outskirts|commute|surrounds))|must\s+be\s+(?:in\s+)?london|need(?:s)?\s+london|(?:in|within|near)\s+london(?:\s+only)?|london\s+day\s+school|day\s+school\s+in\s+london|commutable\s+(?:from|to)\s+london|london\s+only)\b/i,
    predicate: (s) => {
      const r = (s.region ?? '').trim()
      if (!r) return true
      if (r.toLowerCase() === 'england') return true
      return regionInBucket('london', r)
    },
  },
  // ── Boarding ─────────────────────────────────────────────────────
  // "weekly boarding only" / "no full boarding" — narrower than
  // parent.boarding_pref='weekly' (which still allows full-boarding
  // schools that offer weekly options). This drops schools whose name
  // appears in KNOWN_FULL_BOARDING_NAMES (single-mode full-board only).
  {
    name: 'weekly-only',
    pattern: /\b(?:weekly\s+(?:boarding\s+)?only|only\s+weekly\s+boarding|no\s+full[-\s]board(?:ing)?|not?\s+full[-\s]board(?:ing)?|weekly[-\s]?board(?:ing)?\s+(?:school\s+)?only)\b/i,
    predicate: (s) => !KNOWN_FULL_BOARDING_NAMES.has(normalizeSchoolName(s.name)),
  },
  // Phase 4 item #3 Codex r3-r5 review (2026-05-22): "no boarding" / "day
  // school only" as a NONNEG ITEM. Captured separately from prose-derived
  // boarding_pref_from_prose (which the LLM classifier reads from 5 note
  // fields). Without this, child.nonnegotiables=["no boarding"] + null
  // wizard + null prose → KNOWN_FULL_BOARDING_NAMES still surface.
  //
  // Codex r5: rewrote as pronoun-independent phrase patterns. The core
  // negative phrases ("not going/ready/suited to/for board(ing)",
  // "boarding is not right/suitable/etc.") work regardless of subject —
  // "he's not", "they're not", "the kid is not", "we're not", etc. all
  // hit the same phrase. Curly apostrophes (don't / aren't / isn't /
  // they're) included via the char class.
  {
    name: 'no-boarding',
    pattern: /(?:\bno\s+(?:full[-\s]?)?board(?:ing)?\b|\bnot?\s+(?:any\s+)?board(?:ing)?\b|\bday\s+school\s+only\b|\bday[-\s]?only\b|\bday\s+pupil(?:s)?\s+only\b|\b(?:do(?:es)?\s+not|don['‘’]?t|are\s+not|aren['‘’]?t|is\s+not|isn['‘’]?t)\s+(?:want(?:ing)?|need(?:ing)?|considering)\s+board(?:ing)?\b|\bboard(?:ing)?\s+(?:is\s+not|isn['‘’]?t)\s+(?:right|suitable|appropriate|on\s+the\s+table|for)\b|\b(?:not|isn['‘’]?t|aren['‘’]?t)\s+(?:going|ready|suited)\s+(?:to|for)\s+board(?:ing)?\b|\bnever\s+board(?:ing)?\b|\b(?:we|i|they|he|she)\s+(?:are\s+not|aren['‘’]?t|is\s+not|isn['‘’]?t|am\s+not)\s+board(?:ing)?\b)/i,
    predicate: (s) => !KNOWN_FULL_BOARDING_NAMES.has(normalizeSchoolName(s.name)),
  },
  // Symmetric to 'no-boarding': "full boarding only" / "boarding required"
  // is a hard rejection of day-only schools. Drops KNOWN_DAY_ONLY_NAMES.
  // Without this, `nonnegotiables=["full boarding only"]` + null wizard
  // + null prose → KNOWN_DAY_ONLY_NAMES still surface in the candidate
  // pool. Symmetric to 'no-boarding' so neither direction has the gap.
  {
    name: 'boarding-required',
    pattern: /\b(?:(?:full[-\s]?)?board(?:ing)?\s+(?:school\s+)?(?:only|required|essential|mandatory)|(?:only|must\s+be|need|needs|require[sd]?)\s+(?:a\s+)?(?:full[-\s]?)?board(?:ing)?(?:\s+school)?|no\s+day\s+(?:school|pupil)|not?\s+a\s+day\s+(?:school|pupil))\b/i,
    predicate: (s) => !KNOWN_DAY_ONLY_NAMES.has(normalizeSchoolName(s.name)),
  },
  // 2026-05-24 Yoko slice — curriculum relaxer. "any curriculum" / "either
  // curriculum" / "no curriculum preference" — opts the parent OUT of the
  // curriculum hard filter. Predicate is a no-op; actual unblocking happens
  // in resolveCurriculumPref when it sees this filter name in firedNonneg.
  {
    name: 'any-curriculum',
    pattern: /\b(?:any\s+curriculum|curriculum\s+(?:doesn['‘’]?t|does\s+not)\s+matter|either\s+curriculum|no\s+(?:strong\s+)?(?:curriculum|qualification)\s+(?:preference|preferred)|open\s+to\s+(?:either\s+)?(?:ib\s+or\s+a[-\s]level|a[-\s]level\s+or\s+ib))\b/i,
    predicate: () => true,
  },
  // ── Religion ─────────────────────────────────────────────────────
  // "not religious" / "no religion" / "secular only" / "non-religious"
  // — drops schools whose ethos_label is one of the religious-affiliated
  // tags. Schools with ethos_label='secular' OR NULL pass through.
  {
    name: 'not-religious',
    pattern: /\b(?:not\s+religious|no\s+religion|non[-\s]?religious|secular\s+(?:school\s+)?only|secular(?:\s+only)?|no\s+religious(?:\s+(?:affiliation|ethos|school))?)\b/i,
    predicate: (s, struct) => {
      const label = (struct?.ethos_facts as { ethos_label?: string } | undefined)?.ethos_label
      if (!label) return true
      return !RELIGIOUS_ETHOS_LABELS.has(label.trim().toLowerCase())
    },
  },
]

// 2026-05-24 Yoko slice — helper for structural London-negative-context
// detection that the no-london regex can't capture. Used inside
// matchedNonnegFilters to suppress must-be-london and force no-london on
// phrases like "not looking in London" / "not a London day school" /
// "not considering London".
const LONDON_NEGATIVE_PATTERNS: RegExp[] = [
  /\bnot\s+(?:a|an)\s+\w+(?:\s+\w+)?\s+(?:in|near|within|around)\s+london\b/i,
  /\bnot\s+(?:a|an)\s+london\s+\w+/i,
  /\bnot\s+(?:looking|interested|considering|wanting|moving|going)\s+(?:in|near|at|towards?|to)?\s*london\b/i,
]
function hasLondonNegativeContext(entry: string): boolean {
  if (!/\blondon\b/i.test(entry)) return false
  return LONDON_NEGATIVE_PATTERNS.some(p => p.test(entry))
}

// Returns the set of NonnegFilter entries that any nonneg string in the
// parent's list triggers. Each entry is scanned independently so e.g.
// "girls only" + "no London" → both filters fire; a single entry with
// "boys only or co-ed" would only fire whichever matches its own regex
// (not both, avoiding contradiction).
//
// 2026-05-24 Yoko slice — exported for unit testing. London negative-
// context safety added: when no-london fires OR hasLondonNegativeContext
// returns true, suppress must-be-london and force no-london ON. Helper
// is authoritative (Codex r5 — not gated by must-be-london firing) so
// verb-form negatives like "not considering London" are correctly handled.
export function matchedNonnegFilters(nonnegs: string[] | null | undefined): NonnegFilter[] {
  if (!Array.isArray(nonnegs) || nonnegs.length === 0) return []
  const fired = new Map<string, NonnegFilter>()
  for (const entry of nonnegs) {
    if (typeof entry !== 'string' || !entry.trim()) continue
    const entryFired = new Set<string>()
    for (const f of NONNEG_FILTERS) {
      if (f.pattern.test(entry)) entryFired.add(f.name)
    }
    // London negative-context safety: helper is authoritative — applies
    // regardless of whether must-be-london regex actually fired.
    const negCtx = hasLondonNegativeContext(entry)
    if (entryFired.has('no-london') || negCtx) {
      entryFired.delete('must-be-london')
      entryFired.add('no-london')
    }
    for (const name of Array.from(entryFired)) {
      const f = NONNEG_FILTERS.find(x => x.name === name)
      if (f) fired.set(name, f)
    }
  }
  return Array.from(fired.values())
}

// Phase 1 data-utilization (2026-05-21): medicine / vet / dentistry / law /
// engineering intent detection from Build Mode prose. When a parent's
// goals_notes / academic_notes / child_wants mentions one of these career
// paths, the recommender unlocks the corresponding boost for schools whose
// university_destinations.medicine_dentistry_vet_count or oxbridge_subjects
// signal that pathway. Gating on intent (not always-on) prevents medicine-
// specialist schools (Concord, Caterham) from getting an unfair boost for
// non-medicine kids. Codex flagged that `medicine_dentistry_vet_count` is
// extracted as a field but the scorer never reads it.
// Codex r1 P1.3 (2026-05-21): added "med school", "medical school", US
// spelling "pediatric*", "vet school". Kept tight to avoid bare "biology"
// false positives (a kid loving biology class isn't necessarily medicine).
// `pediatrics?` / `paediatrics?` covers both UK + US spelling AND the
// plural form parents commonly type ("interested in pediatrics"). The
// trailing `s?` is INSIDE the word boundary so `\b...\b` still anchors.
//
// Codex r2 P1 follow-up: `pharmac` and `orthodont` were sitting inside
// the trailing `\b`, so "pharmacy" / "pharmacist" / "orthodontist"
// (longer words) didn't match. Use suffix optional groups so the
// matched token can absorb the trailing characters before the `\b`.
// "dentistry" → already covered by `dentistry` alternation.
const MEDICINE_INTENT_RE = /\b(medicine|medical|medic|med\s*school|doctor|gp\b|gp\s+|surgeon|physician|nurse|nursing|paediatrics?|pediatrics?|dentist|dentistry|orthodont(?:ist|ics?)?|vet|veterinary|veterinarian|vet\s*school|biomedical|pharmac(?:y|ist|ology|euticals?)?)\b/i
const LAW_INTENT_RE      = /\b(law|lawyer|solicitor|barrister|legal|judge|attorney|jurisprudence)\b/i
const ENGINEERING_INTENT_RE = /\b(engineer|engineering|architect|architecture)\b/i

// Recommender Phase 2 (2026-05-21): subject-intent regexes for the 9 v2.0
// subject_strengths buckets. Anchored with optional suffix groups so e.g.
// "biological" absorbs the suffix before `\b` (Codex r2 lesson from Phase 1
// `pharmac…` regex). Fed by careerProseBlob (goals_notes / academic_notes /
// child_wants / anchors_notes / personality_notes / nonnegotiables). Matches
// drive ctx.subject_intents → DIMENSIONS.subject_strengths.rank() boost.
//
// Codex r1 P1.1 (2026-05-21): tightened `english` / `history` /
// `economics_business` patterns that previously had bare-word matches with
// high false-positive risk: "first-language English", "family history",
// "medical history", "family business", "financial aid". Now require
// subject-specific cognates (literature, historian, business studies,
// economist, accounting, etc.) or explicit study-context phrases.
//
// Codex r1 P1.2 (2026-05-21): added plural variants previously missing.
// `physic(?:s|ist)` → `physic(?:s|ists?)` so "physicists" fires; similarly
// for biologists, historians, mathematicians, programmers, software
// engineers/developers.
const SUBJECT_INTENT_RE: Record<string, RegExp> = {
  maths:              /\b(?:maths?|mathemati(?:cs?|cal|cians?))\b/i,
  biology:            /\b(?:biolog(?:y|ists?|ical)|biomedical|biotech\w*)\b/i,
  chemistry:          /\b(?:chemist(?:ry|s|ries)?|chemical\w*)\b/i,
  physics:            /\b(?:physic(?:s|ists?)|astrophysic\w*|astronom(?:y|ers?|ical))\b/i,
  english:            /\b(?:english\s+(?:literature|lit|language\s+studies)|literature|creative\s+writing|poet(?:ry|s)|novelists?|english\s+(?:class|lessons?|teacher|essay|essays?|degree|department|major))\b/i,
  history:            /\b(?:historians?|history\s+(?:class|lessons?|teacher|essay|essays?|degree|department|major|geek|fan|enthusiast|book|books?|buff|of\s+art)|historical\s+(?:research|study|analysis|fiction|writing))\b/i,
  modern_languages:   /\b(?:french|spanish|german|mandarin|chinese|japanese|italian|latin|linguistic\w*|foreign\s+languages?)\b/i,
  computer_science:   /\b(?:computer\s*scien(?:ce|tists?)|comp\s*sci|coders?|coding|programmers?|programming|software\s+(?:engineer|engineering|engineers|developer|developers|development|design))\b/i,
  // Codex r2 P1 (2026-05-21): `economic(?:s|al|ics)` matched `economical`
  // ("more economical school") and missed bare `economic` ("economic
  // policy"). Replaced with explicit terms — `economics`, `economist(s)`,
  // `economy`, `econometric*` — and dropped `economical` (adjective for
  // cost-effectiveness, not the subject).
  // Codex r3 NIT: include micro/macroeconomics as cognates (not matched by
  // bare `economics` because of the leading word boundary).
  economics_business: /\b(?:(?:micro|macro)?economics?|economists?|econom(?:y|etric\w*)|business\s+(?:studies|class|management|administration|degree|school)|entrepreneur(?:s|ship|ial)?|accounting|commerce|financial\s+(?:markets?|literacy|analysis|degree)|finance(?!\s+(?:aid|app|company|department)))\b/i,
}

// Codex r1 P1.2 (2026-05-21): oxbridge subject matching upgraded from exact
// Set.has() to substring/regex. Cambridge titles like "Jurisprudence" (Law)
// and "Engineering Science" and "Computer Science and Philosophy" don't
// match exact strings. Patterns are case-insensitive and applied to
// LOWERCASED entries (so the regex source stays lowercase). Each path
// returns true if ANY entry in oxbridge_subjects matches the pattern.
const OXBRIDGE_MEDICINE_RE = /(?:medicine|biomedical|natural\s*sciences|veterinary|dentistry|medical\s*sciences)/i
const OXBRIDGE_LAW_RE      = /(?:\blaw\b|jurisprudence|land\s*economy)/i
const OXBRIDGE_ENG_RE      = /(?:engineer|architecture|computer\s*science|electronics|mechanical)/i

// ── DB types ─────────────────────────────────────────────────────────

type SchoolRow = {
  slug:             string
  name:             string
  gender_split:     string | null
  fees_usd_min:     number | null
  // Phase 3 Bug #7 (2026-05-21): `fees_usd_max` selected so the
  // in-budget chip can switch from day-fee-min to boarding-fee-max
  // when the parent's boarding_pref is full / weekly / flexi. UK
  // schools often have a wide fees range (e.g. day £25k → boarding
  // £60k); the original chip claimed "in budget" for any full-board
  // parent with a ceiling >= the day-fee-min, a false positive.
  fees_usd_max:     number | null
  sen_support:      boolean | null
  strengths:        string[] | null
  confidence_score: number | null
  age_min:          number | null
  age_max:          number | null
  region:           string | null
}

type StructRow = {
  school_slug:             string
  sports_profile:          Record<string, unknown> | null
  exam_results:            Record<string, unknown> | null
  university_destinations: Record<string, unknown> | null
  student_community:       Record<string, unknown> | null
  isi_deep_facts:          Record<string, unknown> | null
  // Phase 1 data-utilization (2026-05-21):
  wellbeing_staffing:      Record<string, unknown> | null  // total_staff, ratio_per_pupil
  ethos_facts:             Record<string, unknown> | null  // ethos_label (church_of_england, roman_catholic, secular, etc.)
  // Phase 2 data-utilization (2026-05-21): subject_strengths v2.0 polymorphic
  // blob. Per-subject {items[], summary_paragraph_for_chatbot}. Consumed by
  // DIMENSIONS.subject_strengths.rank() when ctx.subject_intents is non-empty.
  subject_strengths:       Record<string, unknown> | null
  // 2026-05-24 Slice A — extracted curriculum (truth) for the curriculum
  // hard filter via matchesCurriculumPreference. Replaces the SQL filter
  // that trusted the legacy schools.curriculum column (Charterhouse drift).
  curriculum:              string[] | null
}

// 2026-05-24 Slice A — Codex Q1 verdict. Row-time curriculum resolver
// that PREFERS school_structured_data.curriculum (extracted truth) over
// the legacy schools.curriculum column (manual rot — see Charterhouse).
//
// For pref='ib': require SSD to list IB. If SSD missing/empty, reject —
// don't trust the legacy column. Fixes Charterhouse (schools=["IB"] but
// ssd=NULL → had no IB in real life).
//
// For pref='a-level': permissive UK default. SSD A-Level passes; missing
// also passes since country='United Kingdom' + UK-evidence gating means
// the candidate is almost certainly UK-A-Level by default.
//
// For 'either'/null: no filter.
const IB_PATTERN     = /\b(?:IB(?:\s+Diploma(?:\s+(?:Programme|Program))?|DP)?|International\s+Baccalaureate(?:\s+Diploma(?:\s+(?:Programme|Program))?)?)\b/i
const ALEVEL_PATTERN = /\bA[-\s]?Level(?:s)?\b/i
export function matchesCurriculumPreference(args: {
  schoolsCurriculum: string[] | null,
  ssdCurriculum:     string[] | null,
  pref:              'ib' | 'a-level' | 'either' | null,
}): boolean {
  const { ssdCurriculum, pref } = args
  if (!pref || pref === 'either') return true
  if (pref === 'ib') {
    if (ssdCurriculum && ssdCurriculum.length > 0) {
      return ssdCurriculum.some(c => IB_PATTERN.test(c))
    }
    return false  // SSD missing → reject (fixes Charterhouse)
  }
  if (pref === 'a-level') {
    if (ssdCurriculum && ssdCurriculum.length > 0) {
      return ssdCurriculum.some(c => ALEVEL_PATTERN.test(c))
    }
    return true  // SSD missing → UK default permissive
  }
  return true
}

// ── UK evidence slugs (paginated; mirrors recommend-shortlist private helper) ──

async function loadUkEvidenceSlugs(supabase: SupabaseClient): Promise<{ slugs: string[]; error: boolean }> {
  // Codex r8 Low/Medium #3 — distinguish a real fetch error from an
  // empty result. Before: both returned []. After: the caller can map
  // an error to `reason: 'fetch_failed'` instead of silently degrading
  // to `no_candidates` (which the prompt turns into "schoolProposals:
  // [] verbatim", masking the failure).
  const all: string[] = []
  const PAGE = 1000
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('schools_status')
      .select('school_slug')
      .eq('is_uk_evidence', true)
      .eq('has_substantial_chunks', true)
      .range(offset, offset + PAGE - 1)
    if (error) return { slugs: all, error: true }
    if (!data || data.length === 0) break
    all.push(...data.map((r: { school_slug: string }) => r.school_slug))
    if (data.length < PAGE) break
  }
  return { slugs: all, error: false }
}

// ── Build a synthetic parent ctx for dimension scorers ──────────────
//
// dimensions.js scorers expect `ctx?.parent?.pastoral_pref` and
// `ctx?.parent?.lgbtq_pref` to know whether the parent CARES about a
// dimension. They short-circuit to 0 when these are null. For Build Mode,
// the onboarding dropdowns may not have captured pastoral / lgbtq pref, but
// the LLM classifier (Phase 4 item #3) may have.
//
// Codex 2026-05-22 design GREEN rule: empty prose must NEVER erase or
// downgrade wizard answers. Upgrade only flows null → 'high_priority' /
// 'important'. If parent.pastoral_pref is already set ('standard',
// 'no-preference', etc.), the LLM signal is ignored — the wizard click
// is authoritative.
//
// Reinforcement (Codex r1 design rule 10): current_school_pain='pastoral'
// upgrades pastoral_priority even if the prose didn't independently flag
// 'high'. They reinforce — pastoral pain AT the current school is a clear
// signal the parent wants a stronger pastoral fit at the next school.

function buildScorerCtx(
  parent: BriefProfile | null,
  intent: BuildModeIntent | null | undefined,
): { parent: { pastoral_pref: string | null; lgbtq_pref: string | null } } {
  let pastoral = parent?.pastoral_pref ?? null
  let lgbtq    = parent?.lgbtq_pref    ?? null
  const pastoralHighFromProse =
    intent?.pastoral_priority === 'high' ||
    intent?.current_school_pain === 'pastoral'
  const inclusiveHighFromProse = intent?.inclusive_priority === 'high'
  if (!pastoral && pastoralHighFromProse)  pastoral = 'high_priority'
  if (!lgbtq    && inclusiveHighFromProse) lgbtq    = 'important'
  return { parent: { pastoral_pref: pastoral, lgbtq_pref: lgbtq } }
}

// ── Normalisers ─────────────────────────────────────────────────────

function normalizeSportLabel(raw: string | null | undefined): keyof typeof SPORT_SCORER_BY_LABEL | null {
  if (!raw) return null
  const key = raw.trim().toLowerCase()
  return (key in SPORT_SCORER_BY_LABEL) ? (key as keyof typeof SPORT_SCORER_BY_LABEL) : null
}

function readSportTier(struct: StructRow | null, sport: string): string | null {
  const sp = struct?.sports_profile as Record<string, unknown> | null | undefined
  if (!sp) return null
  // 'rugby' bucket; for other sports the field name matches the sport
  const bucket = sp[sport] as Record<string, unknown> | undefined
  if (!bucket || typeof bucket !== 'object') return null
  const tier = bucket.competitive_tier
  return typeof tier === 'string' ? tier.toLowerCase() : null
}

// Pretty-print a sport tier into a short signal chip. Returns null when the
// tier isn't strong enough to advertise (we don't surface "school-level" or
// "local" as a positive signal).
function tierToChipFragment(tier: string | null): string | null {
  if (!tier) return null
  return SPORT_TIER_LABELS[tier] ?? null
}

// ── Pure ranker (exported for tests) ────────────────────────────────
//
// Takes already-loaded school + structured-data rows and returns the
// ranked, signal-annotated candidate list. No DB access — the main
// `scoreForBuildMode` wrapper handles SQL filters and calls this.

export function rankCandidates(
  schools: SchoolRow[],
  structBySlug: Map<string, StructRow>,
  input: BuildModeScorerInput,
  limit: number,
  // Phase 1 data-utilization (2026-05-21): per-slug arts_music_drama fact
  // count for the new arts scoring branch. Empty map = no arts boosts fire.
  // Optional with safe default so existing direct-test callers don't break.
  artsCountBySlug: Map<string, number> = new Map(),
): ScoredCandidate[] {
  const { parent, child, childGender } = input

  // 2026-05-24 Yoko slice — compute firedNonneg ONCE near the top so the
  // resolver helpers (resolveBoardingPref / resolveHomeRegion /
  // resolveCurriculumPref) can use it. Existing nonneg-predicate filter
  // block below reuses this same set.
  const firedNonnegFilters = matchedNonnegFilters(child?.nonnegotiables)

  // Bug #3 (2026-05-22) + Yoko slice 2026-05-24 — explicitHomeRegion now
  // delegated to resolveHomeRegion which handles the nonneg precedence:
  //   - 'no-london' fires → null (region filter skipped; predicate owns drop)
  //   - 'must-be-london' fires → 'london' (overrides stale parent.home_region)
  //   - else → parent.home_region (with anywhere/overseas/unknown → null)
  const explicitHomeRegion: HomeRegion | null = resolveHomeRegion(parent, firedNonnegFilters)

  // ── JS-level hard filters: gender + boarding via name overrides ──
  let filtered = schools
  const genderAllow =
    childGender === 'boy'  ? BOY_COMPAT  :
    childGender === 'girl' ? GIRL_COMPAT :
    null
  if (genderAllow) {
    filtered = filtered.filter(s => {
      const g = (s.gender_split ?? '').trim().toLowerCase()
      return !g || genderAllow.has(g)
    })
  }

  // Phase 4 item #3 Codex r2 review (2026-05-22): use the shared
  // resolveBoardingPref helper so prose 'full'/'weekly'/'day'/'rejects'
  // all fill the effective boarding when wizard is null. Wizard wins.
  // 'rejects' → 'day' (closest hard-filter equivalent).
  const effectiveBoardingPref = resolveBoardingPref(parent, input.intent, firedNonnegFilters)
  if (
    effectiveBoardingPref === 'full' ||
    effectiveBoardingPref === 'weekly' ||
    effectiveBoardingPref === 'flexi'
  ) {
    filtered = filtered.filter(s => !KNOWN_DAY_ONLY_NAMES.has(normalizeSchoolName(s.name)))
  } else if (effectiveBoardingPref === 'day') {
    filtered = filtered.filter(s => !KNOWN_FULL_BOARDING_NAMES.has(normalizeSchoolName(s.name)))
  }

  // Phase 4 (2026-05-22) — nonnegotiables hard-filter. Drops schools that
  // violate parent free-text constraints (must-be-coed / girls-only /
  // boys-only / no-london / weekly-only / not-religious). See
  // NONNEG_FILTERS for the full pattern table + predicates.
  // firedNonnegFilters already computed near top of function (line ~700).
  if (firedNonnegFilters.length > 0) {
    filtered = filtered.filter(s => {
      const struct = structBySlug.get(s.slug) ?? null
      return firedNonnegFilters.every(f => f.predicate(s, struct))
    })
  }

  // Bug #3 (2026-05-22) — Region hard filter when parent stated an
  // explicit home_region. Soft -2.0 penalty was insufficient: London-
  // clicking parents could see 0 London schools when sport/academic/
  // pastoral dimensions outranked the penalty. Drops schools where
  // region is known AND known to be in a different bucket. Keeps
  // NULL-region schools (could be undocumented London — Bug #4 backfill)
  // and broad 'England'-tagged schools (country-level, not bucket-
  // disqualifying). Skipped when explicitHomeRegion is null (anywhere /
  // overseas / unknown bucket / parent didn't answer).
  if (explicitHomeRegion) {
    filtered = filtered.filter(s => {
      const r = s.region
      if (r == null) return true
      const lc = r.trim().toLowerCase()
      if (lc === 'england') return true
      return regionInBucket(explicitHomeRegion, r)
    })
  }

  if (filtered.length === 0) return []

  // ── Score ──
  const ctx = buildScorerCtx(parent, input.intent)
  const budgetCeiling = BUDGET_CEILING_USD[parent?.budget_range ?? '']

  // Phase 2.8 (2026-05-25) — resolveSportFocus picks the effective sport
  // from explicit structured interests > fresh classifier intent > cache.
  // When structured interests_sports is empty but the LLM classified a
  // sport from prose, inject one synthetic entry so the per-sport loop
  // below fires DIMENSIONS.<sport>_strength scoring. Without this, prose-
  // only parents (Refresh button after editing brief) get no sport-
  // specific re-ranking and the recommender returns sport-breadth schools
  // (Harrow/Eton) instead of sport-specialists (Reed's/Queenswood for tennis).
  //
  // Codex r3 fix: synthetic entry key = sport LABEL ('tennis'), NOT the
  // scorer key ('tennis_strength'). The loop maps key → scorer via
  // SPORT_SCORER_BY_LABEL[sp.key].
  const focusResolution = resolveSportFocus({
    interestsSports: child?.interests_sports ?? null,
    intent:          input.intent ?? null,
    // NOTE: profile arg intentionally omitted — Refresh and finalize routes
    // always pass fresh `intent` so the cache fallback is unnecessary here.
    // The cache-only path lives in recommend-shortlist.ts (pickTopSchoolSlugs).
  })
  if (focusResolution.conflict) {
    console.info('[scoreForBuildMode] sport_focus conflict', {
      structured: child?.interests_sports?.map(s => s.sport),
      llm:        input.intent?.sport_focus,
      resolved:   focusResolution.sport,
    })
  }
  const structuredSportsInterest = (child?.interests_sports ?? [])
    .map(s => ({ raw: s.sport, key: normalizeSportLabel(s.sport), level: s.level }))
    .filter((s): s is { raw: string; key: keyof typeof SPORT_SCORER_BY_LABEL; level: string } => s.key !== null)
  const sportsInterest = structuredSportsInterest.length > 0
    ? structuredSportsInterest
    : (focusResolution.sport
        ? [{ raw: focusResolution.sport, key: focusResolution.sport, level: 'inferred-prose' }]
        : [])
  const artsInterest = child?.interests_arts ?? []
  // Phase 4 item #2 + item #3 (2026-05-22) — LLM-classified intent reading
  // the 5 actual prose fields (academic_notes / goals_notes /
  // personality_notes / child_wants / anchors_notes). The interview
  // PROGRESS targets went_wrong + drill_down are routed by
  // build-mode-merge.ts INTO those 5 fields; their signal surfaces via
  // current_school_pain + parent_drill_focus in the classifier output.
  // See classify-build-mode-intent.ts.
  //
  // Item #2 (academic + uni intent):
  //   - hasAcademicPain   → suppresses academic_strength even if the
  //                         structured goal is university_track. Now ALSO
  //                         fires on current_school_pain='academic_overwhelmed'
  //                         (item #3) — kid drowning at current school must
  //                         not be pushed to selective schools.
  //   - wantsAcademicFromProse → fires academic_strength when the parent
  //                              expressed positive academic intent in prose
  //                              without picking university_track.
  //   - wantsTopUni       → as above, plus prioritises the Oxbridge fact
  //                         over A* / Grade 9 in the rationale_seed.
  //
  // Item #3 SOFTER stretch boost (Codex r1 design rule 11):
  //   - wantsStretch      → current_school_pain='academic_bored'. Kid
  //                         under-stretched at current school needs a
  //                         BETTER FIT, not necessarily the most selective
  //                         high-pressure school. Gets a softer, capped
  //                         academic boost — NOT the full wantsAcademic
  //                         treatment.
  //
  // When input.intent is null/absent or all fields are 'none', only
  // goal_orientation drives academic intent (pre-Phase-4 baseline).
  const hasAcademicPain        = input.intent?.academic_intent === 'struggle'
                              || input.intent?.current_school_pain === 'academic_overwhelmed'
  const wantsAcademicFromProse = input.intent?.academic_intent === 'strong'
  const wantsTopUni            = input.intent?.top_uni_intent  === 'wants'
  const wantsAcademic =
    !hasAcademicPain && (
      child?.goal_orientation === 'university_track' ||
      wantsAcademicFromProse ||
      wantsTopUni
    )
  // Bored-at-current-school stretch: softer, capped. Fires only when
  // there's no academic pain AND the full wantsAcademic path didn't
  // already cover the kid. Codex parent-harm warning: do NOT map 'bored'
  // 1:1 to 'wants Eton-tier selectivity' — bored ≠ ready for max pressure.
  const wantsStretch =
    input.intent?.current_school_pain === 'academic_bored' &&
    !hasAcademicPain &&
    !wantsAcademic
  const wantsSportFocus = child?.goal_orientation === 'sport_career'

  // Pastoral + inclusive — derived from ctx (possibly upgraded by LLM intent)
  const wantsPastoral  = ctx.parent.pastoral_pref === 'high_priority'
  const wantsInclusive = ctx.parent.lgbtq_pref    === 'important'

  // Phase 4 item #3 — small-env + boarding-prose signals now come from
  // the LLM classifier instead of regex. 'rejects' is captured by the
  // classifier but intentionally NOT used to downgrade wizard answers
  // (Codex r1 design rule: empty/contradicting prose never erases wizard).
  // Same additive-only semantics as the deleted regex hints — they boost
  // when 'wants', do nothing when 'rejects' or 'none'.
  const wantsFullBoardingProse = input.intent?.boarding_pref_from_prose === 'full'
  const wantsSmallProse        = input.intent?.small_env_pref === 'wants'

  // Phase 1 data-utilization (2026-05-21): career-intent detection. Reads
  // wider prose blob (goals_notes + academic_notes also matter for career
  // intent, NOT just anchors/personality). When parent's free text mentions
  // medicine / law / engineering, unlock the corresponding pathway boost.
  const careerProseBlob = [
    child?.goals_notes,
    child?.academic_notes,
    child?.child_wants,
    child?.anchors_notes,
    child?.personality_notes,
    ...(child?.nonnegotiables ?? []),
  ].filter(Boolean).join(' \n ')
  const wantsMedicine    = MEDICINE_INTENT_RE.test(careerProseBlob)
  const wantsLaw         = LAW_INTENT_RE.test(careerProseBlob)
  const wantsEngineering = ENGINEERING_INTENT_RE.test(careerProseBlob)

  // Phase 2 data-utilization (2026-05-21): subject-intent detection. For each
  // of the 9 v2.0 subject_strengths buckets, fire when the parent's free text
  // mentions that subject (or a tight set of cognates). Drives the
  // DIMENSIONS.subject_strengths.rank() boost below. Empty set → dim short-
  // circuits to 0 (no penalty), which is the correct behaviour for parents
  // who never named a subject.
  const subjectIntents = new Set<string>()
  for (const subject of Object.keys(SUBJECT_INTENT_RE)) {
    if (SUBJECT_INTENT_RE[subject].test(careerProseBlob)) subjectIntents.add(subject)
  }

  // Phase 1 data-utilization: parent's top_priority from the 5-question
  // wizard (academic / sport / pastoral / arts / all-round). Used below
  // as a small bonus when a school's existing signals match the parent's
  // stated priority area.
  //
  // Phase 4 item #3 (2026-05-22) — Fill-when-null from LLM-classified
  // parent_drill_focus (drill_down prose field). Codex r1 design rule 9:
  // wizard wins on conflict (explicit > derived). Drill_focus only fills
  // when wizard genuinely missing. Logged for telemetry below.
  const wizardTopPriority = (parent?.top_priority ?? '').trim()
  const drillFocus        = input.intent?.parent_drill_focus
  // 2026-05-24 Yoko slice (Codex r1 Q7) — drill_focus wins over wizard
  // when non-'none'. drill_focus is child-specific (read from THIS child's
  // prose); wizard top_priority is parent-account-shared. Reversing the
  // precedence avoids contaminating siblings (e.g. Sam getting Rugby's
  // sport-priority bonus because his parent's wizard says 'sport' even
  // though Sam's notes say academic+pastoral). Only affects the +0.5
  // soft nudge below; no hard-filter impact.
  const topPriority =
    (drillFocus && drillFocus !== 'none')
      ? drillFocus
      : wizardTopPriority || ''
  if (wizardTopPriority && drillFocus && drillFocus !== 'none' && wizardTopPriority !== drillFocus) {
    // Conflict telemetry — wizard wins, but log so we can audit how often
    // parents' drill-down text contradicts their earlier dropdown click.
    console.warn('[score-for-build-mode] top_priority conflict — wizard=%s drill=%s (using drill_focus, Codex r1 Q7)', wizardTopPriority, drillFocus)
  }

  // Phase 1 data-utilization: arts intent. Fires when the parent's brief
  // captured an arts interest OR topPriority resolves to 'arts' (wizard
  // OR drill_focus fallback). Without either, arts_music_drama facts are
  // not scored.
  const wantsArts = artsInterest.length > 0 || topPriority === 'arts'

  // Phase 1 data-utilization: ethos match (parent's RC / CofE / etc.
  // preference vs school's extracted ethos_label). 'no-preference' or
  // null short-circuits — schools aren't penalised, the dim just doesn't
  // fire.
  const wantsEthos = parent?.ethos_pref && parent.ethos_pref !== 'no-preference' ? parent.ethos_pref : null

  type ScoredSchool = {
    school:  SchoolRow
    struct:  StructRow | null
    score:   number
    signals: string[]
    facts:   string[]   // concrete data points for rationale_seed (max ~3)
  }

  const scored: ScoredSchool[] = filtered.map(s => {
    const struct = structBySlug.get(s.slug) ?? null
    const signals: string[] = []
    const facts:   string[] = []
    let score = (s.confidence_score ?? 0) / 100  // 0..1 base

    // ── Region ──────────────────────────────────────────────────────
    // Bug #3 (2026-05-22) — wrong-bucket schools are dropped by the
    // hard filter above, so the -2.0 else branch is unreachable and
    // removed. Reuses `explicitHomeRegion` from the hoisted block at
    // function top so the filter and scoring agree case-insensitively
    // (regionInBucket handles the case folding).
    if (explicitHomeRegion) {
      const broadEngland = typeof s.region === 'string' && s.region.trim().toLowerCase() === 'england'
      if (s.region == null || broadEngland) {
        // neutral — null OR broad country-level tag ('England')
      } else if (regionInBucket(explicitHomeRegion, s.region)) {
        score += 0.6
        signals.push(`${s.region.toLowerCase()} region`)
      }
      // else: wrong-bucket — already dropped by hard filter above.
    }

    // ── Budget closeness ────────────────────────────────────────────
    // Phase 3 Bug #7 (2026-05-21) — for full / weekly / flexi boarding
    // parents, check against `fees_usd_max` (the upper end / boarding
    // fee) instead of `fees_usd_min` (which is often the day-fee). When
    // the boarder's fees_usd_max is null, skip the chip entirely rather
    // than fall back to the day-fee — better silent than false-positive
    // "in budget" on a school whose boarding fee actually exceeds the
    // parent's ceiling.
    // Phase 4 item #3 Codex r2: use resolved boarding (wizard-or-prose)
    // so "weekly boarding suits us" with null wizard uses the boarding
    // fee column, matching the SQL hard filter below.
    const effectiveForBudget = resolveBoardingPref(parent, input.intent, firedNonnegFilters)
    const isBoarderBudget =
      effectiveForBudget === 'full'   ||
      effectiveForBudget === 'weekly' ||
      effectiveForBudget === 'flexi'
    const budgetCheckFee = isBoarderBudget ? s.fees_usd_max : s.fees_usd_min
    if (budgetCeiling != null && budgetCheckFee != null) {
      const ratio = budgetCheckFee / budgetCeiling
      if (ratio <= 1.0)      { score += 0.5; signals.push('in budget') }
      else if (ratio <= 1.2)  score += 0.2
    }

    // ── Per-sport interest ──────────────────────────────────────────
    // Phase 3 Bug #1+#2 (2026-05-21):
    //   * #2 level weighting — multiply each sport's normalised boost by
    //     SPORT_LEVEL_MULTIPLIER for the parent-stated `sp.level`. A
    //     "school-team" rugby kid no longer earns the same boost as a
    //     "national" rugby kid even when the school is national-elite.
    //   * #1 total cap — track the running sum and stop adding to `score`
    //     once SPORT_TOTAL_CAP is reached. Chips still emit so the parent
    //     sees all matched sports; only the numeric contribution caps.
    let sportBoostTotal = 0
    for (const sp of sportsInterest) {
      const scorerKey = SPORT_SCORER_BY_LABEL[sp.key]
      const dim = (DIMENSIONS as Record<string, { rank: (row: unknown, ctx: unknown) => number } | undefined>)[scorerKey]
      const rawScore = dim ? dim.rank(struct, ctx) : 0
      if (rawScore > 0) {
        // Normalise: rugby/football/cricket/hockey scorers return 0-60ish, tennis similar.
        // Bring into the 0-2.5 range so a single strong sport can compete with region.
        const norm = Math.min(rawScore / 20, 2.5)
        const levelKey = (sp.level ?? '').toLowerCase().trim()
        const levelMul = SPORT_LEVEL_MULTIPLIER[levelKey] ?? SPORT_LEVEL_DEFAULT
        const scaled = norm * levelMul
        const remainingCap = Math.max(0, SPORT_TOTAL_CAP - sportBoostTotal)
        const boost = Math.min(scaled, remainingCap)
        score += boost
        sportBoostTotal += boost
        const sportName = sp.key === 'rugby union' || sp.key === 'rugby league' ? 'rugby' : sp.key
        const lookupSport = sportName === 'rugby' ? 'rugby' : sportName
        const tier = readSportTier(struct, lookupSport)
        const tierFrag = tierToChipFragment(tier)
        if (tierFrag) {
          signals.push(`strong ${sportName} (${tierFrag})`)
        } else if (scaled >= 1.0) {
          signals.push(`strong ${sportName}`)
        }
      }
    }
    if (wantsSportFocus && sportsInterest.length === 0) {
      // Build Mode said sport_career but we couldn't map any specific sport.
      // Fall back to the broad 'sport' strengths tag.
      const strengthsLc = (s.strengths ?? []).map(x => x.toLowerCase())
      if (strengthsLc.includes('sport')) {
        score += 0.5
        signals.push('sport-focused')
      }
    }

    // ── Arts interest ───────────────────────────────────────────────
    if (artsInterest.length > 0) {
      const strengthsLc = (s.strengths ?? []).map(x => x.toLowerCase())
      let bumped = false
      for (const a of artsInterest) {
        const art = (a.art ?? '').toLowerCase()
        if (
          (art.includes('music')  && strengthsLc.includes('music')) ||
          (art.includes('drama')  && strengthsLc.includes('performing arts')) ||
          (art.includes('dance')  && strengthsLc.includes('performing arts')) ||
          (art.includes('art')    && strengthsLc.includes('visual and creative arts'))
        ) {
          if (!bumped) score += 0.5
          bumped = true
          signals.push(`strong ${art}`)
        }
      }
    }

    // ── Academic (goal_orientation = university_track OR LLM prose intent) ──
    // Phase 4 item #2 (2026-05-22): wantsAcademic now also fires on
    // intent.academic_intent='strong' / intent.top_uni_intent='wants' from
    // the LLM classifier. When wantsTopUni fires, prioritise the Oxbridge
    // fact over A* / Grade 9 — that's what the parent specifically asked
    // about. Default fact ordering preserved otherwise.
    if (wantsAcademic) {
      const dim = (DIMENSIONS as Record<string, { rank: (row: unknown, ctx: unknown) => number } | undefined>).academic_strength
      const rawScore = dim ? dim.rank(struct, ctx) : 0
      if (rawScore > 0) {
        const norm = Math.min(rawScore / 25, 2.0)
        score += norm
        // Top-line academic fact for rationale_seed.
        const ex = struct?.exam_results as Record<string, Record<string, number> | undefined> | undefined
        const ud = struct?.university_destinations as Record<string, number | undefined> | undefined
        const oxbridge = (ud?.oxford_count ?? 0) + (ud?.cambridge_count ?? 0)
        if (wantsTopUni && oxbridge > 0) {
          facts.push(`${oxbridge} Oxbridge`)
          signals.push('academic-strong')
        } else if (ex?.a_level?.pct_a_star != null) {
          facts.push(`${Math.round(ex.a_level.pct_a_star)}% A*`)
          signals.push('academic-strong')
        } else if (ex?.gcse?.pct_9 != null) {
          facts.push(`${Math.round(ex.gcse.pct_9)}% Grade 9`)
          signals.push('academic-strong')
        } else if (oxbridge > 0) {
          facts.push(`${oxbridge} Oxbridge`)
          signals.push('academic-strong')
        } else if (norm >= 1.0) {
          signals.push('academic-strong')
        }
      }
    } else if (wantsStretch) {
      // Phase 4 item #3 (2026-05-22) — softer stretch boost for kids
      // bored at current school. Codex parent-harm warning: do NOT push
      // bored kids into max-selectivity high-pressure schools. Use the
      // same dim but with HALF the cap (1.0 vs 2.0) and no Oxbridge
      // facts-first reordering. The kid needs a better academic FIT, not
      // necessarily Eton. Signal chip 'better-fit' lets the LLM rationale
      // distinguish from 'academic-strong'.
      const dim = (DIMENSIONS as Record<string, { rank: (row: unknown, ctx: unknown) => number } | undefined>).academic_strength
      const rawScore = dim ? dim.rank(struct, ctx) : 0
      if (rawScore > 0) {
        const norm = Math.min(rawScore / 25, 1.0)
        score += norm
        if (norm >= 0.6) signals.push('better-fit')
      }
    }

    // ── Pastoral ────────────────────────────────────────────────────
    if (wantsPastoral) {
      const dim = (DIMENSIONS as Record<string, { rank: (row: unknown, ctx: unknown) => number } | undefined>).pastoral_care
      const rawScore = dim ? dim.rank(struct, ctx) : 0
      if (rawScore > 0) {
        const norm = Math.min(rawScore / 10, 1.5)
        score += norm
        if (norm >= 0.8) signals.push('pastoral-strong')
      }
    }

    // ── Inclusive culture ───────────────────────────────────────────
    if (wantsInclusive) {
      const dim = (DIMENSIONS as Record<string, { rank: (row: unknown, ctx: unknown) => number } | undefined>).inclusive_culture
      const rawScore = dim ? dim.rank(struct, ctx) : 0
      if (rawScore > 0) {
        const norm = Math.min(rawScore / 8, 1.0)
        score += norm
        // unshift — parent-stated preference match (lgbtq_pref='important'),
        // must survive the top-5 dedupe/slice. See ethos-match for full rationale.
        if (norm >= 0.6) signals.unshift('inclusive culture')
      }
    }

    // ── Class size (onboarding pref OR prose hint) ──────────────────
    const wantsSmall =
      parent?.class_size_pref === 'very-important' ||
      parent?.class_size_pref === 'nice-to-have'   ||
      wantsSmallProse
    if (wantsSmall) {
      const totalPupils = (struct?.student_community as { total_pupils?: number } | undefined)?.total_pupils
      if (typeof totalPupils === 'number') {
        const weight = parent?.class_size_pref === 'very-important' ? 1 : 0.5
        if (totalPupils <= 400) {
          score += 0.8 * weight
          signals.push(`small (~${totalPupils} pupils)`)
        } else if (totalPupils <= 800) {
          score += 0.4 * weight
        } else if (totalPupils > 1200) {
          score -= 0.3 * weight
        }
      }
    }

    // ── Full-boarding prose hint ────────────────────────────────────
    if (wantsFullBoardingProse) {
      // Cheap signal: name override sets capture boarding type. Already
      // filtered above for `boarding_pref`, but the prose may be the only
      // place full-boarding intent was mentioned. Reward known full-
      // boarding schools.
      if (KNOWN_FULL_BOARDING_NAMES.has(normalizeSchoolName(s.name))) {
        score += 0.3
        signals.push('full boarding')
      }
    }

    // ── SEN positive ────────────────────────────────────────────────
    if (parent?.sen_need === 'yes-priority' && s.sen_support === true) {
      score += 0.4
      // unshift — parent-stated preference match (sen_need='yes-priority'),
      // must survive the top-5 dedupe/slice. See ethos-match for full rationale.
      signals.unshift('SEN-aware')
    }

    // ── Phase 1 data-utilization (2026-05-21) — Medicine / law / engineering
    //    pathway scoring via university_destinations + oxbridge_subjects.
    //    Gated on parent prose intent (don't boost medicine schools for
    //    non-medicine kids). Positive-only — schools without the data
    //    aren't penalised. Multiple pathways can stack (a medicine+vet
    //    kid gets both contributions).
    const ud = struct?.university_destinations as Record<string, unknown> | undefined
    const oxbridgeSubjectsRaw = Array.isArray(ud?.oxbridge_subjects)
      ? (ud!.oxbridge_subjects as string[])
      : []
    const oxbridgeSubjectsLc = oxbridgeSubjectsRaw
      .filter((x): x is string => typeof x === 'string')
      .map(x => x.toLowerCase().trim())
    if (wantsMedicine) {
      const medCount = typeof ud?.medicine_dentistry_vet_count === 'number'
        ? ud!.medicine_dentistry_vet_count as number
        : 0
      // Codex r1 P1.2: substring regex (not exact Set.has) so Cambridge
      // titles like "Natural Sciences" / "Biomedical Sciences" /
      // "Veterinary Medicine" all qualify regardless of whitespace.
      const oxbridgeMedHit = oxbridgeSubjectsLc.some(x => OXBRIDGE_MEDICINE_RE.test(x))
      if (medCount >= 1 || oxbridgeMedHit) {
        // Normalise count: ~10 placements is "strong", ~30 is "exceptional".
        // Cap at +2.0 so a single-pathway boost can't dwarf region.
        const countBoost = Math.min(medCount / 10, 1.5)
        const oxbridgeBoost = oxbridgeMedHit ? 0.5 : 0
        score += countBoost + oxbridgeBoost
        if (medCount >= 1) {
          signals.push(`medicine pipeline (${medCount} placement${medCount === 1 ? '' : 's'})`)
          facts.push(`${medCount} medical / vet placements`)
        } else if (oxbridgeMedHit) {
          signals.push('Oxbridge medicine pathway')
        }
      }
    }
    if (wantsLaw) {
      const oxbridgeLawHit = oxbridgeSubjectsLc.some(x => OXBRIDGE_LAW_RE.test(x))
      if (oxbridgeLawHit) {
        score += 0.5
        signals.push('Oxbridge law pathway')
      }
    }
    if (wantsEngineering) {
      const oxbridgeEngHit = oxbridgeSubjectsLc.some(x => OXBRIDGE_ENG_RE.test(x))
      if (oxbridgeEngHit) {
        score += 0.5
        signals.push('Oxbridge engineering pathway')
      }
    }

    // ── Phase 2 data-utilization (2026-05-21) — Subject-strengths density
    //    over v2.0 polymorphic blob. Reads struct.subject_strengths via
    //    DIMENSIONS.subject_strengths.rank() with ctx.subject_intents (Set
    //    populated above by SUBJECT_INTENT_RE). Per-subject banding inside
    //    the dim: 5+ items = +1.0, 2-4 = +0.5, else 0. Cap total at +2.5
    //    so a 4-subject-intent kid doesn't dwarf region (-2.0) or sport
    //    stacking (~+2.5 per sport).
    //
    //    Surfaces a concrete signal chip per qualifying subject AND a top
    //    fact line (highest-item subject) for the LLM rationale_seed. The
    //    fact uses the bucket's summary_paragraph_for_chatbot when present
    //    (Claude-generated at extract time, chat-shaped) or falls back to
    //    a plain item count.
    if (subjectIntents.size > 0 && struct?.subject_strengths) {
      const dim = (DIMENSIONS as Record<string, { rank: (row: unknown, ctx: unknown) => number } | undefined>).subject_strengths
      const rawScore = dim ? dim.rank(struct, { subject_intents: subjectIntents }) : 0
      if (rawScore > 0) {
        score += Math.min(rawScore, 2.5)
        const ss = struct.subject_strengths as Record<string, { items?: unknown[]; summary_paragraph_for_chatbot?: unknown } | undefined>
        // Per-subject signal chips for any subject with ≥2 items.
        let topSubject:   string | null = null
        let topCount = 0
        for (const subject of Array.from(subjectIntents)) {
          const bucket = ss[subject]
          const itemCount = Array.isArray(bucket?.items) ? bucket!.items!.length : 0
          if (itemCount >= 5) {
            const friendly = subject.replace(/_/g, ' ')
            signals.push(`strong ${friendly} (${itemCount} items)`)
          } else if (itemCount >= 2) {
            const friendly = subject.replace(/_/g, ' ')
            signals.push(`${friendly} (${itemCount} items)`)
          }
          if (itemCount > topCount) {
            topCount = itemCount
            topSubject = subject
          }
        }
        // Concrete fact for rationale_seed — Claude-generated summary
        // of the highest-item-count subject, trimmed for prompt cost.
        if (topSubject && topCount >= 2) {
          const bucket = ss[topSubject]
          const summary = typeof bucket?.summary_paragraph_for_chatbot === 'string'
            ? (bucket.summary_paragraph_for_chatbot as string).trim()
            : ''
          // First sentence only — full paragraphs are too long for the
          // facts[] array which feeds into the rationale_seed parenthetical.
          const firstSentence = summary.split(/(?<=[.!?])\s+/, 1)[0] || ''
          if (firstSentence) facts.push(firstSentence.length > 140 ? firstSentence.slice(0, 137) + '…' : firstSentence)
        }
      }
    }

    // ── Phase 1 data-utilization — Ethos match (parent's RC / CofE etc.
    //    vs school's extracted ethos_label). Positive-only — schools with
    //    a non-matching or missing ethos aren't penalised. The 2026-05-19
    //    Brief form removed the ethos_pref dropdown but the column lives
    //    on for existing users + future re-instatement. Filed as TODO:
    //    surface ethos_pref capture again so new parents can benefit.
    if (wantsEthos) {
      const schoolEthos = (struct?.ethos_facts as { ethos_label?: string } | undefined)?.ethos_label
      if (schoolEthos && schoolEthos === wantsEthos) {
        score += 1.0
        // Friendly chip — strip the underscore taxonomy for parent-facing prose.
        const friendly = schoolEthos.replace(/_/g, ' ')
        // unshift, not push: parent-stated preference matches must survive the
        // top-5 signal dedupe/slice (line ~897). Pushed last, they get truncated
        // when a school already has 5 region/sport/academic signals — even
        // though the +1.0 score lands, the LLM never sees the signal name.
        signals.unshift(`ethos match (${friendly})`)
      }
    }

    // ── Phase 1 data-utilization — Wellbeing staffing structured signal.
    //    Complements the existing ISI pastoral hint (which only reads
    //    isi_deep_facts.mental_health_signal etc.) with actual staffing
    //    counts. Gated on pastoral interest. Capped at +0.5 so it doesn't
    //    dwarf the existing pastoral scoring.
    if (wantsPastoral) {
      const ws = struct?.wellbeing_staffing as { total_staff?: number; ratio_per_pupil?: number | null } | undefined
      const totalStaff = typeof ws?.total_staff === 'number' ? ws!.total_staff : 0
      if (totalStaff >= 5) {
        score += 0.5
        signals.push(`wellbeing team (${totalStaff} staff)`)
      } else if (totalStaff >= 3) {
        score += 0.25
      }
    }

    // ── Phase 1 data-utilization — Arts scoring via school_facts dim
    //    'arts_music_drama'. Count-based: schools with rich arts
    //    infrastructure (≥5 facts: drama theatre, music school,
    //    scholarships, ensembles) get a meaningful boost.
    if (wantsArts) {
      const artsCount = artsCountBySlug.get(s.slug) ?? 0
      if (artsCount >= 5) {
        score += 1.0
        signals.push(`rich arts programme (${artsCount} signals)`)
      } else if (artsCount >= 3) {
        score += 0.5
        signals.push('arts programme')
      } else if (artsCount >= 1) {
        score += 0.2
      }
    }

    // ── Phase 1 data-utilization — top_priority nudge. Lightweight before
    //    the priority-aware redesign (backlog memory: project-priority-
    //    aware-recommender-backlog-2026-05-21). Adds +0.5 when one of
    //    the school's signals matches the parent's stated #1 priority.
    //    Not multiplicative — additive — so it doesn't snowball.
    if (topPriority) {
      const signalsLc = signals.map(x => x.toLowerCase())
      const hasAcademicSignal  = signalsLc.some(x => x.includes('academic') || x.includes('oxbridge') || x.includes('medicine pipeline'))
      const hasSportSignal     = signalsLc.some(x => x.includes('strong ') && /football|rugby|cricket|hockey|tennis|sport/.test(x))
      const hasPastoralSignal  = signalsLc.some(x => x.includes('pastoral') || x.includes('wellbeing'))
      const hasArtsSignal      = signalsLc.some(x => x.includes('arts') || x.includes('music') || x.includes('drama') || x.includes('dance'))
      // unshift, not push: parent's stated #1 priority match must survive the
      // top-5 signal dedupe/slice (line ~897). Pushed last, it gets truncated
      // when a school already has 5 region/sport/academic signals — even
      // though the +0.5 score lands, the LLM never sees the signal name.
      if      (topPriority === 'academic' && hasAcademicSignal) { score += 0.5; signals.unshift('academic-priority match') }
      else if (topPriority === 'sport'    && hasSportSignal)    { score += 0.5; signals.unshift('sport-priority match') }
      else if (topPriority === 'pastoral' && hasPastoralSignal) { score += 0.5; signals.unshift('pastoral-priority match') }
      else if (topPriority === 'arts'     && hasArtsSignal)     { score += 0.5; signals.unshift('arts-priority match') }
      else if (topPriority === 'all-round') {
        const matchCount = [hasAcademicSignal, hasSportSignal, hasPastoralSignal, hasArtsSignal].filter(Boolean).length
        if (matchCount >= 3) { score += 0.5; signals.unshift('all-round match') }
      }
    }

    // 2026-05-24 Yoko slice commit 2 — A* soft pressure penalty.
    // When the LLM classifier identifies high pastoral priority (parent has
    // anxious child OR explicit anti-pressure nonneg), apply a small demotion
    // to schools with very high A*-A. Caveats (per Codex r1-r5 review):
    //   - SOFT penalty only (Codex r1 Q10 — no hard filter on A*)
    //   - Cap at 1.0 (Codex r1 Q6 — A* is a PROXY not direct measure)
    //   - Only surface signal if school has positive signals (Codex r2 C2 —
    //     prevents school surfacing past line-1337 filter with only a
    //     negative signal)
    //   - Signal text disclaims confidence (Codex r1 Q7)
    // Net for Sam's current Midlands pool: all 5 schools have A*-A ≤ 60%
    // → penalty fires on zero schools today. Future-proofing for when
    // pool expands beyond Midlands-IB.
    if (input.intent?.pastoral_priority === 'high') {
      const ex = struct?.exam_results as Record<string, Record<string, number> | undefined> | undefined
      const pctAstarA = ex?.a_level?.pct_a_star_a as number | undefined
      if (typeof pctAstarA === 'number' && pctAstarA > 60) {
        const penalty = Math.min(1.0, (pctAstarA - 60) / 30)
        score -= penalty
        if (penalty > 0.4 && signals.length > 0) {
          signals.push(`possible pressure proxy (${Math.round(pctAstarA)}% A*-A)`)
        }
      }
    }

    return { school: s, struct, score, signals, facts }
  })

  // 6. Sort, drop no-signal, slice
  // Phase 3 Bug #4 (2026-05-21) — the no-signal filter now runs BEFORE
  // the limit slice. Previous order: sort → slice(limit) → drop empty
  // → return. That could hide real positive-signal matches when a
  // high-confidence-but-no-signal cluster filled the top `limit` rows
  // and got dropped afterwards, leaving the LLM with an undersized
  // candidate set even though many positive-signal schools existed
  // further down the sort. New order: sort → drop empty → slice(limit).
  scored.sort((a, b) => b.score - a.score)
  const withSignals = scored.filter(s => s.signals.length > 0)
  const top = withSignals.slice(0, Math.max(limit, 0))

  // 7. Build outputs
  const out: ScoredCandidate[] = top.map(t => {
    const dedupedSignals = Array.from(new Set(t.signals)).slice(0, 5)
    const factStr = t.facts.length > 0 ? ` (${t.facts.slice(0, 2).join(', ')})` : ''
    const rationale_seed = dedupedSignals.length > 0
      ? `${t.school.name} — ${dedupedSignals.join(', ')}${factStr}.`
      : `${t.school.name}${factStr}.`
    return {
      slug:           t.school.slug,
      name:           t.school.name,
      total_score:    t.score,
      signals:        dedupedSignals,
      rationale_seed,
    }
  })
  return out
}

// ── Main scorer (DB-backed wrapper) ─────────────────────────────────

export async function scoreForBuildMode(
  supabase: SupabaseClient,
  input:    BuildModeScorerInput,
  limit:    number = 20,
): Promise<BuildModeScorerResult> {
  const { parent, excludeSlugs, childYear } = input
  const exclude = new Set(excludeSlugs)

  // 2026-05-24 Yoko slice — compute firedNonneg in this wrapper's scope
  // so the SQL curriculum filter + SQL budget column selector can honor
  // nonneg overrides (any-curriculum / no-boarding / boarding-required).
  // rankCandidates (called below) recomputes for its own scope.
  const firedNonneg = matchedNonnegFilters(input.child?.nonnegotiables)

  // 1. UK evidence slug allowlist
  const ukResult = await loadUkEvidenceSlugs(supabase)
  if (ukResult.error) return { candidates: [], reason: 'fetch_failed' }
  if (ukResult.slugs.length === 0) return { candidates: [], reason: 'no_candidates' }
  const candidateSlugs = ukResult.slugs.filter(s => !exclude.has(s))
  if (candidateSlugs.length === 0) return { candidates: [], reason: 'no_candidates' }

  // 2. Candidate query — hard filters in SQL where possible
  let q = supabase
    .from('schools')
    .select('slug, name, gender_split, fees_usd_min, fees_usd_max, sen_support, strengths, confidence_score, age_min, age_max, region')
    .in('slug', candidateSlugs)
    .eq('country', 'United Kingdom')

  q = q.or('fees_usd_min.is.null,fees_usd_min.gte.5000') // drop extraction-bug zero fees

  // 2026-05-24 Slice A — SQL curriculum hard filter REMOVED. Moved to
  // row-time matchesCurriculumPreference helper (post-fetch JS filter)
  // which prefers school_structured_data.curriculum over legacy
  // schools.curriculum. See Charterhouse case: schools.curriculum=["IB"]
  // but Charterhouse doesn't offer IB in real life — SQL filter let it
  // through wrongly. Resolver now requires SSD-IB for IB-pref parents.
  const effectiveCurric = resolveCurriculumPref(parent, firedNonneg)

  // Min-confidence floor (parity with recommend-shortlist.ts 2026-05-18).
  // The conf=0 cohort in schools_status is dominated by state primary
  // schools (Gladstone Primary, City of London Freemen's etc.) and a
  // `reeds-school-uk` duplicate — none of which belong in a Build Mode
  // proposal. NULL confidence is preserved (unknown, don't punish).
  // Phase 2.8 (2026-05-25) — confidence_score floor REMOVED.
  // Live-DB audit (Supabase MCP, project ckofdbjfbxoxxxtedmqa) showed the
  // floor dropped 13 canonical 100%-complete schools (St Paul's,
  // Westminster, Reed's, Cheltenham College, King's Canterbury, Stowe,
  // Headington, Haberdashers' Boys', Ashville, Ashford, MPW Birmingham,
  // MPW Cambridge, Handcross Park) whose canonical row has conf=0 because
  // conf was scored on a stale shell row (e.g. `reeds-school` empty shell
  // with conf=64 vs `reeds-school-uk` canonical with 185 chunks + conf=0).
  // The schools_status.has_substantial_chunks filter via loadUkEvidenceSlugs
  // already drops the 23,960 conf<10 empty primaries the floor was meant
  // to catch — verified live — so the floor is redundant for its stated
  // purpose and actively harmful for the 13 entries it does affect.
  // (Same comment + removal mirrored in recommend-shortlist.ts.)

  // Phase 3 Bug #7 (Codex r1 P1): the SQL HARD filter must use the same
  // fee column as the in-budget chip below. For full/weekly/flexi boarders,
  // a school's fees_usd_min is usually the day fee and would let
  // unaffordable boarding schools survive the hard cap, rank on
  // sport/region/academic signals, and surface as proposals with no
  // negative budget signal. Switch the column conditionally; NULL on the
  // chosen column still passes (preserves the existing extraction-gap
  // tolerance).
  const budgetCeiling = BUDGET_CEILING_USD[parent?.budget_range ?? '']
  if (budgetCeiling != null) {
    // Phase 4 item #3 Codex r2: same resolver as the in-budget chip and
    // hard filter — keeps SQL column selection consistent with downstream
    // ranker, so prose-only boarders ("weekly boarding suits us" without
    // a wizard click) use fees_usd_max for the hard cap.
    const effectiveForBudgetSql = resolveBoardingPref(parent, input.intent, firedNonneg)
    const isBoarderBudget =
      effectiveForBudgetSql === 'full'   ||
      effectiveForBudgetSql === 'weekly' ||
      effectiveForBudgetSql === 'flexi'
    const budgetFilterCol = isBoarderBudget ? 'fees_usd_max' : 'fees_usd_min'
    q = q.or(`${budgetFilterCol}.is.null,${budgetFilterCol}.lte.${Math.round(budgetCeiling * 1.3)}`)
  }

  const entryAge = YEAR_TO_ENTRY_AGE[childYear ?? '']
  if (entryAge != null) {
    q = q
      .or(`age_min.is.null,age_min.lte.${entryAge}`)
      .or(`age_max.is.null,age_max.gte.${entryAge}`)
  }

  if (parent?.sen_need === 'yes-priority') {
    q = q.or('sen_support.is.null,sen_support.eq.true')
  }

  // Pull more than `limit` so soft scoring has room to discriminate.
  // Phase 3 Bug #5 (2026-05-21) — raised from 120 to 250. UK independents
  // in `schools_status` with `has_substantial_chunks=true` currently
  // number ~140, so 120 was clipping the bottom ~20 by confidence_score
  // and locking out strong lower-confidence sport / academic / pastoral
  // matches from ever reaching the JS scorer (they'd never appear even
  // as #20 in a Build Mode recommendation). 250 covers the full UK
  // corpus today with safe headroom; the structured-data + facts fetches
  // below stay bounded by this same number.
  q = q.order('confidence_score', { ascending: false }).limit(250)
  const { data: rawCandidates, error: candidateErr } = await q
  if (candidateErr) return { candidates: [], reason: 'fetch_failed' }
  if (!rawCandidates || rawCandidates.length === 0) {
    return { candidates: [], reason: 'no_candidates' }
  }

  // 3. Structured-data fetch for soft scoring
  // Phase 1 data-utilization (2026-05-21): `wellbeing_staffing` added so
  // the pastoral-priority parents see structured staffing signal (total
  // staff + ratio) on top of the existing ISI hint. Codex audit showed
  // the column was extracted but never read.
  // Phase 2 data-utilization (2026-05-21): `subject_strengths` added —
  // v2.0 polymorphic blob with per-subject items[] + summary paragraph.
  // Drives subject-intent boost in rankCandidates via the new
  // DIMENSIONS.subject_strengths dim. Heavy column (~5-15KB per school)
  // but it's only fetched for the ≤250 candidates post-hard-filter (Phase
  // 3 Bug #5 raised the cap from 120; Codex r1 NIT corrected the comment).
  // 2026-05-24 Slice A — fetch curriculum from SSD so the row-time
  // matchesCurriculumPreference helper can apply post-fetch.
  const slugs = (rawCandidates as SchoolRow[]).map(s => s.slug)
  const { data: structRows, error: structErr } = await supabase
    .from('school_structured_data')
    .select('school_slug, sports_profile, exam_results, university_destinations, student_community, wellbeing_staffing, subject_strengths, curriculum')
    .in('school_slug', slugs)
  if (structErr) return { candidates: [], reason: 'fetch_failed' }

  // 2026-05-24 Slice A — curriculum row-time filter (Codex Q1 verdict).
  // Apply matchesCurriculumPreference to drop schools whose extracted
  // curriculum (from SSD) doesn't match parent's pref. For 'ib': require
  // SSD to list IB (NULL ssd → reject; fixes Charterhouse). For 'a-level':
  // SSD A-Level passes OR missing passes (UK default permissive).
  let filteredCandidates = rawCandidates as SchoolRow[]
  if (effectiveCurric === 'ib' || effectiveCurric === 'a-level') {
    const ssdCurricBySlug = new Map<string, string[] | null>()
    for (const r of structRows ?? []) {
      const row = r as { school_slug: string; curriculum: unknown }
      ssdCurricBySlug.set(row.school_slug, Array.isArray(row.curriculum) ? row.curriculum as string[] : null)
    }
    filteredCandidates = filteredCandidates.filter(s => matchesCurriculumPreference({
      schoolsCurriculum: null,  // intentionally ignore legacy column per Codex Q1
      ssdCurriculum:     ssdCurricBySlug.get(s.slug) ?? null,
      pref:              effectiveCurric,
    }))
  }

  // Slice 8 Build 6 hotfix (2026-05-15) — `isi_deep_facts` is NOT a
  // column on `school_structured_data`; it's a bundle assembled from
  // `school_facts` rows of dimension='isi_deep'. The original Build 6
  // landing selected it as if it were a column, which made Postgres
  // reject the query → fetch_failed → 0 candidates → LLM emits empty
  // schoolProposals → no school pills in finalize CTA.
  //
  // Production reads ISI deep via `loadDimFactsBundles` (lib/server/
  // tools.js). Reuse it here so pastoral_care + inclusive_culture +
  // diversity_culture dimension scorers can fire when the parent has
  // pastoral_pref='high_priority' or lgbtq_pref='important'.
  //
  // Phase 1 data-utilization (2026-05-21): also fold in `ethos_facts`
  // so the new ethos-match scoring branch can read school.ethos_label
  // from the same struct row. Same loadDimFactsBundles call covers both
  // (the function pulls all dim bundles for the requested slugs).
  // Phase 3 Bug #6 (2026-05-21) — build a map keyed by ALL candidate
  // slugs, not just slugs that have an SSD row. Before: schools with
  // `school_facts` (ISI deep, ethos) but no `school_structured_data` row
  // silently lost those facts because the iteration was over `structRows`
  // only. After: every candidate slug gets a StructRow with SSD fields
  // null when absent, so the pastoral / inclusive / ethos scorers still
  // fire for facts-only schools.
  const factsBundles = await loadDimFactsBundles(supabase, slugs)
  const structRowsBySlug = new Map<string, Omit<StructRow, 'isi_deep_facts' | 'ethos_facts'>>()
  for (const rawRow of structRows ?? []) {
    const r = rawRow as Omit<StructRow, 'isi_deep_facts' | 'ethos_facts'>
    structRowsBySlug.set(r.school_slug, r)
  }
  const structBySlug = new Map<string, StructRow>()
  for (const slug of slugs) {
    const r = structRowsBySlug.get(slug)
    structBySlug.set(slug, {
      school_slug:             slug,
      sports_profile:          r?.sports_profile ?? null,
      exam_results:            r?.exam_results ?? null,
      university_destinations: r?.university_destinations ?? null,
      student_community:       r?.student_community ?? null,
      wellbeing_staffing:      r?.wellbeing_staffing ?? null,
      subject_strengths:       r?.subject_strengths ?? null,
      curriculum:              (r as { curriculum?: string[] | null } | undefined)?.curriculum ?? null,
      isi_deep_facts: (factsBundles.get(slug)?.isi_deep_facts as Record<string, unknown> | undefined) ?? null,
      ethos_facts:    (factsBundles.get(slug)?.ethos_facts    as Record<string, unknown> | undefined) ?? null,
    })
  }

  // Phase 1 data-utilization (2026-05-21): arts_music_drama fact counts
  // per slug. Separate fetch (the existing factsBundles loader doesn't
  // include this dimension). 146 facts in this dimension —
  // has_drama_theatre, has_music_school, music/drama scholarships,
  // ensembles. Schools with ≥5 unique positive signals get the strong
  // arts boost in rankCandidates.
  //
  // Codex r1 P1.1: de-noise. Pull canonical_key + claim and:
  //   1. Exclude rows whose claim.value === false (e.g. a fact saying
  //      "this school does NOT have a music scholarship").
  //   2. Dedupe by canonical_key per slug so the same canonical claim
  //      doesn't double-count (e.g. two extractions of has_music_school
  //      shouldn't make the school look twice as arts-rich).
  // Pre-fix: any active row inflated the count, including duplicates
  // and negatively-flagged facts.
  const { data: artsRows, error: artsErr } = await supabase
    .from('school_facts')
    .select('school_slug, canonical_key, claim')
    .in('school_slug', slugs)
    .eq('dimension', 'arts_music_drama')
    .eq('status', 'active')
  if (artsErr) return { candidates: [], reason: 'fetch_failed' }
  const artsPositiveKeys = new Map<string, Set<string>>()  // slug → unique-positive canonical_keys
  for (const rawRow of artsRows ?? []) {
    const row = rawRow as { school_slug: string; canonical_key: string | null; claim: { value?: unknown } | null }
    const slug = row.school_slug
    const key = row.canonical_key ?? ''
    if (!key) continue
    // Exclude explicit negatives. Boolean false, string 'false', and
    // numeric 0 all count as negative. Anything else (true, a number > 0,
    // a non-empty string, a structured object) counts as positive.
    const v = row.claim?.value
    const isNegative =
      v === false ||
      v === 'false' ||
      v === 0 ||
      v === null ||
      v === undefined ||
      v === ''
    if (isNegative) continue
    if (!artsPositiveKeys.has(slug)) artsPositiveKeys.set(slug, new Set())
    artsPositiveKeys.get(slug)!.add(key)
  }
  const artsCountBySlug = new Map<string, number>()
  for (const [slug, keys] of Array.from(artsPositiveKeys.entries())) {
    artsCountBySlug.set(slug, keys.size)
  }

  // 4. Pure ranker — passes the curriculum-filtered candidate list (2026-05-24 Slice A)
  const candidates = rankCandidates(filteredCandidates, structBySlug, input, limit, artsCountBySlug)
  if (candidates.length === 0) return { candidates: [], reason: 'no_candidates' }
  return { candidates, reason: 'ok' }
}

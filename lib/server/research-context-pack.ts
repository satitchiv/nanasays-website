import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  estimateTokens,
  minimiseChildProfile,
  safeCell,
  safeRecentMessages,
  type MinimisedChild,
  type SafeCell,
  type SafeRecentMessage,
} from './pack-redactors'
import { loadDimensionEvidencePack } from './dimension-evidence-pack'
import { projectSubjectStrengths } from './subject-strengths-projection.mjs'
import { projectMetaFees } from './project-meta-fees.mjs'
import { projectSchoolPdfs } from './project-meta-pdfs.mjs'
// Notion-sidecar wiring slice (2026-05-24). The projector enforces:
// - whitelist of allowed fields (drops fees + unknown keys)
// - SSD-wins on overlapping fields (total_pupils, boarders, intl, boarding_pct,
//   GCSE / A-Level %, lowest_boarding_entry)
// - unit normalisation (decimal boarding ratios → percent)
// Running it at the fetch boundary stops raw `parsed` from leaking into any
// downstream surface (Codex r1 P1.1).
import { projectNotionBackfill } from './nana-brain.js'

/**
 * research-context-pack.ts — single source of truth for chatbot context.
 *
 * Per ~/notes/research-panel-excellence-plan.md §5–§6.
 *
 * One function: `assembleResearchContextPack(supabase, ctx)`. Called once
 * per chat request, before any LLM call. Returns a typed, privacy-shaped
 * tray of context that all four runners (single, multi, agentic, prose)
 * read from. Replaces today's ad-hoc `parentContext + historyContext +
 * shortlistSlugs + activeRowNames` threading.
 *
 * Critical invariants:
 *  - PRIVACY-FIRST: every field that can carry PII routes through
 *    pack-redactors.ts before landing in the pack. No raw `cell_data.note`,
 *    no raw `child_profile`, no raw `proposed_actions` JSON.
 *  - OWNERSHIP-SCOPED: /api/nana-research uses the SERVICE-ROLE key, so
 *    RLS does NOT apply. Every query in this file MUST include the
 *    user/session/child scope clauses listed in plan §6.4. P1 tests assert
 *    that "user A reading user B's data" returns zero rows.
 *  - TOKEN-BUDGETED: stratified caps per plan §6.5. Pack overflows
 *    degrade gracefully (drop chunks → sensitive → projection → row tail
 *    → older messages → low-weight rows). NEVER drops parent/child/session/
 *    shortlist/intent.
 *  - NO MODEL CALLS. NO Anthropic API. NO Anthropic SDK import.
 *    (Codex 2026-05-08: removed literal package name from this comment so
 *    the no-API grep gate doesn't false-positive on this file.)
 *  - NO public-website paths reference this file. Server-only.
 */

// ── Public types ───────────────────────────────────────────────────────────

export type CitationRef = {
  url: string
  school_slug: string | null
  table:
    | 'school_structured_data'
    | 'school_sensitive'
    | 'school_facts'
    | 'school_fact_projections'
    | 'school_knowledge'
    | 'comparison_rows'
    | null
  field: string | null
  row_id: string | null
  dimension: string | null
  confidence: number | null
}

export type AssemblyContext = {
  user_id: string
  child_id: string | null
  session_id: string
  /** Slugs the parent has shortlisted for this child. */
  shortlist: string[]
  /** Slugs explicitly mentioned in this turn's question (post expandFamousShortNames). */
  mentioned_slugs: string[]
  /** Slug of the school the parent is currently looking at, if any. */
  active_school_slug: string | null
  /** Active comparison-tab base lens. */
  base_lens_kind: 'general' | 'child_fit'
  /** Free-form intent shape from intent-router; nullable. */
  intent: { kind: string | null; dimension: string | null; target_slugs: string[]; confidence: number | null } | null
  /** Verbosity hint forwarded to runners (chat | report). */
  verbosity?: 'chat' | 'report'
}

export type PackSchool = {
  slug: string
  meta: {
    name: string
    country: string | null
    boarding_type: string | null
    gender_split: string | null
    /** Local-currency annual fees (Tab A Step 4, 2026-05-25). Prefers
     * school_structured_data.fees_min/max + fees_currency (post-2026-05-15
     * fees-currency migration these are accurate). Falls back to
     * schools.fees_usd_min/max + 'USD' when SSD has no fees. null when both
     * sources empty. Replaces the misleading fees_min_gbp / fees_max_gbp
     * fields that were carrying USD values under a GBP-suffixed name. */
    fees_min: number | null
    fees_max: number | null
    /** ISO 4217 (GBP, USD, CHF, EUR, THB, ...) or null when fees null. */
    fees_currency: string | null
    is_uk: boolean
  }
  /** Whitelisted SSD fields (per plan §6.1). Object shape varies by school. */
  structured: Record<string, unknown> | null
  /**
   * Hand-curated UK school facts from school_notion_backfill (Phase 1 sidecar,
   * Phase 1.5 promotion 2026-05-18). Only `parsed` (cleaned values) for `clean`
   * rows surfaces here — `raw_properties`, `rejected`, `flagged_review` are
   * never selected. Fields parents ask about that SSD doesn't cover today:
   * class_size, total_pupils, boarder_count, intl_count, boarding_pct,
   * gcse_pct (+ gcse_pct_alt_band), a_level_pct, lowest_boarding_entry,
   * heathrow_distance (miles). Dropped by reducer when pack is over hard cap.
   */
  notion_backfill?: Record<string, unknown> | null
  /**
   * Curated supplementary facts from the `schools` table (Tab A Step 3,
   * 2026-05-25). Compact scalars/short text parents ask about that SSD
   * doesn't carry: head + tenure, houses, EAL, Thai community, open day,
   * prospectus URL, bus, food, USP. Reducer-friendly — `dropped_curated_meta`
   * nulls this whole object when pack is over hard cap.
   */
  curated_meta?: {
    eal_support: boolean | null
    eal_hours_per_week: number | null
    eal_cost_usd: number | null
    thai_students: number | null
    thai_community: string | null
    open_day_text: string | null
    open_day_url: string | null
    prospectus_url: string | null
    head_of_school: string | null
    head_tenure_start: string | null
    house_system: string | null
    house_names: string[] | null
    /** Pre-cap count of house_names. Renderer uses this so schools with
     * many houses (e.g. Eton's 25) don't get mis-reported as the capped
     * length. */
    house_count: number | null
    food_options: string | null
    /** true when the school runs a bus service; null otherwise (false
     * collapses to null at projection time — false doesn't render, no
     * point bloating the JSON). */
    bus_service: true | null
    unique_selling_points: string | null
    /**
     * Tab A Step 10 v2 Commit 3 (2026-05-26). 14 additional parent-facing
     * fields wired alongside the original Step 3 group.
     *
     * A-slice (richness, single-line bits): est. year, ISI inspection date,
     * top-university destinations, notable alumni (wiki-cruft scrubbed),
     * Instagram + YouTube full URLs, school crest + hero photo URLs,
     * top-4 readable PDFs filtered by parent-relevance whitelist.
     *
     * B-slice (ISI narrative block, multi-line render via
     * renderISINarrative): summary prose + grade verdicts + key strengths
     * array + areas-for-improvement array.
     */
    founded_year: number | null
    isi_report_date: string | null
    top_universities: string[] | null
    /** Wiki citation markers (`#cite note-N`, `[1]`) and inline URLs are
     * scrubbed at projection time; field is capped at 500 chars. */
    alumni_notable: string | null
    instagram_url: string | null
    youtube_url: string | null
    logo_url: string | null
    hero_image: string | null
    /** Filtered readable PDFs (max 4). null when no row matches the
     * parent-relevance whitelist — better than offering parents a
     * Fire Risk Assessment. */
    school_pdfs: Array<{ title: string; url: string }> | null
    /** ISI inspectorate verdicts/prose. isi_summary is the gate — when
     * null, renderISINarrative emits no block (non-UK schools). */
    isi_summary: string | null
    isi_key_strengths: string[] | null
    isi_areas_for_improvement: string[] | null
    isi_academic_quality: string | null
    isi_pastoral_care: string | null
  } | null
  /** Optional: regulatory rows (only when intent fires). */
  sensitive?: Array<{ type: string; date: string | null; severity: string | null; title: string; summary: string | null }>
  /** Optional: atomic facts where present. */
  facts?: Array<{ id: string; dimension: string; fact_type: string; canonical_key: string; claim: unknown; confidence: number; source_url: string | null }>
  /** Optional: typed projection (rugby-only tonight). */
  projection?: Record<string, unknown>
  /** Optional: targeted raw chunks (only when intent broad-fit / no structured). */
  chunks?: Array<{ url: string; text: string; category: string; word_count: number }>
  source: 'projection' | 'structured' | 'mixed' | 'empty'
  citations: CitationRef[]
  missing_dims: string[]
}

export type ResearchContextPack = {
  parent: {
    user_id: string
    region: string | null
    budget_band: string | null
    top_priority: string | null
    boarding_pref: string | null
    child_year: string | null
    // T4.16 Gap B prefs (ranking inputs for ethos_match / intl_share /
    // device_policy dims). 'no-preference' option in onboarding maps to
    // null here so dim.rank()'s if (!want) short-circuit fires cleanly.
    ethos_pref: string | null
    intl_pref: string | null
    phone_pref: string | null
    // 2026-05-10 ISI deep extraction prefs (inclusive_culture, pastoral_care).
    lgbtq_pref: string | null
    pastoral_pref: string | null
  }
  child: MinimisedChild | null
  session: { id: string; title: string; rolling_summary: string | null; turn_count: number }
  recent_messages: SafeRecentMessage[]
  shortlist: string[]
  comparison: {
    lens_id: string | null
    lens_kind: 'general' | 'child_fit' | 'chat'
    lens_question: string | null
    weights: Record<string, number>
    visible_rows: string[]
    rows: Array<{
      row_name: string
      group_name: string
      weight: number
      cells: Record<string, SafeCell>
    }>
  }
  intent: AssemblyContext['intent']
  schools: Record<string, PackSchool>
  visit_notes?: Array<{ slug: string; visited_at: string; note: string }>
  partner_brief?: { body_markdown: string; generated_at: string }
  meta: {
    pack_version: '1.0.0'
    assembled_at: string
    elapsed_ms: number
    bytes: number
    estimated_tokens: number
    flags: { mode: 'authenticated' | 'public'; share_justifications: boolean }
    overflow_actions: string[]
  }
}

// ── Token caps per shortlist size (plan §6.5) ─────────────────────────────

function capsForShortlistSize(n: number) {
  if (n <= 2) return { hard: 4000, perSchoolStructured: 350, perSchoolChunks: 600, comparison: 800, recent: 600, citations: 200 }
  if (n === 3) return { hard: 5000, perSchoolStructured: 350, perSchoolChunks: 400, comparison: 800, recent: 600, citations: 200 }
  if (n <= 5) return { hard: 6500, perSchoolStructured: 300, perSchoolChunks: 250, comparison: 1000, recent: 500, citations: 200 }
  return { hard: 8000, perSchoolStructured: 250, perSchoolChunks: 0, comparison: 1200, recent: 500, citations: 200 }
}

// SSD fields whitelisted into the pack (plan §6.1).
const SSD_WHITELIST = [
  'fees_min',
  'fees_max',
  'fees_currency',
  'fees_by_grade',
  'exam_results',
  'university_destinations',
  'sports_profile',
  // Recommender Phase 2 (2026-05-21): subject_strengths is the v2.0 polymorphic
  // per-subject blob (maths/biology/.../economics_business, each with items[]
  // + summary_paragraph_for_chatbot). nana-brain's buildStructuredBlock projects
  // this to one compact line per subject; full row is dropped first by the pack
  // reducers if the token budget is hit.
  'subject_strengths',
  'pastoral_care',
  'pastoral_model',
  'wellbeing_staffing',
  'admissions_format',
  'scholarships_available',
  'bursary_note',
  'location_profile',
  'curriculum',
  'sixth_form_curriculum',
  'student_community',
  'school_life',
  'facilities',
  'languages',
  'grade_levels',
  'accreditations',
  // 2026-05-24 (Notion-sidecar wiring slice, Codex r1 bonus): `boarding_options`
  // was rendered by buildStructuredBlock but never in the whitelist, so it was
  // silently absent from the pack. Adding it closes the dead path.
  'boarding_options',
  'policies_summary',
  'report_verdict',
  'report_parent_fit',
  'report_tour_questions',
] as const

const RECAP_INTENT_RE = /\b(remind me|what did we decide|brief|recap|summary so far)\b/i
const SAFEGUARDING_INTENT_KINDS = new Set(['safeguarding_or_pastoral', 'safeguarding'])

// ── Public entrypoint ──────────────────────────────────────────────────────

export async function assembleResearchContextPack(
  supabase: SupabaseClient,
  ctx: AssemblyContext,
  question: string,
): Promise<ResearchContextPack> {
  const t0 = Date.now()
  const overflow_actions: string[] = []

  // Resolve in-scope school slugs deterministically.
  const inScope = uniq([
    ...ctx.shortlist,
    ...ctx.mentioned_slugs,
    ...(ctx.active_school_slug ? [ctx.active_school_slug] : []),
    ...((ctx.intent?.target_slugs ?? []) as string[]),
  ]).slice(0, 8) // hard ceiling — pack assembler never pulls > 8 schools per call

  const caps = capsForShortlistSize(inScope.length)

  // ── Ownership-scoped root fetches ────────────────────────────────────────
  // Codex 2026-05-08: must verify session ownership BEFORE pulling messages
  // (route uses service-role key — RLS doesn't apply). Parent / child / session
  // checks run in parallel; messages + comparison only fetched after session
  // is confirmed to belong to (user_id, child_id).
  const [parentProfile, childRow, sessionRow] = await Promise.all([
    fetchParent(supabase, ctx.user_id),
    ctx.child_id ? fetchChild(supabase, ctx.user_id, ctx.child_id) : Promise.resolve(null),
    fetchSession(supabase, ctx.user_id, ctx.child_id, ctx.session_id),
  ])

  // If session doesn't belong to (user_id, child_id), return an empty-shaped
  // pack — never leak messages / comparison from another user's session.
  const sessionOwned = !!sessionRow && sessionRow.id === ctx.session_id
  const [recentMsgsRaw, comparisonAggregate] = sessionOwned
    ? await Promise.all([
        fetchRecentMessages(supabase, ctx.user_id, ctx.session_id),
        fetchComparison(supabase, ctx.user_id, ctx.session_id, ctx.base_lens_kind),
      ])
    : [
        [],
        {
          lens_id: null,
          lens_kind: ctx.base_lens_kind as 'general' | 'child_fit' | 'chat',
          lens_question: null,
          weights: {} as Record<string, number>,
          visible_rows: [] as string[],
          rows: [] as Array<{
            row_name: string
            group_name: string
            weight: number
            cells: Record<string, SafeCell>
          }>,
        },
      ]

  const childMinimal = childRow ? minimiseChildProfile(childRow) : null
  const childNames = childRow?.name ? [childRow.name] : []
  const recent_messages = safeRecentMessages(recentMsgsRaw ?? [], { childNames })

  // ── Schools fetch (parallel within in-scope set) ─────────────────────────
  const schoolsArr = await Promise.all(
    inScope.map((slug) => fetchSchoolBundle(supabase, slug, ctx, question)),
  )
  const schoolsMap: Record<string, PackSchool> = {}
  for (const s of schoolsArr) if (s) schoolsMap[s.slug] = s

  // ── Optional sections (intent-gated) ─────────────────────────────────────
  const wantsRecap = RECAP_INTENT_RE.test(question)
  const wantsSafeguarding = ctx.intent && SAFEGUARDING_INTENT_KINDS.has(ctx.intent.kind ?? '')
  const partnerBrief =
    wantsRecap && ctx.child_id
      ? await fetchPartnerBrief(supabase, ctx.user_id, ctx.child_id)
      : undefined
  const visitNotes =
    inScope.length > 0
      ? await fetchVisitNotes(supabase, ctx.user_id, inScope, childNames)
      : undefined

  // Sensitive: include only when intent matches safeguarding OR shortlist ≥ 2
  if (wantsSafeguarding || inScope.length >= 2) {
    const sensitiveBySlug = await fetchSensitive(supabase, inScope)
    for (const slug of Object.keys(sensitiveBySlug)) {
      if (schoolsMap[slug]) schoolsMap[slug].sensitive = sensitiveBySlug[slug]
    }
  }

  // ── Build draft pack ─────────────────────────────────────────────────────
  // T4.16 Gap B: child-first read for the 3 ranking prefs (Slice 3.3 model
  // — child_profile is source of truth, parent_profiles is the seed
  // template + fallback for childless flows). 'no-preference' → null so
  // dim.rank()'s if (!want) short-circuit fires cleanly and the dim
  // contributes 0 to ranking instead of biasing it. child_profile is JSONB
  // and editable via API, so allowlist here too; unknown intl/phone values
  // must not behave like high/strict by accident.
  const childProfileObj = (childRow?.child_profile ?? {}) as Record<string, unknown>
  const prefAllowed = {
    ethos_pref: new Set([
      'church_of_england', 'roman_catholic', 'methodist', 'quaker',
      'jewish', 'muslim', 'mixed_faith', 'christian_general', 'secular',
    ]),
    intl_pref: new Set(['low', 'high']),
    phone_pref: new Set(['strict', 'flexible']),
    // 2026-05-10 ISI deep extraction: drives inclusive_culture + pastoral_care
    // scorers. Same 'no-preference' → null pattern as the T4.16 prefs above.
    lgbtq_pref:    new Set(['important']),
    pastoral_pref: new Set(['high_priority', 'standard']),
  } as const
  type PrefKey = keyof typeof prefAllowed
  const readPref = (key: PrefKey): string | null => {
    const childVal = childProfileObj[key]
    const parentVal = parentProfile?.[key] ?? null
    const raw = (typeof childVal === 'string' && childVal) ? childVal : parentVal
    if (!raw || raw === 'no-preference') return null
    return prefAllowed[key].has(raw) ? raw : null
  }
  const pack: ResearchContextPack = {
    parent: {
      user_id: ctx.user_id,
      region: parentProfile?.home_region ?? null,
      budget_band: parentProfile?.budget_range ?? null,
      top_priority: parentProfile?.top_priority ?? null,
      boarding_pref: parentProfile?.boarding_pref ?? null,
      child_year: parentProfile?.child_year ?? null,
      ethos_pref: readPref('ethos_pref'),
      intl_pref:  readPref('intl_pref'),
      phone_pref: readPref('phone_pref'),
      lgbtq_pref:    readPref('lgbtq_pref'),
      pastoral_pref: readPref('pastoral_pref'),
    },
    child: childMinimal,
    session: {
      id: sessionRow?.id ?? ctx.session_id,
      title: sessionRow?.title ?? '',
      rolling_summary: sessionRow?.summary?.text ?? null,
      turn_count: recent_messages.length,
    },
    recent_messages,
    shortlist: ctx.shortlist,
    comparison: comparisonAggregate,
    intent: ctx.intent,
    schools: schoolsMap,
    visit_notes: visitNotes,
    partner_brief: partnerBrief,
    meta: {
      pack_version: '1.0.0',
      assembled_at: new Date().toISOString(),
      elapsed_ms: 0,
      bytes: 0,
      estimated_tokens: 0,
      flags: { mode: 'authenticated', share_justifications: false },
      overflow_actions: [],
    },
  }

  // ── Token-budget enforcement (plan §6.5) ─────────────────────────────────
  // Codex 2026-05-08: enforcement now iterates until under cap or all reducible
  // sections exhausted. Earlier version stopped after a few drops and could
  // still return over cap. Now: chunks → sensitive → projection → visible_rows →
  // comparison-row tail → older messages → facts → structured-trim. Never drops
  // parent/child/session/shortlist/intent.
  const reducers: Array<{ name: string; reduce: () => void }> = [
    {
      name: 'dropped_chunks',
      reduce: () => { for (const slug of Object.keys(pack.schools)) delete pack.schools[slug].chunks },
    },
    {
      name: 'dropped_sensitive',
      reduce: () => { for (const slug of Object.keys(pack.schools)) delete pack.schools[slug].sensitive },
    },
    {
      name: 'dropped_projection',
      reduce: () => { for (const slug of Object.keys(pack.schools)) delete pack.schools[slug].projection },
    },
    {
      name: 'truncated_visible_rows',
      reduce: () => { pack.comparison.visible_rows = pack.comparison.visible_rows.slice(0, 4) },
    },
    {
      name: 'truncated_comparison_rows_to_4',
      reduce: () => {
        if (pack.comparison.rows.length > 4) {
          pack.comparison.rows.sort((a, b) => b.weight - a.weight)
          pack.comparison.rows = pack.comparison.rows.slice(0, 4)
        }
      },
    },
    {
      name: 'truncated_recent_messages_to_3',
      reduce: () => { if (pack.recent_messages.length > 3) pack.recent_messages = pack.recent_messages.slice(-3) },
    },
    {
      // Tab A Step 3 (2026-05-25). Drop curated_meta BEFORE notion_backfill —
      // Notion carries higher-impact quant facts (class size, pupil counts,
      // GCSE / A-Level %) that parents ask about more than head_of_school /
      // food_options / USP / etc. that live in curated_meta. Both are
      // supplementary to the citation-bearing facts.
      name: 'dropped_curated_meta',
      reduce: () => { for (const slug of Object.keys(pack.schools)) pack.schools[slug].curated_meta = null },
    },
    {
      // Notion sidecar (2026-05-24 wiring slice). Per Codex r1: do NOT rely on
      // the implicit reducer chain to shed Notion data. Drop notion_backfill
      // BEFORE facts because facts are higher-signal (atomic, dimension-tagged,
      // citation-bearing). Notion duplicates parent-facing facts (class size,
      // pupil counts) that are also nice-to-have but lower-priority than the
      // citation-bearing facts the recommender depends on.
      name: 'dropped_notion_backfill',
      reduce: () => { for (const slug of Object.keys(pack.schools)) pack.schools[slug].notion_backfill = null },
    },
    {
      name: 'dropped_facts',
      reduce: () => { for (const slug of Object.keys(pack.schools)) delete pack.schools[slug].facts },
    },
    {
      name: 'truncated_comparison_rows_to_2',
      reduce: () => { if (pack.comparison.rows.length > 2) pack.comparison.rows = pack.comparison.rows.slice(0, 2) },
    },
    {
      name: 'truncated_recent_messages_to_1',
      reduce: () => { if (pack.recent_messages.length > 1) pack.recent_messages = pack.recent_messages.slice(-1) },
    },
    {
      name: 'truncated_structured_to_meta_only',
      reduce: () => { for (const slug of Object.keys(pack.schools)) pack.schools[slug].structured = null },
    },
  ]

  let estimated = estimateTokens(pack)
  for (const r of reducers) {
    if (estimated <= caps.hard) break
    r.reduce()
    overflow_actions.push(r.name)
    estimated = estimateTokens(pack)
  }

  pack.meta.elapsed_ms = Date.now() - t0
  const json = JSON.stringify(pack)
  pack.meta.bytes = Buffer.byteLength(json, 'utf8')
  pack.meta.estimated_tokens = estimateTokens(pack)
  pack.meta.overflow_actions = overflow_actions

  return pack
}

// ── Internals ──────────────────────────────────────────────────────────────

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs))
}

async function fetchParent(supabase: SupabaseClient, userId: string) {
  // T4.16 Gap B (2026-05-09): added ethos_pref / intl_pref / phone_pref.
  // Read here as the *fallback* template only — Slice 3.3 source of truth
  // is each child's child_profile JSONB. The pack.parent constructor below
  // reads child-first, parent-fallback for these 3 keys.
  const { data } = await supabase
    .from('parent_profiles')
    .select('id, child_year, boarding_pref, budget_range, top_priority, home_region, ethos_pref, intl_pref, phone_pref, lgbtq_pref, pastoral_pref')
    .eq('id', userId)
    .maybeSingle<{
      id: string
      child_year: string | null
      boarding_pref: string | null
      budget_range: string | null
      top_priority: string | null
      home_region: string | null
      ethos_pref: string | null
      intl_pref: string | null
      phone_pref: string | null
      lgbtq_pref: string | null
      pastoral_pref: string | null
    }>()
  return data
}

async function fetchChild(supabase: SupabaseClient, userId: string, childId: string) {
  const { data } = await supabase
    .from('children')
    .select('id, name, date_of_birth, child_profile, is_archived')
    .eq('user_id', userId)
    .eq('id', childId)
    .eq('is_archived', false)
    .maybeSingle<{
      id: string
      name: string | null
      date_of_birth: string | null
      child_profile: Record<string, unknown> | null
      is_archived: boolean
    }>()
  return data
}

async function fetchSession(
  supabase: SupabaseClient,
  userId: string,
  childId: string | null,
  sessionId: string,
) {
  // Codex 2026-05-08: must filter by child_id too. A session belongs to a
  // (user, child) pair; if the request asserts a child mismatch, we treat the
  // session as not-owned and return null.
  let q = supabase
    .from('research_sessions')
    .select('id, title, summary, child_id, last_active_at')
    .eq('user_id', userId)
    .eq('id', sessionId)
  if (childId) q = q.eq('child_id', childId)
  const { data } = await q.maybeSingle<{
    id: string
    title: string | null
    summary: { text?: string } | null
    child_id: string | null
    last_active_at: string | null
  }>()
  return data
}

async function fetchRecentMessages(supabase: SupabaseClient, userId: string, sessionId: string) {
  // Codex 2026-05-08: defence-in-depth. The caller already verified session
  // ownership, but we still sub-query against research_sessions to inner-join
  // the user_id check at the DB layer. Belt-and-braces: even if a future caller
  // skipped fetchSession, this query cannot return another user's messages.
  const { data: ownerCheck } = await supabase
    .from('research_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!ownerCheck) return []
  const { data } = await supabase
    .from('research_session_messages')
    .select('question, parsed_answer, actions, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(5)
  // We pulled DESC; flip to chronological for the pack.
  return (data ?? []).slice().reverse().map((m: any, i: number) => ({
    role: 'user',
    question: m.question,
    parsed_answer: m.parsed_answer,
    actions: m.actions,
    created_at: m.created_at,
    turn_idx: i,
  }))
}

async function fetchComparison(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  baseLensKind: 'general' | 'child_fit',
) {
  // Resolve active lens (custom lens overrides client hint).
  const { data: sessRow } = await supabase
    .from('research_sessions')
    .select('active_lens_id')
    .eq('user_id', userId)
    .eq('id', sessionId)
    .maybeSingle<{ active_lens_id: string | null }>()
  let lens_id: string | null = sessRow?.active_lens_id ?? null
  let lens_question: string | null = null
  let weights: Record<string, number> = {}
  let visible_rows: string[] = []
  if (lens_id) {
    const { data: lensRow } = await supabase
      .from('comparison_lenses')
      .select('id, lens_question, weights, visible_rows, base_lens_kind')
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .eq('id', lens_id)
      .maybeSingle<{
        id: string
        lens_question: string | null
        weights: Record<string, number> | null
        visible_rows: string[] | null
        base_lens_kind: 'general' | 'child_fit' | null
      }>()
    if (lensRow) {
      lens_question = lensRow.lens_question
      weights = (lensRow.weights ?? {}) as Record<string, number>
      visible_rows = lensRow.visible_rows ?? []
      if (lensRow.base_lens_kind) baseLensKind = lensRow.base_lens_kind
    }
  }

  // Pull rows for the resolved base lens kind. Cells are whitelisted.
  const { data: rows } = await supabase
    .from('comparison_rows')
    .select('id, row_name, group_name, weight, cell_data, lens_kind, sort_order')
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .eq('lens_kind', baseLensKind)
    .is('undone_at', null)
    .order('sort_order', { ascending: true })
    .limit(50)

  const built = (rows ?? []).map((r: any) => {
    const cells: Record<string, SafeCell> = {}
    const cd = (r.cell_data ?? {}) as Record<string, Record<string, unknown>>
    for (const slug of Object.keys(cd)) {
      cells[slug] = safeCell(cd[slug])
    }
    return {
      row_name: r.row_name,
      group_name: r.group_name,
      weight: typeof r.weight === 'number' ? r.weight : 1,
      cells,
    }
  })

  return {
    lens_id,
    lens_kind: baseLensKind as 'general' | 'child_fit' | 'chat',
    lens_question,
    weights,
    visible_rows,
    rows: built,
  }
}

async function fetchPartnerBrief(supabase: SupabaseClient, userId: string, childId: string) {
  const { data } = await supabase
    .from('partner_briefs')
    .select('body_markdown, generated_at')
    .eq('user_id', userId)
    .eq('child_id', childId)
    .maybeSingle<{ body_markdown: string | null; generated_at: string | null }>()
  if (!data?.body_markdown) return undefined
  return {
    body_markdown: String(data.body_markdown).slice(0, 4000),
    generated_at: data.generated_at ?? new Date(0).toISOString(),
  }
}

async function fetchVisitNotes(
  supabase: SupabaseClient,
  userId: string,
  slugs: string[],
  childNames: string[],
) {
  if (slugs.length === 0) return undefined
  const { data } = await supabase
    .from('visit_notes')
    .select('school_slug, visited_at, note')
    .eq('user_id', userId)
    .in('school_slug', slugs)
    .order('visited_at', { ascending: false })
    .limit(10)
  if (!data?.length) return undefined
  return data.map((r: any) => ({
    slug: r.school_slug,
    visited_at: r.visited_at,
    // PII-strip free-text notes; cap at 400 chars
    note: redactPiiInline(String(r.note ?? ''), childNames).slice(0, 400),
  }))
}

async function fetchSensitive(supabase: SupabaseClient, slugs: string[]) {
  if (slugs.length === 0) return {}
  const { data } = await supabase
    .from('school_sensitive')
    .select('school_slug, source, data_type, severity, source_url, date, title, summary')
    .in('school_slug', slugs)
    .limit(200)
  const out: Record<string, PackSchool['sensitive']> = {}
  for (const r of data ?? []) {
    const slug = (r as any).school_slug as string
    if (!out[slug]) out[slug] = []
    out[slug]!.push({
      type: (r as any).data_type ?? (r as any).source ?? 'unknown',
      date: (r as any).date ?? null,
      severity: (r as any).severity ?? null,
      title: (r as any).title ?? '',
      summary: (r as any).summary ?? null,
    })
  }
  return out
}

// Recommender Phase 2 (2026-05-21, Codex r1 P1.3): the heavy subject_strengths
// v2.0 blob is projected down before it lands in the pack. The helper lives
// in subject-strengths-projection.mjs so it's testable without dragging in
// .ts dependencies (Node 25 strip-types choked on the existing import-type
// chain through dimension-evidence-pack.ts). See that module for the full
// projection rules.

async function fetchSchoolBundle(
  supabase: SupabaseClient,
  slug: string,
  ctx: AssemblyContext,
  _question: string,
): Promise<PackSchool | null> {
  // Fetch core meta + structured + (rugby) projection + facts in parallel.
  // T4.17: rugby projection now goes through loadDimensionEvidencePack which
  // filters on the trusted projection_version. Non-rugby dimensions still
  // return null (no entry in KNOWN_PROJECTION_VERSIONS yet).
  const [metaRes, structuredRes, projectionPack, factsRes, notionRes, pdfsRes] = await Promise.all([
    supabase
      .from('schools')
      .select(
        'slug, name, country, boarding_type, gender_split, fees_usd_min, fees_usd_max, is_international,' +
        // Tab A Step 3 curated_meta fields (2026-05-25):
        ' eal_support, eal_hours_per_week, eal_cost_usd,' +
        ' thai_students, thai_community,' +
        ' open_day_text, open_day_url, prospectus_url,' +
        ' head_of_school, head_tenure_start,' +
        ' house_system, house_names,' +
        ' food_options, bus_service, unique_selling_points,' +
        // Tab A Step 10 v2 Commit 3 curated_meta fields (2026-05-26):
        ' founded_year, isi_report_date, top_universities,' +
        ' alumni_notable, instagram_url, youtube_url,' +
        ' logo_url, hero_image,' +
        ' isi_summary, isi_key_strengths, isi_areas_for_improvement,' +
        ' isi_academic_quality, isi_pastoral_care',
      )
      .eq('slug', slug)
      .maybeSingle(),
    supabase
      .from('school_structured_data')
      .select(SSD_WHITELIST.join(', '))
      .eq('school_slug', slug)
      .maybeSingle(),
    loadDimensionEvidencePack(supabase, slug, 'rugby'),
    // Atomic facts (active only)
    supabase
      .from('school_facts')
      .select('id, dimension, fact_type, canonical_key, claim, confidence, source_url, status')
      .eq('school_slug', slug)
      .eq('status', 'active')
      .limit(80),
    // Notion sidecar (Phase 1, 2026-05-24 wiring slice). Only clean rows; only
    // safe columns — never `raw_properties` / `rejected` / `flagged_review`
    // (Codex r1 RLS guidance).
    supabase
      .from('school_notion_backfill')
      .select('school_slug, status, parsed')
      .eq('school_slug', slug)
      // Codex r3 P1: accept both `clean` (post-Phase 1.5 promotion) and
      // `matched` (pure-write rows from the original sync). See retrieve.js
      // for the live-status-distribution rationale.
      .in('status', ['clean', 'matched'])
      .maybeSingle(),
    // Tab A Step 10 v2 Commit 3 (2026-05-26). Pull readable PDF rows
    // ordered newest-first so projectSchoolPdfs has enough to find ≤4 that
    // match the parent-relevance whitelist. Filenames like "Fire-Risk-2025"
    // are dropped at projection time.
    //
    // Codex r1 F2: raised from 20 to 100 because some schools (e.g.
    // Ardingly) have ≥20 recent policy PDFs that bury the prospectus.
    // school_pdfs has ~2,079 readable rows across 178 schools (avg 12 per
    // school, max in the 30s), so 100 covers the long tail cheaply.
    supabase
      .from('school_pdfs')
      .select('filename, url, readable, status, found_at')
      .eq('school_slug', slug)
      .eq('readable', true)
      .eq('status', 'ingested')
      .order('found_at', { ascending: false })
      .limit(100),
  ])
  const metaRow: any = metaRes.data
  if (!metaRow) return null

  // Tab A Step 4 (2026-05-25): fees-currency truth-in-labelling. The
  // legacy fields fees_min_gbp / fees_max_gbp were sourced from
  // schools.fees_usd_min/max — a USD value under a GBP-named field that
  // the renderer then prefixed with £. Real bug, no migration cleaned it.
  // Projection moved to project-meta-fees.mjs so the SSD-vs-USD precedence
  // logic can be unit-tested without mocking Supabase. Codex r1 r2 mods
  // (single-sided "from"/"up to", numeric overflow guard) live there.
  const { fees_min, fees_max, fees_currency } = projectMetaFees(structuredRes.data as any, metaRow)

  const meta = {
    name: metaRow.name ?? slug,
    country: metaRow.country ?? null,
    boarding_type: metaRow.boarding_type ?? null,
    gender_split: metaRow.gender_split ?? null,
    fees_min,
    fees_max,
    fees_currency,
    is_uk: metaRow.country === 'United Kingdom',
  }

  // Tab A Step 3 (2026-05-25): project the 15 curated `schools` columns into
  // a compact object. Free-text fields are capped at 120 chars (USP / food /
  // open-day blurb can be long). Array (house_names) capped at 12. If every
  // field is null, the whole object becomes null so the reducer doesn't have
  // to walk it later.
  // Tab A Step 10 v2 Commit 3 (2026-05-26), Codex r1 P1: every string that
  // lands in the prompt must be sanitized for prompt-injection vectors.
  // Embedded newlines/control chars in DB values let a malicious or
  // accidentally-scraped wiki value break the per-school line and inject
  // fake "Ignore previous instructions" markers (Codex reproduced this).
  // Strategy: strip ASCII control chars (incl. \n \r \t), collapse
  // remaining whitespace runs to a single space, trim. Applied BEFORE
  // length-capping so the cap counts post-sanitisation characters.
  const sanitizeForPrompt = (s: string): string => {
    // Strip C0 control chars (NUL through US) + DEL. Source uses
    // \uHHHH escape syntax so it stays readable AND avoids the
    // Unicode `u` regex flag (which requires ES2018+ target).
    return s.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim()
  }
  const CURATED_TEXT_CAP = 120
  const clipText = (s: unknown): string | null => {
    if (s == null) return null
    const t = sanitizeForPrompt(String(s))
    if (!t) return null
    return t.length > CURATED_TEXT_CAP ? t.slice(0, CURATED_TEXT_CAP - 1).trimEnd() + '…' : t
  }
  // Tab A Step 10 v2 Commit 3 (2026-05-26). Longer cap for prose fields
  // (alumni, ISI summary) since they're closer to one paragraph than to
  // one-line scalars. 500 chars covers ~99% of observed values; max
  // observed alumni_notable is 870 chars (rare).
  const CURATED_PROSE_CAP = 500
  const clipProse = (s: unknown): string | null => {
    if (s == null) return null
    const t = sanitizeForPrompt(String(s))
    if (!t) return null
    return t.length > CURATED_PROSE_CAP ? t.slice(0, CURATED_PROSE_CAP - 1).trimEnd() + '…' : t
  }
  // Alumni values sometimes contain wiki-export cruft (`#cite note-N`,
  // `[1]`, inline `https://…` URLs from MediaWiki source, MediaWiki ref
  // tags, citation-needed markers). Strip BEFORE the prompt sanitizer
  // so the URL-strip regex sees the original characters intact.
  const scrubAlumni = (s: unknown): string | null => {
    if (s == null) return null
    let t = String(s)
    t = t.replace(/#cite[_ ]note[-_]\d+/gi, '')
    t = t.replace(/\bhttps?:\/\/\S+/g, '')
    t = t.replace(/\[\d+\]/g, '')
    t = t.replace(/\[citation[ _-]needed\]/gi, '')
    t = t.replace(/<\/?ref(\s+[^>]*)?>(?:[^<]*<\/ref>)?/gi, '')
    t = t.replace(/\{\{cite[^}]*\}\}/gi, '')
    t = sanitizeForPrompt(t)
    if (!t) return null
    return t.length > CURATED_PROSE_CAP ? t.slice(0, CURATED_PROSE_CAP - 1).trimEnd() + '…' : t
  }
  const TOP_UNIVERSITIES_CAP = 10
  const ISI_STRENGTHS_CAP = 8
  const ISI_AREAS_CAP = 4
  // Codex r1 P1: URLs must be parseable AND free of whitespace/control
  // chars (otherwise an embedded \n breaks the per-school line in the
  // prompt). Reject anything that doesn't parse via WHATWG `new URL()`
  // or contains any whitespace character at all.
  const httpUrl = (s: unknown): string | null => {
    if (typeof s !== 'string') return null
    const t = s.trim()
    if (!t || /\s/.test(t)) return null
    try {
      const u = new URL(t)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
      // Codex r2 Q4: reject userinfo URLs (`https://trusted.com@evil.com/`)
      // — technically valid but commonly used to mislead readers into
      // thinking the URL points at the prefix host.
      if (u.username || u.password) return null
      return u.toString()
    } catch {
      return null
    }
  }
  const trimString = (s: unknown): string | null => {
    if (typeof s !== 'string') return null
    const t = sanitizeForPrompt(s)
    return t || null
  }
  const stringArray = (v: unknown, cap: number): string[] | null => {
    if (!Array.isArray(v) || v.length === 0) return null
    const out: string[] = []
    for (const item of v) {
      if (out.length >= cap) break
      if (typeof item !== 'string') continue
      const t = sanitizeForPrompt(item)
      if (t) out.push(t)
    }
    return out.length > 0 ? out : null
  }
  // ISI report date is stored as a Postgres `date` (serialises as ISO
  // "YYYY-MM-DD"). Keep the raw ISO string here — renderer formats it.
  const isoDate = (v: unknown): string | null => {
    if (typeof v !== 'string') return null
    return /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null
  }
  const integerOrNull = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isInteger(v) && Number.isFinite(v)) return v
    return null
  }
  // Codex r1 P7: preserve the pre-cap house count so the renderer can show
  // "houses (25): name1…name6" instead of mis-reporting 12 (the projection
  // cap) as the school's house count.
  const houseNamesRaw = Array.isArray(metaRow.house_names) ? (metaRow.house_names as unknown[]) : null
  const houseNamesCount = houseNamesRaw ? houseNamesRaw.length : null
  const curatedMetaRaw = {
    eal_support: typeof metaRow.eal_support === 'boolean' ? metaRow.eal_support : null,
    eal_hours_per_week: typeof metaRow.eal_hours_per_week === 'number' ? metaRow.eal_hours_per_week : null,
    eal_cost_usd: typeof metaRow.eal_cost_usd === 'number' ? metaRow.eal_cost_usd : null,
    thai_students: typeof metaRow.thai_students === 'number' ? metaRow.thai_students : null,
    thai_community: clipText(metaRow.thai_community),
    open_day_text: clipText(metaRow.open_day_text),
    // Codex r2 F1: Step 3 fields were being passed through raw. An
    // embedded \n in any of these would break the per-school line and
    // inject fake instructions. Route them through the same sanitizers
    // we added for the Step 10 v2 fields.
    open_day_url: httpUrl(metaRow.open_day_url),
    prospectus_url: httpUrl(metaRow.prospectus_url),
    head_of_school: clipText(metaRow.head_of_school),
    head_tenure_start: trimString(metaRow.head_tenure_start),
    house_system: clipText(metaRow.house_system),
    // Codex r2 F1: stringArray applies sanitizeForPrompt per item.
    house_names: stringArray(houseNamesRaw, 12),
    house_count: houseNamesCount,
    food_options: clipText(metaRow.food_options),
    // Codex r1 P8: collapse false → null. false produces no rendering
    // anyway (positive-only line, like `bus service: yes`); storing the
    // raw false would just bloat the JSON.
    bus_service: metaRow.bus_service === true ? (true as const) : null,
    unique_selling_points: clipText(metaRow.unique_selling_points),
    // Tab A Step 10 v2 Commit 3 (2026-05-26). 14 additional fields.
    founded_year: integerOrNull(metaRow.founded_year),
    isi_report_date: isoDate(metaRow.isi_report_date),
    top_universities: stringArray(metaRow.top_universities, TOP_UNIVERSITIES_CAP),
    alumni_notable: scrubAlumni(metaRow.alumni_notable),
    instagram_url: httpUrl(metaRow.instagram_url),
    youtube_url: httpUrl(metaRow.youtube_url),
    logo_url: httpUrl(metaRow.logo_url),
    hero_image: httpUrl(metaRow.hero_image),
    school_pdfs: projectSchoolPdfs(pdfsRes.data as unknown as Parameters<typeof projectSchoolPdfs>[0]),
    isi_summary: clipProse(metaRow.isi_summary),
    isi_key_strengths: stringArray(metaRow.isi_key_strengths, ISI_STRENGTHS_CAP),
    isi_areas_for_improvement: stringArray(metaRow.isi_areas_for_improvement, ISI_AREAS_CAP),
    isi_academic_quality: trimString(metaRow.isi_academic_quality),
    isi_pastoral_care: trimString(metaRow.isi_pastoral_care),
  }
  const curated_meta: PackSchool['curated_meta'] =
    Object.values(curatedMetaRaw).every((v) => v === null) ? null : curatedMetaRaw

  const structured: Record<string, unknown> | null = structuredRes.data ? { ...(structuredRes.data as object) } : null
  // Recommender Phase 2 (Codex r1 P1.3): project the heavy subject_strengths
  // v2.0 blob down to top-3 subjects + counts BEFORE it lands in the pack,
  // so a per-school 10-20KB column doesn't bust the token budget and force
  // the overflow reducer to nuke ALL structured fields.
  if (structured && 'subject_strengths' in structured) {
    structured.subject_strengths = projectSubjectStrengths(structured.subject_strengths)
  }

  let projection: Record<string, unknown> | undefined
  let source: PackSchool['source'] = structured ? 'structured' : 'empty'
  if (projectionPack) {
    projection = projectionPack.projection
    source = structured ? 'mixed' : 'projection'
  }

  // Atomic facts → small array
  const facts = (factsRes.data ?? []).map((f: any) => ({
    id: f.id,
    dimension: f.dimension,
    fact_type: f.fact_type,
    canonical_key: f.canonical_key,
    claim: f.claim,
    confidence: typeof f.confidence === 'number' ? f.confidence : 1,
    source_url: f.source_url,
  }))

  // missing_dims: dim whitelist that the SSD didn't populate
  const missing_dims = SSD_WHITELIST.filter(
    (k) => !structured || (structured as any)[k] === null || (structured as any)[k] === undefined,
  )

  // Citations: build from SSD + sensitive + facts URL fields (URL-only canonical
  // form; richer citation objects are layered on by tools.js when it actually
  // queries this slug).
  const citations: CitationRef[] = []
  for (const f of facts) {
    if (f.source_url) {
      citations.push({
        url: f.source_url,
        school_slug: slug,
        table: 'school_facts',
        field: f.fact_type,
        row_id: f.id,
        dimension: f.dimension,
        confidence: f.confidence,
      })
    }
  }

  const notionRow: any = notionRes.data
  const rawNotionParsed: Record<string, unknown> | null =
    notionRow && notionRow.parsed && typeof notionRow.parsed === 'object'
      ? (notionRow.parsed as Record<string, unknown>)
      : null
  const notion_backfill: Record<string, unknown> | null =
    projectNotionBackfill(rawNotionParsed, structured) as Record<string, unknown> | null

  return {
    slug,
    meta,
    structured,
    notion_backfill,
    curated_meta,
    facts: facts.length > 0 ? facts : undefined,
    projection,
    source,
    citations,
    missing_dims,
  }
}

function redactPiiInline(s: string, childNames: string[]): string {
  // Tiny inline copy of redactors to avoid an extra import dep cycle.
  // Codex 2026-05-08: visit-note redactor was missing phone strip. Fixed.
  let out = s.replace(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, '[email]')
  out = out.replace(/\b(?:\+?44\s?(?:\(0\))?\s?\d{2,4}|0\d{2,4})\s?\d{3,4}\s?\d{3,4}\b/g, '[phone]')
  out = out.replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/g, '[postcode]')
  for (const n of childNames) {
    if (!n || n.length < 2) continue
    const safe = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(`\\b${safe}\\b`, 'gi'), '[child]')
  }
  return out
}

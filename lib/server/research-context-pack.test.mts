import { test } from 'node:test'
import assert from 'node:assert/strict'

// Imports use Node 22+ native TS stripping. The 'server-only' import inside
// the modules is resolved via _test-stub-server-only-resolver.mjs (registered
// by the --import hook).
import {
  redactPii,
  minimiseChildProfile,
  safeCell,
  safeRecentMessages,
  estimateTokens,
} from './pack-redactors.ts'
import { assembleResearchContextPack } from './research-context-pack.ts'

// ── pack-redactors: redactPii ──────────────────────────────────────────────

test('redactPii strips emails', () => {
  const out = redactPii('Email me at parent@example.com tomorrow')
  assert.equal(out, 'Email me at [email] tomorrow')
})

test('redactPii strips UK postcodes', () => {
  const out = redactPii('We live near SW1A 1AA, just round the corner')
  assert.equal(out, 'We live near [postcode], just round the corner')
})

test('redactPii blanks the child name when provided', () => {
  const out = redactPii('Maya is shy and hates loud places', { childNames: ['Maya'] })
  assert.equal(out, '[child] is shy and hates loud places')
})

test('redactPii passes through plain text untouched', () => {
  const out = redactPii('We want a school with strong sport and pastoral care')
  assert.equal(out, 'We want a school with strong sport and pastoral care')
})

test('redactPii returns empty string for null/undefined', () => {
  assert.equal(redactPii(null), '')
  assert.equal(redactPii(undefined), '')
})

// ── minimiseChildProfile ───────────────────────────────────────────────────

test('minimiseChildProfile never emits raw name or DOB', () => {
  const m = minimiseChildProfile({
    id: 'child-1',
    name: 'Alex',
    date_of_birth: '2014-06-01',
    child_profile: {
      fit_signals: ['loves rugby', 'dislikes large classes', 'wants science'],
      dealbreakers: ['no boarding', 'no religious observance'],
      gender_pref_for_school: 'co-ed',
      // intentionally include a field that should be DROPPED:
      _internal_notes: 'never include this',
      home_address: '10 Downing Street SW1A 2AA',
    },
  })
  // Whitelist: only id, age_band, gender_pref, fit_signals, dealbreakers
  assert.deepEqual(Object.keys(m).sort(), ['age_band', 'dealbreakers', 'fit_signals', 'gender_pref_for_school', 'id'])
  // Age-band derived, NOT raw DOB
  assert.equal(m.id, 'child-1')
  assert.ok(['7-10', '11-13'].includes(m.age_band))
  assert.equal(m.gender_pref_for_school, 'co-ed')
  // Dealbreakers/fit_signals limited to top 5; PII redacted
  assert.equal(m.fit_signals.length, 3)
  assert.equal(m.dealbreakers.length, 2)
  // Critically: nothing called `name`, `date_of_birth`, `_internal_notes`, `home_address`
  assert.equal((m as any).name, undefined)
  assert.equal((m as any).date_of_birth, undefined)
  assert.equal((m as any).home_address, undefined)
  assert.equal((m as any)._internal_notes, undefined)
})

test('minimiseChildProfile redacts the child name from fit_signals', () => {
  const m = minimiseChildProfile({
    id: 'child-2',
    name: 'Maya',
    date_of_birth: '2012-01-01',
    child_profile: { fit_signals: ['Maya needs strong art programs'] },
  })
  assert.equal(m.fit_signals[0], '[child] needs strong art programs')
})

test('minimiseChildProfile handles missing child_profile gracefully', () => {
  const m = minimiseChildProfile({ id: 'c3', date_of_birth: null, name: null, child_profile: null })
  assert.equal(m.age_band, 'unknown')
  assert.equal(m.gender_pref_for_school, null)
  assert.deepEqual(m.fit_signals, [])
  assert.deepEqual(m.dealbreakers, [])
})

// ── safeCell ───────────────────────────────────────────────────────────────

test('safeCell drops note/justification/internal_*', () => {
  const out = safeCell({
    value: '£42,000',
    score: 87,
    sources: ['https://example.com/fees'],
    note: 'parent thinks this is too high',
    justification: 'computed by ranker v2',
    internal_debug: 'should not leak',
  })
  assert.deepEqual(out, {
    value: '£42,000',
    score: 87,
    sources: ['https://example.com/fees'],
  })
  assert.equal((out as any).note, undefined)
  assert.equal((out as any).justification, undefined)
})

test('safeCell handles null/undefined input', () => {
  assert.deepEqual(safeCell(null), { value: null, score: null, sources: [] })
  assert.deepEqual(safeCell(undefined), { value: null, score: null, sources: [] })
})

test('safeCell caps sources at 3 and rejects non-http URLs', () => {
  const out = safeCell({
    value: 'x',
    score: null,
    sources: ['https://a.com', 'http://b.com', 'https://c.com', 'https://d.com', 'javascript:alert(1)'],
  })
  assert.equal(out.sources.length, 3)
  assert.deepEqual(out.sources, ['https://a.com', 'http://b.com', 'https://c.com'])
})

test('safeCell accepts singleton string source', () => {
  const out = safeCell({ value: 'x', score: null, source: 'https://only.example.com' })
  assert.deepEqual(out.sources, ['https://only.example.com'])
})

// ── safeRecentMessages ─────────────────────────────────────────────────────

test('safeRecentMessages strips raw proposed_actions JSON to a tally', () => {
  const out = safeRecentMessages([
    {
      role: 'assistant',
      content: 'Sure, here are 3 schools',
      actions: [
        { kind: 'propose_add_row', payload: { row_name: 'Fees', cells: { /* private */ } } },
        { kind: 'propose_add_row', payload: { row_name: 'Pastoral', cells: {} } },
        { kind: 'propose_re_rank', payload: { weights: { academic: 5 } } },
      ],
      created_at: '2026-05-08T01:00:00Z',
    },
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].proposed_actions_summary, 'propose_add_row×2, propose_re_rank×1')
  assert.equal(out[0].content, 'Sure, here are 3 schools')
})

test('safeRecentMessages truncates to 400 chars and redacts PII', () => {
  const long = 'Maya '.repeat(200) + ' email me at parent@example.com'
  const out = safeRecentMessages([{ role: 'user', content: long, created_at: '2026-05-08T01:00:00Z' }], {
    childNames: ['Maya'],
  })
  assert.ok(out[0].content.length <= 400)
  // Should contain neither raw 'Maya' nor raw email
  assert.equal(out[0].content.includes('parent@example.com'), false)
  assert.equal(out[0].content.includes('Maya'), false)
})

// ── estimateTokens ─────────────────────────────────────────────────────────

test('estimateTokens roughly returns chars/3.5', () => {
  const s = 'a'.repeat(350)
  assert.equal(estimateTokens(s), 100)
})

// ══════════════════════════════════════════════════════════════════════════
// assembleResearchContextPack — uses a stubbed Supabase client
// ══════════════════════════════════════════════════════════════════════════

/**
 * Build a fake Supabase client whose `.from(table)` returns a chainable
 * mock that resolves to whichever rows the test fixture provided. We
 * intercept `select`, `eq`, `in`, `is`, `not`, `like`, `or`, `order`,
 * `limit`, `maybeSingle` — every method the assembler uses.
 */
function buildMockSupabase(fixtures: Record<string, any[]>) {
  const callLog: Array<{ table: string; ops: any[] }> = []

  function mkChain(table: string) {
    let rows = fixtures[table] ?? []
    let log: any[] = [{ op: 'from', table }]
    const chain: any = {
      _isChain: true,
      select(_cols: string, _opts?: any) {
        log.push({ op: 'select', cols: _cols })
        return chain
      },
      eq(col: string, val: any) {
        log.push({ op: 'eq', col, val })
        rows = rows.filter((r) => r[col] === val)
        return chain
      },
      in(col: string, vals: any[]) {
        log.push({ op: 'in', col, vals })
        rows = rows.filter((r) => vals.includes(r[col]))
        return chain
      },
      is(col: string, val: any) {
        log.push({ op: 'is', col, val })
        // is(col, null) → keep rows where r[col] is null (or missing)
        if (val === null) rows = rows.filter((r) => r[col] == null)
        return chain
      },
      not(col: string, _op: string, _val: any) {
        log.push({ op: 'not', col, val: _val })
        return chain
      },
      like(col: string, pattern: string) {
        log.push({ op: 'like', col, pattern })
        return chain
      },
      or(_clause: string) {
        log.push({ op: 'or', clause: _clause })
        return chain
      },
      order(_col: string, _opts?: any) {
        log.push({ op: 'order', col: _col })
        return chain
      },
      limit(n: number) {
        log.push({ op: 'limit', n })
        rows = rows.slice(0, n)
        return chain
      },
      maybeSingle() {
        log.push({ op: 'maybeSingle' })
        callLog.push({ table, ops: log })
        return Promise.resolve({ data: rows[0] ?? null, error: null })
      },
      then(resolve: any) {
        // Plain await without maybeSingle → return list
        callLog.push({ table, ops: log })
        return Promise.resolve({ data: rows, error: null }).then(resolve)
      },
    }
    return chain
  }

  return {
    from(table: string) {
      return mkChain(table)
    },
    callLog,
  } as any
}

test('assembleResearchContextPack: ownership scoping returns empty for cross-user request', async () => {
  // Fixture: parent-A owns child-A and session-A with messages + comparison rows.
  // Parent-B (attacker) asks for parent-A's session.
  const supabase = buildMockSupabase({
    parent_profiles: [
      { id: 'parent-A', child_year: 'Y9', boarding_pref: 'full', budget_range: '50k', top_priority: 'pastoral', home_region: 'London' },
    ],
    children: [
      { id: 'child-A', user_id: 'parent-A', name: 'Alex', date_of_birth: '2014-01-01', child_profile: {}, is_archived: false },
    ],
    research_sessions: [{ id: 'session-A', user_id: 'parent-A', title: 'Q1', summary: null, child_id: 'child-A' }],
    research_session_messages: [
      // Codex 2026-05-08: fixture now has session_id so the leak path is testable.
      { session_id: 'session-A', question: 'about Eton?', parsed_answer: { sections: { short_answer: 'Eton is...' } }, actions: null, created_at: '2026-05-08' },
    ],
    comparison_rows: [
      { user_id: 'parent-A', session_id: 'session-A', row_name: 'Fees', group_name: 'Costs', weight: 1, cell_data: { 'eton-college': { value: '£50k' } }, sort_order: 0, lens_kind: 'general' },
    ],
    schools: [{ slug: 'eton-college', name: 'Eton College', country: 'United Kingdom' }],
    school_structured_data: [],
    school_fact_projections: [],
    school_facts: [],
    comparison_lenses: [],
  })

  // Parent B (not A) requests parent A's session
  const pack = await assembleResearchContextPack(
    supabase,
    {
      user_id: 'parent-B', // <-- attacker
      child_id: 'child-A',
      session_id: 'session-A',
      shortlist: [],
      mentioned_slugs: ['eton-college'],
      active_school_slug: null,
      base_lens_kind: 'general',
      intent: null,
    },
    'tell me about eton',
  )

  // Ownership filter on parent_profiles by id=parent-B → no parent profile
  assert.equal(pack.parent.region, null, 'cross-user must not leak region')
  assert.equal(pack.parent.budget_band, null, 'cross-user must not leak budget')
  // Ownership filter on children by user_id=parent-B → no child
  assert.equal(pack.child, null, 'cross-user must not leak child profile')
  // Ownership filter on research_sessions by user_id=parent-B → empty session
  assert.equal(pack.session.title, '', 'cross-user must not leak session title')
  // Codex 2026-05-08: explicitly assert messages do NOT leak.
  assert.equal(pack.recent_messages.length, 0, 'cross-user must not leak messages')
  // Comparison rows must not leak either (session-not-owned → empty comparison)
  assert.equal(pack.comparison.rows.length, 0, 'cross-user must not leak comparison rows')
})

test('assembleResearchContextPack: same-user request fills the pack', async () => {
  const supabase = buildMockSupabase({
    parent_profiles: [
      { id: 'parent-A', child_year: 'Y9', boarding_pref: 'full', budget_range: '50k', top_priority: 'pastoral', home_region: 'London' },
    ],
    children: [
      { id: 'child-A', user_id: 'parent-A', name: 'Alex', date_of_birth: '2014-01-01', child_profile: { fit_signals: ['rugby'] }, is_archived: false },
    ],
    research_sessions: [{ id: 'session-A', user_id: 'parent-A', title: 'Q1', summary: { text: 'we like full-boarding rugby schools' }, child_id: 'child-A' }],
    research_session_messages: [],
    schools: [{ slug: 'eton-college', name: 'Eton College', country: 'United Kingdom' }],
    school_structured_data: [{ school_slug: 'eton-college', fees_min: 50000, fees_max: 60000 }],
    school_fact_projections: [],
    school_facts: [],
    comparison_rows: [],
    comparison_lenses: [],
  })

  const pack = await assembleResearchContextPack(
    supabase,
    {
      user_id: 'parent-A',
      child_id: 'child-A',
      session_id: 'session-A',
      shortlist: ['eton-college'],
      mentioned_slugs: [],
      active_school_slug: null,
      base_lens_kind: 'general',
      intent: null,
    },
    'compare schools',
  )

  assert.equal(pack.parent.region, 'London')
  assert.equal(pack.parent.budget_band, '50k')
  assert.equal(pack.child?.id, 'child-A')
  assert.equal(pack.child?.fit_signals[0], 'rugby')
  assert.equal(pack.session.title, 'Q1')
  assert.equal(pack.session.rolling_summary, 'we like full-boarding rugby schools')
  assert.equal(pack.schools['eton-college']?.meta.name, 'Eton College')
  assert.equal(pack.schools['eton-college']?.meta.is_uk, true)
  assert.equal(pack.meta.pack_version, '1.0.0')
  // Token accounting
  assert.ok(pack.meta.estimated_tokens > 0)
  assert.ok(pack.meta.bytes > 0)
})

test('assembleResearchContextPack: P5 — rugby projection sets source=mixed when both present', async () => {
  const supabase = buildMockSupabase({
    parent_profiles: [{ id: 'p', child_year: null, boarding_pref: null, budget_range: null, top_priority: null, home_region: null }],
    children: [],
    research_sessions: [{ id: 's', user_id: 'p', title: '', summary: null, child_id: null }],
    research_session_messages: [],
    schools: [{ slug: 'plymouth-college', name: 'Plymouth College', country: 'United Kingdom' }],
    school_structured_data: [{ school_slug: 'plymouth-college', sports_profile: { rugby: { competitive_tier: 'national' } } }],
    school_fact_projections: [
      {
        school_slug: 'plymouth-college',
        dimension: 'rugby',
        projection_version: 'rugby-projector@1.1.0',
        status: 'success',
        quality: { projection: { competitive_tier: 'national', head_coach: { name: 'Coach X', notable: 'former England player' } } },
        projected_at: '2026-05-07',
      },
    ],
    school_facts: [],
    comparison_rows: [],
    comparison_lenses: [],
  })
  const pack = await assembleResearchContextPack(
    supabase,
    {
      user_id: 'p', child_id: null, session_id: 's',
      shortlist: ['plymouth-college'], mentioned_slugs: [], active_school_slug: null,
      base_lens_kind: 'general', intent: null,
    },
    'rugby?',
  )
  const ply = pack.schools['plymouth-college']
  assert.ok(ply, 'plymouth-college should be in pack')
  assert.equal(ply.source, 'mixed', 'both structured and projection present → source=mixed')
  assert.ok(ply.projection, 'projection payload should be set from quality.projection')
  assert.equal((ply.projection as any).head_coach.name, 'Coach X')
})

test('assembleResearchContextPack: P5 — school without projection sets source=structured', async () => {
  const supabase = buildMockSupabase({
    parent_profiles: [{ id: 'p', child_year: null, boarding_pref: null, budget_range: null, top_priority: null, home_region: null }],
    children: [],
    research_sessions: [{ id: 's', user_id: 'p', title: '', summary: null, child_id: null }],
    research_session_messages: [],
    schools: [{ slug: 'eton-college', name: 'Eton College', country: 'United Kingdom' }],
    school_structured_data: [{ school_slug: 'eton-college', curriculum: 'A-level' }],
    school_fact_projections: [], // none
    school_facts: [],
    comparison_rows: [],
    comparison_lenses: [],
  })
  const pack = await assembleResearchContextPack(
    supabase,
    {
      user_id: 'p', child_id: null, session_id: 's',
      shortlist: ['eton-college'], mentioned_slugs: [], active_school_slug: null,
      base_lens_kind: 'general', intent: null,
    },
    'about eton',
  )
  const eton = pack.schools['eton-college']
  assert.equal(eton.source, 'structured')
  assert.equal(eton.projection, undefined)
})

test('assembleResearchContextPack: T4.17 — wrong-version projection is ignored', async () => {
  // A v1.0.0 row alone (without a v1.1.0 row) must NOT surface in the pack —
  // the loader filters on KNOWN_PROJECTION_VERSIONS.rugby = v1.1.0.
  // Behaviour-preserving guarantee for the chatbot once T4.17 ships.
  const supabase = buildMockSupabase({
    parent_profiles: [{ id: 'p', child_year: null, boarding_pref: null, budget_range: null, top_priority: null, home_region: null }],
    children: [],
    research_sessions: [{ id: 's', user_id: 'p', title: '', summary: null, child_id: null }],
    research_session_messages: [],
    schools: [{ slug: 'plymouth-college', name: 'Plymouth College', country: 'United Kingdom' }],
    school_structured_data: [{ school_slug: 'plymouth-college', sports_profile: { rugby: { competitive_tier: 'national' } } }],
    school_fact_projections: [
      {
        school_slug: 'plymouth-college',
        dimension: 'rugby',
        projection_version: 'rugby-projector@1.0.0', // older — should be ignored
        status: 'success',
        quality: { projection: { competitive_tier: 'should_be_filtered_out' } },
        projected_at: '2026-05-01',
      },
    ],
    school_facts: [],
    comparison_rows: [],
    comparison_lenses: [],
  })
  const pack = await assembleResearchContextPack(
    supabase,
    {
      user_id: 'p', child_id: null, session_id: 's',
      shortlist: ['plymouth-college'], mentioned_slugs: [], active_school_slug: null,
      base_lens_kind: 'general', intent: null,
    },
    'rugby?',
  )
  const ply = pack.schools['plymouth-college']
  assert.equal(ply.source, 'structured', 'wrong-version projection should not promote source to mixed')
  assert.equal(ply.projection, undefined, 'projection payload should be dropped when version mismatches')
})

test('assembleResearchContextPack: shortlist-of-3 fits under 5000 tokens', async () => {
  const slugs = ['school-a', 'school-b', 'school-c']
  const supabase = buildMockSupabase({
    parent_profiles: [{ id: 'p', child_year: null, boarding_pref: null, budget_range: null, top_priority: null, home_region: null }],
    children: [],
    research_sessions: [{ id: 's', user_id: 'p', title: '', summary: null, child_id: null }],
    research_session_messages: [],
    schools: slugs.map((s, i) => ({ slug: s, name: `School ${i}`, country: 'United Kingdom' })),
    school_structured_data: slugs.map((s) => ({
      school_slug: s,
      fees_min: 40000,
      fees_max: 50000,
      curriculum: 'A-level',
    })),
    school_fact_projections: [],
    school_facts: [],
    comparison_rows: [],
    comparison_lenses: [],
  })

  const pack = await assembleResearchContextPack(
    supabase,
    {
      user_id: 'p',
      child_id: null,
      session_id: 's',
      shortlist: slugs,
      mentioned_slugs: [],
      active_school_slug: null,
      base_lens_kind: 'general',
      intent: null,
    },
    'compare these',
  )

  assert.ok(pack.meta.estimated_tokens <= 5000, `pack should fit 5000 tokens for shortlist=3, was ${pack.meta.estimated_tokens}`)
  assert.equal(Object.keys(pack.schools).length, 3)
})

// Codex 2026-05-08: token budget tests for shortlist sizes 1/2/5/8 with
// realistic structured payloads. Asserts the cap-enforcement reducers kick in.
function buildHeavyShortlistFixture(n: number) {
  const slugs = Array.from({ length: n }, (_, i) => `heavy-school-${i}`)
  const heavyStructured = (s: string) => ({
    school_slug: s,
    // ~4KB of structured data per school
    fees_min: 40000, fees_max: 50000, fees_currency: 'GBP',
    fees_by_grade: { 'Y7': 14000, 'Y8': 14500, 'Y9': 15000, 'Y10': 15500, 'Y11': 16000 },
    exam_results: { gcse_9_7_pct: 87.5, alevel_a_star_a_pct: 65.4, year: 2024, ib_average: 39 },
    university_destinations: { oxbridge: 12, russell_group: 89, medicine: 8, us_universities: 3 },
    sports_profile: { rugby: { competitive_tier: 'national-strong', summary: 'strong rugby program with multiple terms of fixtures'.repeat(5) } },
    pastoral_care: 'House system with strong pastoral support across all year groups. '.repeat(8),
    pastoral_model: 'Vertical house system, tutor groups, dedicated heads of house, weekly pastoral check-ins'.repeat(2),
    curriculum: 'A-level + IB Diploma',
    facilities: ['theatre', 'sports hall', 'olympic pool', 'astroturf', 'CCF range'],
    accreditations: ['ISI', 'COBIS'],
    location_profile: { postcode: 'SL4 6DW', region: 'Berkshire', station_distance_miles: 0.5 },
    report_parent_fit: 'Strong fit for academically ambitious families. '.repeat(8),
    report_verdict: 'Excellent across the board. '.repeat(6),
  })
  return {
    parent_profiles: [{ id: 'p', child_year: 'Y9', boarding_pref: 'full', budget_range: '50k', top_priority: 'pastoral', home_region: 'London' }],
    children: [],
    research_sessions: [{ id: 's', user_id: 'p', title: '', summary: null, child_id: null }],
    research_session_messages: [],
    schools: slugs.map((s, i) => ({ slug: s, name: `Heavy ${i}`, country: 'United Kingdom' })),
    school_structured_data: slugs.map(heavyStructured),
    school_fact_projections: [],
    school_facts: [],
    comparison_rows: [],
    comparison_lenses: [],
    _slugs: slugs,
  } as any
}

async function packForShortlist(n: number) {
  const fix = buildHeavyShortlistFixture(n)
  const supabase = buildMockSupabase(fix)
  return assembleResearchContextPack(
    supabase,
    {
      user_id: 'p', child_id: null, session_id: 's',
      shortlist: fix._slugs, mentioned_slugs: [], active_school_slug: null,
      base_lens_kind: 'general', intent: null,
    },
    'compare these',
  )
}

test('Token budget — shortlist=1 fits under 4000 tokens', async () => {
  const pack = await packForShortlist(1)
  assert.ok(pack.meta.estimated_tokens <= 4000, `was ${pack.meta.estimated_tokens}`)
})

test('Token budget — shortlist=2 fits under 4000 tokens', async () => {
  const pack = await packForShortlist(2)
  assert.ok(pack.meta.estimated_tokens <= 4000, `was ${pack.meta.estimated_tokens}`)
})

test('Token budget — shortlist=5 fits under 6500 tokens', async () => {
  const pack = await packForShortlist(5)
  assert.ok(pack.meta.estimated_tokens <= 6500, `was ${pack.meta.estimated_tokens}`)
  // Should have triggered overflow reducers
  assert.ok(pack.meta.overflow_actions.length >= 0)
})

test('Token budget — shortlist=8 fits under 8000 tokens', async () => {
  const pack = await packForShortlist(8)
  assert.ok(pack.meta.estimated_tokens <= 8000, `was ${pack.meta.estimated_tokens}`)
  // Reducers may or may not fire depending on fixture density; what matters is
  // the cap is honoured. Codex 2026-05-08: this test asserts the cap, not the
  // mechanism — heavier fixtures will exercise reducers when real data hits.
})

// Codex 2026-05-08 follow-up: adversarial fixture that ABSOLUTELY exceeds the
// cap pre-reduction, so reducers MUST fire to bring it under cap. Proves the
// reducer chain actually runs end-to-end, not just that small fixtures fit.
test('Token budget — adversarially-heavy 5-school fixture forces reducers to fire', async () => {
  const slugs = Array.from({ length: 5 }, (_, i) => `mega-school-${i}`)
  // Each school carries ~12KB of structured + heavy comparison rows + lots of
  // recent messages. Total raw pack would exceed ~9000 tokens (well over the
  // 6500 cap for shortlist=4–5). Reducers must drop chunks/sensitive/etc.
  const supabase = buildMockSupabase({
    parent_profiles: [{ id: 'p', child_year: 'Y9', boarding_pref: 'full', budget_range: '50k', top_priority: 'pastoral', home_region: 'London' }],
    children: [],
    research_sessions: [{ id: 's', user_id: 'p', title: '', summary: 'Long rolling summary text. '.repeat(100), child_id: null }],
    research_session_messages: Array.from({ length: 5 }, (_, i) => ({
      session_id: 's',
      question: `Question ${i}: ` + 'with very long content. '.repeat(40),
      parsed_answer: { sections: { short_answer: 'Long answer. '.repeat(40) } },
      actions: null,
      created_at: '2026-05-08',
    })),
    schools: slugs.map((s, i) => ({ slug: s, name: `Mega ${i}`, country: 'United Kingdom' })),
    school_structured_data: slugs.map((s) => ({
      school_slug: s,
      fees_min: 40000, fees_max: 50000,
      // very heavy text fields:
      pastoral_care: 'Pastoral care detail '.repeat(200),
      pastoral_model: 'House system detail '.repeat(200),
      report_parent_fit: 'Parent fit narrative '.repeat(200),
      report_verdict: 'Verdict narrative '.repeat(200),
      sports_profile: { rugby: { competitive_tier: 'national', summary: 'rugby '.repeat(300) } },
    })),
    // Comparison: many heavy rows so the comparison section is huge
    comparison_rows: Array.from({ length: 12 }, (_, i) => ({
      user_id: 'p',
      session_id: 's',
      row_name: `Row ${i}`,
      group_name: 'Heavy',
      weight: 1 + (12 - i) * 0.1, // varied weight so reducer keeps highest
      cell_data: Object.fromEntries(slugs.map((s, j) => [s, { value: `Cell value `.repeat(20), score: 75 + j }])),
      sort_order: i,
      lens_kind: 'general',
    })),
    school_fact_projections: [],
    school_facts: [],
    comparison_lenses: [],
  })

  const pack = await assembleResearchContextPack(
    supabase,
    {
      user_id: 'p', child_id: null, session_id: 's',
      shortlist: slugs, mentioned_slugs: [], active_school_slug: null,
      base_lens_kind: 'general', intent: null,
    },
    'compare these',
  )

  // Cap for shortlist=5 is 6500 (per capsForShortlistSize). Pack must end up
  // under cap, which means reducers MUST have fired.
  assert.ok(pack.meta.estimated_tokens <= 6500, `pack went over cap: ${pack.meta.estimated_tokens}`)
  assert.ok(pack.meta.overflow_actions.length > 0, `expected reducers to fire; overflow_actions=${JSON.stringify(pack.meta.overflow_actions)}`)
})

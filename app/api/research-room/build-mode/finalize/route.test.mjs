// Slice 8 Build 3 session 4 — finalize route source-grep regression tests.
//
// Same pattern as ../turn/route.test.mjs — source-grep instead of full
// integration because the route's import graph (next/server, supabase,
// our own engine + LLM helpers) is too heavy for module-level mocking
// under Node's --test runner.
//
// What this catches:
//   • Auth + paid + origin + rate-limit gates still wired
//   • shortlist allowlist defence (LLM-emitted slugs outside the
//     parent's shortlist are dropped, not persisted)
//   • parsed_answer shape uses prose_v1 format so NanaBubble's
//     prose-mode renderer picks it up + proposals show as "+ Add" pills
//   • nana_chat_logs insert uses backend='build-mode-finalize' so the
//     MC dashboard breaks this out from regular Build Mode turns
//   • Anti-hallucination — no nana-brain.js import (Codex r1 #12)
//     and no @anthropic-ai/sdk import (CLAUDE.md hard stop)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./route.ts', import.meta.url), 'utf8')
const schemasSrc = readFileSync(
  new URL('../../../../../lib/server/research-room/build-mode-schemas.ts', import.meta.url),
  'utf8',
)

// ── Auth + gates ─────────────────────────────────────────────────────

test('finalize: feature flag gate', () => {
  assert.match(src, /if \(!isResearchRoomEnabled\(\)\)/)
})

test('finalize: origin allowlist gate', () => {
  assert.match(src, /if \(!\(await isAllowedOrigin\(\)\)\)/)
})

test('finalize: auth.getUser unauthorized gate', () => {
  assert.match(src, /supabase\.auth\.getUser\(\)/)
  assert.match(src, /if \(!user\) return jsonError\(401/)
})

test('finalize: paid gate via getUnlockedUser', () => {
  assert.match(src, /getUnlockedUser\(\)/)
  assert.match(src, /if \(!isPaid\) return jsonError\(402/)
})

test('finalize: reuses chat rate-limit bucket', () => {
  assert.match(src, /checkRateLimit\(req,\s*'chat'\)/)
  assert.match(src, /jsonError\(429/)
})

// ── Anti-hallucination isolation ─────────────────────────────────────

test('finalize: no @anthropic-ai/sdk import (CLAUDE.md hard stop)', () => {
  assert.doesNotMatch(src, /from ['"]@anthropic-ai\/sdk['"]/)
})

test('finalize: no nana-brain.js import (Codex r1 #12)', () => {
  // Same isolation rule as the turn route: comments OK, real import not.
  assert.doesNotMatch(src, /from ['"][^'"]*nana-brain[^'"]*['"]/)
  assert.doesNotMatch(src, /require\(['"][^'"]*nana-brain[^'"]*['"]\)/)
})

test('finalize: uses streamBuildModeTurn primitive (OpenAI-only)', () => {
  // The route reuses the existing OpenAI-only streaming helper rather
  // than calling the OpenAI SDK directly, so isolation lives in one
  // audited place.
  assert.match(src, /from ['"]@\/lib\/server\/research-room\/build-mode-llm['"]/)
  assert.match(src, /streamBuildModeTurn\(\s*\{/)
})

// ── Session + child loading ──────────────────────────────────────────

test('finalize: session ownership check matches user.id', () => {
  assert.match(src, /sess\.user_id !== user\.id/)
  assert.match(src, /jsonError\(403/)
})

test('finalize: rejects sessions without a bound child', () => {
  assert.match(src, /!sess\.child_id/)
  assert.match(src, /'session_missing_child'/)
})

test('finalize: child ownership check matches user.id', () => {
  assert.match(src, /child\.user_id !== user\.id/)
})

test('finalize: child_profile filtered via WRITABLE_PROFILE_KEYS allowlist', () => {
  assert.match(src, /WRITABLE_PROFILE_KEYS/)
  assert.match(src, /extractWritableProfile\(/)
})

// ── Shortlist handling ───────────────────────────────────────────────

test('finalize: empty shortlist is now valid (2026-05-18 Commit C) — picker seeds 6 schools', () => {
  // Commit C removed the onboarding-time recommender; finalize is the
  // first auto-recommender to fire. Empty shortlist must succeed and
  // bump the propose cap to MAX_SCHOOL_PROPOSALS_FRESH (6).
  assert.match(src, /shortlistSlugs\.length === 0/)
  assert.doesNotMatch(src, /'empty_shortlist'/)
  assert.match(src, /MAX_SCHOOL_PROPOSALS_FRESH/)
})

test('finalize: shortlist falls back to comparison_views when body omits it', () => {
  // Body-provided shortlist matches the parent's current view; the
  // comparison_views fallback covers calls where the chat hook didn't
  // include it.
  assert.match(src, /from\(['"]comparison_views['"]\)/)
  assert.match(src, /is\(['"]undone_at['"],\s*null\)/)
})

test('finalize: shortlist capped at MAX_SHORTLIST for prompt size', () => {
  assert.match(src, /MAX_SHORTLIST\s*=\s*12/)
  assert.match(src, /\.limit\(MAX_SHORTLIST\)/)
})

// ── Proposal validation + shortlist allowlist ────────────────────────

test('finalize: enforces MIN_PROPOSALS lower bound when shortlist is non-empty', () => {
  // 2026-05-18 — the gate is now per-request: minRowProposals = 0 in
  // fresh-start mode (empty shortlist) so the LLM can legitimately emit
  // rowProposals: []. Falls back to MIN_PROPOSALS=3 otherwise. Combined
  // sanity check after schools are appended catches the wholly-empty case.
  assert.match(src, /MIN_PROPOSALS\s*=\s*3/)
  assert.match(src, /const minRowProposals = isFreshStart \? 0 : MIN_PROPOSALS/)
  assert.match(src, /proposalsRaw\.length < minRowProposals/)
})

test('finalize r9: trims overshoot to MAX_PROPOSALS (was unused constant)', () => {
  // Codex r9 NIT: the Zod schema permits up to 8 proposals; the prompt
  // asks for 3-5. Without trim, an LLM that overshoots into 6-8 would
  // produce that many propose_add_row pills — more than the parent can
  // realistically scan in one bubble. The trim slices to MAX_PROPOSALS.
  assert.match(src, /MAX_PROPOSALS\s*=\s*5/)
  // Slice 8 Build 6: renamed proposalsExtracted → rowProposalsExtracted
  // when the LLM payload became the parallel-array {rowProposals,
  // schoolProposals} shape. Trim semantics unchanged.
  assert.match(src, /rowProposalsExtracted\.length > MAX_PROPOSALS/)
  assert.match(src, /rowProposalsExtracted\.slice\(0, MAX_PROPOSALS\)/)
})

test('finalize: drops LLM-emitted slugs not in the parent shortlist', () => {
  // Defence in depth against prompt-injection or hallucination — even
  // if the LLM emits "rugby-school" cell_data, the persisted message
  // only contains entries whose slug is in shortlistSlugs.
  assert.match(src, /!shortlistSlugs\.includes\(item\.slug\)/)
  assert.match(src, /continue/)
})

test('finalize: cell_data array → Record<slug,…> conversion before persist', () => {
  // Schema uses array shape (OpenAI strict mode doesn't like z.record);
  // the existing ProposedAddRow + confirm_add_row validator expect a
  // record keyed by slug. Conversion happens server-side before insert.
  assert.match(src, /cell_data: Record<string,/)
  assert.match(src, /for \(const item of p\.cell_data\)/)
})

// ── Codex r6 P1 — hallucination defence-in-depth ────────────────────

test('finalize r6: rejects any response carrying an off-shortlist slug', () => {
  // Filter alone silently drops off-list slugs but a hallucinated slug
  // is evidence the response can't be trusted; reject the whole thing.
  assert.match(src, /offListSlugs/)
  assert.match(src, /offListSlugs\.length > 0/)
  assert.match(src, /off-shortlist slug/)
})

test('finalize r6: re-checks MIN_PROPOSALS after the shortlist filter (non-fresh only)', () => {
  // The pre-filter check catches under-count from the LLM; the post-
  // filter check covers the case where all of a proposal's cell_data
  // was off-list and got dropped, silently reducing persisted count.
  // 2026-05-18 — gated on !isFreshStart so empty-shortlist mode skips it.
  assert.match(src, /if \(!isFreshStart && Object\.keys\(proposed_actions\)\.length < MIN_PROPOSALS\)/)
  assert.match(src, /after filtering/)
})

test('finalize r6+r7: cell_data value/source/note schema is z.null()', () => {
  // Prompt instructs the LLM that verdict rows MUST NOT invent per-school
  // facts; schema enforces it at BOTH layers. r6 first tried
  // z.literal(null) but openai@6.35's zod-to-json-schema serializes that
  // as `{ "type": "object" }`, which would have constrained the model
  // toward objects while the Zod parser still expected null — Codex r7
  // P1. z.null() serializes as `{ "type": "null" }` AND rejects
  // omission/"null" string, so it's correct at both layers.
  assert.match(schemasSrc, /value:\s*z\.null\(\)/)
  assert.match(schemasSrc, /source:\s*z\.null\(\)/)
  assert.match(schemasSrc, /note:\s*z\.null\(\)/)
})

// ── Persistence + render shape ───────────────────────────────────────

test('finalize: persists message with prose_v1 format + proposed_actions', () => {
  // NanaBubble.tsx switches to prose-mode render on parsed?.format ===
  // 'prose_v1'. proposed_actions keyed by short proposal_ids drives
  // the "+ Add as row" pills.
  assert.match(src, /format:\s+['"]prose_v1['"]/)
  assert.match(src, /proposed_actions/)
})

test('finalize: build_mode.finalize marker on parsed_answer', () => {
  // The turn route filters history on `parsed_answer.build_mode !=
  // null` to keep the LLM's prompt context on-topic. The finalize
  // message must carry a marker so it's NOT treated as interview Q/A
  // on the next turn.
  assert.match(src, /finalize:\s+true/)
})

test('finalize: research_session_messages insert + share_token wiring', () => {
  assert.match(src, /\.from\(['"]research_session_messages['"]\)/)
  assert.match(src, /share_token:\s+shareToken/)
})

// ── Spend tracking ───────────────────────────────────────────────────

test('finalize: logs to nana_chat_logs with backend=build-mode-finalize-v2', () => {
  // Slice 8 Build 6: bumped from 'build-mode-finalize' (v1, rows only)
  // to 'build-mode-finalize-v2' (v1 + school recommendations). Distinct
  // backend label lets MC Costs split cost-per-finalize trendlines
  // across the two revisions. Codex r-merge Q9 OK.
  assert.match(src, /\.from\(['"]nana_chat_logs['"]\)\.insert\(/)
  assert.match(src, /backend:\s+['"]build-mode-finalize-v2['"]/)
})

test('finalize: gpt-5.4-mini pricing matches turn route + nana-brain', () => {
  // Same drift-detection assertion as the turn route. If pricing shifts
  // in nana-brain.js's PRICING_PER_MTOK['gpt-5-4-mini'] without
  // updating both routes, this test fails before dashboards mis-cost.
  assert.match(src, /input:\s+0\.75/)
  assert.match(src, /output:\s+4\.50/)
})

// ── SSE event order ──────────────────────────────────────────────────

test('finalize: emits session_ready before tokens', () => {
  // Matches the turn route + the chat hook's case handlers. Without
  // session_ready first, the hook's setSession path doesn't fire.
  assert.match(src, /session_ready[\s\S]*answer_format[\s\S]*token/)
})

test('finalize: final event carries DB-issued messageId (not local UUID)', () => {
  assert.match(src, /messageId,/)
  assert.match(src, /insertedRow\?\.id\s+\?\?\s+null/)
})

test('finalize: AbortController wired to req.signal + cancel hook', () => {
  assert.match(src, /new AbortController\(\)/)
  assert.match(src, /req\.signal\.addEventListener\(['"]abort['"]/)
  assert.match(src, /cancel\(\)\s*\{[\s\S]*?ac\.abort\(\)/)
})

// ── Slice 8 Build 7: funnel_state transition ─────────────────────────

test('finalize: funnel_state transition to comparison on success', () => {
  // Co-located but not adjacency-coupled. Both assertions must hold
  // in the same file; prettier won't break either independently.
  assert.match(src, /funnel_state:\s*['"]comparison['"]/)
  assert.match(src, /updated_at:\s*new Date\(\)\.toISOString\(\)/)
})

test('finalize: funnel_state transition idempotent — guarded to interview', () => {
  // Re-clicks of finalize CTA (Build 6 row-dedup case) won't revert.
  assert.match(src, /\.eq\(\s*['"]funnel_state['"]\s*,\s*['"]interview['"]/)
})

test('finalize: funnel_state UPDATE gated on insert success', () => {
  // Don't advance state if proposals didn't persist (Codex r2 P1).
  assert.match(src, /if \(!insertError && insertedRow\?\.id/)
})

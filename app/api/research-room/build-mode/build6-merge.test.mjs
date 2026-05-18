// Slice 8 Build 6 — source-grep tests covering the merge of school
// recommendations into the Build Mode finalize CTA.
//
// One file rather than per-surface because the wiring spans 7 files
// and we want every assertion to live next to its sibling so future
// readers can see the whole picture in one place.
//
// Run via:
//   cd website
//   node --experimental-strip-types --test app/api/research-room/build-mode/build6-merge.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// ── Helpers ─────────────────────────────────────────────────────────

function readFile(rel) {
  return fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8')
}

// ── 1. confirm_add_school migration SQL ─────────────────────────────

test('migration: confirm_add_school RPC defined with correct return shape', () => {
  const sql = readFile('../scripts/migrations/2026-05-16-confirm-add-school-rpc.sql')
  // Function signature
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.confirm_add_school\(\s*p_message_id\s+uuid,\s*p_proposal_id\s+text\s*\)/)
  // Returns 4-column tuple per Codex Q1 P1 (slug, status, session_id, child_id)
  assert.match(sql, /out_slug\s+text/)
  assert.match(sql, /out_status\s+text/)
  assert.match(sql, /out_session_id\s+uuid/)
  assert.match(sql, /out_child_id\s+uuid/)
})

test('migration: SECURITY DEFINER with locked search_path', () => {
  const sql = readFile('../scripts/migrations/2026-05-16-confirm-add-school-rpc.sql')
  assert.match(sql, /SECURITY DEFINER/)
  assert.match(sql, /SET search_path = pg_catalog, public, pg_temp/)
})

test('migration: idempotency stamp pre-check (Codex Q7 P2)', () => {
  const sql = readFile('../scripts/migrations/2026-05-16-confirm-add-school-rpc.sql')
  // FOR UPDATE on the message + EXISTS check on actions[] for an existing
  // add_school stamp with the same proposal_id → already_confirmed return.
  assert.match(sql, /FOR UPDATE OF m/)
  assert.match(sql, /act ->> 'kind'\s*=\s*'add_school'/)
  assert.match(sql, /act ->> 'proposal_id'\s*=\s*p_proposal_id/)
  assert.match(sql, /'already_confirmed'/)
})

test('migration: stale-stamp re-add status (Codex r1 P1)', () => {
  // Codex r1 P1 — original sketch returned 'already_confirmed' purely
  // on stamp presence, which missed the "removed-then-re-added" case
  // (shortlist row gone but stamp persists). Fix: always attempt INSERT
  // first, then resolve final status from (inserted?, prior_stamp?).
  const sql = readFile('../scripts/migrations/2026-05-16-confirm-add-school-rpc.sql')
  // All four cases must be present in the CASE expression
  assert.match(sql, /'added'/)
  assert.match(sql, /'already_present'/)
  assert.match(sql, /'re_added'/)
  assert.match(sql, /'already_confirmed'/)
  // Stamp only appends when no prior stamp exists
  assert.match(sql, /IF NOT v_existing_stamp THEN/)
})

test('migration: validates proposal.kind === propose_add_school', () => {
  const sql = readFile('../scripts/migrations/2026-05-16-confirm-add-school-rpc.sql')
  assert.match(sql, /v_kind\s+<>\s+'propose_add_school'/)
})

test('migration: slug regex + EXISTS schools defence', () => {
  const sql = readFile('../scripts/migrations/2026-05-16-confirm-add-school-rpc.sql')
  assert.match(sql, /v_slug\s+!~\s+'\^\[a-z0-9-\]\+\$'/)
  assert.match(sql, /NOT EXISTS \(SELECT 1 FROM public\.schools WHERE schools\.slug\s*=\s*v_slug\)/)
})

test('migration: GRANT EXECUTE only to authenticated (Codex NIT)', () => {
  const sql = readFile('../scripts/migrations/2026-05-16-confirm-add-school-rpc.sql')
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.confirm_add_school\(uuid, text\) FROM PUBLIC/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.confirm_add_school\(uuid, text\) TO authenticated/)
  // Codex NIT: must NOT grant to service_role
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.confirm_add_school\(uuid, text\) TO[^;]*service_role/)
})

test('migration: stamps add_school action on the source message', () => {
  const sql = readFile('../scripts/migrations/2026-05-16-confirm-add-school-rpc.sql')
  assert.match(sql, /UPDATE public\.research_session_messages/)
  assert.match(sql, /'kind',\s*'add_school'/)
  assert.match(sql, /'slug',\s*v_slug/)
  assert.match(sql, /'proposal_id',\s*p_proposal_id/)
})

// ── 2. write-match-reasons shared helper ────────────────────────────

test('helper: writeMatchReasonsForInRoomAdd extracted from shortlist route', () => {
  const src = readFile('lib/research-room/write-match-reasons.ts')
  assert.match(src, /export async function writeMatchReasonsForInRoomAdd/)
  assert.match(src, /loadMatchReasonsBatch/)
})

test('helper: shortlist route now imports from shared helper', () => {
  const src = readFile('app/api/research-room/shortlist/route.ts')
  assert.match(src, /from '@\/lib\/research-room\/write-match-reasons'/)
  // The private function definition is gone
  assert.doesNotMatch(src, /^async function writeMatchReasonsForInRoomAdd/m)
})

// ── 3. Finalize route — parallel arrays + scorer + retry + backend ──

test('finalize route: imports scoreForBuildMode + mixed schema', () => {
  const src = readFile('app/api/research-room/build-mode/finalize/route.ts')
  assert.match(src, /scoreForBuildMode/)
  assert.match(src, /BuildModeFinalizeMixedSchema/)
})

test('finalize route: scorer runs with excludeSlugs = shortlist', () => {
  const src = readFile('app/api/research-room/build-mode/finalize/route.ts')
  assert.match(src, /excludeSlugs:\s*shortlistSlugs/)
  assert.match(src, /SCORER_CANDIDATE_LIMIT/)
})

test('finalize route: candidate allowlist filters school proposals', () => {
  const src = readFile('app/api/research-room/build-mode/finalize/route.ts')
  assert.match(src, /candidateAllowlist\s*=\s*new Set/)
  assert.match(src, /candidateAllowlist\.has\(sp\.slug\)/)
})

test('finalize route: retry-once on all-filtered school proposals (Codex Q8)', () => {
  const src = readFile('app/api/research-room/build-mode/finalize/route.ts')
  // Retry only fires when LLM tried (>0 raw) but all got filtered (=0 safe).
  // Codex r1 Q3 P2: also guard on !ac.signal.aborted so we don't burn
  // tokens after the client has hung up.
  assert.match(src, /schoolProposalsExtracted\.length > 0/)
  assert.match(src, /safeSchoolProposals\.length === 0/)
  assert.match(src, /!ac\.signal\.aborted/)
  assert.match(src, /Re-emit schoolProposals using ONLY the slugs/)
})

test('finalize route: retry meta rolled up into nana_chat_logs (Codex r1 Q3)', () => {
  // Both the primary stream.meta and the optional retryStream.meta
  // contribute to the persisted token + cost totals.
  const src = readFile('app/api/research-room/build-mode/finalize/route.ts')
  assert.match(src, /retryMetaPromise/)
  assert.match(src, /Promise\.all\(\[\s*stream\.meta,\s*retryMetaPromise/)
})

test('finalize route: schoolProposals deduped by slug (Codex r1 Q9)', () => {
  const src = readFile('app/api/research-room/build-mode/finalize/route.ts')
  // Set-based dedupe runs before the trim + display_name resolve loop.
  assert.match(src, /seenSlugs = new Set<string>\(\)/)
})

test('finalize route: empty candidate allowlist explicit prompt (Codex r1 Q2)', () => {
  const src = readFile('app/api/research-room/build-mode/finalize/route.ts')
  // When the scorer yields zero candidates, the prompt block tells the
  // LLM explicitly NOT to include schoolProposals — not just an empty
  // bullet list to interpret.
  assert.match(src, /DO NOT include schoolProposals at all/)
})

test('finalize route: row proposals NOT dropped if school branch fails', () => {
  // Codex Q8 NIT — row proposals are persisted regardless of school outcome.
  // The route returns early ONLY on row count too low or off-shortlist
  // cell_data, NOT on school proposal hallucinations.
  const src = readFile('app/api/research-room/build-mode/finalize/route.ts')
  // Order matters: row processing must complete (and return early on row
  // failures) BEFORE the school branch runs.
  const rowSchoolOrder = src.indexOf('Object.keys(proposed_actions).length < MIN_PROPOSALS')
  const schoolBranch   = src.indexOf('safeSchoolProposals: BuildModeFinalizeSchoolProposal[]')
  assert.ok(rowSchoolOrder > 0 && schoolBranch > 0, 'both branches present')
  assert.ok(rowSchoolOrder < schoolBranch, 'row branch validation precedes school branch processing')
})

test('finalize route: school display_name resolved server-side from schools table', () => {
  const src = readFile('app/api/research-room/build-mode/finalize/route.ts')
  assert.match(src, /\.from\(['"]schools['"]\)\s*\.select\(['"]slug, name['"]\)/)
  assert.match(src, /nameBySlug/)
})

test('finalize route: persists propose_add_school entries in proposed_actions', () => {
  const src = readFile('app/api/research-room/build-mode/finalize/route.ts')
  assert.match(src, /kind:\s+'propose_add_school'/)
})

test('finalize route: backend tag bumped to build-mode-finalize-v2 (Codex Q9)', () => {
  const src = readFile('app/api/research-room/build-mode/finalize/route.ts')
  assert.match(src, /backend:\s+['"]build-mode-finalize-v2['"]/)
})

test('finalize route: school proposal bounds split into _DEFAULT (3) + _FRESH (6) after 2026-05-18', () => {
  // The cap was split because Commit C removed the onboarding-time
  // recommender — finalize now seeds the comparison table for fresh
  // parents, so 2-3 picks would leave the table thin.
  const src = readFile('app/api/research-room/build-mode/finalize/route.ts')
  assert.match(src, /MAX_SCHOOL_PROPOSALS_DEFAULT\s*=\s*3/)
  assert.match(src, /MAX_SCHOOL_PROPOSALS_FRESH\s*=\s*6/)
  // Slicer reads the per-request computed cap, not the constant directly.
  assert.match(src, /safeSchoolProposals\.slice\(0, maxSchoolProposals\)/)
  // The branch that picks the cap lives next to shortlistSlugs.
  assert.match(src, /shortlistSlugs\.length === 0\s*\n\s*\?\s*MAX_SCHOOL_PROPOSALS_FRESH\s*\n\s*:\s*MAX_SCHOOL_PROPOSALS_DEFAULT/)
})

// ── 4. write-action add_school branch ───────────────────────────────

test('write-action: add_school parser accepts message_id + proposal_id', () => {
  const src = readFile('app/api/research-room/write-action/route.ts')
  assert.match(src, /type AddSchoolBody\s+=/)
  assert.match(src, /action === 'add_school'/)
  assert.match(src, /\| AddSchoolBody/)
})

test('write-action: add_school calls confirm_add_school RPC', () => {
  const src = readFile('app/api/research-room/write-action/route.ts')
  assert.match(src, /\.rpc\(['"]confirm_add_school['"]/)
})

test('write-action: add_school handles added | already_present | already_confirmed | re_added', () => {
  // Codex r1 P1: 're_added' must be a valid status the route accepts.
  // Fresh write returns 201; idempotent / unchanged states return 200.
  const src = readFile('app/api/research-room/write-action/route.ts')
  assert.match(src, /'added'/)
  assert.match(src, /'already_present'/)
  assert.match(src, /'already_confirmed'/)
  assert.match(src, /'re_added'/)
})

test('write-action: add_school runs match_reasons + seedResearchSession after RPC', () => {
  const src = readFile('app/api/research-room/write-action/route.ts')
  assert.match(src, /writeMatchReasonsForInRoomAdd/)
  assert.match(src, /seedResearchSession/)
  // Both wrapped in try/catch so RPC success isn't undone by side-effect failures
  assert.match(src, /match_reasons after add_school failed/)
  assert.match(src, /seedResearchSession after add_school failed/)
})

// ── 5. Build Mode schemas — parallel arrays + school proposal type ─

test('schemas: BuildModeFinalizeSchoolProposalSchema shape', () => {
  const src = readFile('lib/server/research-room/build-mode-schemas.ts')
  assert.match(src, /BuildModeFinalizeSchoolProposalSchema/)
  assert.match(src, /slug:\s+z\.string\(\)\.min\(1\)\.max\(120\)/)
  assert.match(src, /rationale:\s+z\.string\(\)\.min\(1\)\.max\(280\)/)
  assert.match(src, /match_signals:\s+z\.array\(z\.string\(\)\.min\(1\)\.max\(48\)\)/)
})

test('schemas: BuildModeFinalizeMixedSchema has rowProposals + schoolProposals', () => {
  const src = readFile('lib/server/research-room/build-mode-schemas.ts')
  assert.match(src, /BuildModeFinalizeMixedSchema/)
  assert.match(src, /rowProposals:\s+BuildModeFinalizeProposalsSchema/)
  assert.match(src, /schoolProposals:\s+BuildModeFinalizeSchoolProposalsSchema/)
})

test('schemas: school proposals capped at 5 LLM output', () => {
  const src = readFile('lib/server/research-room/build-mode-schemas.ts')
  assert.match(src, /BuildModeFinalizeSchoolProposalsSchema\s*=\s*z\.array\(BuildModeFinalizeSchoolProposalSchema\)\.max\(5\)/)
})

// ── 6. ProposedAction union + ProposeAddSchool type ─────────────────

test('types: ProposeAddSchool is part of the ProposedAction union', () => {
  const src = readFile('lib/nana/types.ts')
  assert.match(src, /interface ProposeAddSchool/)
  assert.match(src, /kind:\s+'propose_add_school'/)
  assert.match(src, /ProposedAction\s*=\s*ProposedAddRow\s*\|\s*ProposeReRank\s*\|\s*ProposeCreateLens\s*\|\s*ProposeAddToLetter\s*\|\s*ProposeCreateTopicLens\s*\|\s*ProposeAddSchool/)
})

test('types: ResearchMessage carries activeSchoolProposalIds', () => {
  const src = readFile('lib/nana/types.ts')
  assert.match(src, /activeSchoolProposalIds\?:\s*string\[\]/)
})

// ── 7. page.tsx activeSchoolProposalIds derivation ──────────────────

test('page.tsx: activeShortlistSlugs Set built from shortlisted_schools', () => {
  const src = readFile('app/nana/research-room/page.tsx')
  assert.match(src, /activeShortlistSlugs\s*=\s*new Set<string>\(\)/)
  assert.match(src, /\.from\(['"]shortlisted_schools['"]\)/)
})

test('page.tsx: activeSchoolProposalIds walks stamps + slug-in-shortlist', () => {
  const src = readFile('app/nana/research-room/page.tsx')
  assert.match(src, /activeSchoolProposalIds:\s*string\[\]\s*=\s*\[\]/)
  // (a) add_school stamp present
  assert.match(src, /a\.kind\s*!==\s*'add_school'/)
  assert.match(src, /activeShortlistSlugs\.has\(a\.slug\)/)
  // (b) slug-already-in-shortlist fallback for parents who manual-added
  assert.match(src, /prop\?\.kind\s*!==\s*'propose_add_school'/)
})

test('use-nana-chat: activeSchoolProposalIds included in sync signature', () => {
  const src = readFile('lib/nana/use-nana-chat.ts')
  assert.match(src, /activeSchoolProposalIds/)
  assert.match(src, /schoolsById/)
})

// ── 8. NanaBubble AddSchoolButton + ProposedActionsList wiring ──────

test('NanaBubble: AddSchoolButton renders with #ic-school sprite (Codex Q5)', () => {
  const src = readFile('components/nana/NanaBubble.tsx')
  assert.match(src, /function AddSchoolButton/)
  assert.match(src, /href="#ic-school"/)
  // Tooltip surfaces rationale; pill label says "Add {displayName}"
  assert.match(src, /Add \$\{displayName\}/)
})

test('NanaBubble: ProposedActionsList filters propose_add_school entries', () => {
  const src = readFile('components/nana/NanaBubble.tsx')
  assert.match(src, /addSchoolEntries/)
  assert.match(src, /e\[1\]\.kind === 'propose_add_school'/)
})

test('NanaBubble: NanaMsgBubble forwards onConfirmAddSchool + activeSchoolProposalIds', () => {
  const src = readFile('components/nana/NanaBubble.tsx')
  assert.match(src, /onConfirmAddSchool\?:/)
  assert.match(src, /activeSchoolProposalIds=\{msg\.activeSchoolProposalIds\}/)
})

test('NanaBubble: AddSchoolButton has optimistic/pending/error/added states', () => {
  const src = readFile('components/nana/NanaBubble.tsx')
  // Mirror the row pill's state machine + flip on shortlist truth
  assert.match(src, /override === 'optimistic-added' \|\| isInShortlist/)
})

test('NanaBubble: school pill uses distinct CSS modifier from topic-lens', () => {
  const src = readFile('components/nana/NanaBubble.tsx')
  // Must NOT reuse the topic-lens sparkle class
  assert.match(src, /rr-proposed-btn--school/)
})

// ── 9. ResearchRoomChat onConfirmAddSchool handler ──────────────────

test('ResearchRoomChat: onConfirmAddSchool posts to write-action with action=add_school', () => {
  const src = readFile('components/nana/ResearchRoomChat.tsx')
  assert.match(src, /async function onConfirmAddSchool/)
  assert.match(src, /action:\s*'add_school',\s*message_id:\s*messageId,\s*proposal_id:\s*proposalId/)
  // Isolate just the function body and confirm router.refresh() lives inside.
  const fnStart = src.indexOf('async function onConfirmAddSchool')
  assert.ok(fnStart > 0, 'function declaration present')
  const fnSegment = src.slice(fnStart, fnStart + 1200)
  assert.match(fnSegment, /router\.refresh\(\)/)
})

test('ResearchRoomChat: ChatBody receives + forwards onConfirmAddSchool', () => {
  const src = readFile('components/nana/ResearchRoomChat.tsx')
  // Both ChatBody calls (desktop + mobile) pass the handler
  const passes = src.match(/onConfirmAddSchool=\{onConfirmAddSchool\}/g) ?? []
  assert.ok(passes.length >= 2, `expected ≥2 passes of onConfirmAddSchool, got ${passes.length}`)
})

// ── 10. CSS modifier exists ─────────────────────────────────────────

test('CSS: rr-proposed-btn--school modifier defined', () => {
  const src = readFile('components/nana/research-room.css')
  assert.match(src, /\.rr-proposed-btn--school\s*\{/)
})

// 2026-05-18 Commit B + C source-grep tests.
//
// Commit B — Mirror min-confidence floor + region penalty into the
//             Build Mode finalize scorer (lib/research-room/score-for-
//             build-mode.ts) so Picker #2 has the same quality knobs
//             as Picker #1 (lib/recommend-shortlist.ts).
//
// Commit C — Recommendation-flow cleanup:
//   • /api/children POST no longer calls recommendShortlist() — the
//     parent enters Build Mode interview with an empty shortlist and
//     gets recommendations only after the interview's finalize step.
//   • finalize accepts an empty shortlist (was 409 before) and bumps
//     the school proposal cap from 3 to 6 in the fresh-start case.
//
// Run via:
//   cd website
//   node --experimental-strip-types --test app/api/research-room/build-mode/shortlist-recommender-architecture.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readFile(rel) {
  return fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8')
}

// ── Commit B: Picker #2 quality knobs ───────────────────────────────

test('Phase 2.8 (2026-05-25): score-for-build-mode.ts conf-floor REMOVED (dropped 13 canonical schools when present)', () => {
  const src = readFile('lib/research-room/score-for-build-mode.ts')
  assert.doesNotMatch(src, /\.or\('confidence_score\.is\.null,confidence_score\.gte\.10'\)/,
    'conf-floor must stay removed — has_substantial_chunks via loadUkEvidenceSlugs is the sole gate now')
})

test('Region penalty MIGRATED to hard filter (was: score -= 2.0)', () => {
  const src = readFile('lib/research-room/score-for-build-mode.ts')
  // The score -= 2.0 soft penalty was replaced by a hard filter that drops
  // wrong-bucket schools entirely (Bug #3 picker-followup 2026-05-23). The
  // grep asserts the literal no longer exists.
  assert.doesNotMatch(src, /} else {\s*\n\s*score -= 2\.0\s*\n\s*}\s*\n\s*}/,
    'wrong-region soft penalty must stay migrated to hard filter')
  // The old -1.0 region penalty is gone (defensive — accept it elsewhere)
  assert.doesNotMatch(src, /score -= 1\.0(\s+\/\/.*)?\s*\n\s*}\s*\n\s*}/)
})

// ── Commit C: Onboarding-time recommender removal ───────────────────

test('Commit C: /api/children no longer imports or calls recommendShortlist', () => {
  const src = readFile('app/api/children/route.ts')
  // The import is gone — if there's no import, there can't be a live call.
  assert.doesNotMatch(src, /import\s+\{\s*recommendShortlist\s*\}\s+from\s+'@\/lib\/recommend-shortlist'/)
  // The actual call sites had the `await` prefix; assert no awaited call
  // remains. Mentions in comments (e.g. "recommendShortlist() was removed")
  // are fine — they explain the removal to future readers.
  assert.doesNotMatch(src, /await\s+recommendShortlist\s*\(/)
})

test('Commit C: /api/children documents the removal', () => {
  const src = readFile('app/api/children/route.ts')
  // The new comment explains why the recommender call is gone — guards
  // against a future contributor reinstating it without context.
  assert.match(src, /recommendShortlist\(\) at child-creation time was removed/)
})

// ── Commit C: finalize accepts empty shortlist + bumps cap ──────────

test('Commit C: finalize route drops the empty_shortlist 409', () => {
  const src = readFile('app/api/research-room/build-mode/finalize/route.ts')
  assert.doesNotMatch(src, /jsonError\(409,\s*'empty_shortlist'\)/)
})

test('Commit C: finalize route picks cap based on shortlist size', () => {
  const src = readFile('app/api/research-room/build-mode/finalize/route.ts')
  // The conditional that picks _FRESH vs _DEFAULT
  assert.match(src, /const maxSchoolProposals = shortlistSlugs\.length === 0\s*\n\s*\?\s*MAX_SCHOOL_PROPOSALS_FRESH\s*\n\s*:\s*MAX_SCHOOL_PROPOSALS_DEFAULT/)
})

test('Commit C: finalize prompt is empty-shortlist aware', () => {
  const src = readFile('app/api/research-room/build-mode/finalize/route.ts')
  // The prompt branch that tells the LLM to emit `rowProposals: []`
  // when no shortlist exists yet.
  assert.match(src, /isFreshStart = args\.shortlistSlugs\.length === 0/)
  assert.match(src, /Emit `rowProposals: \[\]` verbatim/)
})

test('Commit C: finalize prompt builder takes maxSchoolProposals from caller', () => {
  const src = readFile('app/api/research-room/build-mode/finalize/route.ts')
  assert.match(src, /maxSchoolProposals:\s+number/)
  // Prompt template uses the per-request value, not the constant.
  assert.match(src, /0-\$\{args\.maxSchoolProposals\}/)
})

// Codex r2 P0 — the prompt instructs the LLM to emit rowProposals: [] in
// fresh-start mode, but the handler then hard-rejected anything below
// MIN_PROPOSALS=3 before schools were processed. The fix relaxes the row-
// count gates in fresh-start mode and adds a combined sanity check after
// schools are appended.
test('Commit C bug-fix: row-count gates relax in fresh-start mode', () => {
  const src = readFile('app/api/research-room/build-mode/finalize/route.ts')
  // Per-request minRowProposals (0 when isFreshStart, else MIN_PROPOSALS)
  assert.match(src, /const minRowProposals = isFreshStart \? 0 : MIN_PROPOSALS/)
  assert.match(src, /proposalsRaw\.length < minRowProposals/)
  // The post-filter gate is skipped in fresh-start mode.
  assert.match(src, /if \(!isFreshStart && Object\.keys\(proposed_actions\)\.length < MIN_PROPOSALS\)/)
})

test('Commit C bug-fix: combined sanity check after schools appended', () => {
  const src = readFile('app/api/research-room/build-mode/finalize/route.ts')
  // After both row + school proposals are merged, error if BOTH counts
  // are zero (wholly-empty finalize is never a success state).
  assert.match(src, /if \(rowCount === 0 && schoolCount === 0\) \{/)
  assert.match(src, /Finalize produced no row or school proposals/)
})

// Bug 5 fix (Option A, 2026-05-19) — the LLM was picking famous-but-
// wrong-region schools over higher-ranked Midlands+football schools
// because the prompt didn't tell it the candidates were pre-sorted.
test('Bug 5: prompt declares candidate list is pre-sorted by data-driven fit', () => {
  const src = readFile('app/api/research-room/build-mode/finalize/route.ts')
  // The explicit pre-sort declaration in the candidate section
  assert.match(src, /THE LIST IS PRE-SORTED BY DATA-DRIVEN FIT/)
  assert.match(src, /PREFER the top \$\{args\.maxSchoolProposals\} candidates/)
  // The swap-justification clause
  assert.match(src, /rationale MUST explain the swap based on the captured profile/)
})

test('Bug 5: schoolProposals rules include the pre-sort-respect rule (10b)', () => {
  const src = readFile('app/api/research-room/build-mode/finalize/route.ts')
  assert.match(src, /10b\. RESPECT THE PRE-SORT/)
  // The worked example pinning the SmokeTestBoy regression class.
  assert.match(src, /Famous-school reputation is NOT a valid reason/)
})

// Option A (2026-05-19): "Build my comparison table now" must actually
// build the table, not just propose chips the parent has to click. The
// server now auto-confirms each propose_add_school proposal server-side
// in fresh-start mode + emits an auto_accepted_count flag the client
// uses to trigger router.refresh.
test('Option A: finalize auto-accepts propose_add_school proposals in fresh-start mode', () => {
  const src = readFile('app/api/research-room/build-mode/finalize/route.ts')
  // The auto-accept block is gated on isFreshStart + messageId + schoolCount > 0
  assert.match(src, /if \(isFreshStart && messageId && schoolCount > 0 && sess\?\.child_id\)/)
  // Calls confirm_add_school RPC for each proposal (same RPC as chip click)
  assert.match(src, /\.rpc\('confirm_add_school', \{\s*p_message_id:\s+messageId/)
  // Match outStatus must be 'added' | 're_added' | 'already_present' to count.
  assert.match(src, /outStatus === 'added' \|\| outStatus === 're_added' \|\| outStatus === 'already_present'/)
})

test('Option A: best-effort match_reasons + seedResearchSession side effects', () => {
  const src = readFile('app/api/research-room/build-mode/finalize/route.ts')
  // Mirrors the chip-click flow in write-action/route.ts
  assert.match(src, /writeMatchReasonsForInRoomAdd/)
  // seedResearchSession fires ONCE after all auto-accepts (not per-school)
  // — pinned by the "if (autoAcceptedCount > 0)" guard above the import.
  assert.match(src, /if \(autoAcceptedCount > 0\) \{\s*\n\s*try \{\s*\n\s*const \{ loadShortlistContext, seedResearchSession \}/)
})

test('Option A: final event payload carries auto_accepted_count + slugs', () => {
  const src = readFile('app/api/research-room/build-mode/finalize/route.ts')
  // finalParsed extends build_mode with the auto-accept telemetry
  assert.match(src, /auto_accepted_count:\s+autoAcceptedCount/)
  assert.match(src, /auto_accepted_slugs:\s+autoAcceptedSlugs/)
})

test('Option A: client (ResearchRoomChat) refreshes on auto_accepted_count > 0', () => {
  const src = readFile('components/nana/ResearchRoomChat.tsx')
  // The useEffect that watches chat.messages for the build_mode auto-accept signal
  assert.match(src, /lastAutoAcceptedMsgIdRef/)
  assert.match(src, /build_mode\?: \{ auto_accepted_count\?: number \}/)
  // Watermark prevents repeat-firing on re-renders
  assert.match(src, /if \(lastAutoAcceptedMsgIdRef\.current === last\.id\) return/)
})

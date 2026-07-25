// rr-8-build3-sibling-gender-year (2026-05-21) — source-grep tests
// covering the cross-file invariants of the sibling gender/year fix.
//
// Background. Browser-smoke on 2026-05-20 revealed that adding the
// 5th child to a parent profile correctly skipped the 5-question
// onboarding wizard (selective inheritance, Build 7 Phase C followup
// #3) but Build Mode never asked the two basics the wizard owns —
// child_gender + child_year. The turn + finalize routes then fell
// back to parent_profiles.child_gender/year for the brief + scorer,
// which still carries the FIRST child's values. Sibling
// recommendations could come back silently mis-targeted (Y9 boy
// recommendations for a Sixth Form girl). Codex sharpened the bug
// from "permissive NULL filter" to "stale-from-parent-profiles
// contamination" (memory: project_sibling_gender_year_bug_sharpened
// _2026_05_20).
//
// Fix shape — eight files:
//   1. lib/server/research-room/build-mode-schemas.ts
//   2. lib/server/research-room/build-mode-merge.ts
//   3. lib/server/research-room/build-mode-interview.ts
//   4. lib/server/research-room/build-mode-prompt.ts
//   5. app/api/research-room/build-mode/turn/route.ts
//   6. app/api/research-room/build-mode/finalize/route.ts
//   7. components/nana/ResearchRoom.tsx
//   8. components/nana/ResearchRoomChat.tsx
//
// One file rather than per-surface because the fix is a single logical
// change spanning the LLM extraction allowlist, the merge layer, the
// orchestrator focus picker, two SSE routes, and two React surfaces;
// readers tracking the bug should see all invariants in one place.
//
// Run via:
//   cd website
//   node --experimental-strip-types --test \
//     app/api/research-room/build-mode/sibling-basics.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readFile(rel) {
  return fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8')
}

// ── 1. build-mode-schemas.ts — extraction allowlist extended ─────────

const schemasSrc = readFile('lib/server/research-room/build-mode-schemas.ts')

test('schemas: FIELD_DEFS adds child_gender enum (boy | girl | either)', () => {
  // Mirrors lib/onboarding-fields.ts so the Brief tab + scorer keep
  // a consistent vocabulary across all surfaces.
  assert.match(schemasSrc, /child_gender:\s*z\.enum\(\['boy',\s*'girl',\s*'either'\]\)/)
})

test('schemas: FIELD_DEFS adds child_year enum (year-7 | year-9 | year-10 | sixth-form | not-sure)', () => {
  assert.match(
    schemasSrc,
    /child_year:\s*z\.enum\(\['year-7',\s*'year-9',\s*'year-10',\s*'sixth-form',\s*'not-sure'\]\)/,
  )
})

test('schemas: LLM extraction schema lists child_gender + child_year as nullable', () => {
  // OpenAI strict structured outputs requires every key present with
  // .nullable(); null = "no signal this turn". Without these the LLM
  // can't emit values for the sibling_basics opener.
  assert.match(schemasSrc, /BuildModeExtractionLLMSchema[\s\S]*?child_gender:\s*FIELD_DEFS\.child_gender\.nullable\(\)/)
  assert.match(schemasSrc, /BuildModeExtractionLLMSchema[\s\S]*?child_year:\s*FIELD_DEFS\.child_year\.nullable\(\)/)
})

test('schemas: HTTP extraction schema lists child_gender + child_year as optional', () => {
  assert.match(schemasSrc, /BuildModeExtractionHTTPSchema[\s\S]*?child_gender:\s*FIELD_DEFS\.child_gender\.optional\(\)/)
  assert.match(schemasSrc, /BuildModeExtractionHTTPSchema[\s\S]*?child_year:\s*FIELD_DEFS\.child_year\.optional\(\)/)
})

test('schemas: ConfidenceMapSchema derives shape from FIELD_DEFS (mirrorFieldShape)', () => {
  // wizard-inheritance r1 — CorrectionsSchema and ConfidenceMapSchema
  // were refactored from hand-spelled objects to derive shape from
  // FIELD_DEFS via mirrorFieldShape(). The pattern check below pins that
  // refactor; without it, a future hand-edit could silently fall out of
  // sync with FIELD_DEFS again (the bug Codex flagged in design review).
  assert.match(schemasSrc, /const ConfidenceMapSchema = z\.object\(mirrorFieldShape\(ConfidenceFieldSchema\)\)\.strict\(\)/)
})

test('schemas: CorrectionsSchema derives shape from FIELD_DEFS (mirrorFieldShape)', () => {
  assert.match(schemasSrc, /const CorrectionsSchema = z\.object\(mirrorFieldShape\(z\.boolean\(\)\)\)\.strict\(\)/)
})

// ── 2. build-mode-merge.ts — scalar overwrite path ───────────────────

const mergeSrc = readFile('lib/server/research-room/build-mode-merge.ts')

test('merge: child_gender + child_year write through nextProfile when resolved (LLM or gap-filled parser)', () => {
  // No contradiction tracking for basics — trust the latest answer.
  // Chat-quality rewrite: the resolved value is `fields.X ?? parserGender ?? null`
  // (LLM wins on non-null; parser fills only when priorProfile.X is also null —
  // r7 P2.3 gate prevents overwrite of already-known basics by stray pronouns).
  // The "is this changing from prior?" gate is preserved so we don't emit
  // a no-op diff.set.
  assert.match(mergeSrc, /const resolvedGender = fields\.child_gender \?\? parserGender \?\? null/)
  assert.match(mergeSrc, /const resolvedYear\s+= fields\.child_year\s+\?\? parserYear\s+\?\? null/)
  assert.match(
    mergeSrc,
    /if \(resolvedGender != null && resolvedGender !== opts\.priorProfile\.child_gender\) \{[\s\S]*?nextProfile\.child_gender = resolvedGender/,
  )
  assert.match(
    mergeSrc,
    /if \(resolvedYear != null && resolvedYear !== opts\.priorProfile\.child_year\) \{[\s\S]*?nextProfile\.child_year = resolvedYear/,
  )
})

test('merge: MergeBuildModeTurnOpts.currentFocus + mergeProgress.currentFocus include sibling_basics', () => {
  // currentFocus is just forwarded to mergeProgress, whose drill_down/
  // other tiebreaker never matches 'sibling_basics' — so the new value
  // is a type-system update, not a behaviour change.
  const matches = mergeSrc.match(/currentFocus:\s*TargetKey \| 'confirm_contradiction' \| 'sibling_basics' \| 'free'/g) ?? []
  assert.ok(
    matches.length >= 2,
    `expected currentFocus type with 'sibling_basics' in BOTH MergeBuildModeTurnOpts and mergeProgress (saw ${matches.length})`,
  )
})

// ── 3. build-mode-interview.ts — pickFocus + sibling_basics gate ─────

const interviewSrc = readFile('lib/server/research-room/build-mode-interview.ts')

test('interview: pickFocus signature accepts optional priorProfile', () => {
  assert.match(
    interviewSrc,
    /export function pickFocus\(\s*progress:\s*BuildModeProgress,\s*priorProfile\?:\s*Partial<BuildModeExtractionHTTP>,?\s*\)/,
  )
})

test('interview: pickFocus returns sibling_basics when priorProfile missing child_gender or child_year', () => {
  // Gate sits AFTER contradictions (which always trump) and BEFORE
  // the per-target weight × headroom selection.
  assert.match(
    interviewSrc,
    /if \(priorProfile && \(!priorProfile\.child_gender \|\| !priorProfile\.child_year\)\) \{\s*\n\s*return 'sibling_basics'/,
  )
})

test('interview: runInterviewTurn passes priorProfile through to pickFocus', () => {
  // Without this the gate would never fire — the orchestrator owns the
  // profile and must hand it to the focus picker.
  assert.match(interviewSrc, /pickFocus\(opts\.priorProgress,\s*opts\.priorProfile\)/)
})

test('interview: buildFollowUpQuestion + RunInterviewTurnResult include sibling_basics', () => {
  assert.match(interviewSrc, /focus:\s*TargetKey \| 'confirm_contradiction' \| 'sibling_basics' \| 'free'/)
})

test('interview: buildFollowUpQuestion has partial-aware sibling_basics appendix (Codex r1 P1.2 + r2 P2.1)', () => {
  // The LLM is known to drop terminal questions on ~50% of turns.
  // Without a dedicated appendix, a sibling-opener turn could ship
  // prose that recites prior facts and stops, with no prompt for the
  // parent to respond to. The appendix must include deflection escape
  // hatches ("either" / "not sure").
  //
  // r2 P2.1: appendix branches on missingGender / missingYear so that
  // when the parent has answered one of the two, the appendix only
  // re-asks the OTHER. Re-asking both feels like the system ignored
  // their answer.
  assert.match(interviewSrc, /SIBLING_BASICS_BOTH/)
  assert.match(interviewSrc, /SIBLING_BASICS_GENDER_ONLY/)
  assert.match(interviewSrc, /SIBLING_BASICS_YEAR_ONLY/)
  // The branching: missing gender only → gender-only; missing year only
  // → year-only; both missing → both.
  assert.match(
    interviewSrc,
    /if \(opts\.focus === 'sibling_basics'\)[\s\S]*?const missingGender = !opts\.mergedProfile\?\.child_gender[\s\S]*?const missingYear\s+= !opts\.mergedProfile\?\.child_year[\s\S]*?if \(missingGender && !missingYear\) return SIBLING_BASICS_GENDER_ONLY[\s\S]*?if \(missingYear\s+&& !missingGender\) return SIBLING_BASICS_YEAR_ONLY[\s\S]*?return SIBLING_BASICS_BOTH/,
  )
  // Each variant must include the deflection escape hatch language so
  // a parent can move past without retyping.
  assert.match(interviewSrc, /SIBLING_BASICS_BOTH[\s\S]{0,400}\beither\b[\s\S]{0,400}\bnot sure\b/)
  assert.match(interviewSrc, /SIBLING_BASICS_GENDER_ONLY[\s\S]{0,400}\beither\b/)
  assert.match(interviewSrc, /SIBLING_BASICS_YEAR_ONLY[\s\S]{0,400}\bnot sure\b/)
})

test('interview: SIBLING_BASICS_* appendix variants all end with ? (Codex r3 NIT.1)', () => {
  // The string is the terminal fallback question — ending with `.)`
  // or `.` reads as an aside rather than a prompt. Source-grep the
  // assignments to verify each ends in `?`. Const definitions live on
  // their own lines, so anchor on the assignment line.
  //
  // The route's hasTerminalQuestion regex doesn't actually evaluate
  // the appendix string (only the LLM prose); this is purely a reading-
  // quality assertion to prevent regression on the question framing.
  for (const name of ['SIBLING_BASICS_BOTH', 'SIBLING_BASICS_GENDER_ONLY', 'SIBLING_BASICS_YEAR_ONLY']) {
    const re = new RegExp(`const ${name} = \`[^\`]*\\?\``, 's')
    assert.match(interviewSrc, re, `${name} must end with "?" inside the backtick literal`)
  }
})

test('interview: buildFollowUpQuestion opts include mergedProfile (Codex r2 P2.1)', () => {
  // Optional param keeps back-compat for callers that don't pass it
  // (those callers' focus values can't be sibling_basics anyway —
  // pickFocus never returns it without priorProfile, and only the
  // turn route passes priorProfile).
  assert.match(
    interviewSrc,
    /export function buildFollowUpQuestion\(opts: \{[\s\S]*?mergedProfile\?:\s*Partial<BuildModeExtractionHTTP>/,
  )
})

// ── 4. build-mode-prompt.ts — sibling_basics focus line ──────────────

const promptSrc = readFile('lib/server/research-room/build-mode-prompt.ts')

test('prompt: BuildSystemPromptOpts.currentFocus type includes sibling_basics', () => {
  assert.match(
    promptSrc,
    /currentFocus:\s*TargetKey \| 'confirm_contradiction' \| 'sibling_basics' \| 'free'/,
  )
})

test('prompt: sibling_basics focus branch asks gender + year via the schema-canonical enum values', () => {
  // The branch is now extracted into renderSiblingBasicsFocus (chat-
  // quality pass). Mappings still reference the canonical enum values
  // so extraction round-trips through the strict schema parse.
  assert.match(promptSrc, /currentFocus === 'sibling_basics'/)
  assert.match(promptSrc, /function renderSiblingBasicsFocus/)
  assert.match(promptSrc, /const missingGender = !priorProfile\.child_gender/)
  assert.match(promptSrc, /const missingYear\s+= !priorProfile\.child_year/)
  // Canonical enum values appear in the FIRST-RESOLVE shorthand block.
  assert.match(promptSrc, /child_year:\s*"year-9"/)
  assert.match(promptSrc, /child_year:\s*"sixth-form"/)
  assert.match(promptSrc, /child_gender:\s*"boy"/)
  assert.match(promptSrc, /child_gender:\s*"girl"/)
})

test('prompt: sibling_basics branch flags the "one question" exception (chat-quality rewrite)', () => {
  // The global SYSTEM_BASE has "Ask ONE thing at a time. Never bundle
  // two questions." — the sibling branch overrides this DELIBERATELY,
  // and saying so out loud removes the prompt ambiguity Codex flagged.
  // (The Codex r1 NIT.2 "leave all other fields null" wording was
  // dropped in the chat-quality rewrite — the new prompt doesn't tell
  // the LLM what to do with the other 9-11 fields because the
  // STRICT-SCHEMA contract already requires every key be emitted; the
  // FIRST-RESOLVE rule + CONSISTENCY rule cover the rest.)
  assert.match(promptSrc, /deliberate exception to the "ask ONE thing at a time" rule above for sibling basics/)
})

test('prompt: sibling_basics ask list is partial-aware (chat-quality rewrite)', () => {
  // The chat-quality rewrite moved the branch into
  // renderSiblingBasicsFocus() and changed the ask-list shape from
  // bullet "asks" rendering to a JOIN of the genuinely-missing fields.
  // Partial-aware still holds — when only one basic is missing, only
  // that one appears in the asks array. Codex r3-P2's concrete check
  // (literal "askCount === 1 ? 'one quick basic' : 'two quick basics'")
  // is no longer in the source; the equivalent invariant is now: the
  // asks array length depends on missingGender + missingYear, and the
  // join joins WITH "AND" when both are present.
  assert.match(promptSrc, /const asks: string\[\] = \[\]/)
  assert.match(promptSrc, /if \(missingGender\)/)
  assert.match(promptSrc, /if \(missingYear\)/)
  assert.match(promptSrc, /asks\.join\(' AND '\)/)
})

test('prompt: sibling_basics branch includes deflection / skip mappings (chat-quality)', () => {
  // The chat-quality rewrite moves these from a separate DEFLECTION
  // block into the FIRST-RESOLVE shorthand table. The mappings are
  // still load-bearing — without them the LLM leaves fields null on
  // "doesn't matter" / "don't know" and pickFocus would loop.
  assert.match(promptSrc, /"not sure", "don't know", "depends", "skip", "pass" → child_year: "not-sure"/)
  assert.match(promptSrc, /"either", "both", "no preference", "doesn't matter", "co-ed only" → child_gender: "either"/)
  assert.match(promptSrc, /"skip", "rather not say", "n\/a" → child_gender: "either"/)
})

// ── chat-quality additions (2026-05-21) ──────────────────────────────
//
// Codex advisory after browser smoke surfaced that the LLM felt robotic
// + dropped fragment answers like "year 9". These tests lock in the
// chat-quality response: FIRST-RESOLVE rule, birthday-aware hint,
// extraction/prose consistency, tone rules, sibling-aware prior facts.

test('prompt: FIRST-RESOLVE rule explicitly tells LLM to treat fragments as answers (chat-quality #1)', () => {
  // The original prompt only described WHAT enum values are valid.
  // The LLM defaulted to null on bare answers like "year 9" because
  // nothing in the prompt gave it permission to map fragments. This
  // rule is the load-bearing fix.
  assert.match(promptSrc, /FIRST, resolve any sibling basics from the latest user message and recent chat history BEFORE writing your prose/)
  assert.match(promptSrc, /The parent may answer with a fragment because they are replying to your last question/)
  // Bare-number gating: "9" only counts when prior Nana asked about year.
  assert.match(promptSrc, /Only treat a bare number like "9" as a school year when the LAST Nana message asked about year group/)
})

test('prompt: FIRST-RESOLVE shorthand table covers the failure modes from browser smoke', () => {
  // Each row is a regression guard against a specific shorthand the
  // LLM was observed missing (or could miss).
  for (const mapping of [
    '"year 7", "y7", "yr 7", "7", "seventh"',
    '"year 9", "y9", "yr 9", "9", "ninth"',
    '"year 10", "y10", "yr 10", "10"',
    '"sixth form", "6th form", "year 12", "y13", "L6", "U6"',
    '"son", "boy", "lad", "he", "him"',
    '"daughter", "girl", "she", "her"',
  ]) {
    assert.ok(promptSrc.includes(mapping), `prompt missing shorthand mapping: ${mapping}`)
  }
})

test('prompt: birthday hint branch renders both-vs-single-year prose (chat-quality #2 + r7 P2.4)', () => {
  // When siblingYearHint is available AND year is missing, the prompt
  // tells Nana to PROPOSE a year ("From the birthday, I have yoyo as
  // Year 9 now") rather than list enum options to the parent. The
  // both-current-and-next variant matters in spring/summer when
  // families are researching for next September. Post-r7: only fires
  // when the year-enum value is storable (label-only versions removed).
  assert.match(promptSrc, /BIRTHDAY HINT/)
  assert.match(promptSrc, /likely \$\{nextLabel\} from September/)
  assert.match(promptSrc, /Do NOT silently set child_year unless the parent confirms/)
})

test('prompt: tone block bans system-y vocab and sets reading level (chat-quality #4)', () => {
  // Browser smoke caught the LLM emitting "I'm just reusing the
  // preferences you already gave for yoyo, and I only need two quick
  // basics to start..." — robotic + form-y. Codex's tone block bans
  // the system-y words from parent-facing prose. r7 NIT.2 added
  // positive replacements (covered by a separate test above).
  assert.match(promptSrc, /TONE: write like a calm human adviser/)
  assert.match(promptSrc, /Year-6 reading level/)
  assert.match(promptSrc, /Keep it under 30 words where possible/)
  // Negative bans now live on a "Words to AVOID" line (r7 NIT.2 split).
  assert.match(promptSrc, /Words to AVOID in parent-facing prose:[\s\S]*?"captured"[\s\S]*?"field"[\s\S]*?"prior facts"[\s\S]*?"onboarding"[\s\S]*?"basics"/)
})

test('prompt: extraction/prose consistency rule prevents re-asking captured fields', () => {
  // Closes the bug where turn 3 set gender from "she's" but the prose
  // still asked "is yoyo a son or a daughter?". CONSISTENCY rule forces
  // the LLM to align extraction with prose.
  assert.match(promptSrc, /CONSISTENCY: never ask in prose for a basic you are setting in extraction this turn/)
})

test('prompt: renderPriorFacts splits sibling case into "Family preferences" + "Still needed" (chat-quality #3 + r7 P2.1 neutral)', () => {
  // The standard brief render shows "Brief: Year group: ..." which for
  // siblings could pull stale first-child values via parent_profiles.
  // The sibling-aware branch makes the model explicitly aware that some
  // facts are reused-family-level and others are missing for THIS child.
  // Codex r7 P2.1: wording neutralised — works for both true siblings
  // and legacy first children with missing child_profile basics.
  assert.match(promptSrc, /const siblingNeedsBasics = !profile\.child_gender \|\| !profile\.child_year/)
  assert.match(promptSrc, /Family preferences on file:/)
  assert.match(promptSrc, /Still needed for this child:/)
  // The load-bearing instruction — also neutralised post-r7.
  assert.match(promptSrc, /Do NOT assume this child's missing basics from another child's profile or from parent-level defaults/)
})

test('prompt: BuildSystemPromptOpts type accepts optional siblingYearHint', () => {
  assert.match(promptSrc, /siblingYearHint\?: UkYearHint \| null/)
})

// ── Merge layer: parser as safety net ────────────────────────────────

test('merge: invokes parseSiblingBasicsAnswer when focus=sibling_basics + userMessage present (chat-quality #5)', () => {
  // The parser is the deterministic safety net Codex called out as
  // "the difference between 'the model should remember' and 'the
  // product definitely remembers'."
  assert.match(mergeSrc, /import \{\s*parseSiblingBasicsAnswer/)
  assert.match(
    mergeSrc,
    /opts\.currentFocus === 'sibling_basics' &&\s*\n\s*typeof opts\.userMessage === 'string'/,
  )
  assert.match(
    mergeSrc,
    /parserResult = parseSiblingBasicsAnswer\(\{[\s\S]*?userMessage:\s+opts\.userMessage[\s\S]*?lastNanaProse: opts\.lastNanaProse \?\? null/,
  )
})

test('merge: LLM-emitted basics WIN over parser; parser only fills LLM-null gaps + priorProfile-null gaps', () => {
  // Spec'd by Codex r2: "LLM values ALWAYS win when non-null; the
  // parser only fills when the LLM left it blank." Codex r7 P2.3
  // strengthened this: parser ONLY fills when priorProfile.X is ALSO
  // null (prevents overwrite of already-known basics from off-topic
  // pronoun mentions later in the interview).
  assert.match(mergeSrc, /const resolvedGender = fields\.child_gender \?\? parserGender \?\? null/)
  assert.match(mergeSrc, /const resolvedYear\s+= fields\.child_year\s+\?\? parserYear\s+\?\? null/)
})

test('merge: MergeBuildModeTurnOpts type carries optional userMessage + lastNanaProse', () => {
  assert.match(mergeSrc, /userMessage\?:\s+string \| null/)
  assert.match(mergeSrc, /lastNanaProse\?: string \| null/)
})

// ── Interview orchestrator: pulls userMessage + lastNanaProse from history ──

test('interview: derives userMessage + lastNanaProse from history and passes to merge', () => {
  // The history convention is oldest→newest with the current user
  // message as the final entry. Without this derivation the merge
  // layer's parser would never receive the inputs it needs.
  assert.match(interviewSrc, /const userMessage = \(\(\) => \{[\s\S]*?for \(let i = opts\.history\.length - 1; i >= 0; i--\)[\s\S]*?if \(m && m\.role === 'user'\) return m\.content/)
  assert.match(interviewSrc, /const lastNanaProse = \(\(\) => \{[\s\S]*?if \(m && m\.role === 'assistant'\) return m\.content/)
  assert.match(interviewSrc, /mergeBuildModeTurn\(\{[\s\S]*?userMessage,[\s\S]*?lastNanaProse,/)
})

test('interview: siblingYearHint threaded through RunInterviewTurnOpts → buildSystemPrompt', () => {
  assert.match(interviewSrc, /siblingYearHint\?: UkYearHint \| null/)
  assert.match(interviewSrc, /siblingYearHint: opts\.siblingYearHint \?\? null/)
})

// ── Turn route: loads DOB + computes UkYearHint ─────────────────────

test('turn route: SELECTs date_of_birth + curriculum_pref', () => {
  // DOB drives the birthday hint; curriculum_pref drives the sibling-
  // aware "Already reused from the family profile" rendering.
  assert.match(turnSrc, /\.select\('user_id, name, child_profile, date_of_birth'\)/)
  assert.match(turnSrc, /\.select\('child_year, child_gender, boarding_pref, budget_range, top_priority, home_region, curriculum_pref'\)/)
})

test('turn route: computes siblingYearHint via buildUkYearHint + passes to runInterviewTurn', () => {
  assert.match(turnSrc, /import \{ buildUkYearHint \} from '@\/lib\/server\/research-room\/uk-school-year'/)
  assert.match(turnSrc, /const siblingYearHint = buildUkYearHint\(childRes\.data\.date_of_birth \?\? null\)/)
  assert.match(turnSrc, /runInterviewTurn\(\{[\s\S]*?siblingYearHint,/)
})

// ── Finalize route: consistency with turn route ─────────────────────

test('finalize route: SELECT includes date_of_birth for projection parity with turn', () => {
  assert.match(finalizeSrc, /\.select\('user_id, name, child_profile, date_of_birth'\)/)
})

// ── Codex r7 mods ───────────────────────────────────────────────────

test('prompt: sibling_basics branch branches on isSibling (Codex r7 P2.1)', () => {
  // pickFocus's sibling_basics gate fires for legacy first children
  // too. The "earlier child" framing would be incorrect for them. The
  // isSibling branch neutralises wording when false.
  assert.match(promptSrc, /isSibling:\s+boolean/)
  // Sibling-true branch retains the "earlier child" framing.
  assert.match(promptSrc, /BASICS opener — \$\{name\} is a sibling/)
  // Sibling-false branch must NOT claim "earlier child".
  assert.match(
    promptSrc,
    /Do NOT claim they're a sibling or reference any "earlier child"/,
  )
})

test('prompt: renderPriorFacts uses neutral copy (Codex r7 P2.1)', () => {
  // "Already reused from the family profile" → "Family preferences on
  // file"; "another sibling's profile" → "another child's profile".
  // Both shifts let the same wording apply whether this is a true
  // sibling or a legacy first child.
  assert.match(promptSrc, /Family preferences on file:/)
  assert.doesNotMatch(promptSrc, /Already reused from the family profile:/)
  assert.match(promptSrc, /from another child's profile or from parent-level defaults/)
})

test('prompt: BIRTHDAY HINT only proposes storable enum years (Codex r7 P2.4)', () => {
  // Old branch rendered Y8 / Y11 labels even when the schema can't
  // store them — invited the parent to confirm "Y8" and the LLM
  // would silently emit null. The fix gates each side on
  // currentValue/nextSeptemberValue being non-null.
  assert.match(promptSrc, /const curValue\s+= siblingYearHint\.currentValue/)
  assert.match(promptSrc, /const nextValue = siblingYearHint\.nextSeptemberValue/)
  assert.match(promptSrc, /const curSuggestable\s+= curLabel\s+&& curValue/)
  assert.match(promptSrc, /const nextSuggestable = nextLabel && nextValue/)
  // Three-way branching: both / current-only / next-only.
  // Codex r8 NIT.1: comparison uses ENUM value, not label — both Y12 and
  // Y13 map to 'sixth-form' so label-based comparison would falsely
  // trigger the "which year should I use?" branch when both options
  // collapse to the same storable value.
  assert.match(promptSrc, /if \(curSuggestable && nextSuggestable && curValue !== nextValue\)/)
  assert.match(promptSrc, /else if \(curSuggestable\)/)
  assert.match(promptSrc, /else if \(nextSuggestable\)/)
  // The next-only branch must explicitly say current year isn't a
  // search option (otherwise parent might still try Y8).
  assert.match(promptSrc, /they aren't in one of our entry-year groups[\s\S]*?Year 7, 9, 10, Sixth Form/)
})

test('prompt: tone block has positive replacements (Codex r7 NIT.2)', () => {
  // Negative bans land better when paired with positive examples.
  assert.match(promptSrc, /Words to USE:/)
  assert.match(promptSrc, /"check", "use for the search", "tell me", "is that right\?", "got it", "not sure is fine"/)
  assert.match(promptSrc, /Words to AVOID in parent-facing prose:/)
})

test('merge: parser fallback gated on priorProfile.X being null (Codex r7 P2.3)', () => {
  // Critical correctness fix. Without this gate, the parser could
  // OVERWRITE an already-known child_gender if a parent later mentions
  // "she sees a tutor" while answering a non-gender turn. The LLM is
  // the canonical correction path; the parser only fills LLM-null
  // gaps WHEN the field was missing on priorProfile to begin with.
  assert.match(
    mergeSrc,
    /const parserGender = opts\.priorProfile\.child_gender == null \? \(parserResult\?\.child_gender \?\? null\) : null/,
  )
  assert.match(
    mergeSrc,
    /const parserYear\s+= opts\.priorProfile\.child_year\s+== null \? \(parserResult\?\.child_year\s+\?\? null\) : null/,
  )
  assert.match(mergeSrc, /const resolvedGender = fields\.child_gender \?\? parserGender \?\? null/)
  assert.match(mergeSrc, /const resolvedYear\s+= fields\.child_year\s+\?\? parserYear\s+\?\? null/)
})

test('parser: GENDER_PATTERNS split into STRONG (always) + PRONOUN (context-gated) (Codex r7 P2.2)', () => {
  const parserSrc = readFile('lib/server/research-room/sibling-basics-parser.ts')
  assert.match(parserSrc, /GENDER_PATTERNS_STRONG: ReadonlyArray/)
  assert.match(parserSrc, /GENDER_PATTERNS_PRONOUN: ReadonlyArray/)
  // Pronoun-tier explicitly contains bare "he" / "him" / "she".
  assert.match(parserSrc, /\\b\(\?:he\|him\)\\b/)
  assert.match(parserSrc, /\\bshe\\b/)
  // Parser function must gate the PRONOUN tier on askedAboutGender.
  assert.match(
    parserSrc,
    /if \(child_gender == null && askedAboutGender\)[\s\S]*?for \(const \[pattern, value\] of GENDER_PATTERNS_PRONOUN\)/,
  )
})

test('parser: year patterns accept "Y 9" with space (Codex r7 NIT.1)', () => {
  const parserSrc = readFile('lib/server/research-room/sibling-basics-parser.ts')
  // y\s*N — both "y9" and "Y 9" should match. Regression guard
  // against the prior `y9` (no-space-allowed) variant.
  assert.match(parserSrc, /y\\s\*9/)
  assert.match(parserSrc, /y\\s\*10/)
  assert.match(parserSrc, /y\\s\*7/)
  assert.match(parserSrc, /y\\s\*12/)
})

test('interview: passes isSibling flag through to buildSystemPrompt (Codex r7 P2.1 wiring)', () => {
  assert.match(interviewSrc, /isSibling\?:\s+boolean/)
  assert.match(interviewSrc, /isSibling:\s+opts\.isSibling \?\? false/)
})

test('turn route: derives isSibling from a children-count probe (Codex r7 P2.1 wiring)', () => {
  assert.match(turnSrc, /let isSibling = false/)
  assert.match(
    turnSrc,
    /\.from\('children'\)[\s\S]*?\.select\('id', \{ count: 'exact', head: true \}\)[\s\S]*?\.eq\('user_id', user\.id\)/,
  )
  assert.match(turnSrc, /isSibling = \(count \?\? 0\) > 1/)
  // Passed to runInterviewTurn.
  assert.match(turnSrc, /runInterviewTurn\(\{[\s\S]*?isSibling,/)
})

// ── 5. turn/route.ts — read-preference flip + WRITABLE_PROFILE_KEYS ──

const turnSrc = readFile('app/api/research-room/build-mode/turn/route.ts')

test('turn: WRITABLE_PROFILE_KEYS includes child_gender + child_year', () => {
  // Without this, extractWritableProfile's allowlist filter drops the
  // fields before the schema parse — pickFocus would never see them
  // and the sibling_basics gate would loop forever.
  assert.match(turnSrc, /WRITABLE_PROFILE_KEYS[\s\S]*?'child_gender'/)
  assert.match(turnSrc, /WRITABLE_PROFILE_KEYS[\s\S]*?'child_year'/)
})

test('turn: brief uses childProfile gender/year ONLY (no parent_profiles fallback) — Codex r1 P1.1', () => {
  // The pre-fix code read brief = parentRes.data ?? {}. For siblings,
  // parent_profiles still carries the FIRST child's gender/year, which
  // contaminated the prompt's "Prior facts about this child" block.
  // The post-r1 fix DROPS the parent_profiles fallback entirely for
  // gender/year: blank-on-child means null-in-brief, which makes
  // renderPriorFacts skip those lines (it filters null/empty values).
  // First children's child_profile already mirrors parent_profiles
  // (the wizard copies all 14 fields on first-child create), so the
  // null-only path covers them.
  //
  // wizard-inheritance r1 — the brief construction was generalized to
  // use pickChildOnly (no parent fallback) for child_gender/year, and
  // pickInherited (child wins, parent fallback) for the 4 new family-
  // constant wizard fields. The shape changed but the SAFETY property
  // is identical: gender/year MUST NOT fall back to parent_profiles.
  assert.match(turnSrc, /const pickChildOnly\s*=\s*\(child:\s*unknown\)/)
  assert.match(turnSrc, /child_gender:\s*pickChildOnly\(childProfileRaw\.child_gender\)/)
  assert.match(turnSrc, /child_year:\s+pickChildOnly\(childProfileRaw\.child_year\)/)
  // Regression guard: the parent fallback would re-introduce P1.1 verbatim.
  assert.doesNotMatch(turnSrc, /child_gender:[^,\n]*parentRes\.data\?\.child_gender/)
  assert.doesNotMatch(turnSrc, /child_year:[^,\n]*parentRes\.data\?\.child_year/)
  assert.doesNotMatch(turnSrc, /child_gender:\s*pickInherited\(/)
  assert.doesNotMatch(turnSrc, /child_year:\s*pickInherited\(/)
})

test('turn: brief uses childProfile-first for 4 wizard family-constant fields (wizard-inheritance r1)', () => {
  // Inverse safety property — the 4 family-constant fields MUST use
  // pickInherited (child wins, parent fallback). The bug being closed:
  // turn route used to read these from parent_profiles ONLY, never
  // falling back to the child's corrected value.
  assert.match(turnSrc, /const pickInherited\s*=\s*\(child:\s*unknown,\s*parent:\s*unknown\)/)
  assert.match(turnSrc, /boarding_pref:\s*pickInherited\(childProfileRaw\.boarding_pref,\s*parentRow\.boarding_pref\)/)
  assert.match(turnSrc, /home_region:\s*pickInherited\(childProfileRaw\.home_region,\s*parentRow\.home_region\)/)
  assert.match(turnSrc, /budget_range:\s*pickInherited\(childProfileRaw\.budget_range,\s*parentRow\.budget_range\)/)
  assert.match(turnSrc, /curriculum_pref:\s*pickInherited\(childProfileRaw\.curriculum_pref,\s*parentRow\.curriculum_pref\)/)
})

test('turn: post-merge pickFocus receives the union of priorProfile + nextProfile delta', () => {
  // merge.nextProfile carries only THIS turn's changes (the RPC's `||`
  // merges into the DB row); pickFocus needs the union to see freshly-
  // captured gender/year and stop returning sibling_basics.
  assert.match(turnSrc, /const mergedProfileForFocus = \{\s*\.\.\.priorProfile,\s*\.\.\.merge\.nextProfile\s*\}/)
  assert.match(turnSrc, /pickFocus\(merge\.nextProgress,\s*mergedProfileForFocus\)/)
})

test('turn: orchestrator follow-up appendix INCLUDES sibling_basics focus (Codex r1 P1.2)', () => {
  // The LLM is known to drop terminal questions on ~50% of turns.
  // Earlier draft skipped sibling_basics here, but that meant a
  // sibling-opener turn could ship without a closing question and
  // leave the parent stuck. buildFollowUpQuestion now has a
  // SIBLING_BASICS_FOLLOW_UP that asks both basics with deflection
  // escape hatches.
  assert.match(
    turnSrc,
    /nextFocus !== 'free' &&\s*\n\s*nextFocus !== 'confirm_contradiction'\s*\n\s*\)/,
  )
  // Regression guard against re-adding the sibling_basics skip.
  assert.doesNotMatch(turnSrc, /nextFocus !== 'sibling_basics'/)
})

test('turn: extractWritableProfile has legacy-data fallback driven by parse-issue paths (wizard-inheritance r3)', () => {
  // Without this, a legacy/hand-edited child_gender='male' would empty
  // the entire priorProfile (strict zod parse is all-or-nothing) and
  // wreck the prompt context for Build Mode notes.
  //
  // wizard-inheritance impl r3 (Codex): the fallback was switched from
  // a hand-spelled `delete fallback.child_gender; delete fallback.child_year`
  // to a loop over parsed.error.issues that drops every TOP-LEVEL key
  // the strict parse flagged. This makes the fallback future-proof for
  // any field added to FIELD_DEFS (the 4 wizard fields would have been
  // missed by the rr-8 shape and a bad legacy boarding_pref enum would
  // have dropped all notes).
  assert.match(turnSrc, /legacy-data hardening/)
  assert.match(turnSrc, /const fallback: Record<string, unknown> = \{\s*\.\.\.filtered\s*\}/)
  assert.match(turnSrc, /for \(const issue of parsed\.error\.issues\)/)
  assert.match(turnSrc, /delete fallback\[topKey\]/)
})

test('turn: extractWritableProfile logs schema-drift issuePaths (Codex r2 NIT.1)', () => {
  // Silent drift was the r1 worry. r2 NIT.1 asks for issuePath logging
  // (NOT field values, to avoid dumping the whole child_profile).
  assert.match(
    turnSrc,
    /console\.warn\('\[build-mode\/turn\] extractWritableProfile schema-drift fallback'[\s\S]*?issuePaths: parsed\.error\.issues\.map\(i => i\.path\.join\('\.'\)\)/,
  )
  // Defence-in-depth: log when the fallback parse ALSO fails (would
  // mean the malformed value is on a non-basics field).
  assert.match(turnSrc, /extractWritableProfile fallback ALSO failed/)
})

test('turn: orchestrator passes mergedProfileForFocus to buildFollowUpQuestion (Codex r2 P2.1)', () => {
  // The partial-aware sibling_basics appendix relies on this — without
  // mergedProfile, the appendix degrades to SIBLING_BASICS_BOTH.
  assert.match(
    turnSrc,
    /buildFollowUpQuestion\(\{\s*childName,\s*focus:\s*nextFocus,\s*mergedProfile:\s*mergedProfileForFocus\s*\}\)/,
  )
})

// ── 6. finalize/route.ts — gender/year read-preference flip ──────────

const finalizeSrc = readFile('app/api/research-room/build-mode/finalize/route.ts')

test('finalize: WRITABLE_PROFILE_KEYS mirrors turn route allowlist for child basics', () => {
  // Consistency invariant: both routes must share the same allowlist
  // because the schema-parse step rejects any unknown key under strict.
  assert.match(finalizeSrc, /WRITABLE_PROFILE_KEYS[\s\S]*?'child_gender'/)
  assert.match(finalizeSrc, /WRITABLE_PROFILE_KEYS[\s\S]*?'child_year'/)
})

test('finalize: childGender + childYear prefer child.child_profile over parent_profiles', () => {
  // This is the load-bearing read-preference flip. The scorer receives
  // these as separate args (NOT through briefProfile), so the fallback
  // chain has to live AT the read site. The parent_profiles fallback
  // is RETAINED here (vs. the turn route, which drops it) because
  // scoreForBuildMode receives a null gender/year cleanly — it just
  // doesn't apply the gender filter or year-range scoring. For the
  // turn route, null gender/year in `brief` simply means renderPriorFacts
  // omits those lines, which is also fine. Different surface, different
  // null-handling, so the fallback choice differs (Codex r1 verified
  // scoreForBuildMode reads input.childGender/childYear, not briefProfile).
  assert.match(finalizeSrc, /const childProfileRaw = \(child\.child_profile \?\? \{\}\) as Record<string, unknown>/)
  assert.match(
    finalizeSrc,
    /const childGenderOnRow = typeof childProfileRaw\.child_gender === 'string' && childProfileRaw\.child_gender[\s\S]*?\?\s*childProfileRaw\.child_gender[\s\S]*?:\s*null/,
  )
  assert.match(
    finalizeSrc,
    /const childYearOnRow = typeof childProfileRaw\.child_year === 'string' && childProfileRaw\.child_year[\s\S]*?\?\s*childProfileRaw\.child_year[\s\S]*?:\s*null/,
  )
  assert.match(finalizeSrc, /const childGender = childGenderOnRow \?\? parentRow\?\.child_gender \?\? null/)
  assert.match(finalizeSrc, /const childYear\s+= childYearOnRow\s+\?\? parentRow\?\.child_year\s+\?\? null/)
})

test('finalize: extractWritableProfile has legacy-data fallback for malformed basics (Codex r1 Q11)', () => {
  // Same hardening as the turn route. finalize's childGender/childYear
  // reads above come from raw child_profile so the scorer still gets
  // the basics even when this schema-parse drops them.
  assert.match(finalizeSrc, /Codex r1 Q11.*?legacy-data hardening/)
  assert.match(finalizeSrc, /delete fallback\.child_gender/)
  assert.match(finalizeSrc, /delete fallback\.child_year/)
})

test('finalize: extractWritableProfile logs schema-drift issuePaths (Codex r2 NIT.1)', () => {
  // Mirror of the turn route's log so Mission Control sees drift
  // across both routes consistently.
  assert.match(
    finalizeSrc,
    /console\.warn\('\[build-mode\/finalize\] extractWritableProfile schema-drift fallback'[\s\S]*?issuePaths: parsed\.error\.issues\.map\(i => i\.path\.join\('\.'\)\)/,
  )
  assert.match(finalizeSrc, /extractWritableProfile fallback ALSO failed/)
})

// ── 7. ResearchRoom.tsx — siblingNeedsBasics derivation ──────────────

const researchRoomSrc = readFile('components/nana/ResearchRoom.tsx')

test('ResearchRoom: siblingNeedsBasics gated on fullscreen + multi-child + missing basics', () => {
  // Three gates: fullscreen (in funnel), childSummaries.length > 1 (so
  // the "reuse your family preferences" copy is accurate), AND missing
  // basics on THIS child's profile.
  assert.match(
    researchRoomSrc,
    /const siblingNeedsBasics\s+= !!\(\s*\n\s*fullscreenBuildMode &&\s*\n\s*currentChildProfile &&\s*\n\s*childSummaries\.length > 1 &&\s*\n\s*\(!currentChildProfile\.child_gender \|\| !currentChildProfile\.child_year\)\s*\n\s*\)/,
  )
})

test('ResearchRoom: passes siblingNeedsBasics prop to ResearchRoomChat', () => {
  assert.match(researchRoomSrc, /siblingNeedsBasics=\{siblingNeedsBasics\}/)
})

// ── 8. ResearchRoomChat.tsx — prop plumbing + signage paragraph ──────

const chatSrc = readFile('components/nana/ResearchRoomChat.tsx')

test('ResearchRoomChat: outer Props type declares siblingNeedsBasics', () => {
  assert.match(chatSrc, /siblingNeedsBasics\?:\s+boolean/)
})

test('ResearchRoomChat: outer component defaults siblingNeedsBasics to false', () => {
  // Default keeps back-compat for any other embedder of this component.
  assert.match(chatSrc, /siblingNeedsBasics = false/)
})

test('ResearchRoomChat: ChatBody destructures + types siblingNeedsBasics', () => {
  assert.match(chatSrc, /function ChatBody\([\s\S]*?siblingNeedsBasics,[\s\S]*?\}: \{/)
  // Body type declaration (required, not optional — outer component
  // provides the default so ChatBody always receives a boolean).
  assert.match(chatSrc, /siblingNeedsBasics:\s+boolean/)
})

test('ResearchRoomChat: ChatBody invocations forward siblingNeedsBasics (desktop + mobile)', () => {
  const matches = chatSrc.match(/<ChatBody[^>]*siblingNeedsBasics=\{siblingNeedsBasics\}/g) ?? []
  assert.equal(
    matches.length,
    2,
    `expected ChatBody invocations to forward siblingNeedsBasics on BOTH desktop and mobile (got ${matches.length})`,
  )
})

// ── 9. Basics chip-strip wiring (2026-05-21 chip-strip pass) ─────────
//
// Browser smoke surfaced two UX issues with the original gender/year
// fix: (a) the % bar stayed at 0 while the parent answered the basics,
// reading as "broken", and (b) when the LLM re-asked after a non-
// answer, the parent had no signal which field was still missing. The
// chip-strip replaces the % on sibling_basics turns and flips chips
// from ⋯ to ✓ as each basic is captured — visible feedback that
// shares state via the SSE diff (immediate) and via the
// siblingBasicsCaptured prop (initial seed for reloads).

const progressBarSrc = readFile('components/nana/BuildModeProgressBar.tsx')
const progressBarCss = readFile('components/nana/research-room.css')

test('ProgressBar: accepts optional basics prop seeded from child_profile', () => {
  assert.match(progressBarSrc, /basics\?: \{ gender: boolean; year: boolean \}/)
})

test('ProgressBar: useState seeded from basics prop with safe defaults', () => {
  assert.match(progressBarSrc, /useState\(basics\?\.gender \?\? false\)/)
  assert.match(progressBarSrc, /useState\(basics\?\.year\s+\?\? false\)/)
})

test('ProgressBar: live updates from lastDiff.set when child_gender/child_year ship', () => {
  // The SSE diff flips the chip the instant the turn route reports the
  // field was set — without this, the chip wouldn't update until the
  // next router.refresh round-trip lands the new profile.
  assert.match(
    progressBarSrc,
    /useEffect\([\s\S]*?if \(lastDiff\.set\.includes\('child_gender'\)\) setGenderCaptured\(true\)[\s\S]*?if \(lastDiff\.set\.includes\('child_year'\)\)\s+setYearCaptured\(true\)[\s\S]*?\}, \[lastDiff\]\)/,
  )
})

test('ProgressBar: captured state is monotonic (only flips true, never reverts)', () => {
  // A late prop refresh with `false` mustn't un-capture state advanced
  // by the SSE diff — the local state is the source of truth once
  // forward progress has been made. Verify the prop-sync effect is
  // gated on truthy values.
  assert.match(
    progressBarSrc,
    /useEffect\([\s\S]*?if \(basics\?\.gender\) setGenderCaptured\(true\)[\s\S]*?if \(basics\?\.year\)\s+setYearCaptured\(true\)/,
  )
})

test('ProgressBar: head renders chip strip ONLY when focus === sibling_basics', () => {
  // The whole point of the chip strip is to give a parent feedback on
  // a turn where usable_total === 0. On regular target turns the %
  // stays — it's the meaningful metric.
  assert.match(progressBarSrc, /const inSiblingBasics = focus === 'sibling_basics'/)
  assert.match(progressBarSrc, /\{inSiblingBasics \? \([\s\S]*?rr-build-progress-basics[\s\S]*?\) : \([\s\S]*?rr-build-progress-pct/)
})

test('ProgressBar: FOCUS_HEADING includes a sibling_basics entry', () => {
  // Heading reads "Capturing the basics first" so the parent has
  // context for what the chips below mean.
  assert.match(progressBarSrc, /sibling_basics:\s+'Capturing the basics first'/)
})

test('ProgressBar: chip strip uses role=status + sr-only text node (Codex r5 P2.4)', () => {
  // Earlier draft used aria-label on the chip-strip container inside
  // aria-live. Many AT stacks announce live-region TEXT mutations but
  // NOT aria-label attribute changes, so the announcement was
  // unreliable. role="status" carries implicit aria-live="polite"
  // and the .rr-sr-only text node gives the AT an actual text
  // mutation to announce.
  assert.match(progressBarSrc, /role="status"/)
  assert.match(progressBarSrc, /<span className="rr-sr-only">/)
  // Wording change per Codex r5: "captured / pending" instead of
  // "yes / still needed" — reads more naturally to screen-reader users.
  assert.match(
    progressBarSrc,
    /`Basics captured: year group \$\{yearCaptured \? 'captured' : 'pending'\}, gender \$\{genderCaptured \? 'captured' : 'pending'\}\.`/,
  )
  // Regression guard — aria-label-on-live-region pattern should not
  // come back.
  assert.doesNotMatch(progressBarSrc, /className="rr-build-progress-basics"\s+aria-live=/)
})

test('ProgressBar: basicsComplete guard suppresses chip strip + falls back to neutral heading (Codex r5 P2.2)', () => {
  // SSE event reports `focus: turn.focus` (pre-merge), so when the
  // parent answers BOTH basics in one turn, server still says
  // focus='sibling_basics' until the next user turn. Without this
  // guard the chip strip would stay visible with both chips ✓ and
  // the head would read "Capturing the basics first" — stale UI.
  // The local guard falls through to the 'free' heading + shows %.
  assert.match(
    progressBarSrc,
    /const basicsComplete = genderCaptured && yearCaptured/,
  )
  assert.match(
    progressBarSrc,
    /const inSiblingBasics = focus === 'sibling_basics' && !basicsComplete/,
  )
  assert.match(
    progressBarSrc,
    /const displayFocus = \(focus === 'sibling_basics' && basicsComplete\) \? 'free' : focus/,
  )
  assert.match(progressBarSrc, /const displayHeading = FOCUS_HEADING\[displayFocus\] \?\? FOCUS_HEADING\.free/)
  // The JSX renders displayHeading, not the raw heading.
  assert.match(progressBarSrc, /\{ready \? 'Ready when you are' : displayHeading\}/)
  // Regression guard against re-introducing the dead `heading` variable.
  assert.doesNotMatch(progressBarSrc, /const heading = FOCUS_HEADING\[focus\] \?\? FOCUS_HEADING\.free/)
})

test('ProgressBar: FIELD_LABEL covers all writable basics + learnedFields suppresses them (Codex r5 P2.1)', () => {
  // Without these labels the "Nana learned" line would render raw
  // keys ("Nana learned: child_gender, child_year"). The SUPPRESS set
  // hides them entirely since the chip strip already gives that
  // signal — showing the same fact in two places is redundant.
  assert.match(progressBarSrc, /child_gender:\s+'gender'/)
  assert.match(progressBarSrc, /child_year:\s+'year group'/)
  assert.match(progressBarSrc, /const SUPPRESS_FROM_LEARNED = new Set\(\['child_gender', 'child_year'\]\)/)
  assert.match(
    progressBarSrc,
    /Array\.from\(new Set\(\[\.\.\.lastDiff\.set, \.\.\.lastDiff\.appended\]\)\)\s*\.filter\(f => !SUPPRESS_FROM_LEARNED\.has\(f\)\)/,
  )
})

test('ProgressBar CSS: chip-strip classes defined with monotonic captured-state styling', () => {
  // The captured state's distinct visual (teal-tinted bg) is what
  // makes the ✓ chip read as "done" vs the muted ⋯ chip — without
  // this class the chip flip wouldn't read as progress.
  assert.match(progressBarCss, /\.rr-build-progress-basics \{/)
  assert.match(progressBarCss, /\.rr-build-progress-basic-chip \{/)
  assert.match(progressBarCss, /\.rr-build-progress-basic-chip\.is-captured \{/)
  assert.match(progressBarCss, /\.rr-build-progress-basic-chip-mark \{/)
  assert.match(progressBarCss, /\.rr-build-progress-basic-divider \{/)
})

test('ProgressBar CSS: progress head wraps on narrow viewports (Codex r5 P2.3)', () => {
  // No-wrap flex head would overflow on narrow mobile widths because
  // "Capturing the basics first" + 2 chips can exceed ~360px. flex-wrap
  // lets the chip strip drop to a second line rather than clip.
  assert.match(
    progressBarCss,
    /\.rr-build-progress-head \{[\s\S]*?flex-wrap: wrap;[\s\S]*?\}/,
  )
})

test('ProgressBar CSS: color-mix has hex fallbacks for older browsers (Codex r5 NIT)', () => {
  // color-mix() is Chrome 111+ / Safari 16.2+ / Firefox 113+. Hex
  // fallback paints the intended teal tint on older browsers without
  // requiring the new CSS feature.
  assert.match(
    progressBarCss,
    /\.rr-build-progress-basic-chip\.is-captured \{[\s\S]*?background:\s+#dff5ed;[\s\S]*?background:\s+color-mix/,
  )
  assert.match(
    progressBarCss,
    /\.rr-build-progress-basic-chip\.is-captured \{[\s\S]*?border-color:\s+#87cdbb;[\s\S]*?border-color:\s+color-mix/,
  )
})

test('ProgressBar CSS: .rr-sr-only utility class defined (Codex r5 P2.4)', () => {
  // The chip strip's role=status uses a .rr-sr-only span to give AT
  // a real text node to announce on capture transitions. Standard
  // sr-only clip pattern.
  assert.match(progressBarCss, /\.rr-sr-only \{[\s\S]*?clip: rect\(0, 0, 0, 0\)/)
})

test('ResearchRoom: derives siblingBasicsCaptured + passes to ResearchRoomChat', () => {
  // Seed comes from THIS child's profile (NOT parent_profiles, which
  // would carry first-child values for siblings — that's the whole
  // bug this fix exists to close).
  assert.match(
    researchRoomSrc,
    /const siblingBasicsCaptured = \{\s*gender: !!currentChildProfile\?\.child_gender,\s*year:\s+!!currentChildProfile\?\.child_year,?\s*\}/,
  )
  assert.match(researchRoomSrc, /siblingBasicsCaptured=\{siblingBasicsCaptured\}/)
})

test('ResearchRoomChat: props + ChatBody invocations forward siblingBasicsCaptured to BuildModeProgressBar', () => {
  // Prop type defined on the outer component.
  assert.match(chatSrc, /siblingBasicsCaptured\?:\s*\{\s*gender: boolean;\s*year: boolean\s*\}/)
  // Default keeps back-compat for embedders that don't pass it.
  assert.match(chatSrc, /siblingBasicsCaptured = \{ gender: false, year: false \}/)
  // ChatBody body type — required, not optional (outer provides default).
  assert.match(chatSrc, /siblingBasicsCaptured: \{ gender: boolean; year: boolean \}/)
  // Both ChatBody invocations forward it.
  const chatBodyMatches = chatSrc.match(/<ChatBody[^>]*siblingBasicsCaptured=\{siblingBasicsCaptured\}/g) ?? []
  assert.equal(chatBodyMatches.length, 2, `expected ChatBody invocations to forward siblingBasicsCaptured on BOTH desktop and mobile (got ${chatBodyMatches.length})`)
  // BuildModeProgressBar receives it via the `basics` prop.
  assert.match(chatSrc, /<BuildModeProgressBar[\s\S]*?basics=\{siblingBasicsCaptured\}/)
})

test('ResearchRoomChat: welcome bubble swaps in renderSiblingBasicsOpener when basics missing (proactive opener)', () => {
  // Browser smoke caught that the generic "Tell me about your child
  // first" lead did NOT lead with the basics question — parents typed
  // an unrelated message and only got the gender/year ask AFTER one
  // round-trip. Fix: when siblingNeedsBasics, the welcome bubble uses
  // renderSiblingBasicsOpener() which puts the actual question first.
  assert.match(chatSrc, /siblingNeedsBasics\s*\?\s*renderSiblingBasicsOpener\(/)
  // The function exists and is defined client-side.
  assert.match(chatSrc, /function renderSiblingBasicsOpener\(args: \{/)
  // Reused-preferences signage still leads.
  assert.match(chatSrc, /I.{0,3}ve reused your family preferences from your earlier child:\s*region, boarding, budget, and curriculum/)
  // The actual question line — short, parent-friendly, ends with "?".
  assert.match(chatSrc, /Quick one before we dive in/)
  // Regression guard against the old wizardy phrasing.
  assert.doesNotMatch(chatSrc, /5-question wizard is skipped/)
  assert.doesNotMatch(chatSrc, /couple of basics/)
})

test('ResearchRoomChat: renderSiblingBasicsOpener has three DOB-hint branches + plain fallback', () => {
  // Mirrors the server-side branching in build-mode-prompt.ts so Nana
  // sounds the same whether the opener is this client-side welcome
  // bubble or a streamed LLM turn.
  assert.match(chatSrc, /const hint = buildUkYearHint\(args\.dob \?\? null\)/)
  // Both storable + different enum.
  assert.match(chatSrc, /if \(curSuggestable && nextSuggestable && curValue !== nextValue\)/)
  // Current storable only.
  assert.match(chatSrc, /else if \(curSuggestable\)/)
  // Next September storable only (current is e.g. Y8/Y11).
  assert.match(chatSrc, /else if \(nextSuggestable\)/)
  // Plain fallback — no DOB or fully out-of-band.
  assert.match(chatSrc, /Year 7, Year 9, Year 10, or Sixth Form\?/)
})

test('ResearchRoomChat: outer Props type declares siblingActiveChildName + siblingActiveChildDob', () => {
  assert.match(chatSrc, /siblingActiveChildName\?: string \| null/)
  assert.match(chatSrc, /siblingActiveChildDob\?:\s+string \| null/)
})

test('ResearchRoomChat: ChatBody invocations forward siblingActiveChildName + Dob (desktop + mobile)', () => {
  const matches = chatSrc.match(/<ChatBody[^>]*siblingActiveChildName=\{siblingActiveChildName\}/g) ?? []
  assert.equal(matches.length, 2, `expected ChatBody invocations to forward siblingActiveChildName on BOTH desktop and mobile (got ${matches.length})`)
  const dobMatches = chatSrc.match(/<ChatBody[^>]*siblingActiveChildDob=\{siblingActiveChildDob\}/g) ?? []
  assert.equal(dobMatches.length, 2)
})

test('ResearchRoom: passes currentChild.name + date_of_birth to ResearchRoomChat for proactive opener', () => {
  assert.match(researchRoomSrc, /siblingActiveChildName=\{currentChild\?\.name \?\? null\}/)
  assert.match(researchRoomSrc, /siblingActiveChildDob=\{currentChild\?\.date_of_birth \?\? null\}/)
})

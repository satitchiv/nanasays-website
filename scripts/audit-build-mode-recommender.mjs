// audit-build-mode-recommender.mjs
//
// Standalone trace harness for the Build Mode comparison-table
// recommender (`scoreForBuildMode`). NO LLM call, NO production
// impact — just runs the scorer against a real parent's profile and
// dumps the top N candidates with their score breakdown.
//
// Born from the 2026-05-21 chat-quality audit. Codex flagged 7
// concrete bugs + a bunch of ignored inputs. This harness lets us
// see for each real test parent (Maya / Sam / yoko etc.) exactly
// which schools the recommender ranks highest and why — so we can
// confirm bug impact with real data instead of guessing.
//
// Usage:
//   cd ~/nanasays/website
//   node --experimental-strip-types \
//        --import ./lib/server/_test-stub-server-only.mjs \
//        scripts/audit-build-mode-recommender.mjs <child_name>
//
// Optional overrides via env vars (Codex's diagnostic variations):
//   AUDIT_HOME_REGION=anywhere       (toggle region dominance test)
//   AUDIT_DROP_SPORTS=1              (drop all sports interest)
//   AUDIT_DROP_FIRST_SPORT=1         (drop the first sport only)
//   AUDIT_LIMIT=20                   (top-N to print; default 20)
//
// Example:
//   node --experimental-strip-types \
//        --import ./lib/server/_test-stub-server-only.mjs \
//        scripts/audit-build-mode-recommender.mjs Maya

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Match backfill-build-mode-chat-logs.mjs's loader — the website is a
// Next app so dotenv isn't installed; read .env.local directly.
function loadEnvFile() {
  try {
    const raw = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 0) continue
      const key = trimmed.slice(0, eq).trim()
      let val = trimmed.slice(eq + 1).trim()
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
      if (!(key in process.env)) process.env[key] = val
    }
  } catch {
    console.error('Could not read .env.local — falling back to process.env')
  }
}
loadEnvFile()

const childArg = process.argv[2]
if (!childArg) {
  console.error('Usage: node ... scripts/audit-build-mode-recommender.mjs <child_name>')
  process.exit(1)
}

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.EDUWORLD_SUPABASE_URL
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.EDUWORLD_SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in env (.env.local).')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
})

const { scoreForBuildMode } = await import('../lib/research-room/score-for-build-mode.ts')

// 2026-05-24 Codex r1 finding #1 — harness parity with production finalize.
// Optionally call the same LLM classifier production calls at finalize:461.
// Default OFF (keeps the "no LLM" promise in the original header). Opt-in
// via AUDIT_USE_CLASSIFIER=1 to see real production behaviour including
// parent_drill_focus / pastoral_priority / small_env_pref / boarding-from-prose.
let classifyBuildModeIntent = null
if (process.env.AUDIT_USE_CLASSIFIER === '1') {
  ;({ classifyBuildModeIntent } = await import('../lib/server/research-room/classify-build-mode-intent.ts'))
}

// ── 1. Load the child + parent profile from DB ─────────────────────

const { data: childRows, error: childErr } = await supabase
  .from('children')
  .select('id, name, date_of_birth, user_id, child_profile, is_archived')
  .ilike('name', childArg)
  .eq('is_archived', false)
  .order('created_at', { ascending: false })
  .limit(1)
if (childErr || !childRows || childRows.length === 0) {
  console.error(`Child "${childArg}" not found (or all archived). Error:`, childErr?.message)
  process.exit(1)
}
const child = childRows[0]

const { data: parentRow, error: parentErr } = await supabase
  .from('parent_profiles')
  .select('home_region, child_gender, child_year, boarding_pref, budget_range, top_priority, curriculum_pref, class_size_pref, sen_need, ethos_pref, lgbtq_pref, pastoral_pref')
  .eq('id', child.user_id)
  .maybeSingle()
if (parentErr) {
  console.error('Parent profile lookup failed:', parentErr.message)
  process.exit(1)
}

// ── 2. Apply Codex's variation toggles ─────────────────────────────

const childProfileRaw = { ...(child.child_profile ?? {}) }
const briefRaw = parentRow ? { ...parentRow } : {}

// Prefer child_profile basics over parent_profiles, mirroring turn route.
const childGender = (typeof childProfileRaw.child_gender === 'string' && childProfileRaw.child_gender)
  ? childProfileRaw.child_gender
  : (briefRaw.child_gender ?? null)
const childYear = (typeof childProfileRaw.child_year === 'string' && childProfileRaw.child_year)
  ? childProfileRaw.child_year
  : (briefRaw.child_year ?? null)

// 2026-05-24 Codex r1 finding #1 — child-profile overlay for family constants.
// Mirrors production finalize at app/api/research-room/build-mode/finalize/route.ts:383-389.
// pickInherited: child value when present, else parent value.
const pickInherited = (childVal, parentVal) => {
  if (typeof childVal  === 'string' && childVal)  return childVal
  if (typeof parentVal === 'string' && parentVal) return parentVal
  return null
}
if (parentRow != null) {
  briefRaw.boarding_pref   = pickInherited(childProfileRaw.boarding_pref,   briefRaw.boarding_pref)
  briefRaw.home_region     = pickInherited(childProfileRaw.home_region,     briefRaw.home_region)
  briefRaw.budget_range    = pickInherited(childProfileRaw.budget_range,    briefRaw.budget_range)
  briefRaw.curriculum_pref = pickInherited(childProfileRaw.curriculum_pref, briefRaw.curriculum_pref)
}
const overlayApplied = parentRow != null && (
  (typeof childProfileRaw.boarding_pref   === 'string' && childProfileRaw.boarding_pref)   ||
  (typeof childProfileRaw.home_region     === 'string' && childProfileRaw.home_region)     ||
  (typeof childProfileRaw.budget_range    === 'string' && childProfileRaw.budget_range)    ||
  (typeof childProfileRaw.curriculum_pref === 'string' && childProfileRaw.curriculum_pref)
)

// Variation: AUDIT_HOME_REGION=anywhere
let overrideHomeRegion = null
if (process.env.AUDIT_HOME_REGION) {
  overrideHomeRegion = process.env.AUDIT_HOME_REGION
  briefRaw.home_region = overrideHomeRegion
}

// Variation: drop sports
let droppedSports = []
if (process.env.AUDIT_DROP_SPORTS) {
  droppedSports = Array.isArray(childProfileRaw.interests_sports) ? [...childProfileRaw.interests_sports] : []
  childProfileRaw.interests_sports = []
} else if (process.env.AUDIT_DROP_FIRST_SPORT) {
  const list = Array.isArray(childProfileRaw.interests_sports) ? [...childProfileRaw.interests_sports] : []
  if (list.length > 0) {
    droppedSports = [list[0]]
    childProfileRaw.interests_sports = list.slice(1)
  }
}

const limit = parseInt(process.env.AUDIT_LIMIT ?? '20', 10)

// ── 3. Print the brief context ─────────────────────────────────────

console.log('═'.repeat(80))
console.log(`Child:        ${child.name}  (id: ${child.id})`)
console.log(`DOB:          ${child.date_of_birth ?? '(none)'}`)
console.log(`Gender:       ${childGender ?? '(none)'}`)
console.log(`Year:         ${childYear ?? '(none)'}`)
console.log('─'.repeat(80))
console.log('Parent brief (from parent_profiles):')
for (const k of ['home_region', 'boarding_pref', 'budget_range', 'curriculum_pref', 'top_priority', 'class_size_pref', 'sen_need', 'ethos_pref', 'lgbtq_pref', 'pastoral_pref']) {
  console.log(`  ${k.padEnd(22)} ${briefRaw[k] ?? '(none)'}`)
}
if (overrideHomeRegion) console.log(`  [OVERRIDE: home_region=${overrideHomeRegion}]`)
if (overlayApplied) console.log(`  [overlay: child_profile family-constant fields applied]`)
console.log('─'.repeat(80))
console.log('Build Mode child_profile (interview output):')
console.log(`  goal_orientation       ${childProfileRaw.goal_orientation ?? '(none)'}`)
console.log(`  interests_sports       ${JSON.stringify(childProfileRaw.interests_sports ?? [])}`)
console.log(`  interests_arts         ${JSON.stringify(childProfileRaw.interests_arts ?? [])}`)
console.log(`  nonnegotiables         ${JSON.stringify(childProfileRaw.nonnegotiables ?? [])}`)
console.log(`  personality_notes      ${childProfileRaw.personality_notes ? '(' + String(childProfileRaw.personality_notes).slice(0, 60) + '…)' : '(none)'}`)
console.log(`  anchors_notes          ${childProfileRaw.anchors_notes ? '(' + String(childProfileRaw.anchors_notes).slice(0, 60) + '…)' : '(none)'}`)
console.log(`  child_wants            ${childProfileRaw.child_wants ? '(' + String(childProfileRaw.child_wants).slice(0, 60) + '…)' : '(none)'}`)
console.log(`  academic_notes         ${childProfileRaw.academic_notes ? '(' + String(childProfileRaw.academic_notes).slice(0, 60) + '…)' : '(none)'}`)
console.log(`  goals_notes            ${childProfileRaw.goals_notes ? '(' + String(childProfileRaw.goals_notes).slice(0, 60) + '…)' : '(none)'}`)
if (droppedSports.length > 0) console.log(`  [OVERRIDE: dropped sports = ${JSON.stringify(droppedSports)}]`)
console.log('═'.repeat(80))
console.log('')

// ── 4. Build scorer input + run it ─────────────────────────────────

// Use briefRaw (the override-mutated copy), not parentRow (the immutable DB row),
// so AUDIT_HOME_REGION et al actually reach the scorer.
const briefProfile = parentRow ? briefRaw : null  // shape matches BriefProfile

// Mirror the turn route's WRITABLE_PROFILE_KEYS filter so the scorer
// sees the same shape it does in production.
const WRITABLE = ['personality_notes', 'anchors_notes', 'academic_notes', 'goals_notes', 'child_wants', 'nonnegotiables', 'goal_orientation', 'interests_sports', 'interests_arts', 'child_gender', 'child_year']
const childInput = {}
for (const k of WRITABLE) {
  if (childProfileRaw[k] != null) childInput[k] = childProfileRaw[k]
}

// 2026-05-24 Codex r1 finding #1 — intent passing parity with production.
// Production finalize classifies and passes `intent` (route.ts:461 + :490).
// In the harness we either:
//   - skip (legacy "no LLM" mode, default) → intent=null
//   - call classifier with 5 prose fields → real production intent
//   - read mocked intent from AUDIT_FAKE_INTENT env (JSON) for deterministic tests
let buildModeIntent = null
const strOrNull = (v) => typeof v === 'string' ? v : null
if (process.env.AUDIT_FAKE_INTENT) {
  try {
    buildModeIntent = JSON.parse(process.env.AUDIT_FAKE_INTENT)
  } catch (e) {
    console.warn('AUDIT_FAKE_INTENT JSON parse failed — proceeding with intent=null:', e.message)
  }
} else if (classifyBuildModeIntent != null) {
  console.log('Calling classifyBuildModeIntent (AUDIT_USE_CLASSIFIER=1)…')
  const tIntent = Date.now()
  buildModeIntent = await classifyBuildModeIntent({
    academic_notes:    strOrNull(childProfileRaw.academic_notes),
    goals_notes:       strOrNull(childProfileRaw.goals_notes),
    personality_notes: strOrNull(childProfileRaw.personality_notes),
    child_wants:       strOrNull(childProfileRaw.child_wants),
    anchors_notes:     strOrNull(childProfileRaw.anchors_notes),
  })
  console.log(`Intent classified in ${Date.now() - tIntent} ms:`)
  for (const k of Object.keys(buildModeIntent ?? {})) {
    if (k === 'classification_version') continue
    console.log(`  ${k.padEnd(28)} ${buildModeIntent[k]}`)
  }
  console.log('─'.repeat(80))
}

const t0 = Date.now()
const result = await scoreForBuildMode(supabase, {
  parent:       briefProfile,
  child:        childInput,
  excludeSlugs: [],     // empty so we see what WOULD have been recommended fresh
  childGender,
  childYear,
  intent:       buildModeIntent,
}, limit)
const elapsed = Date.now() - t0

console.log(`Scorer result: ${result.reason}  ·  ${result.candidates.length} candidates  ·  ${elapsed} ms`)
console.log('')

if (result.candidates.length === 0) {
  console.log('NO CANDIDATES. Reason:', result.reason)
  process.exit(0)
}

// ── 5. Pretty-print top N ──────────────────────────────────────────

// Pull supplemental display fields for the top candidates so the
// audit shows region/gender/curriculum/fees alongside the score.
const slugs = result.candidates.map(c => c.slug)
const { data: detailRows } = await supabase
  .from('schools')
  .select('slug, region, gender_split, age_min, age_max, curriculum, fees_usd_min, confidence_score')
  .in('slug', slugs)
const detailBySlug = new Map((detailRows ?? []).map(r => [r.slug, r]))

console.log('Rank  Score    Name                                          Region          Gender     Year-band    Curric       Fees(USD)  Signals')
console.log('─'.repeat(180))
for (let i = 0; i < result.candidates.length; i++) {
  const c = result.candidates[i]
  const d = detailBySlug.get(c.slug) ?? {}
  const rank = String(i + 1).padStart(4, ' ')
  const score = c.total_score.toFixed(2).padStart(7, ' ')
  const name = (c.name ?? c.slug).padEnd(45).slice(0, 45)
  const region = String(d.region ?? '(none)').padEnd(15).slice(0, 15)
  const gender = String(d.gender_split ?? '(none)').padEnd(10).slice(0, 10)
  const yearband = `${d.age_min ?? '?'}-${d.age_max ?? '?'}`.padEnd(12).slice(0, 12)
  const curric = JSON.stringify(d.curriculum ?? []).padEnd(12).slice(0, 12)
  const fees = d.fees_usd_min != null ? String(d.fees_usd_min).padStart(10, ' ') : '(none)    '
  const signals = c.signals.join(', ')
  console.log(`${rank}  ${score}  ${name} ${region} ${gender} ${yearband} ${curric} ${fees}  ${signals}`)
}
console.log('')
console.log(`Top-${result.candidates.length} rationale_seed lines:`)
for (let i = 0; i < Math.min(5, result.candidates.length); i++) {
  console.log(`  ${i + 1}. ${result.candidates[i].rationale_seed}`)
}
console.log('')

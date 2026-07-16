// seed-research-room-test-session.mjs
//
// One-off seed script for the Research Room comparison-grid redesign
// (2026-07-16). Creates ONE real, authenticated test child + a 5-school
// shortlist under the existing dev/test account, so the redesigned
// ComparisonView can be judged against real data instead of the empty
// state or the old fictional PLACEHOLDER_DATA.
//
// Safety notes (read before re-running):
//   - Target project: NanaSays standalone-app Supabase (id ckofdbjfbxoxxxtedmqa),
//     the only Supabase project this repo's .env.local points at
//     (NEXT_PUBLIC_SUPABASE_URL). There is no separate dev/prod split for
//     this app today.
//   - Verified before writing: only the demo account and the dev/test
//     account (set via NANA_DEV_BYPASS_USER_ID in .env.local) exist, no
//     real paying customers yet. The dev/test account already has several
//     "-test" suffixed children used for manual QA — this script follows
//     that exact convention rather than inventing a new user or touching
//     an existing child/shortlist.
//   - ADDITIVE ONLY: this script only INSERTs one new children row + up to
//     5 new shortlisted_schools rows scoped to that new child_id. It never
//     updates/deletes any existing row, and never touches parent_profiles
//     (so it does NOT change which child is "active" for the founder's own
//     session — see "How to view it" below).
//   - Idempotent-ish: re-running skips creating a duplicate child if one
//     with the exact TEST_CHILD_NAME already exists for TEST_USER_ID, and
//     upserts (on conflict do nothing) the shortlist rows.
//
// Usage:
//   cd ~/nanasays/website
//   node scripts/seed-research-room-test-session.mjs
//
// After running, open Research Room, switch the active child to
// "Redesign-test" (child switcher in the sidebar), and the comparison grid
// will seed itself on that page load (page.tsx calls
// ensure_research_session_for_child + seedResearchSession automatically —
// no further script action needed).

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY in env (.env.local).')
  process.exit(1)
}

// Guardrail: this script is only meant for the sanctioned NanaSays project.
// If .env.local ever points somewhere else, refuse to run rather than guess.
const EXPECTED_PROJECT_REF = 'ckofdbjfbxoxxxtedmqa'
if (!SUPABASE_URL.includes(EXPECTED_PROJECT_REF)) {
  console.error(
    `Refusing to run: NEXT_PUBLIC_SUPABASE_URL (${SUPABASE_URL}) does not match the ` +
    `expected NanaSays project (${EXPECTED_PROJECT_REF}). If this is intentional, update ` +
    'this guard after re-confirming it is not a production customer database.'
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// The dev/test account — same one used by scripts/nana-smoke-driver.mjs,
// and the account that already holds every other "-test" child.
const TEST_USER_ID = process.env.NANA_DEV_BYPASS_USER_ID
if (!TEST_USER_ID) {
  console.error('Refusing to run: set NANA_DEV_BYPASS_USER_ID in .env.local first.')
  process.exit(1)
}
const TEST_CHILD_NAME = 'Redesign-test'

// Five real UK girls' boarding schools already in `schools`, each verified
// (query run 2026-07-16) to have hero_image, logo_url, AND
// school_structured_data (fees_min/max + exam_results) populated — so the
// redesigned grid has real images + real numeric rows to render, not gaps.
const SCHOOL_SLUGS = [
  'wycombe-abbey',
  'benenden-school',
  'roedean-school',
  'cheltenham-ladies-college',
  'downe-house-school',
]

async function main() {
  console.log(`Target project: ${SUPABASE_URL}`)
  console.log(`Test user: ${TEST_USER_ID}`)

  // 1. Confirm the target user actually exists (auth.users) before writing
  //    anything under their id.
  const { data: authUser, error: authErr } = await supabase.auth.admin.getUserById(TEST_USER_ID)
  if (authErr || !authUser?.user) {
    console.error(`Refusing to run: TEST_USER_ID ${TEST_USER_ID} not found in auth.users.`, authErr?.message)
    process.exit(1)
  }
  console.log(`Confirmed auth user: ${authUser.user.email}`)

  // 2. Confirm all 5 target schools exist with the image + structured-data
  //    columns this task is meant to exercise. Fail loudly (not silently)
  //    if any slug is missing — better to fix the slug list than seed a
  //    shortlist with a dangling school_slug.
  const { data: schoolRows, error: schoolsErr } = await supabase
    .from('schools')
    .select('slug, name, hero_image, logo_url')
    .in('slug', SCHOOL_SLUGS)
  if (schoolsErr) {
    console.error('schools read failed:', schoolsErr.message)
    process.exit(1)
  }
  const foundSlugs = new Set((schoolRows ?? []).map(s => s.slug))
  const missing = SCHOOL_SLUGS.filter(s => !foundSlugs.has(s))
  if (missing.length > 0) {
    console.error(`Refusing to run: missing school slugs in \`schools\`: ${missing.join(', ')}`)
    process.exit(1)
  }
  for (const s of schoolRows) {
    const flags = [s.hero_image ? 'hero✓' : 'hero✗', s.logo_url ? 'logo✓' : 'logo✗'].join(' ')
    console.log(`  school: ${s.slug} (${s.name}) — ${flags}`)
  }

  // 3. Find-or-create the test child. Idempotent: re-running the script
  //    reuses the existing child_id instead of creating a duplicate.
  const { data: existingChild, error: findChildErr } = await supabase
    .from('children')
    .select('id')
    .eq('user_id', TEST_USER_ID)
    .eq('name', TEST_CHILD_NAME)
    .maybeSingle()
  if (findChildErr) {
    console.error('children read failed:', findChildErr.message)
    process.exit(1)
  }

  let childId = existingChild?.id ?? null
  if (childId) {
    console.log(`Reusing existing child "${TEST_CHILD_NAME}" (${childId}).`)
  } else {
    const { data: newChild, error: insertChildErr } = await supabase
      .from('children')
      .insert({
        user_id: TEST_USER_ID,
        name: TEST_CHILD_NAME,
        child_profile: {},
        funnel_state: 'onboarding',
      })
      .select('id')
      .single()
    if (insertChildErr) {
      console.error('children insert failed:', insertChildErr.message)
      process.exit(1)
    }
    childId = newChild.id
    console.log(`Created child "${TEST_CHILD_NAME}" (${childId}).`)
  }

  // 4. Shortlist the 5 schools under this child. ON CONFLICT DO NOTHING via
  //    upsert(ignoreDuplicates) — safe to re-run.
  const shortlistRows = SCHOOL_SLUGS.map(school_slug => ({
    user_id: TEST_USER_ID,
    child_id: childId,
    school_slug,
  }))
  const { data: inserted, error: shortlistErr } = await supabase
    .from('shortlisted_schools')
    .upsert(shortlistRows, { onConflict: 'user_id,child_id,school_slug', ignoreDuplicates: true })
    .select('school_slug')
  if (shortlistErr) {
    // Fallback: the table may not have a unique constraint matching that
    // onConflict target. Check what's already there and insert only the gap.
    console.warn('shortlist upsert failed, falling back to read-then-insert:', shortlistErr.message)
    const { data: existingShortlist } = await supabase
      .from('shortlisted_schools')
      .select('school_slug')
      .eq('user_id', TEST_USER_ID)
      .eq('child_id', childId)
    const already = new Set((existingShortlist ?? []).map(r => r.school_slug))
    const toInsert = shortlistRows.filter(r => !already.has(r.school_slug))
    if (toInsert.length > 0) {
      const { error: fallbackErr } = await supabase.from('shortlisted_schools').insert(toInsert)
      if (fallbackErr) {
        console.error('shortlist fallback insert failed:', fallbackErr.message)
        process.exit(1)
      }
    }
    console.log(`Shortlist ensured (fallback path): ${SCHOOL_SLUGS.join(', ')}`)
  } else {
    console.log(`Shortlist ensured: ${(inserted ?? shortlistRows).map(r => r.school_slug).join(', ')}`)
  }

  console.log('')
  console.log('Done. This is MANUAL — nothing runs on its own; the test data now just')
  console.log('exists in the DB until someone opens Research Room for this child.')
  console.log('')
  console.log('To view it:')
  console.log(`  1. Sign in as ${authUser.user.email} on /nana/research-room`)
  console.log(`  2. Switch the active child to "${TEST_CHILD_NAME}" in the child switcher`)
  console.log('  3. The page auto-creates a research_sessions row and seeds the General-lens')
  console.log('     comparison rows on that load (page.tsx → ensure_research_session_for_child')
  console.log('     + seedResearchSession) — no further script action needed.')
  console.log('')
  console.log(`Re-run anytime: node scripts/seed-research-room-test-session.mjs`)
  console.log(`(safe — reuses the existing "${TEST_CHILD_NAME}" child + skips schools already shortlisted)`)
}

main().catch(e => {
  console.error('Unexpected failure:', e)
  process.exit(1)
})

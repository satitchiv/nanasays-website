// seed-research-room-mobile-cards-test.mjs
//
// One-off seed script for the Research Room comparison-grid follow-up
// (2026-07-17). The ≤3-school "stacked card" mobile layout
// (`@media max-width:680px .rr-cmp-table-wrap--cards`, added by the
// 2026-07-16 redesign) had never actually been seen rendering, because the
// only seeded test session ("Redesign-test", see
// seed-research-room-test-session.mjs) has 5 schools — always over the
// fewSchools<=3 threshold. This script creates a SEPARATE, small 3-school
// test child so that path can finally be exercised by a real Puppeteer
// screenshot, without touching the existing 5-school session.
//
// Safety notes (read before re-running) — same posture as
// seed-research-room-test-session.mjs, whose guardrails this mirrors:
//   - Target project: NanaSays standalone-app Supabase (id ckofdbjfbxoxxxtedmqa),
//     the only Supabase project this repo's .env.local points at.
//   - ADDITIVE ONLY: INSERTs one new children row + up to 3 new
//     shortlisted_schools rows scoped to that new child_id. Never
//     updates/deletes any existing row (including the "Redesign-test"
//     child + its 5-school shortlist), and never touches parent_profiles
//     (so it does NOT change which child is "active").
//   - Idempotent-ish: re-running reuses the existing child if one with the
//     exact TEST_CHILD_NAME already exists, and skips schools already
//     shortlisted for it.
//   - Reuses 3 of the 5 school slugs already verified (2026-07-16) to have
//     hero_image, logo_url, AND school_structured_data populated, so the
//     card layout has real images + real cell data to render, not gaps.
//
// Usage:
//   cd ~/nanasays/website
//   node scripts/seed-research-room-mobile-cards-test.mjs
//
// After running, open Research Room, switch the active child to
// "Cards-test" in the child switcher, and view the Comparison tab at
// ≤680px width — the ≤3-school fewSchools path renders the header as its
// own horizontal-scroll strip and every data row as a stacked card
// (see ComparisonView.tsx `fewSchools` + research-room.css
// `.rr-cmp-table-wrap--cards`).

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

// Same dev/test account used by seed-research-room-test-session.mjs.
const TEST_USER_ID = process.env.NANA_DEV_BYPASS_USER_ID
if (!TEST_USER_ID) {
  console.error('Refusing to run: set NANA_DEV_BYPASS_USER_ID in .env.local first.')
  process.exit(1)
}
const TEST_CHILD_NAME = 'Cards-test'

// 3 of the 5 slugs already verified (2026-07-16) to have hero_image,
// logo_url, AND school_structured_data populated — deliberately reusing
// the same verified set rather than picking new, unverified slugs.
const SCHOOL_SLUGS = [
  'wycombe-abbey',
  'benenden-school',
  'roedean-school',
]

async function main() {
  console.log(`Target project: ${SUPABASE_URL}`)
  console.log(`Test user: ${TEST_USER_ID}`)

  const { data: authUser, error: authErr } = await supabase.auth.admin.getUserById(TEST_USER_ID)
  if (authErr || !authUser?.user) {
    console.error(`Refusing to run: TEST_USER_ID ${TEST_USER_ID} not found in auth.users.`, authErr?.message)
    process.exit(1)
  }
  console.log(`Confirmed auth user: ${authUser.user.email}`)

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
  console.log('     comparison rows on that load — no further script action needed.')
  console.log('  4. Narrow the viewport to ≤680px to see the stacked-card layout.')
  console.log('')
  console.log(`Re-run anytime: node scripts/seed-research-room-mobile-cards-test.mjs`)
  console.log(`(safe — reuses the existing "${TEST_CHILD_NAME}" child + skips schools already shortlisted)`)
}

main().catch(e => {
  console.error('Unexpected failure:', e)
  process.exit(1)
})

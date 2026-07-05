// parent-battery.mjs
//
// Deterministic parent-question battery for the Research Room chat.
// NO LLM CALLS — this harness exercises exactly the deterministic half of
// the answer pipeline (the half that decides retrieval quality):
//
//   routeIntent()  →  TOOLS[..](supabase, args, toolCtx)  →  injectToolResult()
//                  →  buildUserMessage()   [stops HERE — before the Claude call]
//
// It then grades each question the way a demanding parent would grade the
// final answer's raw material:
//   - did the router pick a deterministic plan (fast) or drop to agentic (slow)?
//   - did retrieval cover every relevant school (ground-truth cross-check)?
//   - does every school carry real evidence strings + citation URLs?
//   - are all asked-for dimensions actually in the plan (table questions)?
//   - is the assembled context compact enough?
//   - for unsupported asks, do the tools fail HONESTLY (explicit redirect /
//     unknown-dimension errors) instead of returning silent empties?
//
// Usage:
//   cd ~/nanasays/website
//   node --experimental-strip-types \
//        --import ./lib/server/_test-stub-server-only.mjs \
//        scripts/parent-battery.mjs [scenario-id ...]
//
// Exit code 0 = all hard checks pass. Non-zero = at least one FAIL.
// Companion offline test (no DB): lib/server/intent-router-battery.test.mjs

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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EDUWORLD_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.EDUWORLD_SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in env (.env.local).')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

const { routeIntent } = await import('../lib/server/intent-router.js')
const { TOOLS, rankSchools, filterSchools } = await import('../lib/server/tools.js')
const { buildUserMessage } = await import('../lib/server/prose-runner.js')
const { injectToolResult } = await import('../lib/server/tool-result-compact.js')
const { extractSubjectIntents } = await import('../lib/server/subject-intents.mjs')
const { scoreSportOffering } = await import('../lib/server/generic-sport.mjs')
const { DIMENSIONS } = await import('../lib/server/dimensions.js')

// ── Parent Benz — the demanding test parent ────────────────────────────────
// Child: 13, golf-mad, plays tennis, needs strong English/academics.
// Shortlist picked from live data 2026-07-05: all four carry BOTH golf and
// tennis evidence, so a good comparison must have something to say about
// every school on every asked dimension.
export const BENZ_SHORTLIST = [
  'culford-school',           // golf signature (30), tennis 59.9
  'merchiston-castle-school', // golf signature (26), tennis 51.4
  'reeds-school-uk',          // tennis #1 (77.2), golf 11
  'wellington-college',       // golf 13, tennis 28, academics strong
]

// ── Ground truth: full-table offering scan (same UK filter as rankSchools) ──
async function loadGroundTruth() {
  const uk = new Set()
  for (let o = 0; ; o += 1000) {
    const { data, error } = await supabase
      .from('schools_status').select('school_slug')
      .eq('is_uk_evidence', true).range(o, o + 999)
    if (error || !data?.length) break
    data.forEach((r) => uk.add(r.school_slug))
    if (data.length < 1000) break
  }
  const { data: rows, error } = await supabase
    .from('school_structured_data')
    .select('school_slug, sports_profile')
    .range(0, 9999)
  if (error) throw new Error(`ground-truth scan failed: ${error.message}`)
  return { uk, rows: rows.filter((r) => uk.has(r.school_slug)) }
}

function groundTruthTopN(gt, sportKey, n) {
  return gt.rows
    .map((r) => ({ slug: r.school_slug, score: scoreSportOffering(r.sports_profile, sportKey).score }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
}

// ── Plan execution — mirrors prose-runner.js lines 1234-1335 exactly ───────
async function executePlan(question, intentMatch) {
  const toolCtx = { parent: null, subject_intents: extractSubjectIntents(question) }
  const toolDefs = intentMatch.plan.tools
  const t0 = Date.now()
  const settled = await Promise.allSettled(
    toolDefs.map(async (def) => {
      if (!TOOLS[def.name]) throw new Error(`unknown tool: ${def.name}`)
      return { def, r: await TOOLS[def.name](supabase, def.args, toolCtx) }
    }),
  )
  const toolMs = Date.now() - t0
  const toolBlobs = []
  const citations = new Set()
  const failures = []
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i]
    if (s.status === 'fulfilled') {
      const { def, r } = s.value
      for (const c of r.citations || []) {
        const url = c && typeof c === 'object' ? c.url : c
        if (url) citations.add(url)
      }
      toolBlobs.push({ name: def.name, summary: r.summary, compact: injectToolResult(def.name, r.result), result: r.result })
    } else {
      failures.push(`${toolDefs[i].name}: ${s.reason?.message}`)
    }
  }
  const userMessage = buildUserMessage(question, intentMatch, toolBlobs, null, null)
  return { toolBlobs, citations, failures, toolMs, userMessage }
}

// Schools that made it into the model-visible context, by tool result shape.
function retrievedSchools(exec) {
  const out = new Map() // slug → { name, summaries: [] }
  for (const b of exec.toolBlobs) {
    const r = b.result || {}
    for (const s of r.schools || []) {
      const slug = s.slug || s.school_slug
      if (!slug) continue
      if (!out.has(slug)) out.set(slug, { name: s.name || slug, summaries: [] })
      if (s.summary) out.get(slug).summaries.push(s.summary)
      for (const d of Object.values(s.dimensions || {})) {
        if (d?.summary) out.get(slug).summaries.push(d.summary)
      }
    }
    if (r.slug) {
      if (!out.has(r.slug)) out.set(r.slug, { name: r.slug, summaries: [] })
    }
  }
  return out
}

// ── Check helpers ───────────────────────────────────────────────────────────
const CONTEXT_BUDGET_CHARS = 40_000 // pass-1 user message; report actuals anyway
const ok = (name, note = '') => ({ name, pass: true, note })
const bad = (name, note = '') => ({ name, pass: false, note })

function checkDeterministic(route, expectedIntent) {
  if (!route) return bad('routes deterministically', 'routeIntent returned null → slow agentic fallback')
  if (expectedIntent && route.intent !== expectedIntent) {
    return bad('routes deterministically', `intent=${route.intent}, expected ${expectedIntent}`)
  }
  return ok('routes deterministically', `intent=${route.intent} conf=${route.confidence}`)
}

function planDims(route) {
  const dims = new Set()
  for (const t of route?.plan?.tools || []) {
    if (t.name === 'rankSchools' && t.args?.dimension) dims.add(t.args.dimension)
    for (const d of t.args?.dimensions || []) dims.add(d)
  }
  return dims
}

function checkPlanCoversDims(route, wanted) {
  const dims = planDims(route)
  const missing = wanted.filter((d) => !dims.has(d))
  return missing.length
    ? bad('plan covers asked dimensions', `missing: ${missing.join(', ')} (plan has: ${[...dims].join(', ') || 'none'})`)
    : ok('plan covers asked dimensions', [...dims].join(', '))
}

function checkContextBudget(exec) {
  const n = exec.userMessage.length
  return n <= CONTEXT_BUDGET_CHARS
    ? ok('context within budget', `${n.toLocaleString()} chars (~${Math.round(n / 4).toLocaleString()} tok), tools ${exec.toolMs}ms`)
    : bad('context within budget', `${n.toLocaleString()} chars > ${CONTEXT_BUDGET_CHARS.toLocaleString()}`)
}

function checkEvidence(exec, re, minSchools) {
  const schools = retrievedSchools(exec)
  const withEvidence = [...schools.values()].filter((s) => s.summaries.some((x) => re.test(x)))
  return withEvidence.length >= minSchools
    ? ok('evidence-backed retrieval', `${withEvidence.length}/${schools.size} schools carry matching evidence`)
    : bad('evidence-backed retrieval', `only ${withEvidence.length}/${schools.size} schools carry evidence matching ${re}`)
}

function checkCitations(exec, min = 1) {
  return exec.citations.size >= min
    ? ok('has citation URLs', `${exec.citations.size} distinct URLs`)
    : bad('has citation URLs', 'no citation URLs surfaced')
}

function checkShortlistCoverage(exec, shortlist) {
  const schools = retrievedSchools(exec)
  const missing = shortlist.filter((s) => !schools.has(s))
  return missing.length
    ? bad('every shortlist school covered', `missing from tool results: ${missing.join(', ')}`)
    : ok('every shortlist school covered', `${shortlist.length}/${shortlist.length} present`)
}

function checkGroundTruthTopN(exec, gt, sportKey, n) {
  const truth = groundTruthTopN(gt, sportKey, n).map((s) => s.slug)
  const schools = retrievedSchools(exec)
  const missed = truth.filter((slug) => !schools.has(slug))
  return missed.length
    ? bad(`no missed ${sportKey} school (top-${n})`, `ground-truth top-${n} missing from results: ${missed.join(', ')}`)
    : ok(`no missed ${sportKey} school (top-${n})`, `all ground-truth top-${n} retrieved`)
}

// Commute/location evidence must survive compaction in parent-usable form
// (airport drive times / nearest town), not as a "[3 × {name,…}]" shape
// summary — that's what the location_profile carve-out renderer guarantees.
function checkLocationEvidence(exec, minSchools) {
  const hits = (exec.userMessage.match(/• airports: |• nearest town: /g) || []).length
  return hits >= minSchools
    ? ok('commute evidence usable', `${hits} airport/town lines in context`)
    : bad('commute evidence usable', `only ${hits} usable location lines (need ≥${minSchools})`)
}

function checkTableInstruction(exec) {
  return /markdown table/i.test(exec.userMessage)
    ? ok('table instruction present', 'pass-1 message instructs a markdown table')
    : bad('table instruction present', 'parent asked for a table but the pass-1 message never says to build one')
}

function checkCompletenessNote(exec) {
  return /COVERAGE RULE/.test(exec.userMessage)
    ? ok('coverage rule attached')
    : bad('coverage rule attached', 'comparison-shaped answer without the completeness note')
}

// ── The battery ─────────────────────────────────────────────────────────────
// `expect.intent` = the deterministic intent the router MUST produce (the
// parent bar — not necessarily today's behavior). checks run after execution.
const BATTERY = [
  {
    id: 'golf-global',
    persona: 'Parent Benz, no shortlist yet',
    question: 'Which schools are best for golf?',
    ctx: {},
    expect: { intent: 'top_n_for_dim' },
    checks: (route, exec, gt) => [
      checkPlanCoversDims(route, ['golf_offering']),
      checkGroundTruthTopN(exec, gt, 'golf', 5),
      checkEvidence(exec, /golf/i, 5),
      checkCitations(exec),
      checkCompletenessNote(exec),
      checkContextBudget(exec),
    ],
  },
  {
    id: 'tennis-global',
    persona: 'Parent Benz, no shortlist yet',
    question: 'Which schools are best for tennis?',
    ctx: {},
    expect: { intent: 'top_n_for_dim' },
    checks: (route, exec) => [
      checkPlanCoversDims(route, ['tennis_strength']),
      checkEvidence(exec, /tennis|lta|aegon|youll cup/i, 5),
      checkCitations(exec),
      checkContextBudget(exec),
    ],
  },
  {
    id: 'academics-plus-sport',
    persona: 'Parent Benz, no shortlist yet',
    question: 'Recommend schools for my child who wants strong academics plus sports.',
    ctx: {},
    expect: { intent: 'top_n_for_dim' },
    checks: (route, exec) => [
      checkPlanCoversDims(route, ['academic_strength', 'sport_breadth']),
      checkEvidence(exec, /gcse|a-level|a\*|oxbridge|russell/i, 3),
      checkEvidence(exec, /sport|team|academy|signature/i, 3),
      checkCitations(exec),
      checkContextBudget(exec),
    ],
  },
  {
    id: 'benz-table',
    persona: 'Parent Benz, shortlist of 4 loaded',
    question: 'Build me a table comparing the best options for golf, tennis, academics, commute/location, fees/value, and why.',
    ctx: { shortlistSlugs: BENZ_SHORTLIST },
    expect: { intent: 'shortlist_rank_or_compare' },
    checks: (route, exec) => [
      checkPlanCoversDims(route, ['golf_offering', 'tennis_strength', 'academic_strength', 'fees_value']),
      checkShortlistCoverage(exec, BENZ_SHORTLIST),
      checkTableInstruction(exec),
      checkLocationEvidence(exec, 4),
      checkCompletenessNote(exec),
      checkCitations(exec),
      checkContextBudget(exec),
    ],
  },
  {
    id: 'benz-choice',
    persona: 'Parent Benz, shortlist of 4 loaded',
    question: 'Which school should Parent Benz choose if the child likes golf and tennis but also needs strong English/academics?',
    ctx: { shortlistSlugs: BENZ_SHORTLIST },
    expect: { intent: 'shortlist_rank_or_compare' },
    checks: (route, exec) => [
      checkPlanCoversDims(route, ['golf_offering', 'tennis_strength', 'academic_strength']),
      checkShortlistCoverage(exec, BENZ_SHORTLIST),
      checkCompletenessNote(exec),
      checkCitations(exec),
      checkContextBudget(exec),
    ],
  },
  {
    id: 'thai-golf',
    persona: 'Thai parent, no shortlist',
    question: 'โรงเรียนไหนดีที่สุดสำหรับกอล์ฟ?', // "Which school is best for golf?"
    ctx: {},
    expect: { intent: 'top_n_for_dim' },
    checks: (route, exec, gt) => [
      checkPlanCoversDims(route, ['golf_offering']),
      checkGroundTruthTopN(exec, gt, 'golf', 5),
      checkContextBudget(exec),
    ],
  },
  {
    id: 'thai-mixed-compare',
    persona: 'Thai parent, Benz shortlist loaded, mixed Thai/English',
    question: 'ช่วยเปรียบเทียบโรงเรียนพวกนี้เรื่อง golf กับ tennis ให้หน่อยค่ะ', // "please compare these schools on golf and tennis"
    ctx: { shortlistSlugs: BENZ_SHORTLIST },
    expect: { intent: 'shortlist_rank_or_compare' },
    checks: (route, exec) => [
      checkPlanCoversDims(route, ['golf_offering', 'tennis_strength']),
      checkShortlistCoverage(exec, BENZ_SHORTLIST),
      checkContextBudget(exec),
    ],
  },
  {
    id: 'missing-sport',
    persona: 'Parent asking for a sport the dataset does not track',
    question: 'Which schools are best for curling?',
    ctx: {},
    // No deterministic route can exist (no curling data) — the bar here is
    // HONESTY of the fallback tools, checked directly below.
    expect: { intent: null },
    checks: async () => {
      const checks = []
      const rank = await rankSchools(supabase, { dimension: 'curling_offering', limit: 8 })
      checks.push(
        rank.result?.error && /unknown dimension/i.test(rank.result.error)
          ? ok('rankSchools fails honestly', 'explicit unknown-dimension error')
          : bad('rankSchools fails honestly', `got: ${JSON.stringify(rank.result).slice(0, 120)}`),
      )
      // Untracked sports must NOT be redirected to a fabricated dimension
      // name (curling_offering doesn't exist) — the guard must say so plainly.
      const filt = await filterSchools(supabase, { has_sport: 'curling' })
      checks.push(
        filt.result?.error &&
        /matches no tracked sport dimension/.test(filt.result.error) &&
        !/curling_offering/.test(filt.result.error)
          ? ok('filterSchools declines honestly', 'no fabricated dimension name for untracked sport')
          : bad('filterSchools declines honestly', `got: ${JSON.stringify(filt.result).slice(0, 120)}`),
      )
      return checks
    },
  },
]

// ── Runner ──────────────────────────────────────────────────────────────────
const only = process.argv.slice(2)
const scenarios = only.length ? BATTERY.filter((s) => only.includes(s.id)) : BATTERY
if (!scenarios.length) {
  console.error(`No matching scenarios. Available: ${BATTERY.map((s) => s.id).join(', ')}`)
  process.exit(1)
}

console.log('Parent battery — deterministic retrieval quality (no LLM calls)\n')
const gt = await loadGroundTruth()
console.log(`Ground truth loaded: ${gt.rows.length} UK schools with structured rows\n`)

let hardFailures = 0
for (const sc of scenarios) {
  console.log(`━━━ ${sc.id} ━━━  (${sc.persona})`)
  console.log(`  Q: ${sc.question}`)
  const route = routeIntent(sc.question, sc.ctx)

  const results = []
  if (typeof sc.checks === 'function' && sc.expect.intent === null) {
    // honesty-of-fallback scenario: route must be null AND tools must fail loudly
    results.push(
      route === null
        ? ok('falls to agentic (expected)', 'no deterministic route for untracked sport')
        : bad('falls to agentic (expected)', `unexpectedly routed to ${route.intent}`),
    )
    results.push(...(await sc.checks()))
  } else {
    results.push(checkDeterministic(route, sc.expect.intent))
    if (route) {
      const exec = await executePlan(sc.question, route)
      if (exec.failures.length) results.push(bad('all plan tools succeeded', exec.failures.join(' | ')))
      results.push(...(await sc.checks(route, exec, gt)))
    }
  }

  for (const r of results) {
    const mark = r.pass ? '  ✓' : '  ✗'
    console.log(`${mark} ${r.name}${r.note ? ` — ${r.note}` : ''}`)
    if (!r.pass) hardFailures++
  }
  console.log('')
}

console.log(hardFailures === 0 ? 'ALL CHECKS PASSED' : `${hardFailures} CHECK(S) FAILED`)
process.exit(hardFailures === 0 ? 0 : 1)

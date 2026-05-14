#!/usr/bin/env node
// Backfill Build Mode turns into nana_chat_logs so Mission Control
// shows the historical traffic before session 4 wired live logging.
//
// Reads research_session_messages where parsed_answer.build_mode is
// present (carried by the marker key — see route.ts) and created_at
// is on/after 2026-05-14T00:00:00Z (Build Mode session 1 ship date).
//
// For each row, looks for a nana_chat_logs entry on the same question
// within ±5s of the message's created_at — if found, the row is
// considered already logged and the backfill skips it. Otherwise an
// insert is staged with:
//   backend           = 'build-mode-backfill'
//   model             = 'gpt-5-4-mini'
//   confidence        = 'high'
//   answer_preview    = first 500 chars of parsed_answer.sections.short_answer
//   tokens_*          = null   (we never captured them at send time)
//   cost_*            = null   (same)
//   created_at        = the original message's created_at
//
// Dry-run by default. Pass --write to actually insert.
// Pass --since=2026-05-14 to override the cutoff. Pass --limit=N to cap.
//
// Usage:
//   node scripts/backfill-build-mode-chat-logs.mjs               # dry-run
//   node scripts/backfill-build-mode-chat-logs.mjs --write       # write
//   node scripts/backfill-build-mode-chat-logs.mjs --since=2026-05-15 --limit=10

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── env loader (the website is a Next app, no dotenv runtime) ──────
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
  } catch (e) {
    console.error('Could not read .env.local — falling back to process.env')
  }
}
loadEnvFile()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ── arg parsing ────────────────────────────────────────────────────
const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const SINCE = (args.find(a => a.startsWith('--since='))?.slice(8)) || '2026-05-14T00:00:00Z'
const LIMIT_RAW = args.find(a => a.startsWith('--limit='))?.slice(8)
const LIMIT = LIMIT_RAW ? parseInt(LIMIT_RAW, 10) : null

console.log(`mode:    ${WRITE ? 'WRITE' : 'dry-run'}`)
console.log(`since:   ${SINCE}`)
if (LIMIT) console.log(`limit:   ${LIMIT}`)
console.log('')

// ── 1. read build-mode messages ────────────────────────────────────
const q = svc
  .from('research_session_messages')
  .select('id, session_id, question, parsed_answer, created_at')
  .gte('created_at', SINCE)
  .order('created_at', { ascending: true })

if (LIMIT) q.limit(LIMIT)

const { data: allMsgs, error: readErr } = await q
if (readErr) {
  console.error('Read failed:', readErr)
  process.exit(1)
}

const buildModeMsgs = (allMsgs ?? []).filter(m => {
  const pa = m.parsed_answer
  return pa && typeof pa === 'object' && pa.build_mode != null
})
console.log(`scanned: ${allMsgs?.length ?? 0} messages since ${SINCE}`)
console.log(`         ${buildModeMsgs.length} carry build_mode marker`)

if (buildModeMsgs.length === 0) {
  console.log('nothing to backfill.')
  process.exit(0)
}

// ── 2. for each, check nana_chat_logs for an existing companion ────
let alreadyLogged = 0
let toInsert = []

for (const m of buildModeMsgs) {
  const t = new Date(m.created_at)
  const lo = new Date(t.getTime() - 5_000).toISOString()
  const hi = new Date(t.getTime() + 5_000).toISOString()
  const qPrefix = (m.question ?? '').slice(0, 200)

  const { data: existing, error: lookupErr } = await svc
    .from('nana_chat_logs')
    .select('id, created_at, question')
    .gte('created_at', lo)
    .lte('created_at', hi)
    .like('question', `${qPrefix.replace(/[%_]/g, '\\$&')}%`)
    .limit(1)

  if (lookupErr) {
    console.error(`  lookup error for ${m.id}:`, lookupErr.message)
    continue
  }

  if ((existing ?? []).length > 0) {
    alreadyLogged++
    continue
  }

  const prose =
    m.parsed_answer?.sections?.short_answer ??
    m.parsed_answer?.prose ??
    ''

  toInsert.push({
    school_slug:          null,
    question:             (m.question ?? '').slice(0, 2000),
    answer_preview:       String(prose).slice(0, 500),
    tokens_in:            null,
    tokens_cache_write:   null,
    tokens_cache_read:    null,
    tokens_out:           null,
    cost_input_usd:       null,
    cost_cache_write_usd: null,
    cost_cache_read_usd:  null,
    cost_output_usd:      null,
    cost_total_usd:       null,
    cache_hit_pct:        null,
    chunk_count:          null,
    sensitive_count:      null,
    backend:              'build-mode-backfill',
    model:                'gpt-5-4-mini',
    confidence:           'high',
    claude_ms:            null,
    total_ms:             null,
    created_at:           m.created_at,
  })
}

console.log('')
console.log(`already logged (skip): ${alreadyLogged}`)
console.log(`would-insert:          ${toInsert.length}`)

if (!WRITE) {
  console.log('')
  console.log('dry-run — re-run with --write to actually insert.')
  process.exit(0)
}

// ── 3. write phase — batch insert ──────────────────────────────────
if (toInsert.length === 0) {
  console.log('nothing to insert.')
  process.exit(0)
}

const BATCH = 100
let inserted = 0
let failed = 0

for (let i = 0; i < toInsert.length; i += BATCH) {
  const slice = toInsert.slice(i, i + BATCH)
  const { error } = await svc.from('nana_chat_logs').insert(slice)
  if (error) {
    failed += slice.length
    console.error(`  batch ${i}-${i + slice.length} failed:`, error.message)
  } else {
    inserted += slice.length
    console.log(`  batch ${i}-${i + slice.length} ok`)
  }
}

console.log('')
console.log(`inserted: ${inserted}`)
console.log(`failed:   ${failed}`)

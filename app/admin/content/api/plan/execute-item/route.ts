// POST /admin/content/api/plan/execute-item
// Body: { plan_item_id: string }
//
// Queue-aware fire-and-forget:
//   - If fewer than ALBUM_CONCURRENCY items are 'generating', we spawn this
//     item immediately as a detached background process.
//   - Otherwise we set its status to 'queued' and return. A generator that
//     finishes (success or failure) automatically calls advanceQueue() which
//     picks up the oldest queued item and spawns it.
//
// Returns in <1 second either way. The UI polls /plan/list for status updates.

import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { openSync } from 'fs'
import path from 'path'
import { tmpdir } from 'os'
import { verifyAdmin, supabaseService } from '@/lib/supabase-admin'

export const maxDuration = 30

const ALBUM_CONCURRENCY = Math.max(parseInt(process.env.ALBUM_CONCURRENCY || '1', 10) || 1, 1)

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => ({}))
  const planItemId = body.plan_item_id
  if (!planItemId || typeof planItemId !== 'string') {
    return NextResponse.json({ error: 'plan_item_id required' }, { status: 400 })
  }

  const svc = supabaseService()
  const { data: item, error } = await svc
    .from('social_content_plans')
    .select('id, post_type, status')
    .eq('id', planItemId)
    .single()
  if (error || !item) {
    return NextResponse.json({ error: 'Plan item not found' }, { status: 404 })
  }
  if (item.status === 'generated') {
    return NextResponse.json({ error: 'Plan item already generated' }, { status: 400 })
  }
  if (item.status === 'generating') {
    return NextResponse.json({ error: 'Plan item is already generating' }, { status: 409 })
  }
  if (item.status === 'queued') {
    return NextResponse.json({ ok: true, status: 'queued', alreadyQueued: true })
  }

  // Check concurrency
  const { data: running } = await svc
    .from('social_content_plans')
    .select('id')
    .eq('status', 'generating')
    .limit(ALBUM_CONCURRENCY + 1)
  const runningCount = running?.length || 0

  if (runningCount >= ALBUM_CONCURRENCY) {
    // Slot full — ATOMIC claim to 'queued' — only succeeds if we're still in a
    // non-active status. Prevents double-queueing on racing clicks.
    const { data: queuedRows, error: qErr } = await svc
      .from('social_content_plans')
      .update({ status: 'queued', error_message: null, updated_at: new Date().toISOString() })
      .eq('id', planItemId)
      .in('status', ['planned', 'failed'])
      .select('id')
    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })
    if (!queuedRows?.length) {
      // Someone else already moved this item forward — read current state
      const { data: fresh } = await svc.from('social_content_plans').select('status').eq('id', planItemId).single()
      return NextResponse.json({ ok: true, status: fresh?.status, alreadyClaimed: true })
    }

    return NextResponse.json({
      ok: true,
      status: 'queued',
      message: `Queued — ${runningCount} generation(s) ahead of this one`,
    })
  }

  // Slot free — ATOMIC claim to 'generating' (only succeeds if still in
  // planned/failed/queued state). Prevents double-spawn on racing clicks.
  const { data: claimedRows, error: claimErr } = await svc
    .from('social_content_plans')
    .update({ status: 'generating', error_message: null, updated_at: new Date().toISOString() })
    .eq('id', planItemId)
    .in('status', ['planned', 'queued', 'failed'])
    .select('id')
  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 })
  if (!claimedRows?.length) {
    const { data: fresh } = await svc.from('social_content_plans').select('status').eq('id', planItemId).single()
    return NextResponse.json({ ok: true, status: fresh?.status, alreadyClaimed: true })
  }

  const scriptDir = path.resolve(process.cwd(), '../scripts')
  const scriptName = item.post_type === 'album' ? 'generate-album.js' : 'generate.js'
  const scriptPath = path.join(scriptDir, 'social-media-planner', scriptName)
  const logPath = path.join(tmpdir(), `plan-${planItemId}.log`)

  try {
    const out = openSync(logPath, 'a')
    const err = openSync(logPath, 'a')
    const proc = spawn('node', [scriptPath, `--plan-item=${planItemId}`], {
      cwd: scriptDir,
      detached: true,
      stdio: ['ignore', out, err],
      env: {
        ...process.env,
        HOME: process.env.HOME || '/Users/moodygarlic',
        PATH: process.env.PATH || '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
      },
    })
    proc.unref()

    return NextResponse.json({
      ok: true,
      planItemId,
      status: 'generating',
      logPath,
      message: 'Generator started in background.',
    })
  } catch (spawnErr) {
    await svc
      .from('social_content_plans')
      .update({
        status: 'failed',
        error_message: spawnErr instanceof Error ? spawnErr.message : 'Spawn failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', planItemId)

    return NextResponse.json({
      error: spawnErr instanceof Error ? spawnErr.message : 'Spawn failed',
    }, { status: 500 })
  }
}

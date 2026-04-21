// POST /api/planner — external planner endpoint.
//
// Auth: X-Service-Key header must match PLANNER_API_KEY env var.
// Feature flag: disabled unless PLANNER_API_ENABLED=true.
//
// Body: { count?: number, startDate?: string, execute?: boolean }
// - count: 1–10 (default 3)
// - startDate: YYYY-MM-DD (default = next Monday UTC)
// - execute: if true, also runs the generator for every planned item sequentially
//
// Returns: { ok, batchId, items, generated? }

import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { supabaseService } from '@/lib/supabase-admin'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  if (process.env.PLANNER_API_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Planner API disabled. Set PLANNER_API_ENABLED=true to enable.' }, { status: 403 })
  }

  const serviceKey = req.headers.get('x-service-key')
  const expected = process.env.PLANNER_API_KEY
  if (!expected) {
    return NextResponse.json({ error: 'PLANNER_API_KEY not configured on server' }, { status: 500 })
  }
  if (serviceKey !== expected) {
    return NextResponse.json({ error: 'Invalid service key' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const count = Math.min(Math.max(parseInt(body.count ?? '3', 10) || 3, 1), 10)
  const startDate = typeof body.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate)
    ? body.startDate
    : null
  const execute = body.execute === true

  const scriptDir = path.resolve(process.cwd(), '../scripts')
  const planScript = path.join(scriptDir, 'social-media-planner', 'plan-cli.js')

  // 1. Plan
  const args = [`--count=${count}`]
  if (startDate) args.push(`--start=${startDate}`)
  const planResult = await runScript(planScript, args, scriptDir)

  const batchMatch = /batch_id:\s*([0-9a-f-]+)/i.exec(planResult.stdout)
  if (planResult.code !== 0 || !batchMatch) {
    return NextResponse.json({
      error: `Planner failed (exit ${planResult.code})`,
      stderr: planResult.stderr.slice(-800),
    }, { status: 500 })
  }
  const batchId = batchMatch[1]

  const svc = supabaseService()
  const { data: items, error: fetchErr } = await svc
    .from('social_content_plans')
    .select('*')
    .eq('batch_id', batchId)
    .order('scheduled_for', { ascending: true, nullsFirst: false })
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

  if (!execute) {
    return NextResponse.json({ ok: true, batchId, items })
  }

  // 2. Execute each item sequentially
  const generated: Array<{ id: string; ok: boolean; post_id?: string | null; error?: string }> = []
  for (const item of items || []) {
    const script = item.post_type === 'album' ? 'generate-album.js' : 'generate.js'
    const scriptPath = path.join(scriptDir, 'social-media-planner', script)
    const res = await runScript(scriptPath, [`--plan-item=${item.id}`], scriptDir)

    const { data: updated } = await svc
      .from('social_content_plans')
      .select('status, generated_post_id, error_message')
      .eq('id', item.id)
      .single()

    generated.push({
      id: item.id,
      ok: updated?.status === 'generated',
      post_id: updated?.generated_post_id,
      error: updated?.error_message || (res.code !== 0 ? res.stderr.slice(-200) : undefined),
    })
  }

  return NextResponse.json({ ok: true, batchId, items, generated })
}

function runScript(scriptPath: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [scriptPath, ...args], {
      cwd,
      env: {
        ...process.env,
        HOME: process.env.HOME || '/Users/moodygarlic',
        PATH: process.env.PATH || '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
      },
    })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', d => { stdout += d.toString() })
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('close', code => resolve({ stdout, stderr, code: code ?? -1 }))
    proc.on('error', err => reject(err))
  })
}

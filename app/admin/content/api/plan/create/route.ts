// POST /admin/content/api/plan/create
// Body: { count?: number, startDate?: string }
// Spawns plan-cli.js → returns { batchId, items }

import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { verifyAdmin, supabaseService } from '@/lib/supabase-admin'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => ({}))
  const count = Math.min(Math.max(parseInt(body.count ?? '3', 10) || 3, 1), 10)
  const startDate = typeof body.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate)
    ? body.startDate
    : null

  const scriptDir = path.resolve(process.cwd(), '../scripts')
  const scriptPath = path.join(scriptDir, 'social-media-planner', 'plan-cli.js')

  const args = [`--count=${count}`]
  if (startDate) args.push(`--start=${startDate}`)

  try {
    const { stdout, stderr, code } = await runScript(scriptPath, args, scriptDir)

    // Find batch_id in output
    const batchMatch = /batch_id:\s*([0-9a-f-]+)/i.exec(stdout)
    const batchId = batchMatch ? batchMatch[1] : null

    if (code !== 0 || !batchId) {
      return NextResponse.json({
        error: `Planner failed (exit ${code})`,
        stderr: stderr.slice(-1000),
        stdout: stdout.slice(-1000),
      }, { status: 500 })
    }

    // Fetch the inserted rows
    const svc = supabaseService()
    const { data: items, error: fetchErr } = await svc
      .from('social_content_plans')
      .select('*')
      .eq('batch_id', batchId)
      .order('scheduled_for', { ascending: true, nullsFirst: false })

    if (fetchErr) {
      return NextResponse.json({ error: `Fetch failed: ${fetchErr.message}` }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      batchId,
      items,
      log: stdout.slice(-2000),
    })
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Planner spawn failed',
    }, { status: 500 })
  }
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

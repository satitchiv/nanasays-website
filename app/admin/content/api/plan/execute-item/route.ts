// POST /admin/content/api/plan/execute-item
// Body: { plan_item_id: string }
// Spawns generate-album.js or generate.js with --plan-item=<id>

import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { verifyAdmin, supabaseService } from '@/lib/supabase-admin'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => ({}))
  const planItemId = body.plan_item_id
  if (!planItemId || typeof planItemId !== 'string') {
    return NextResponse.json({ error: 'plan_item_id required' }, { status: 400 })
  }

  // Look up post_type to choose generator
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

  const scriptDir = path.resolve(process.cwd(), '../scripts')
  const scriptName = item.post_type === 'album' ? 'generate-album.js' : 'generate.js'
  const scriptPath = path.join(scriptDir, 'social-media-planner', scriptName)

  try {
    const { stdout, stderr, code } = await runScript(scriptPath, [`--plan-item=${planItemId}`], scriptDir)

    // Refresh plan item status
    const { data: updated } = await svc
      .from('social_content_plans')
      .select('status, generated_post_id, error_message')
      .eq('id', planItemId)
      .single()

    if (code !== 0 && updated?.status !== 'generated') {
      return NextResponse.json({
        error: `Generator failed (exit ${code})`,
        stderr: stderr.slice(-1000),
        stdout: stdout.slice(-1000),
        item: updated,
      }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      item: updated,
      log: stdout.slice(-1500),
    })
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Spawn failed',
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

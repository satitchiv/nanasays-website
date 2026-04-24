// POST /admin/content/api/plan/item/[id]/regenerate
// Body: { field?: 'all' | 'headline' }
// Runs the regen script and returns the updated plan item.

import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { verifyAdmin, supabaseService } from '@/lib/supabase-admin'

export const maxDuration = 120

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const field: 'all' | 'headline' = body.field === 'headline' ? 'headline' : 'all'

  const scriptDir = path.resolve(process.cwd(), '../scripts')
  const cliArg = `--plan-item=${id}`
  const modeArg = `--mode=${field}`

  try {
    const { code, stdout, stderr } = await runRegenInline(scriptDir, cliArg, modeArg)
    if (code !== 0) {
      return NextResponse.json({
        error: `Regen failed (exit ${code})`,
        stderr: stderr.slice(-800),
        stdout: stdout.slice(-800),
      }, { status: 500 })
    }

    const svc = supabaseService()
    const { data: item } = await svc
      .from('social_content_plans')
      .select('*')
      .eq('id', id)
      .single()

    return NextResponse.json({ ok: true, item })
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Regen failed',
    }, { status: 500 })
  }
}

function runRegenInline(scriptDir: string, ...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(scriptDir, 'social-media-planner', 'regen-cli.js')
    const proc = spawn('node', [scriptPath, ...args], {
      cwd: scriptDir,
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
    proc.on('close', code => resolve({ code: code ?? -1, stdout, stderr }))
    proc.on('error', err => reject(err))
  })
}

// POST /admin/content/api/auto-generate-glossary
// Body: { count?: number }   (default 5, clamped to 1..10)
//
// Spawns scripts/social-media-planner/auto-generate-glossary.js. The CLI
// asks Claude to plan N glossary terms (term_en, term_th, definition,
// icon_slug) avoiding recent ones, then renders each card via
// generate-card.js. Final stdout line is JSON with the aggregate result.
//
// Timing: Claude planning is ~20-40s for the batch + ~3-5s per card render.
// 5 cards ≈ 45-65s total. We give it 4 minutes ceiling.

import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { verifyAdmin } from '@/lib/supabase-admin'

export const maxDuration = 240

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => ({}))
  let count = parseInt(String(body?.count ?? 5), 10)
  if (Number.isNaN(count)) count = 5
  count = Math.max(1, Math.min(10, count))

  const scriptDir = path.resolve(process.cwd(), '../scripts')
  const scriptPath = path.join(scriptDir, 'social-media-planner', 'auto-generate-glossary.js')
  const args = [`--count=${count}`]

  let result: { stdout: string; stderr: string; code: number }
  try {
    result = await runScript(scriptPath, args, scriptDir)
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Auto-generator spawn failed',
    }, { status: 500 })
  }

  if (result.code !== 0) {
    const lines = result.stderr.split('\n').filter(Boolean)
    const informative = lines.find(l => /failed:|fatal:|error:/i.test(l))
    const message = (informative || lines[lines.length - 1] || `Generator exited ${result.code}`).slice(0, 300)
    return NextResponse.json({
      error: message,
      stderr: result.stderr.slice(-800),
      stdout: result.stdout.slice(-500),
    }, { status: 500 })
  }

  // Last stdout line is the aggregate JSON {ok, total, success, failed, results, skipped}.
  const json = result.stdout.split('\n').filter(Boolean).reverse().find(l => l.trim().startsWith('{'))
  if (!json) {
    return NextResponse.json({
      error: 'Auto-generator succeeded but returned no JSON',
      stdout: result.stdout.slice(-500),
    }, { status: 500 })
  }
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(json)
  } catch {
    return NextResponse.json({ error: 'Generator returned malformed JSON', raw: json.slice(0, 200) }, { status: 500 })
  }
  return NextResponse.json({ ok: true, ...parsed, log: result.stdout.slice(-1500) })
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
    let stdout = '', stderr = ''
    proc.stdout.on('data', d => { stdout += d.toString() })
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('error', reject)
    proc.on('close', code => resolve({ stdout, stderr, code: code ?? -1 }))
  })
}

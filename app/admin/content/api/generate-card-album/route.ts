// POST /admin/content/api/generate-card-album
// Body: { template: 'glossary' | 'tip', count?: number }
//
// Spawns scripts/social-media-planner/auto-generate-card-album.js — Claude
// plans N items, each is rendered as a slide, all uploaded as one album.
// Result: a single social_posts row with post_type='album', slide_count=N.
//
// Timing: ~25-40s Claude planning + ~3-5s per slide render. Five slides ≈
// 50-65s total. Six minutes ceiling — generous, but the pipeline is mostly
// IO-bound (Claude + Puppeteer), not CPU-bound.

import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { verifyAdmin } from '@/lib/supabase-admin'

export const maxDuration = 360

const KNOWN_TEMPLATES = new Set(['glossary', 'tip'])

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => ({}))
  const template = String(body?.template ?? 'glossary')
  if (!KNOWN_TEMPLATES.has(template)) {
    return NextResponse.json({
      error: `Unknown template '${template}'. Known: ${[...KNOWN_TEMPLATES].join(', ')}`,
    }, { status: 400 })
  }
  let count = parseInt(String(body?.count ?? 5), 10)
  if (Number.isNaN(count)) count = 5
  count = Math.max(3, Math.min(10, count))

  const scriptDir = path.resolve(process.cwd(), '../scripts')
  const scriptPath = path.join(scriptDir, 'social-media-planner', 'auto-generate-card-album.js')
  const args = [`--template=${template}`, `--count=${count}`]

  let result: { stdout: string; stderr: string; code: number }
  try {
    result = await runScript(scriptPath, args, scriptDir)
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Card album generator spawn failed',
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

  const json = result.stdout.split('\n').filter(Boolean).reverse().find(l => l.trim().startsWith('{'))
  if (!json) {
    return NextResponse.json({
      error: 'Generator succeeded but returned no JSON',
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

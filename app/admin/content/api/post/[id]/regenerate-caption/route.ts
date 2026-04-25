// POST /admin/content/api/post/[id]/regenerate-caption
// Body: { length?: 'short' | 'long' } (default 'short')
//
// Spawns scripts/social-media-planner/regenerate-caption.js — Claude
// rewrites copy_en using NanaSays voice. Mirrors the translate-caption
// route pattern exactly: admin auth, env propagation, informative-line
// stderr surfacing.

import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { verifyAdmin } from '@/lib/supabase-admin'

export const maxDuration = 120

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid post id' }, { status: 400 })
  }
  const body = await req.json().catch(() => ({}))
  const length = body?.length === 'long' ? 'long' : 'short'

  const scriptDir = path.resolve(process.cwd(), '../scripts')
  const scriptPath = path.join(scriptDir, 'social-media-planner', 'regenerate-caption.js')
  const args = [`--post=${id}`, `--length=${length}`]

  let result: { stdout: string; stderr: string; code: number }
  try {
    result = await runScript(scriptPath, args, scriptDir)
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Caption regenerator spawn failed',
    }, { status: 500 })
  }

  if (result.code !== 0) {
    const lines = result.stderr.split('\n').filter(Boolean)
    const informative = lines.find(l => /failed:|fatal:|error:|validation:/i.test(l))
    const message = (informative || lines[lines.length - 1] || `Generator exited ${result.code}`).slice(0, 300)
    return NextResponse.json({
      error: message,
      stderr: result.stderr.slice(-500),
    }, { status: 500 })
  }

  // Last stdout line is JSON {ok, post_id, copy_en, length}
  const json = result.stdout.split('\n').filter(Boolean).reverse().find(l => l.trim().startsWith('{'))
  if (!json) {
    return NextResponse.json({
      error: 'Regenerator succeeded but returned no JSON',
      stdout: result.stdout.slice(-500),
    }, { status: 500 })
  }
  let parsed: { ok?: boolean; post_id?: string; copy_en?: string; length?: string }
  try {
    parsed = JSON.parse(json)
  } catch {
    return NextResponse.json({ error: 'Regenerator returned malformed JSON', raw: json.slice(0, 200) }, { status: 500 })
  }
  return NextResponse.json({ ok: true, ...parsed })
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

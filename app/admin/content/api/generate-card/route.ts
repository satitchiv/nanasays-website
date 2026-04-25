// POST /admin/content/api/generate-card
//
// Renders a template-based card post (no Claude) end-to-end:
// spawns scripts/social-media-planner/generate-card.js, returns the new
// post_id + image_url on success.
//
// Pattern mirrors api/post/[id]/translate-caption/route.ts — same admin
// auth, same env propagation, same stderr-prefer-informative-line surfacing.

import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { verifyAdmin } from '@/lib/supabase-admin'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => ({}))
  const { template_slug, card_data, channel_slug } = body as {
    template_slug?: string
    card_data?: Record<string, unknown>
    channel_slug?: string
  }
  if (!template_slug || typeof template_slug !== 'string') {
    return NextResponse.json({ error: 'template_slug (string) required' }, { status: 400 })
  }
  if (!card_data || typeof card_data !== 'object') {
    return NextResponse.json({ error: 'card_data (object) required' }, { status: 400 })
  }

  const scriptDir = path.resolve(process.cwd(), '../scripts')
  const scriptPath = path.join(scriptDir, 'social-media-planner', 'generate-card.js')
  const args = [
    `--template=${template_slug}`,
    `--data=${JSON.stringify(card_data)}`,
  ]
  if (channel_slug) args.push(`--channel=${channel_slug}`)

  let result: { stdout: string; stderr: string; code: number }
  try {
    result = await runScript(scriptPath, args, scriptDir)
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Card generator spawn failed',
    }, { status: 500 })
  }

  if (result.code !== 0) {
    const lines = result.stderr.split('\n').filter(Boolean)
    const informative = lines.find(l => /failed:|fatal:|error:/i.test(l))
    const message = (informative || lines[lines.length - 1] || `Generator exited ${result.code}`).slice(0, 300)
    return NextResponse.json({
      error: message,
      stderr: result.stderr.slice(-500),
      stdout: result.stdout.slice(-500),
    }, { status: 500 })
  }

  // The CLI's last stdout line is JSON: {ok, post_id, image_url}.
  const json = result.stdout.split('\n').filter(Boolean).reverse().find(l => l.trim().startsWith('{'))
  if (!json) {
    return NextResponse.json({
      error: 'Generator succeeded but returned no JSON line',
      stdout: result.stdout.slice(-500),
    }, { status: 500 })
  }
  let parsed: { ok?: boolean; post_id?: string; image_url?: string }
  try {
    parsed = JSON.parse(json)
  } catch {
    return NextResponse.json({ error: 'Generator returned malformed JSON', raw: json.slice(0, 200) }, { status: 500 })
  }
  return NextResponse.json({ ok: true, ...parsed })
}

function runScript(scriptPath: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [scriptPath, ...args], {
      cwd,
      // Mirror api/generate-route + translate-caption: HOME/PATH fallbacks
      // so the CLI can find node + .env + Claude config when spawned from
      // Next.js managed processes.
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

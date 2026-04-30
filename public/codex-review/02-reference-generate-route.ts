import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { verifyAdmin } from '@/lib/supabase-admin'
import path from 'path'

export const maxDuration = 300   // 5 minutes for local; Netlify free tier will cap earlier

export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => ({}))
  const count = Math.min(Math.max(parseInt(body.count ?? '1', 10) || 1, 1), 10)
  const overrides = body.overrides || {}
  const type = body.type === 'album' ? 'album' : 'single'

  const scriptDir = path.resolve(process.cwd(), '../scripts')
  const scriptName = type === 'album' ? 'generate-album.js' : 'generate.js'
  const generatorPath = path.join(scriptDir, 'social-media-planner', scriptName)

  const args = ['--count=' + count]
  if (overrides.pillar_slug)   args.push('--pillar=' + overrides.pillar_slug)
  if (overrides.school_id)     args.push('--school=' + overrides.school_id)
  if (type === 'single') {
    if (overrides.template_slug) args.push('--template=' + overrides.template_slug)
    if (overrides.channel_slug)  args.push('--channel=' + overrides.channel_slug)
  }

  try {
    const { stdout, stderr, code } = await runGenerator(generatorPath, args, scriptDir)

    // Parse generator's "Generated: N. Failed: M." line
    const match = /Generated:\s*(\d+)\.\s*Failed:\s*(\d+)/i.exec(stdout)
    const generated = match ? parseInt(match[1], 10) : 0
    const failed = match ? parseInt(match[2], 10) : 0

    if (code !== 0 && generated === 0) {
      return NextResponse.json({
        error: `Generator failed (exit ${code})`,
        stderr: stderr.slice(-1000),
        stdout: stdout.slice(-1000),
      }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      generated,
      failed,
      log: stdout.slice(-2000),
    })
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Generator spawn failed',
    }, { status: 500 })
  }
}

function runGenerator(scriptPath: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
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

// POST /admin/content/api/post/[id]/translate-caption
//
// Spawns scripts/social-media-planner/translate-caption.js which
// translates the post's copy_en into Thai via Claude, validates, and
// writes copy_th + copy_th_generated_at + copy_th_model back to the
// row. Returns the resulting copy_th so the UI can update optimistically
// without another round-trip.
//
// Pattern mirrors api/generate/route.ts — admin auth, spawn CLI,
// parse stdout + exit code. Translation is short (~10s) so no streaming
// needed, but we give it a 60s ceiling in case Claude stalls.

import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { supabaseService, verifyAdmin } from '@/lib/supabase-admin'

export const maxDuration = 120

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid post id' }, { status: 400 })
  }

  const svc = supabaseService()

  // Sanity check the post exists + has copy_en before we burn a Claude call.
  const { data: post, error: fetchErr } = await svc
    .from('social_posts')
    .select('id, copy_en')
    .eq('id', id)
    .single()
  if (fetchErr || !post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }
  if (!post.copy_en) {
    return NextResponse.json({ error: 'Post has no English caption to translate' }, { status: 400 })
  }

  const scriptDir = path.resolve(process.cwd(), '../scripts')
  const scriptPath = path.join(scriptDir, 'social-media-planner', 'translate-caption.js')
  const args = ['--post=' + id]

  let stdout = '', stderr = '', code = -1
  try {
    const result = await runScript(scriptPath, args, scriptDir)
    stdout = result.stdout
    stderr = result.stderr
    code = result.code
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Translator spawn failed',
    }, { status: 500 })
  }

  if (code !== 0) {
    // Translation failed — row is unchanged. Prefer an informative line
    // (the script prints "Translation failed:" / "Fatal:" / a validation
    // error) over the tail line, which on a hard crash is a stack-frame
    // reference and tells the user nothing useful.
    const lines = stderr.split('\n').filter(Boolean)
    const informative = lines.find(l => /translation failed:|fatal:|error:|validation:/i.test(l))
    const message = (informative || lines[lines.length - 1] || `Translator exited ${code}`).slice(0, 300)
    return NextResponse.json({
      error: message,
      stderr: stderr.slice(-500),
      stdout: stdout.slice(-500),
    }, { status: 500 })
  }

  // Read back the translation the script wrote so the UI has the final text.
  const { data: updated, error: readErr } = await svc
    .from('social_posts')
    .select('copy_th, copy_th_generated_at, copy_th_model')
    .eq('id', id)
    .single()
  if (readErr || !updated?.copy_th) {
    return NextResponse.json({
      error: 'Translation ran but copy_th is missing — check stderr',
      stderr: stderr.slice(-500),
    }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    copy_th: updated.copy_th,
    copy_th_generated_at: updated.copy_th_generated_at,
    copy_th_model: updated.copy_th_model,
  })
}

function runScript(scriptPath: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [scriptPath, ...args], {
      cwd,
      // Mirror api/generate/route.ts exactly — the Claude CLI depends on HOME
      // for its config/auth and on PATH for node itself. These are inherited
      // from process.env when the admin runs this from a terminal, but in
      // some Next.js / managed-process deploy paths they can be missing.
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

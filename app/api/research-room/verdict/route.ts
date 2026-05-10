import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { isResearchRoomEnabled } from '@/lib/feature-flags'
import { getUnlockedUser } from '@/lib/paid-status'
import { supabaseService } from '@/lib/supabase-admin'
import { loadVerdictEvidenceData, type LensKind } from '@/lib/research-comparison'
import { buildResearchVerdictDraft, type ResearchVerdictRecord } from '@/lib/server/research-room/verdict-generator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = {
  session_id: string
  base_lens_kind: LensKind
  force?: boolean
}

const UUID_RX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

function parseBody(raw: unknown): { body: Body | null; error?: string } {
  if (!raw || typeof raw !== 'object') return { body: null, error: 'body must be a JSON object' }
  const o = raw as Record<string, unknown>
  if (typeof o.session_id !== 'string' || !UUID_RX.test(o.session_id)) {
    return { body: null, error: 'session_id must be a UUID' }
  }
  const baseLensKind: LensKind = o.base_lens_kind === 'child_fit' ? 'child_fit' : 'general'
  return { body: { session_id: o.session_id, base_lens_kind: baseLensKind, force: o.force === true } }
}

function isMissingMigrationError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? '')
  return msg.includes("Could not find the table 'public.research_verdicts'") ||
    msg.includes('research_verdicts') && msg.includes('schema cache')
}

async function getAuthClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
}

async function isAllowedOrigin(): Promise<boolean> {
  const h = await headers()
  const origin = h.get('origin')
  if (!origin) return true
  const host = h.get('host')
  if (!host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

async function loadMatchingCachedVerdict(
  svc: ReturnType<typeof supabaseService>,
  sessionId: string,
  childId: string,
  lensId: string | null,
  baseLensKind: LensKind,
  inputHash: string,
): Promise<ResearchVerdictRecord | null> {
  let q = svc
    .from('research_verdicts')
    .select('id, input_hash, verdict_json, body_markdown, generated_at')
    .eq('session_id', sessionId)
    .eq('child_id', childId)
    .eq('input_hash', inputHash)

  q = lensId
    ? q.eq('lens_id', lensId)
    : q.is('lens_id', null).eq('base_lens_kind', baseLensKind)

  const { data, error } = await q.maybeSingle()
  if (error) throw new Error(`verdict cache read failed: ${error.message}`)
  if (!data) return null
  return {
    id: data.id,
    input_hash: data.input_hash,
    verdict_json: data.verdict_json as ResearchVerdictRecord['verdict_json'],
    body_markdown: data.body_markdown,
    generated_at: data.generated_at,
  }
}

function collectLensWeights(rows: Array<{ weights: Record<string, unknown> | null; visible_rows: string[] | null }>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of rows) {
    for (const [rowId, raw] of Object.entries(row.weights ?? {})) {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) continue
      out[rowId] = Math.max(out[rowId] ?? 0, raw)
    }
    for (const rowId of row.visible_rows ?? []) {
      out[rowId] = Math.max(out[rowId] ?? 0, 1)
    }
  }
  return out
}

export async function POST(req: NextRequest) {
  if (!isResearchRoomEnabled()) {
    return NextResponse.json({ ok: false, code: 'feature_disabled' }, { status: 404 })
  }
  if (!(await isAllowedOrigin())) {
    return NextResponse.json({ ok: false, code: 'forbidden_origin' }, { status: 403 })
  }

  let raw: unknown
  try { raw = await req.json() }
  catch { return NextResponse.json({ ok: false, code: 'invalid_json' }, { status: 400 }) }

  const { body, error } = parseBody(raw)
  if (!body) return NextResponse.json({ ok: false, code: 'invalid_payload', detail: error }, { status: 400 })

  const auth = await getAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, code: 'unauthorized' }, { status: 401 })

  const { isPaid } = await getUnlockedUser()
  if (!isPaid) return NextResponse.json({ ok: false, code: 'payment_required' }, { status: 402 })

  const svc = supabaseService()
  const { data: session, error: sessionErr } = await svc
    .from('research_sessions')
    .select('id, user_id, child_id, active_lens_id')
    .eq('id', body.session_id)
    .eq('user_id', user.id)
    .maybeSingle<{ id: string; user_id: string; child_id: string | null; active_lens_id: string | null }>()

  if (sessionErr) {
    console.error('[verdict] session lookup failed', sessionErr)
    return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })
  }
  if (!session || !session.child_id) {
    return NextResponse.json({ ok: false, code: 'not_found' }, { status: 404 })
  }

  const { data: child, error: childErr } = await svc
    .from('children')
    .select('id, name, child_profile')
    .eq('id', session.child_id)
    .eq('user_id', user.id)
    .eq('is_archived', false)
    .maybeSingle<{ id: string; name: string; child_profile: Record<string, unknown> | null }>()

  if (childErr) {
    console.error('[verdict] child lookup failed', childErr)
    return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })
  }
  if (!child) return NextResponse.json({ ok: false, code: 'not_found' }, { status: 404 })

  let baseLensKind = body.base_lens_kind
  const lensId = session.active_lens_id
  if (lensId) {
    const { data: lens, error: lensErr } = await svc
      .from('comparison_lenses')
      .select('id, base_lens_kind')
      .eq('id', lensId)
      .eq('session_id', session.id)
      .eq('user_id', user.id)
      .maybeSingle<{ id: string; base_lens_kind: LensKind }>()
    if (lensErr) {
      console.error('[verdict] lens lookup failed', lensErr)
      return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })
    }
    if (lens?.base_lens_kind === 'general' || lens?.base_lens_kind === 'child_fit') {
      baseLensKind = lens.base_lens_kind
    }
  }

  let comparisonData
  try {
    comparisonData = await loadVerdictEvidenceData(svc, user.id, child.id, session.id)
  } catch (e) {
    console.error('[verdict] evidence load failed', e)
    return NextResponse.json({ ok: false, code: 'comparison_failed' }, { status: 500 })
  }
  if (comparisonData.schools.length < 1 || comparisonData.rows.length < 1) {
    return NextResponse.json({ ok: false, code: 'empty_comparison' }, { status: 409 })
  }

  let lensWeightsByRowId: Record<string, number> = {}
  const { data: lensWeightRows, error: lensWeightErr } = await svc
    .from('comparison_lenses')
    .select('weights, visible_rows')
    .eq('session_id', session.id)
    .eq('user_id', user.id)
  if (lensWeightErr) {
    console.error('[verdict] lens weights lookup failed', lensWeightErr)
  } else {
    lensWeightsByRowId = collectLensWeights((lensWeightRows ?? []) as Array<{ weights: Record<string, unknown> | null; visible_rows: string[] | null }>)
  }

  const draft = buildResearchVerdictDraft({
    comparisonData,
    childName: child.name,
    childProfile: child.child_profile,
    sessionId: session.id,
    childId: child.id,
    baseLensKind,
    activeLensId: lensId,
    lensWeightsByRowId,
  })

  try {
    const cached = await loadMatchingCachedVerdict(svc, session.id, child.id, lensId, baseLensKind, draft.inputHash)
    if (cached && !body.force) {
      return NextResponse.json({ ok: true, status: 'cached', verdict: cached }, { status: 200 })
    }

    if (cached) {
      const { data: updated, error: updateErr } = await svc
        .from('research_verdicts')
        .update({
          verdict_json: draft.verdict,
          body_markdown: draft.bodyMarkdown,
          generated_at: new Date().toISOString(),
        })
        .eq('id', cached.id)
        .select('id, input_hash, verdict_json, body_markdown, generated_at')
        .single()
      if (updateErr) throw updateErr
      return NextResponse.json({ ok: true, status: 'refreshed', verdict: updated }, { status: 200 })
    }

    const { data: inserted, error: insertErr } = await svc
      .from('research_verdicts')
      .insert({
        user_id: user.id,
        child_id: child.id,
        session_id: session.id,
        lens_id: lensId,
        base_lens_kind: baseLensKind,
        input_hash: draft.inputHash,
        verdict_json: draft.verdict,
        body_markdown: draft.bodyMarkdown,
      })
      .select('id, input_hash, verdict_json, body_markdown, generated_at')
      .single()
    if (insertErr) throw insertErr

    return NextResponse.json({ ok: true, status: 'fresh', verdict: inserted }, { status: 201 })
  } catch (e) {
    if (isMissingMigrationError(e)) {
      return NextResponse.json({ ok: false, code: 'migration_missing' }, { status: 500 })
    }
    console.error('[verdict] save failed', e)
    return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })
  }
}

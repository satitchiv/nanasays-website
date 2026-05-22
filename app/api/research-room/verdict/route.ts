import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { isResearchRoomEnabled } from '@/lib/feature-flags'
import { getUnlockedUser } from '@/lib/paid-status'
import { supabaseService } from '@/lib/supabase-admin'
import { loadVerdictEvidenceData, type LensKind } from '@/lib/research-comparison'
import { loadVerdictSchoolFacts } from '@/lib/server/research-room/load-verdict-school-facts'
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
  inputHash: string,
): Promise<ResearchVerdictRecord | null> {
  // R4-MUST-2 + R5-MUST-2: drop lens filtering. Cache identity is now
  // (session_id, child_id, input_hash) only — matches the new UNIQUE index
  // from 2026-05-21-verdict-cache-identity-drop-lens.sql.
  const { data, error } = await svc
    .from('research_verdicts')
    .select('id, input_hash, verdict_json, body_markdown, generated_at')
    .eq('session_id', sessionId)
    .eq('child_id', childId)
    .eq('input_hash', inputHash)
    .maybeSingle()
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

// R2-F2 + R4-MUST-2: `collectLensWeights` deleted in v3. Lens weights no
// longer drive scoring or cache identity (verdict is all-evidence).

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
  // Codex r1 NIT + r2 carry-forward (2026-05-22): active_lens_id is no longer
  // used by the v3 verdict — cache identity dropped lens scope. Selecting it
  // was dead weight.
  const { data: session, error: sessionErr } = await svc
    .from('research_sessions')
    .select('id, user_id, child_id')
    .eq('id', body.session_id)
    .eq('user_id', user.id)
    .maybeSingle<{ id: string; user_id: string; child_id: string | null }>()

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

  // R4-MUST-2: active-lens lookup REMOVED in v3. Verdict reads all-evidence
  // rows regardless of which lens is active. base_lens_kind is no longer
  // part of cache identity; we write 'general' as an ignored legacy value
  // when inserting (see upsert below).


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

  // R2-F2 + R4-MUST-2: lens-weight collection block REMOVED. Lens weights no
  // longer drive scoring or cache identity.

  // R5-MUST-5 + R6-MUST-3: enrich the verdict with structured-data facts
  // (grades, fees, location, students, curriculum) so v3 path overlays +
  // budget tensions + the fact ribbon have real values.
  const schoolFacts = await loadVerdictSchoolFacts(
    svc,
    comparisonData.schools.map(s => s.slug),
  )

  const draft = buildResearchVerdictDraft({
    comparisonData,
    childName: child.name,
    childProfile: child.child_profile,
    sessionId: session.id,
    childId: child.id,
    schoolFacts,
  })

  try {
    const cached = await loadMatchingCachedVerdict(svc, session.id, child.id, draft.inputHash)
    if (cached && !body.force) {
      return NextResponse.json({ ok: true, status: 'cached', verdict: cached }, { status: 200 })
    }

    // R4-MUST-1: atomic upsert keyed on (session_id, child_id, input_hash) so
    // two concurrent "Generate verdict" requests don't race on the UNIQUE
    // index from 2026-05-21-verdict-cache-identity-drop-lens.sql.
    // R5-MUST-2: base_lens_kind written as 'general' (ignored legacy value)
    // because the slice-7 schema's NOT NULL + CHECK constraint still applies.
    const { data: upserted, error: upsertErr } = await svc
      .from('research_verdicts')
      .upsert(
        {
          user_id:        user.id,
          child_id:       child.id,
          session_id:     session.id,
          lens_id:        null,
          base_lens_kind: 'general',
          input_hash:     draft.inputHash,
          verdict_json:   draft.verdict,
          body_markdown:  draft.bodyMarkdown,
          generated_at:   new Date().toISOString(),
        },
        { onConflict: 'session_id,child_id,input_hash' },
      )
      .select('id, input_hash, verdict_json, body_markdown, generated_at')
      .single()
    if (upsertErr) throw upsertErr

    return NextResponse.json({
      ok:      true,
      status:  cached ? 'refreshed' : 'fresh',
      verdict: upserted,
    }, { status: cached ? 200 : 201 })
  } catch (e) {
    if (isMissingMigrationError(e)) {
      return NextResponse.json({ ok: false, code: 'migration_missing' }, { status: 500 })
    }
    console.error('[verdict] save failed', e)
    return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })
  }
}

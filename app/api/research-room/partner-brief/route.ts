import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { isResearchRoomEnabled } from '@/lib/feature-flags'
import { getUnlockedUser } from '@/lib/paid-status'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Section = 'opening' | 'why_it_matters' | 'tradeoffs' | 'questions' | 'next_step'
type SaveBody = {
  action: 'save'
  child_id: string
  body_markdown: string
}
type AppendSectionBody = {
  action: 'append_section'
  child_id: string
  section: Section
  body_markdown: string
}
type GenerateBody = {
  action: 'generate_from_verdict'
  child_id: string
  session_id: string
}
type Body = SaveBody | AppendSectionBody | GenerateBody

const UUID_RX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const SECTIONS = new Set<Section>(['opening', 'why_it_matters', 'tradeoffs', 'questions', 'next_step'])
const MAX_BRIEF_CHARS = 64000
const MAX_APPEND_CHARS = 2400

function hasHtml(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text)
}

function sectionTitle(section: Section): string {
  switch (section) {
    case 'opening':        return 'Opening'
    case 'why_it_matters': return 'Why this matters'
    case 'tradeoffs':      return 'Tradeoffs'
    case 'questions':      return 'Questions to ask'
    case 'next_step':      return 'Next step'
  }
}

function parseBody(raw: unknown): { body: Body | null; error?: string } {
  if (!raw || typeof raw !== 'object') return { body: null, error: 'body must be a JSON object' }
  const o = raw as Record<string, unknown>
  if (o.action !== 'save' && o.action !== 'append_section' && o.action !== 'generate_from_verdict') {
    return { body: null, error: 'action must be save | append_section | generate_from_verdict' }
  }
  if (typeof o.child_id !== 'string' || !UUID_RX.test(o.child_id)) {
    return { body: null, error: 'child_id must be a UUID' }
  }

  if (o.action === 'generate_from_verdict') {
    if (typeof o.session_id !== 'string' || !UUID_RX.test(o.session_id)) {
      return { body: null, error: 'session_id must be a UUID' }
    }
    return { body: { action: 'generate_from_verdict', child_id: o.child_id, session_id: o.session_id } }
  }

  if (typeof o.body_markdown !== 'string') {
    return { body: null, error: 'body_markdown must be a string' }
  }
  const bodyMarkdown = o.body_markdown.trim()
  if (hasHtml(bodyMarkdown)) {
    return { body: null, error: 'body_markdown must be markdown, not HTML' }
  }

  if (o.action === 'save') {
    if (bodyMarkdown.length > MAX_BRIEF_CHARS) {
      return { body: null, error: `body_markdown must be <= ${MAX_BRIEF_CHARS} chars` }
    }
    return { body: { action: 'save', child_id: o.child_id, body_markdown: bodyMarkdown } }
  }

  if (typeof o.section !== 'string' || !SECTIONS.has(o.section as Section)) {
    return { body: null, error: 'section is invalid' }
  }
  if (bodyMarkdown.length < 1 || bodyMarkdown.length > MAX_APPEND_CHARS) {
    return { body: null, error: `body_markdown must be 1..${MAX_APPEND_CHARS} chars` }
  }
  return {
    body: {
      action: 'append_section',
      child_id: o.child_id,
      section: o.section as Section,
      body_markdown: bodyMarkdown,
    },
  }
}

function buildBriefFromVerdict(verdictJson: unknown): string {
  const v = (verdictJson && typeof verdictJson === 'object') ? verdictJson as any : {}
  // R3-P1 + R4-MUST-1: hybrid ranked_schools[] contains below-threshold schools
  // appended at the bottom with `coverage_below_threshold: true`. For top/second
  // semantics we filter them out so a thin-coverage school doesn't become the
  // partner-brief headline. Legacy v2 records have no flag — they pass through.
  const ranked = Array.isArray(v.ranked_schools) ? v.ranked_schools : []
  const eligible = ranked.filter((s: any) => !s?.coverage_below_threshold)
  const top = eligible[0]
  const second = eligible[1]
  const topName = typeof top?.name === 'string' ? top.name : 'the current lead'
  const secondName = typeof second?.name === 'string' ? second.name : null
  const headline = typeof v.headline === 'string' ? v.headline : `${topName} is the current lead`
  const bestForChild = typeof v.best_for_child === 'string' ? v.best_for_child : headline
  const dissenting = typeof v.dissenting_view === 'string' ? v.dissenting_view : ''
  const gaps = Array.isArray(v.evidence_gaps) ? v.evidence_gaps.filter((g: unknown) => typeof g === 'string').slice(0, 4) : []

  const lines = [
    '### Opening',
    '',
    `I think ${topName} is where the research is currently pointing.`,
    '',
    '### Why this matters',
    '',
    bestForChild,
  ]

  if (secondName) {
    lines.push('', '### Tradeoffs', '', `${secondName} is still worth keeping in the conversation, but the current verdict puts ${topName} ahead on the full Research Room evidence.`)
  }
  if (dissenting) {
    lines.push('', '### Dissenting view', '', dissenting)
  }
  if (gaps.length > 0) {
    lines.push('', '### Questions to ask', '')
    for (const gap of gaps) lines.push(`- ${gap}`)
  }
  lines.push('', '### Next step', '', `I suggest we check the evidence gaps, then decide whether ${topName} should be the first visit or first follow-up call.`)
  return lines.join('\n')
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

  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, code: 'unauthorized' }, { status: 401 })

  const { isPaid } = await getUnlockedUser()
  if (!isPaid) return NextResponse.json({ ok: false, code: 'payment_required' }, { status: 402 })

  const { data: child, error: childErr } = await supabase
    .from('children')
    .select('id')
    .eq('id', body.child_id)
    .eq('user_id', user.id)
    .eq('is_archived', false)
    .maybeSingle()

  if (childErr) {
    console.error('[partner-brief] child lookup failed', childErr)
    return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })
  }
  if (!child) return NextResponse.json({ ok: false, code: 'not_found' }, { status: 404 })

  let nextBody = ''
  let sourceSessionId: string | null = null
  if (body.action === 'generate_from_verdict') {
    const { data: session, error: sessionErr } = await supabase
      .from('research_sessions')
      .select('id')
      .eq('id', body.session_id)
      .eq('user_id', user.id)
      .eq('child_id', body.child_id)
      .maybeSingle()
    if (sessionErr) {
      console.error('[partner-brief] session lookup failed', sessionErr)
      return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })
    }
    if (!session) return NextResponse.json({ ok: false, code: 'not_found' }, { status: 404 })

    const { data: verdict, error: verdictErr } = await supabase
      .from('research_verdicts')
      .select('verdict_json')
      .eq('session_id', body.session_id)
      .eq('child_id', body.child_id)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ verdict_json: unknown }>()
    if (verdictErr) {
      console.error('[partner-brief] verdict lookup failed', verdictErr)
      return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })
    }
    if (!verdict) {
      return NextResponse.json({ ok: false, code: 'missing_verdict' }, { status: 409 })
    }

    nextBody = buildBriefFromVerdict(verdict.verdict_json)
    sourceSessionId = body.session_id
  } else {
    nextBody = body.body_markdown
  }

  if (body.action === 'append_section') {
    const { data: current, error: currentErr } = await supabase
      .from('partner_briefs')
      .select('body_markdown')
      .eq('child_id', body.child_id)
      .maybeSingle<{ body_markdown: string | null }>()
    if (currentErr) {
      console.error('[partner-brief] current read failed', currentErr)
      return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })
    }
    const existing = current?.body_markdown?.trim() ?? ''
    const snippet = `### ${sectionTitle(body.section)}\n\n${body.body_markdown}`
    nextBody = existing ? `${existing}\n\n${snippet}` : snippet
    if (nextBody.length > MAX_BRIEF_CHARS) {
      return NextResponse.json({ ok: false, code: 'too_long' }, { status: 400 })
    }
  }

  const now = new Date().toISOString()
  const { data: saved, error: saveErr } = await supabase
    .from('partner_briefs')
    .upsert({
      user_id: user.id,
      child_id: body.child_id,
      body_markdown: nextBody || null,
      ...(sourceSessionId ? { source_session_id: sourceSessionId } : {}),
      generated_at: now,
    }, { onConflict: 'child_id' })
    .select('id, tone, body_markdown, generated_at, share_token')
    .single()

  if (saveErr) {
    console.error('[partner-brief] save failed', saveErr)
    return NextResponse.json({ ok: false, code: 'internal' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, brief: saved }, { status: body.action === 'append_section' ? 201 : 200 })
}

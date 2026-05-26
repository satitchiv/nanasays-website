// Internal eval-only endpoint — recommender quality battery.
//
// Route path: /api/research-room/eval-score (no leading underscore — Next.js
// App Router opts underscore-prefixed dirs out of routing).
//
// Sits BESIDE the production /api/research-room/build-mode/finalize route
// and exposes the same `classifyBuildModeIntent → scoreForBuildMode`
// pipeline without the LLM proposal-streaming, message persistence, or
// session-id plumbing. The eval harness (scripts/eval/eval-recommender-
// battery.mjs) POSTs a synthesised brief + child object and consumes the
// scored shortlist directly.
//
// Hard-stop compliance — no Anthropic SDK, no Claude CLI subprocess (the
// harness handles those for parent + judge). This route only invokes
// OpenAI via classifyBuildModeIntent + service-role Supabase reads via
// scoreForBuildMode.
//
// Gating — requires header `x-nana-eval-token` to match env
// NANA_EVAL_TOKEN. Belt-and-braces refuses in production
// (NODE_ENV === 'production'). 404 on any miss so existence isn't
// signalled to the public internet.

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseService } from '@/lib/supabase-admin'
import { scoreForBuildMode, type ScoredCandidate } from '@/lib/research-room/score-for-build-mode'
import {
  classifyBuildModeIntent,
  type BuildModeIntent,
} from '@/lib/server/research-room/classify-build-mode-intent'
import type { BriefProfile } from '@/lib/research-room/brief-predicates'
import type { BuildModeExtractionHTTP } from '@/lib/server/research-room/build-mode-schemas'

export const runtime  = 'nodejs'
export const dynamic  = 'force-dynamic'

// Codex r1 P2 — return a fresh NextResponse per request. Reusing a
// module-level instance risks header/cookie state leaking between
// concurrent rejections.
function notFound(): NextResponse {
  return NextResponse.json({ error: 'not_found' }, { status: 404 })
}

const SCORER_LIMIT = 20

type EvalRequestBody = {
  brief:        BriefProfile | null
  child:        BuildModeExtractionHTTP | null
  excludeSlugs?: string[]
  childGender?: string | null
  childYear?:   string | null
}

type EvalResponseBody = {
  intent:     BuildModeIntent
  candidates: ScoredCandidate[]
  reason:     'ok' | 'no_candidates' | 'fetch_failed'
  meta: {
    scorer_limit: number
    classified_in_ms: number
    scored_in_ms:    number
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Production guardrail — this endpoint must NEVER be reachable in prod.
  if (process.env.NODE_ENV === 'production') return notFound()

  // Token gate — require a non-empty NANA_EVAL_TOKEN and a matching header.
  const expectedToken = (process.env.NANA_EVAL_TOKEN || '').trim()
  if (!expectedToken) return notFound()
  const providedToken = (req.headers.get('x-nana-eval-token') || '').trim()
  if (providedToken !== expectedToken) return notFound()

  let body: EvalRequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 })
  }

  const { brief, child, excludeSlugs, childGender, childYear } = body
  if (brief === undefined || child === undefined) {
    return NextResponse.json({ error: 'missing_brief_or_child' }, { status: 400 })
  }

  const t0 = Date.now()
  const intent = await classifyBuildModeIntent({
    academic_notes:    child?.academic_notes    ?? null,
    goals_notes:       child?.goals_notes       ?? null,
    personality_notes: child?.personality_notes ?? null,
    child_wants:       child?.child_wants       ?? null,
    anchors_notes:     child?.anchors_notes     ?? null,
  })
  const tClassified = Date.now()

  const svc = supabaseService()
  let candidates: ScoredCandidate[] = []
  let reason: 'ok' | 'no_candidates' | 'fetch_failed' = 'no_candidates'
  try {
    const scored = await scoreForBuildMode(
      svc,
      {
        parent:       brief,
        child,
        excludeSlugs: Array.isArray(excludeSlugs) ? excludeSlugs : [],
        childGender:  childGender ?? null,
        childYear:    childYear ?? null,
        intent,
      },
      SCORER_LIMIT,
    )
    candidates = scored.candidates
    reason     = scored.reason
  } catch (e) {
    console.warn('[__eval/score] scoreForBuildMode threw:', e)
    reason = 'fetch_failed'
  }
  const tScored = Date.now()

  const payload: EvalResponseBody = {
    intent,
    candidates,
    reason,
    meta: {
      scorer_limit:     SCORER_LIMIT,
      classified_in_ms: tClassified - t0,
      scored_in_ms:     tScored - tClassified,
    },
  }
  return NextResponse.json(payload)
}

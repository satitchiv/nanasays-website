import 'server-only'
import OpenAI from 'openai'
import { createHash } from 'crypto'
// usage-log.js is the central logger every paid API call funnels through;
// the Mission Control dashboard at http://100.100.120.57:8765 reads
// /tmp/claude-usage-YYYY-MM-DD.log. Mirrors nana-brain.js:36 import pattern.
import { logUsage } from './server/usage-log.js'

// Slice 4d preview: turn the 4 free-text Brief-tab notes (Personality /
// Anchors / Academic / Goals) into structured signals the recommender can
// score against. Calls OpenAI GPT-5.4 Mini (the live Nana LLM per
// NANA_PROVIDER=gpt) with response_format=json_object.
//
// Cached per-child by a hash of the concatenated notes — re-interpreting
// only when the parent edits a note. Persisted under
// `child_profile.notes_interpretation_v1` so recommendShortlist reads it
// straight from the same row.

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini'

export type NoteInterpretation = {
  academic_subjects:  string[]
  career_aim:         string | null
  community_pref:     'small' | 'medium' | 'large' | null
  boarding_readiness: 'ready' | 'unsure' | 'not_ready' | null
  sport_weight:       number
  arts_weight:        number
  academic_weight:    number
  signal_quality:     'rich' | 'thin' | 'noisy'
  summary:            string
}

export type CachedInterpretation = NoteInterpretation & {
  notes_hash: string
  model:      string
  generated_at: string
}

export type NotesInput = {
  personality_notes: string | null
  anchors_notes:     string | null
  academic_notes:    string | null
  goals_notes:       string | null
}

export type ProfileContext = {
  child_year:    string | null
  home_region:   string | null
  boarding_pref: string | null
  budget_range:  string | null
  top_priority:  string | null
}

// Codex P3.2: NFC-normalise before trimming so visually-identical Unicode
// (composed vs decomposed forms) hashes the same and we don't waste an LLM
// call on cosmetic re-encoding.
function canonicalNote(s: string | null): string {
  return (s ?? '').normalize('NFC').trim()
}

export function notesHash(notes: NotesInput): string {
  const blob = JSON.stringify({
    p: canonicalNote(notes.personality_notes),
    a: canonicalNote(notes.anchors_notes),
    c: canonicalNote(notes.academic_notes),
    g: canonicalNote(notes.goals_notes),
  })
  return createHash('sha256').update(blob).digest('hex').slice(0, 16)
}

export function notesAreEmpty(notes: NotesInput): boolean {
  return (
    !notes.personality_notes?.trim() &&
    !notes.anchors_notes?.trim() &&
    !notes.academic_notes?.trim() &&
    !notes.goals_notes?.trim()
  )
}

const SYSTEM_PROMPT = `You extract structured signals from a parent's free-text notes about their child for school matching. The notes are short, often messy, sometimes gibberish.

Return JSON ONLY matching this exact shape:
{
  "academic_subjects": [string, ...],         // lowercase canonical subjects mentioned, e.g. "math", "science", "history". Empty array if none.
  "career_aim": string | null,                // one of: "medicine", "law", "engineering", "finance", "research", "arts", "sport", "tech", "other". null if not stated.
  "community_pref": "small" | "medium" | "large" | null,  // infer from personality cues (introvert/quiet/shy → small; outgoing/thrives in groups → medium/large). null if no signal.
  "boarding_readiness": "ready" | "unsure" | "not_ready" | null,
  "sport_weight": number,                     // 0..1, intensity of sport ambitions in the notes
  "arts_weight": number,                      // 0..1, intensity of arts/music/drama mentions
  "academic_weight": number,                  // 0..1, intensity of academic priorities/strengths
  "signal_quality": "rich" | "thin" | "noisy",  // rich=clear actionable signal; thin=brief but real; noisy=mostly gibberish or contradictions
  "summary": string                            // ONE sentence explaining the signals you extracted
}

Rules:
- Only extract what's actually in the notes. Do NOT invent.
- If a note is gibberish like "sdfjsd", treat it as noise and pull no signal from it.
- If ALL notes are noise, return signal_quality="noisy", all weights=0, all enums=null, academic_subjects=[].
- Weights MUST be in [0, 1]. Default to 0 when no signal.
- Return ONLY the JSON object — no prose, no code fences.`

function buildUserMessage(notes: NotesInput, context: ProfileContext): string {
  const parts: string[] = []
  parts.push('Parent dropdown answers (context only — do not extract from these):')
  parts.push(`- Year: ${context.child_year ?? 'not set'}`)
  parts.push(`- Region: ${context.home_region ?? 'not set'}`)
  parts.push(`- Boarding pref: ${context.boarding_pref ?? 'not set'}`)
  parts.push(`- Budget: ${context.budget_range ?? 'not set'}`)
  parts.push(`- Top priority: ${context.top_priority ?? 'not set'}`)
  parts.push('')
  parts.push('Free-text notes (extract from these):')
  parts.push(`- Personality: ${notes.personality_notes?.trim() || '(empty)'}`)
  parts.push(`- Anchors: ${notes.anchors_notes?.trim() || '(empty)'}`)
  parts.push(`- Academic: ${notes.academic_notes?.trim() || '(empty)'}`)
  parts.push(`- Goals: ${notes.goals_notes?.trim() || '(empty)'}`)
  return parts.join('\n')
}

let _client: OpenAI | null = null
function client(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY not set — cannot interpret notes')
    _client = new OpenAI({ apiKey })
  }
  return _client
}

function clamp01(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function asStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function validateAndNormalise(raw: unknown): NoteInterpretation {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  // Codex P3.1: cap raw array length AND individual subject string length so
  // a bad LLM response can't bloat the cache or pass long substrings into
  // the recommender's `tag.includes(subj)` check.
  const subjects = Array.isArray(r.academic_subjects)
    ? r.academic_subjects
        .slice(0, 16)
        .filter((s): s is string => typeof s === 'string')
        .map(s => s.toLowerCase().trim().slice(0, 50))
        .filter(Boolean)
    : []

  const careerRaw = asStr(r.career_aim)?.toLowerCase() ?? null
  const careerAllow = new Set(['medicine', 'law', 'engineering', 'finance', 'research', 'arts', 'sport', 'tech', 'other'])
  const career = careerRaw && careerAllow.has(careerRaw) ? careerRaw : null

  const commRaw = asStr(r.community_pref)?.toLowerCase() ?? null
  const community = (commRaw === 'small' || commRaw === 'medium' || commRaw === 'large') ? commRaw : null

  const boardRaw = asStr(r.boarding_readiness)?.toLowerCase() ?? null
  const boarding = (boardRaw === 'ready' || boardRaw === 'unsure' || boardRaw === 'not_ready') ? boardRaw : null

  // Codex P2.3: fail-noisy on missing/invalid signal_quality. Recommender
  // filters 'noisy' at load time, so an LLM that omits the field gets
  // ignored rather than silently boosting on whatever weights came back.
  const qRaw = asStr(r.signal_quality)?.toLowerCase() ?? 'noisy'
  const quality = (qRaw === 'rich' || qRaw === 'thin' || qRaw === 'noisy') ? qRaw : 'noisy'

  return {
    academic_subjects:  subjects.slice(0, 8),
    career_aim:         career,
    community_pref:     community,
    boarding_readiness: boarding,
    sport_weight:       clamp01(r.sport_weight),
    arts_weight:        clamp01(r.arts_weight),
    academic_weight:    clamp01(r.academic_weight),
    signal_quality:     quality,
    summary:            (asStr(r.summary) ?? '').slice(0, 280),
  }
}

// Calls GPT-5.4 Mini with the 4 notes + parent profile context. Returns a
// validated/normalised interpretation, or null if the LLM call fails or
// returns unparseable output (caller falls back to the dropdown profile only).
//
// Usage is logged to /tmp/claude-usage-YYYY-MM-DD.log via logUsage so the
// Mission Control Costs tab picks up each refresh's spend automatically.
export async function interpretChildNotes(
  notes: NotesInput,
  context: ProfileContext,
  childIdLabel?: string,
): Promise<CachedInterpretation | null> {
  if (notesAreEmpty(notes)) return null

  let parsed: unknown
  let modelUsed = OPENAI_MODEL
  try {
    const resp = await client().chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: buildUserMessage(notes, context) },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 600,
    })
    modelUsed = resp.model || OPENAI_MODEL

    // Telemetry: feed the dashboard's Costs tab. Mirrors llm-adapter.js's
    // openaiStream usage extraction so computeCostUSD prices it via the
    // 'gpt-5-4-mini' entry in PRICING_PER_MTOK.
    try {
      const u = resp.usage as
        | { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } }
        | undefined
      if (u) {
        const promptTotal = u.prompt_tokens     ?? 0
        const completion  = u.completion_tokens ?? 0
        const cacheRead   = u.prompt_tokens_details?.cached_tokens ?? 0
        logUsage({
          provider: 'openai',
          model:    modelUsed,
          label:    childIdLabel
            ? `rr-refresh:notes-interpret:${childIdLabel}`
            : 'rr-refresh:notes-interpret',
          in:        Math.max(0, promptTotal - cacheRead),
          out:       completion,
          cacheRead,
        })
      }
    } catch {
      // telemetry failure must never abort the call
    }

    const content = resp.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) return null
    parsed = JSON.parse(content)
  } catch (e) {
    console.error('[interpretChildNotes] failed:', e instanceof Error ? e.message : e)
    return null
  }

  const interpretation = validateAndNormalise(parsed)
  return {
    ...interpretation,
    notes_hash:   notesHash(notes),
    model:        modelUsed,
    generated_at: new Date().toISOString(),
  }
}

// Helper for callers that want to skip the LLM call when notes haven't
// changed since the last cached interpretation.
export function isCacheValid(
  cached: CachedInterpretation | null | undefined,
  currentNotes: NotesInput,
): boolean {
  if (!cached || typeof cached !== 'object') return false
  if (typeof cached.notes_hash !== 'string') return false
  return cached.notes_hash === notesHash(currentNotes)
}

// Evidence packs — compact per-school verified-fact bundles for the
// reasoned-shortlist stage (recommender-quality slice, 2026-07-06).
//
// Ported from the 2026-07-05 experiment builder (41 schools, avg 4.6KB/pack).
// The reasoning prompt embeds these as the model's ENTIRE world — richer
// packs mean better-grounded reasons; missing fields mean the model must
// say "evidence thin" instead of hallucinating.
//
// Design:
//   - Two batched selects (schools, school_structured_data) — read-only.
//   - Never throws. DB error → {} (caller treats empty packs as
//     "no evidence" and falls back to deterministic order).
//   - Missing SSD row → pack with meta only; the reasoner sees thin
//     evidence honestly.
//   - Field caps keep a 20-school pool ≈ 90KB of prompt payload.
//   - Codex r1 #8: free-text fields are school-controlled (extracted from
//     school websites) and therefore UNTRUSTED. sanitizeEvidenceText
//     neutralizes instruction-like phrases before they reach the prompt;
//     the reasoning system prompt additionally pins all pack text as
//     evidence-never-instructions. Structural slug validation upstream
//     means injected text can never add a school.

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface EvidencePack {
  name?: string
  city?: string
  region?: string
  gender?: string
  boarding?: unknown
  boarding_type?: string
  religion?: string
  ages?: string
  school_type?: string
  curriculum?: unknown
  sixth_form_curriculum?: string
  fees?: string
  exam_results?: unknown
  university_destinations?: unknown
  sports?: {
    signature?: unknown
    categories?: unknown
    competitions?: string[]
    achievements?: unknown[]
    big_five?: Record<string, unknown>
  }
  subject_strengths_subjects?: Record<string, number>
  pastoral?: string
  pastoral_model?: string
  wellbeing_staffing?: string
  scholarships?: unknown
  community?: string
}

// Neutralize instruction-like phrases in school-controlled free text
// (Codex r1 #8). Deliberately narrow — evidence prose must survive intact;
// we only defuse text that addresses the model imperatively.
const INSTRUCTION_LIKE_RE =
  /\b(ignore|disregard|forget|override)\b[^.\n]{0,80}\b(instructions?|rules?|prompt|above|previous)\b|\bsystem\s*prompt\b|\byou\s+(are|must|should)\b[^.\n]{0,80}\b(rank|recommend|pick|choose|place)\b/gi

export function sanitizeEvidenceText(s: string): string {
  return s
    .replace(INSTRUCTION_LIKE_RE, '[removed]')
    // Strip C0/C1 control chars except \n and \t (same scrub family as the
    // umbrella-router _sanitise hardening).
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
}

const cap = (v: unknown, n: number): string | undefined => {
  if (v == null) return undefined
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  if (!s) return undefined
  const clipped = s.length > n ? s.slice(0, n) + '…' : s
  return sanitizeEvidenceText(clipped)
}

const BIG_FIVE = ['tennis', 'rugby', 'cricket', 'football', 'hockey'] as const

export async function buildEvidencePacks(
  supabase: SupabaseClient,
  slugs: string[],
): Promise<Record<string, EvidencePack>> {
  if (!slugs.length) return {}
  try {
    const [metaRes, ssdRes] = await Promise.all([
      supabase
        .from('schools')
        .select('slug, name, city, region, gender_split, boarding, boarding_type, religious_affiliation, age_min, age_max, school_type')
        .in('slug', slugs),
      supabase
        .from('school_structured_data')
        .select('school_slug, fees_min, fees_max, fees_currency, fees_includes_boarding, curriculum, exam_results, university_destinations, sports_profile, subject_strengths, pastoral_care, pastoral_model, wellbeing_staffing, sixth_form_curriculum, scholarships_available, student_community')
        .in('school_slug', slugs),
    ])
    // Codex r2 P1: fail CLOSED on either select error — partial packs would
    // weaken the verified-evidence rule; caller falls back to deterministic.
    if (metaRes.error || ssdRes.error) {
      console.warn('[evidence-packs] select failed:', metaRes.error?.message ?? ssdRes.error?.message)
      return {}
    }
    const metaBySlug = new Map((metaRes.data ?? []).map((m) => [m.slug as string, m]))
    const ssdBySlug = new Map((ssdRes.data ?? []).map((s) => [s.school_slug as string, s]))

    const packs: Record<string, EvidencePack> = {}
    for (const slug of slugs) {
      const m = metaBySlug.get(slug) as Record<string, unknown> | undefined
      const s = ssdBySlug.get(slug) as Record<string, unknown> | undefined
      const sp = (s?.sports_profile ?? {}) as Record<string, unknown>
      const ss = (s?.subject_strengths ?? {}) as Record<string, unknown>

      const bigFive: Record<string, unknown> = {}
      for (const sport of BIG_FIVE) {
        const d = sp[sport] as Record<string, unknown> | undefined
        if (d && typeof d === 'object') {
          bigFive[sport] = {
            tier: d.competitive_tier,
            teams: Array.isArray(d.teams) ? d.teams.length : undefined,
            note: cap(d.summary ?? d.notes, 200),
          }
        }
      }

      const pack: EvidencePack = {
        name: (m?.name as string) ?? undefined,
        city: (m?.city as string) ?? undefined,
        region: (m?.region as string) ?? undefined,
        gender: (m?.gender_split as string) ?? undefined,
        boarding: m?.boarding ?? undefined,
        boarding_type: (m?.boarding_type as string) ?? undefined,
        religion: (m?.religious_affiliation as string) ?? undefined,
        ages: m ? `${m.age_min ?? '?'}-${m.age_max ?? '?'}` : undefined,
        school_type: (m?.school_type as string) ?? undefined,
        curriculum: s?.curriculum ?? m?.curriculum ?? undefined,
        sixth_form_curriculum: (s?.sixth_form_curriculum as string) ?? undefined,
        fees: s?.fees_min != null
          ? `${s.fees_currency ?? ''} ${s.fees_min}-${s.fees_max}${s.fees_includes_boarding ? ' (incl boarding)' : ''}`
          : undefined,
        exam_results: s?.exam_results ? cap(s.exam_results, 900) : undefined,
        university_destinations: Array.isArray(s?.university_destinations)
          ? (s!.university_destinations as unknown[]).slice(0, 8)
          : s?.university_destinations
            ? cap(s.university_destinations, 500)
            : undefined,
        sports: {
          signature: sp.signature_sports ?? undefined,
          categories: sp.sport_categories ?? undefined,
          competitions: Array.isArray(sp.competitions_entered)
            ? (sp.competitions_entered as Array<Record<string, unknown>>)
                .map((c) => `${c.sport}: ${c.name} (${c.scope})`)
                .slice(0, 12)
            : undefined,
          achievements: Array.isArray(sp.notable_achievements)
            ? (sp.notable_achievements as unknown[]).slice(0, 6)
            : undefined,
          big_five: Object.keys(bigFive).length ? bigFive : undefined,
        },
        subject_strengths_subjects: Object.fromEntries(
          Object.entries(ss)
            .filter(([, v]) => Array.isArray(v) && v.length)
            .map(([k, v]) => [k, (v as unknown[]).length])
            .slice(0, 15),
        ),
        pastoral: cap(s?.pastoral_care, 450),
        pastoral_model: (s?.pastoral_model as string) ?? undefined,
        wellbeing_staffing: cap(s?.wellbeing_staffing, 350),
        scholarships: s?.scholarships_available ?? undefined,
        community: cap(s?.student_community, 300),
      }
      // Drop empty branches so packs stay small and the model can't cite blanks.
      for (const k of Object.keys(pack) as Array<keyof EvidencePack>) {
        const v = pack[k]
        if (
          v == null ||
          (typeof v === 'object' && !Array.isArray(v) && !Object.values(v as object).some((x) => x != null)) ||
          (Array.isArray(v) && !v.length)
        ) {
          delete pack[k]
        }
      }
      packs[slug] = pack
    }
    return packs
  } catch (err) {
    console.warn('[evidence-packs] failed:', (err as Error)?.message)
    return {}
  }
}

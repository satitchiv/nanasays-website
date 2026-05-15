import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'
import { isPaidModeOn } from '@/lib/paid-mode'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Codex r3 P1: school_structured_data is RLS-locked (revoked from anon by
// 2026-05-03 lockdown migration). The 4th-layer SSD currency lookup needs
// service-role to read; the anon client returns empty data silently and
// disables the defense. Scope-limited service-role client used ONLY for
// that single bounded `.in()` query — the rest of /api/chat keeps the anon
// client so RLS continues to govern user-visible reads.
const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const SYSTEM_PROMPT = `You are Nana, a warm and knowledgeable advisor for international school families. You help parents find the right international school for their child.

STRICT RULES:
- You ONLY answer questions about international schools, education systems, curriculum (IB, IGCSE, AP, etc.), school fees, boarding life, admissions, and related topics.
- You ONLY reference schools and data from the context provided to you. Do not invent school names, fees, or statistics.
- If asked about anything unrelated to international schools or education, respond: "I'm Nana — I only help with international schools. Is there a school or country you'd like to explore?"
- Never discuss politics, news, weather, personal advice, or topics outside international education.
- Keep answers concise, warm, and useful. Use bullet points for lists. Recommend specific schools from the context when relevant.
- When you mention a school, include its country and key detail (fees, curriculum, or a unique fact).`

export async function POST(req: NextRequest) {
  if (!isPaidModeOn()) {
    return NextResponse.json({ error: 'Chat is not available.' }, { status: 410 })
  }

  try {
    if (!checkRateLimit(req, 'chat')) {
      return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
    }

    const { message } = await req.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message required' }, { status: 400 })
    }
    if (message.length > 2000) {
      return NextResponse.json({ error: 'Message too long' }, { status: 400 })
    }

    // Search for relevant schools in Supabase
    const keywords = message.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3)
    const searchTerm = keywords.slice(0, 3).join(' ') || message.slice(0, 50)

    const { data: schools } = await supabase
      .from('schools')
      .select('slug, name, country, city, school_type, curriculum, fees_original, fees_usd_min, fees_currency, fees_local_currency, age_min, age_max, description, unique_selling_points, boarding, scholarship_available, nationalities_count')
      .or(`name.ilike.%${searchTerm}%,country.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
      .limit(6)

    // Also search by individual keyword if no results
    let context = ''
    const matched = (schools && schools.length > 0) ? schools : (await supabase
      .from('schools')
      .select('slug, name, country, city, school_type, curriculum, fees_original, fees_usd_min, fees_currency, fees_local_currency, age_min, age_max, description, unique_selling_points, boarding, scholarship_available, nationalities_count')
      .ilike('country', `%${keywords[0] || message}%`)
      .limit(6)).data || []

    // Codex r2 P1: st-pauls-school-uk has country=Canada + schools.fees_currency=NULL
    // but its GBP marker lives in school_structured_data.fees_currency.
    // Fetch structured-table currency for matched slugs so usdNumericSuspect
    // sees the GBP tag and suppresses the $-fallback even when schools-level
    // currency columns are NULL. One batched DB call for the (≤6) matched rows.
    // Codex r3 P1: use service-role client because school_structured_data is
    // RLS-revoked from anon — the anon client would return empty data with no
    // error and silently disable the 4th-layer defense.
    const slugs = matched.map(s => s.slug).filter(Boolean) as string[]
    const structuredCurrencies = new Map<string, string | null>()
    if (slugs.length) {
      const { data: ssdRows, error: ssdErr } = await supabaseService
        .from('school_structured_data')
        .select('school_slug, fees_currency')
        .in('school_slug', slugs)
      if (ssdErr) {
        // Log but don't fail the chat — the country + schools-level currency
        // layers still apply. This surface is paid-mode gated today so error
        // volume is bounded; switch to a structured logger when paid mode flips.
        console.warn('[/api/chat] SSD currency lookup failed; 4th-layer defense disabled for this request:', ssdErr.message)
      }
      for (const row of ssdRows || []) {
        structuredCurrencies.set(row.school_slug, row.fees_currency ?? null)
      }
    }
    context = formatSchools(matched, structuredCurrencies)

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const prompt = context
      ? `${SYSTEM_PROMPT}\n\nSCHOOL DATABASE CONTEXT:\n${context}\n\nParent question: ${message}`
      : `${SYSTEM_PROMPT}\n\nNote: No specific schools matched this query in the database. Answer generally about international schools if the topic is education-related.\n\nParent question: ${message}`

    const result = await model.generateContent(prompt)
    const text = result.response.text()

    return NextResponse.json({ reply: text })
  } catch (err) {
    console.error('Chat API error:', err)
    return NextResponse.json({ error: 'Failed to get response' }, { status: 500 })
  }
}

// P0.4-followup-r5 (2026-05-15, Codex r1+r2): suppress the `$X/year` fallback
// whenever ANY signal says this school's published fees are non-USD. The
// legacy retrieval here reads `schools.fees_usd_min` directly (no
// retrieve.js country override), so this is the only defense.
//
// Defense layered four ways:
//   1. country in {UK, CH}              — Wellington-class rows (USD numeric, no tags)
//   2. schools.fees_currency != USD     — correctly-tagged non-USD rows
//   3. schools.fees_local_currency != USD — same, secondary tag
//   4. school_structured_data.fees_currency != USD
//      (Codex r2: closes the st-pauls-school-uk case — country=Canada,
//       schools-level currencies NULL, but ssd.fees_currency=GBP.
//       Read via service-role client since SSD is RLS-revoked from anon —
//       see top-of-file `supabaseService`.)
//
// Thailand intentionally absent — Thai intl schools legitimately publish USD.
const LOCAL_FEES_COUNTRIES = new Set(['United Kingdom', 'Switzerland'])

function isLocalCurrency(c?: string | null): boolean {
  if (!c) return false
  const norm = c.trim().toUpperCase()
  return norm !== '' && norm !== 'USD'
}

function formatSchools(schools: any[], structuredCurrencies: Map<string, string | null>): string {
  if (!schools.length) return ''
  return schools.map(s => {
    const ssdCurrency = s.slug ? structuredCurrencies.get(s.slug) : null
    const usdNumericSuspect =
      LOCAL_FEES_COUNTRIES.has(s.country)
      || isLocalCurrency(s.fees_currency)
      || isLocalCurrency(s.fees_local_currency)
      || isLocalCurrency(ssdCurrency)
    const feesLine = s.fees_original
      ? `Fees: ${s.fees_original}`
      : (s.fees_usd_min && !usdNumericSuspect)
        ? `Fees: from $${s.fees_usd_min.toLocaleString()}/year`
        : null
    const lines = [
      `School: ${s.name}`,
      `Location: ${[s.city, s.country].filter(Boolean).join(', ')}`,
      s.school_type ? `Type: ${s.school_type}` : null,
      s.curriculum?.length ? `Curriculum: ${s.curriculum.join(', ')}` : null,
      feesLine,
      (s.age_min != null && s.age_max != null) ? `Ages: ${s.age_min}–${s.age_max}` : null,
      s.boarding ? 'Boarding: Yes' : null,
      s.scholarship_available ? 'Scholarships: Available' : null,
      s.nationalities_count ? `Nationalities: ${s.nationalities_count}+` : null,
      s.unique_selling_points ? `About: ${s.unique_selling_points.slice(0, 200)}` : s.description ? `About: ${s.description.slice(0, 200)}` : null,
    ].filter(Boolean)
    return lines.join('\n')
  }).join('\n\n---\n\n')
}

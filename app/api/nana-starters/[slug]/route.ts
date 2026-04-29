import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/i

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const slug = params.slug?.toLowerCase()
  if (!slug || !SLUG_RE.test(slug)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })
  }

  const { data } = await supabase
    .from('school_structured_data')
    .select('report_verdict, fees_min, fees_max, fees_currency, sports_profile')
    .eq('school_slug', slug)
    .maybeSingle()

  const starters = deriveStarters(data)
  return NextResponse.json({ starters })
}

interface Starter {
  text: string
  label?: string
}

function deriveStarters(data: any): Starter[] {
  if (!data) return []

  // Prefer pre-generated tour questions from report_verdict — they're already
  // data-specific and reviewed for quality.
  const topQ = data.report_verdict?.top_3_questions
  if (Array.isArray(topQ) && topQ.length >= 2) {
    return topQ.slice(0, 3).map((q: any) => ({
      text: q.text,
      label: q.label,
    }))
  }

  // Fallback: derive from raw signals
  const starters: Starter[] = []

  // Fee signal
  if (data.fees_min && data.fees_max) {
    const currency = data.fees_currency === 'GBP' ? '£' : '$'
    const fee = Math.round(data.fees_max / 1000) * 1000
    starters.push({
      text: `Fees are around ${currency}${fee.toLocaleString()}/yr — what's included and are there bursaries?`,
      label: 'Fees & value',
    })
  }

  // Sport signal — if ranked rugby school
  const rugby = data.sports_profile?.rugby
  if (rugby?.dmt_ranking?.current_rank && rugby.dmt_ranking.current_rank <= 50) {
    starters.push({
      text: `Wellington is ranked #${rugby.dmt_ranking.current_rank} for rugby nationally — how strong is the pathway for a serious player?`,
      label: 'Sport strength',
    })
  } else if (Array.isArray(data.sports_profile?.signature_sports) && data.sports_profile.signature_sports.length) {
    const sport = data.sports_profile.signature_sports[0]
    starters.push({
      text: `How strong is the ${sport.toLowerCase()} programme compared to other schools at this level?`,
      label: 'Sport',
    })
  }

  // Pastoral fallback
  starters.push({
    text: 'What will my child actually experience day-to-day here?',
    label: 'School life',
  })

  return starters.slice(0, 3)
}

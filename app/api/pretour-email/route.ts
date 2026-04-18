import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    if (!checkRateLimit(req, 'chat')) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
    }

    const { slug } = await req.json().catch(() => ({}))
    if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })

    const [schoolRes, ssdRes, sensitiveRes, isiRes] = await Promise.all([
      supabase.from('schools').select('*').eq('slug', slug).single(),
      supabase.from('school_structured_data').select('*').eq('school_slug', slug).maybeSingle(),
      supabase.from('school_sensitive')
        .select('source, data_type, date, title, summary, details')
        .eq('school_slug', slug),
      supabase.from('school_knowledge')
        .select('school_slug').eq('school_slug', slug)
        .ilike('source_url', '%reports.isi.net%').limit(1),
    ])

    if (schoolRes.error || !schoolRes.data) {
      return NextResponse.json({ error: `School not found: ${slug}` }, { status: 404 })
    }

    const school    = schoolRes.data
    const ssd       = ssdRes.data ?? null
    const sensitive = sensitiveRes.data ?? []
    const hasISI    = (isiRes.data ?? []).length > 0

    const context = buildContext(school, ssd, sensitive, hasISI)
    const prompt  = buildPrompt(school.name, context)

    const model  = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
    const result = await model.generateContent(prompt)
    const email  = result.response.text().trim()

    return NextResponse.json({ email, schoolName: school.name })
  } catch (err) {
    console.error('Pre-tour email API error:', err)
    return NextResponse.json({ error: 'Failed to generate email' }, { status: 500 })
  }
}

function buildContext(school: any, ssd: any, sensitive: any[], hasISI: boolean): string {
  const lines: string[] = []

  lines.push(`School: ${school.name}`)
  if (school.city) lines.push(`Location: ${school.city}`)
  if (school.gender) lines.push(`Gender: ${school.gender}`)
  if (school.age_range) lines.push(`Age range: ${school.age_range}`)
  if (school.boarding_type) lines.push(`Boarding: ${school.boarding_type}`)
  if (school.curriculum) lines.push(`Curriculum: ${school.curriculum}`)
  if (school.student_count) lines.push(`Students: ${school.student_count}`)

  const feesMin = ssd?.fees_min || school.fees_local_min
  const feesMax = ssd?.fees_max || school.fees_local_max
  const feesCur = ssd?.fees_currency || school.fees_local_currency || 'GBP'
  if (feesMin || feesMax) {
    const sym = feesCur === 'GBP' ? '£' : feesCur
    lines.push(`Fees: ${sym}${Number(feesMin || feesMax).toLocaleString()}–${sym}${Number(feesMax || feesMin).toLocaleString()} per term`)
  }

  const head        = school.leadership?.head?.name || school.head_of_school
  const tenureStart = school.head_tenure_start || school.leadership?.head?.tenure_start
  if (head) lines.push(`Head: ${head}${tenureStart ? ` (since ${String(tenureStart).slice(0, 7)})` : ''}`)

  const seniorTeam = school.leadership?.senior_team || []
  if (seniorTeam.length) lines.push(`Senior team: ${seniorTeam.length} members listed`)

  if (ssd?.exam_results) {
    const er = ssd.exam_results
    if (er.a_level?.pct_a_a_star != null) lines.push(`A-level A*/A: ${er.a_level.pct_a_a_star}%`)
    if (er.ib?.average_points != null) lines.push(`IB average: ${er.ib.average_points} points`)
    if (er.a_level?.year || er.academic_year) lines.push(`Results year: ${er.a_level?.year || er.academic_year}`)
  }

  if (ssd?.university_destinations) {
    const ud = ssd.university_destinations
    if (ud.oxbridge_offers != null) lines.push(`Oxbridge offers: ${ud.oxbridge_offers}`)
    if (ud.oxbridge_acceptances != null) lines.push(`Oxbridge acceptances: ${ud.oxbridge_acceptances}`)
    if (ud.russell_group_pct != null) lines.push(`Russell Group: ${ud.russell_group_pct}%`)
    if (ud.top_destinations?.length) lines.push(`Top destinations: ${ud.top_destinations.slice(0, 5).join(', ')}`)
  }

  if (ssd?.admissions_format) {
    const af = ssd.admissions_format
    if (af.entry_points?.length) lines.push(`Entry points: ${af.entry_points.join(', ')}`)
    if (af.eleven_plus?.test_type) lines.push(`11+ test: ${af.eleven_plus.test_type}`)
    if (af.thirteen_plus?.test_type) lines.push(`13+ test: ${af.thirteen_plus.test_type}`)
    if (af.registration_deadline) lines.push(`Registration deadline: ${af.registration_deadline}`)
  }

  lines.push(`ISI inspection: ${hasISI ? 'Yes' : 'Not in our records'}`)

  const ccRow = sensitive.find((r: any) => r.source === 'charity_commission')
  if (ccRow?.details) {
    const d = ccRow.details
    if (d.income) lines.push(`CC income: £${Number(d.income).toLocaleString()}`)
    if (d.num_employees) lines.push(`CC employees: ${d.num_employees}`)
    if (d.financial_history?.length >= 2) {
      const [latest, prev] = d.financial_history
      if (latest.income && prev.income) {
        const change = Math.round(((latest.income - prev.income) / prev.income) * 100)
        lines.push(`CC income change YoY: ${change > 0 ? '+' : ''}${change}%`)
      }
    }
  }

  return lines.join('\n')
}

function buildPrompt(schoolName: string, context: string): string {
  return `You are a senior school researcher helping a parent prepare for an in-person school tour at ${schoolName}.

Using ONLY the verified data below, write a parent-ready email they can send to the school admissions office 48 hours before their visit — or print as a cheat sheet on the day.

The email must contain exactly 10 sharp, specific questions. Each question must:
- Use real numbers and facts from the data (never invent)
- Be impossible to answer with a vague PR response
- Be politely assertive — a confident parent, not an interrogator
- Cover: fees breakdown, academic results context, university destinations, admissions timeline, leadership priorities, wellbeing/counselling access, and any notable financial signals
- If a field is missing from the data, write a question that draws out that information ("We couldn't find your published counsellor ratio — could you share it?")

Output format (follow exactly):
Subject: [one line]

Dear Admissions Team,

[2-sentence intro personalised to ${schoolName}]

1. [question]
2. [question]
...
10. [question]

[1-sentence warm closing]

Best regards,
[Your name]

School data:
${context}`
}

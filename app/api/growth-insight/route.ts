import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { schoolId } = await req.json()
    if (!schoolId) return NextResponse.json({ error: 'schoolId required' }, { status: 400 })

    // Fetch school profile
    const { data: school } = await supabase
      .from('schools')
      .select('name, country, city, curriculum, fees_usd_min, fees_usd_max, boarding, description, hero_image, official_website, contact_email, accreditations, student_count, is_partner, partner_tier')
      .eq('id', schoolId)
      .single()

    if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })

    // Fetch last 30 days of analytics
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const [{ data: analytics }, { data: enquiries }] = await Promise.all([
      supabase.from('school_analytics').select('event_type, created_at').eq('school_id', schoolId).gte('created_at', since),
      supabase.from('enquiries').select('created_at').eq('school_id', schoolId).gte('created_at', since),
    ])

    const impressions = analytics?.filter(e => e.event_type === 'impression').length ?? 0
    const views = analytics?.filter(e => e.event_type === 'view').length ?? 0
    const enquiryCount = enquiries?.length ?? 0
    const ctr = impressions > 0 ? Math.round((views / impressions) * 100) : 0

    // Profile completeness check
    const missing: string[] = []
    if (!school.description) missing.push('school description')
    if (!school.hero_image) missing.push('hero image')
    if (!school.fees_usd_min) missing.push('fee information')
    if (!school.contact_email) missing.push('contact email')
    if (!school.accreditations) missing.push('accreditations')

    const prompt = `You are a senior strategic advisor specialising in education marketing and school admissions. You are writing for a school business owner or head of admissions, not a parent or student. Use professional business language. No emojis. No casual phrases. No exclamation points. Write like a senior McKinsey analyst who specialises in premium education marketing.

A school has requested one data-driven growth recommendation based on their current performance metrics.

School: ${school.name}
Location: ${[school.city, school.country].filter(Boolean).join(', ')}
Curriculum: ${school.curriculum ?? 'not listed'}
Boarding: ${school.boarding ? 'Yes' : 'No'}
Fees: ${school.fees_usd_min ? `$${school.fees_usd_min}–$${school.fees_usd_max} USD/year` : 'not listed'}
Student count: ${school.student_count ?? 'not listed'}
Profile tier: ${school.partner_tier ?? 'Starter (free)'}

Last 30 days performance:
- Impressions (appeared in search): ${impressions}
- Profile views: ${views}
- Click-through rate: ${ctr}%
- Direct enquiries from parents: ${enquiryCount}

Profile gaps (fields not filled in): ${missing.length > 0 ? missing.join(', ') : 'none — profile is complete'}

Based on this data, provide ONE specific, high-impact recommendation to increase qualified enquiries from international families.

Reply in this exact JSON format:
{
  "headline": "concise strategic title (max 8 words, no exclamation points)",
  "insight": "2-3 sentences in professional business language: what the data indicates, the commercial implication, and why it warrants action now",
  "action": "one precise, specific action the school should implement this week — state exactly what to do, not general advice",
  "priority": "high" | "medium" | "low"
}`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
        }),
      }
    )

    if (!geminiRes.ok) {
      throw new Error(`Gemini API error: ${geminiRes.status}`)
    }

    const geminiData = await geminiRes.json()
    const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    // Extract JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in Gemini response')

    const recommendation = JSON.parse(jsonMatch[0])

    return NextResponse.json({ recommendation, meta: { impressions, views, ctr, enquiryCount, missingFields: missing } })
  } catch (err) {
    console.error('growth-insight error:', err)
    return NextResponse.json({ error: 'Failed to generate insight' }, { status: 500 })
  }
}

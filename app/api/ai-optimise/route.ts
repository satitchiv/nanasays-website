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

    const { data: school } = await supabase
      .from('schools')
      .select(`
        name, country, city, curriculum, description, hero_image,
        fees_usd_min, fees_usd_max, boarding, boarding_type, student_count,
        nationalities_count, international_student_percent, languages,
        accreditations, contact_email, official_website,
        sports_facilities, arts_programs, extracurriculars,
        scholarship_available, scholarship_details, sen_support,
        university_placement_rate, top_universities, ib_pass_rate,
        unique_selling_points, head_of_school, founded_year,
        accepts_mid_year, rolling_admissions
      `)
      .eq('id', schoolId)
      .single()

    if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })

    // Score each field group
    const checks = [
      { field: 'description', label: 'School description', value: school.description, weight: 'high' },
      { field: 'hero_image', label: 'Hero image', value: school.hero_image, weight: 'high' },
      { field: 'fees_usd_min', label: 'Fee information', value: school.fees_usd_min, weight: 'high' },
      { field: 'contact_email', label: 'Contact email', value: school.contact_email, weight: 'high' },
      { field: 'official_website', label: 'Official website', value: school.official_website, weight: 'medium' },
      { field: 'accreditations', label: 'Accreditations', value: school.accreditations, weight: 'medium' },
      { field: 'curriculum', label: 'Curriculum', value: school.curriculum, weight: 'medium' },
      { field: 'student_count', label: 'Student count', value: school.student_count, weight: 'medium' },
      { field: 'nationalities_count', label: 'Nationalities count', value: school.nationalities_count, weight: 'low' },
      { field: 'languages', label: 'Languages of instruction', value: school.languages, weight: 'low' },
      { field: 'sports_facilities', label: 'Sports facilities', value: school.sports_facilities, weight: 'low' },
      { field: 'arts_programs', label: 'Arts programmes', value: school.arts_programs, weight: 'low' },
      { field: 'university_placement_rate', label: 'University placement rate', value: school.university_placement_rate, weight: 'medium' },
      { field: 'top_universities', label: 'Top university destinations', value: school.top_universities, weight: 'low' },
      { field: 'unique_selling_points', label: 'Unique selling points', value: school.unique_selling_points, weight: 'high' },
      { field: 'scholarship_available', label: 'Scholarship info', value: school.scholarship_available !== null ? 'set' : null, weight: 'low' },
      { field: 'head_of_school', label: 'Head of school name', value: school.head_of_school, weight: 'low' },
    ]

    const missing = checks.filter(c => !c.value)
    const filled = checks.filter(c => !!c.value)

    const highMissing = missing.filter(c => c.weight === 'high')
    const totalWeight = checks.reduce((s, c) => s + (c.weight === 'high' ? 3 : c.weight === 'medium' ? 2 : 1), 0)
    const filledWeight = filled.reduce((s, c) => s + (c.weight === 'high' ? 3 : c.weight === 'medium' ? 2 : 1), 0)
    const score = Math.round((filledWeight / totalWeight) * 100)

    const prompt = `You are a school profile optimisation expert for an international school directory.
A school has asked for specific suggestions to improve their directory listing to attract more families.

School: ${school.name}, ${[school.city, school.country].filter(Boolean).join(', ')}
Profile completeness score: ${score}/100

Missing fields (high priority): ${highMissing.map(c => c.label).join(', ') || 'none'}
All missing fields: ${missing.map(c => c.label).join(', ') || 'none — profile is complete'}

Current description: ${school.description ? `"${school.description.slice(0, 200)}..."` : 'not written yet'}
Unique selling points: ${school.unique_selling_points ?? 'not listed'}

Give 3 specific, actionable suggestions to improve this school's profile. Each should be practical and completable within one day.

Reply in this exact JSON format:
{
  "score": ${score},
  "scoreLabel": "brief label for this score (e.g. 'Good', 'Needs work', 'Excellent')",
  "summary": "one sentence summarising the profile's current state",
  "suggestions": [
    {
      "priority": "high" | "medium" | "low",
      "title": "short action title",
      "detail": "specific instruction — what to write, what image to upload, etc."
    }
  ]
}`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 600 },
        }),
      }
    )

    if (!geminiRes.ok) throw new Error(`Gemini API error: ${geminiRes.status}`)

    const geminiData = await geminiRes.json()
    const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in Gemini response')

    const result = JSON.parse(jsonMatch[0])

    return NextResponse.json({ ...result, missingFields: missing.map(c => c.field) })
  } catch (err) {
    console.error('ai-optimise error:', err)
    return NextResponse.json({ error: 'Failed to generate optimisation tips' }, { status: 500 })
  }
}

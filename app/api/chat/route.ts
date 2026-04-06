import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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
      .select('name, country, city, school_type, curriculum, fees_original, fees_usd_min, age_min, age_max, description, unique_selling_points, boarding, scholarship_available, nationalities_count')
      .or(`name.ilike.%${searchTerm}%,country.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
      .limit(6)

    // Also search by individual keyword if no results
    let context = ''
    if (!schools || schools.length === 0) {
      const { data: fallback } = await supabase
        .from('schools')
        .select('name, country, city, school_type, curriculum, fees_original, fees_usd_min, age_min, age_max, description, unique_selling_points, boarding, scholarship_available, nationalities_count')
        .ilike('country', `%${keywords[0] || message}%`)
        .limit(6)

      context = formatSchools(fallback || [])
    } else {
      context = formatSchools(schools)
    }

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

function formatSchools(schools: any[]): string {
  if (!schools.length) return ''
  return schools.map(s => {
    const lines = [
      `School: ${s.name}`,
      `Location: ${[s.city, s.country].filter(Boolean).join(', ')}`,
      s.school_type ? `Type: ${s.school_type}` : null,
      s.curriculum?.length ? `Curriculum: ${s.curriculum.join(', ')}` : null,
      s.fees_original ? `Fees: ${s.fees_original}` : s.fees_usd_min ? `Fees: from $${s.fees_usd_min.toLocaleString()}/year` : null,
      (s.age_min != null && s.age_max != null) ? `Ages: ${s.age_min}–${s.age_max}` : null,
      s.boarding ? 'Boarding: Yes' : null,
      s.scholarship_available ? 'Scholarships: Available' : null,
      s.nationalities_count ? `Nationalities: ${s.nationalities_count}+` : null,
      s.unique_selling_points ? `About: ${s.unique_selling_points.slice(0, 200)}` : s.description ? `About: ${s.description.slice(0, 200)}` : null,
    ].filter(Boolean)
    return lines.join('\n')
  }).join('\n\n---\n\n')
}

import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// ── Keyword fallback ──────────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  'a','an','the','is','it','in','on','at','to','for','of','and','or','but',
  'with','do','you','we','i','me','my','your','how','what','when','where',
  'who','which','does','are','was','were','be','been','have','has','had',
  'will','would','could','should','can','may','might','about','any','some',
  'this','that','there','their','they','them','tell','give','me','know',
  'get','need','want','please','like','also','then','than','its','our'
])

function extractKeywords(q: string) {
  return q.toLowerCase().split(/\W+/).filter(w => w.length > 2 && !STOP_WORDS.has(w))
}

function scoreChunk(content: string, keywords: string[]): number {
  if (!keywords.length) return 0
  const lower = content.toLowerCase()
  return keywords.reduce((s, kw) => s + (lower.match(new RegExp(`\\b${kw}\\b`, 'g')) || []).length, 0)
}

// ── Embedding via Google REST API ─────────────────────────────────────────────
async function embedQuery(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY!
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/gemini-embedding-001',
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_QUERY',
      outputDimensionality: 768,
    }),
  })
  if (!res.ok) throw new Error(`Embedding API error: ${res.status}`)
  const data = await res.json()
  return data.embedding.values
}

// ── Fallback contacts ─────────────────────────────────────────────────────────
async function getContacts(slug: string): Promise<any[]> {
  const { data } = await supabase
    .from('school_contacts')
    .select('name, role, email, phone, department')
    .eq('school_slug', slug)
    .limit(10)
  return data || []
}

function buildContactsBlock(contacts: any[]): string {
  if (!contacts.length) return ''
  const lines = contacts.map(c => {
    const parts = [c.name, c.role, c.department].filter(Boolean).join(', ')
    const reach = [c.email, c.phone].filter(Boolean).join(' / ')
    return `- ${parts}${reach ? ': ' + reach : ''}`
  })
  return `\nSCHOOL CONTACTS (use these when you cannot answer — direct the person to the right contact):\n${lines.join('\n')}\n`
}

// ── Retrieval ─────────────────────────────────────────────────────────────────
async function retrieve(slug: string, question: string) {
  const maxWords = 8000

  // Always fetch the NanaSays profile row (pinned baseline)
  const { data: profileRow } = await supabase
    .from('school_knowledge')
    .select('*')
    .eq('school_slug', slug)
    .eq('source_type', 'nanasays')
    .single()

  // Check if embeddings exist
  const { count: embCount } = await supabase
    .from('school_knowledge')
    .select('*', { count: 'exact', head: true })
    .eq('school_slug', slug)
    .not('embedding', 'is', null)

  let candidates: any[] = []

  if (embCount && embCount > 0) {
    try {
      const queryEmbedding = await embedQuery(question)
      const { data: vectorResults, error } = await supabase.rpc('match_school_knowledge', {
        query_embedding: queryEmbedding,
        p_school_slug: slug,
        match_count: 8,
      })
      if (!error && vectorResults) {
        candidates = vectorResults.filter((r: any) => r.source_type !== 'nanasays')
      }
    } catch {
      // fall through to keyword
      const { data: rows } = await supabase
        .from('school_knowledge')
        .select('*')
        .eq('school_slug', slug)
        .neq('source_type', 'nanasays')
      const keywords = extractKeywords(question)
      candidates = (rows || [])
        .map(r => ({ ...r, score: scoreChunk(r.content, keywords) }))
        .sort((a, b) => b.score - a.score)
    }
  } else {
    const { data: rows } = await supabase
      .from('school_knowledge')
      .select('*')
      .eq('school_slug', slug)
      .neq('source_type', 'nanasays')
    const keywords = extractKeywords(question)
    candidates = (rows || [])
      .map(r => ({ ...r, score: scoreChunk(r.content, keywords) }))
      .sort((a, b) => b.score - a.score)
  }

  // Fetch structured data
  const { data: structured } = await supabase
    .from('school_structured_data')
    .select('*')
    .eq('school_slug', slug)
    .single()

  // Build final chunk list: profile first, then candidates up to word budget
  const selected: any[] = []
  const sourceCounts: Record<string, number> = {}
  let totalWords = 0

  if (profileRow) {
    const w = profileRow.word_count || profileRow.content.split(/\s+/).length
    selected.push(profileRow)
    sourceCounts[profileRow.source_url] = 1
    totalWords += w
  }

  for (const row of candidates) {
    if (selected.length >= 6) break
    if (row.source_type === 'nanasays') continue

    const sourceCount = sourceCounts[row.source_url] || 0
    if (sourceCount >= 2) continue

    const rowWords = row.word_count || row.content.split(/\s+/).length
    const remaining = maxWords - totalWords
    if (remaining < 100) break

    let content = row.content
    let usedWords = rowWords

    if (rowWords > remaining) {
      content = row.content.split(/\s+/).slice(0, remaining).join(' ') + '… [truncated]'
      usedWords = remaining
    }

    selected.push({ ...row, content })
    sourceCounts[row.source_url] = sourceCount + 1
    totalWords += usedWords
  }

  return { chunks: selected, structured: structured || null }
}


// ── Prompt builder ────────────────────────────────────────────────────────────
const SENSITIVE_CATEGORIES = new Set(['fees', 'scholarships', 'admissions', 'support'])

function sourceLabel(row: any): string {
  if (row.source_type === 'nanasays') return 'NanaSays profile data'
  if (row.source_type === 'pdf') return `PDF: ${row.title}`
  return `school website — ${row.category} page`
}

function buildStructuredBlock(structured: any): string {
  if (!structured) return ''
  const lines: string[] = []

  if (structured.fees_min || structured.fees_max) {
    const cur = structured.fees_currency || ''
    const range = [structured.fees_min, structured.fees_max].filter(Boolean).join('–')
    lines.push(`Annual fees: ${cur} ${range}`.trim())
  }
  if (structured.languages?.length)      lines.push(`Languages of instruction: ${structured.languages.join(', ')}`)
  if (structured.curriculum?.length)     lines.push(`Curriculum: ${structured.curriculum.join(', ')}`)
  if (structured.accreditations?.length) lines.push(`Accreditations: ${structured.accreditations.join(', ')}`)
  if (structured.grade_levels?.grades?.length) lines.push(`Grade levels: ${structured.grade_levels.grades.join(', ')}`)
  if (structured.facilities?.length)     lines.push(`Facilities: ${structured.facilities.slice(0, 10).join(', ')}`)

  if (!lines.length) return ''
  return `\nVERIFIED STRUCTURED FACTS (extracted from school data — treat as authoritative):\n${lines.join('\n')}\n`
}

function buildPrompt(schoolName: string, chunks: any[], structured: any, contacts: any[], question: string): string {
  const isSensitive = chunks.some(c => SENSITIVE_CATEGORIES.has(c.category))
  const structuredBlock = buildStructuredBlock(structured)
  const contactsBlock = buildContactsBlock(contacts)

  const contextBlocks = chunks.map(chunk =>
    `[Source: ${sourceLabel(chunk)} | URL: ${chunk.source_url} | Category: ${chunk.category}]\n${chunk.content}`
  ).join('\n\n---\n\n')

  const sensitiveWarning = isSensitive
    ? `\nFor sensitive topics (fees, scholarships, admissions eligibility, SEN provision), always add at the end of your answer: "Please verify this information is current — policies may have been updated internally."`
    : ''

  const noAnswerInstruction = contacts.length
    ? `If the information does not contain the answer, refer to the relevant contact from the SCHOOL CONTACTS list below. Never guess or make up information.`
    : `If the information does not contain the answer, say "I don't have that information — check with the relevant department." Never guess or make up information.`

  return `You are an internal assistant for staff at ${schoolName}. Answer questions about the school using ONLY the information provided below. ${noAnswerInstruction}${sensitiveWarning}

Always end your answer with source citations — one per source used. Use the exact URL value from each source's URL field in the context below. Format:
(Source: [label] | [URL])
${structuredBlock}${contactsBlock}
SCHOOL INFORMATION:
${contextBlocks}

STAFF QUESTION: ${question}`
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { slug, question } = await req.json()

    if (!slug || !question) {
      return NextResponse.json({ error: 'slug and question required' }, { status: 400 })
    }
    if (question.length > 1000) {
      return NextResponse.json({ error: 'Question too long' }, { status: 400 })
    }

    const [{ chunks, structured }, contacts] = await Promise.all([
      retrieve(slug, question),
      getContacts(slug),
    ])

    if (chunks.length === 0) {
      return NextResponse.json({
        answer: "I don't have any information loaded for this school yet. Please contact NanaSays support.",
        sources: []
      })
    }

    const profileRow = chunks.find((r: any) => r.source_type === 'nanasays')
    const schoolName = profileRow?.title?.replace(' — NanaSays Profile Data', '') || slug

    const prompt = buildPrompt(schoolName, chunks, structured, contacts, question)

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent(prompt)
    const answer = result.response.text()

    // Extract source citations from the answer
    const sourceLines = answer.match(/\(Source:.*?\)/g) || []
    const sources = sourceLines.map(line => {
      const match = line.match(/\(Source: (.*?) \| (https?:\/\/[^\)]+)\)/)
      return match ? { label: match[1], url: match[2] } : null
    }).filter(Boolean)

    // Strip citation lines from the main answer body
    const body = answer.replace(/\(Source:.*?\)\n?/g, '').trim()

    // Log question + answer (fire and forget)
    void supabase.from('chat_questions').insert({
      school_slug: slug,
      question,
      answer: body,
      sources: sources.length ? sources : null,
    })

    return NextResponse.json({ answer: body, sources })

  } catch (err) {
    console.error('school-chat error:', err)
    return NextResponse.json({ error: 'Failed to get response' }, { status: 500 })
  }
}

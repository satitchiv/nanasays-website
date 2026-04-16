import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// EduWorld Supabase — news articles
const eduworld = createClient(
  process.env.EDUWORLD_SUPABASE_URL!,
  process.env.EDUWORLD_SUPABASE_SERVICE_KEY!
)

// Area intelligence sources by school country
const SOURCE_COUNTRY_MAP: Record<string, string[]> = {
  'Thailand':       ['Bangkok Post', 'The Thaiger', 'The Standard Thailand'],
  'United Kingdom': ['BBC News UK', 'Schools Week'],
  'Switzerland':    ['SWI Swissinfo'],
}
const GLOBAL_AREA_SOURCES = ['BBC News World', 'Reuters World']

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

// ── Card type detection ───────────────────────────────────────────────────────
type CardType = 'fees' | 'admissions' | 'results' | 'general'

function detectCardType(question: string): CardType {
  const q = question.toLowerCase()
  if (/fee|cost|tuition|price|how much|afford|deposit|application fee|annual/.test(q)) return 'fees'
  if (/admission|apply|enrol|enroll|process|how do.*get in|intake|steps|join/.test(q)) return 'admissions'
  if (/ib result|score|rank|percentage|pass rate|diploma point|achievement|ib score|average score/.test(q)) return 'results'
  return 'general'
}

// ── Question intent detection ─────────────────────────────────────────────────
type QuestionIntent = 'factual' | 'area' | 'education' | 'hybrid'

function detectIntent(question: string): QuestionIntent {
  const q = question.toLowerCase()
  const areaWords = [
    'safe', 'safety', 'crime', 'area', 'neighbourhood', 'neighborhood',
    'community', 'air quality', 'pm2.5', 'pollution', 'cost of living',
    'housing', 'healthcare', 'hospital', 'transport', 'surrounding',
    'nearby', 'location', 'expat', 'environment', 'flood', 'weather', 'local',
  ]
  const eduWords = [
    'curriculum', 'ib', 'fees', 'scholarship', 'admission', 'university',
    'ranking', 'result', 'placement', 'trend', 'parents', 'market',
    'open day', 'boarding', 'academic', 'teaching', 'programme', 'program',
    'policy', 'industry', 'compare', 'competition',
  ]
  const isArea = areaWords.some(w => q.includes(w))
  const isEdu  = eduWords.some(w => q.includes(w))
  if (isArea && isEdu) return 'hybrid'
  if (isArea) return 'area'
  if (isEdu)  return 'education'
  return 'factual'
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

// ── School location (for geo-filtering news) ──────────────────────────────────
async function getSchoolLocation(slug: string): Promise<{ country: string; city: string }> {
  const { data } = await supabase
    .from('schools')
    .select('country, city')
    .eq('slug', slug)
    .single()
  return { country: data?.country || '', city: data?.city || '' }
}

// ── News retrieval from EduWorld ──────────────────────────────────────────────
async function retrieveNews(
  question: string,
  country: string,
  intent: QuestionIntent
): Promise<{ education: any[]; area: any[] }> {
  if (intent === 'factual') return { education: [], area: [] }

  try {
    const queryEmbedding = await embedQuery(question)
    const results: { education: any[]; area: any[] } = { education: [], area: [] }

    if (intent === 'education' || intent === 'hybrid') {
      const { data } = await eduworld.rpc('match_articles', {
        query_embedding: queryEmbedding,
        p_stream: 'education',
        p_source_names: null,
        p_freshness_days: 90,
        match_count: 3,
      })
      results.education = data || []
    }

    if (intent === 'area' || intent === 'hybrid') {
      const countrySources = SOURCE_COUNTRY_MAP[country] || []
      const allAreaSources = [...countrySources, ...GLOBAL_AREA_SOURCES]
      const { data } = await eduworld.rpc('match_articles', {
        query_embedding: queryEmbedding,
        p_stream: 'area_intelligence',
        p_source_names: allAreaSources.length > 0 ? allAreaSources : null,
        p_freshness_days: 30,
        match_count: 2,
      })
      results.area = data || []
    }

    return results
  } catch (e) {
    console.error('retrieveNews error:', e)
    return { education: [], area: [] }
  }
}

// ── Format news for prompt ────────────────────────────────────────────────────
function buildNewsBlock(newsChunks: { education: any[]; area: any[] }): string {
  const all = [...newsChunks.education, ...newsChunks.area]
  if (all.length === 0) return ''

  const lines = all.map(a => {
    const headline = a.english_headline || a.source_title || 'News article'
    const summary  = a.english_summary ? ` — ${a.english_summary.slice(0, 180)}` : ''
    const date     = a.published_at
      ? new Date(a.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : ''
    const tag = a.news_stream === 'area_intelligence' ? '[AREA]' : '[EDUCATION]'
    return `${tag} "${headline}"${summary} (${a.source_name}${date ? ', ' + date : ''})`
  })

  return `\nNEWS CONTEXT — use ONLY for SIGNALS and INTELLIGENCE sections:\n${lines.join('\n')}\n`
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

function buildPrompt(
  schoolName: string,
  chunks: any[],
  structured: any,
  contacts: any[],
  question: string,
  newsChunks: { education: any[]; area: any[] } = { education: [], area: [] },
  cardType: CardType = 'general'
): string {
  const isSensitive    = chunks.some(c => SENSITIVE_CATEGORIES.has(c.category))
  const structuredBlock = buildStructuredBlock(structured)
  const contactsBlock   = buildContactsBlock(contacts)
  const newsBlock       = buildNewsBlock(newsChunks)
  const hasNews         = newsChunks.education.length > 0 || newsChunks.area.length > 0

  const contextBlocks = chunks.map(chunk =>
    `[Source: ${sourceLabel(chunk)} | URL: ${chunk.source_url} | Category: ${chunk.category}]\n${chunk.content}`
  ).join('\n\n---\n\n')

  const sensitiveWarning = isSensitive
    ? ` For fees, scholarships, or admissions details add: "Please verify this is current — policies may have been updated."`
    : ''

  const noAnswerInstruction = `Only use data from the sources below. Never guess or invent facts. If a specific detail is not available, omit it silently.`

  const signalsInstruction = hasNews
    ? `**SIGNALS**
List 1-3 of the most relevant news items from NEWS CONTEXT above. Each on its own line:
• [one sentence summary] — [Source Name], [date]
Only include items genuinely relevant to the question. If none are relevant, write: none`
    : `**SIGNALS**
none`

  const intelligenceInstruction = hasNews
    ? `**INTELLIGENCE**
One short paragraph connecting the news signals to ${schoolName} specifically. Must be concrete and actionable — not generic. If you cannot make a meaningful specific connection, write: none`
    : `**INTELLIGENCE**
none`

  const formatHint = cardType === 'fees'
    ? `Start FACTS with the fee range in the first sentence. Then one brief note on one-time costs. Maximum 2 short paragraphs.`
    : cardType === 'admissions'
    ? `Write FACTS in 1–2 sentences only — a brief overview of the process. Do NOT include numbered steps in FACTS. All steps must go in the CARD JSON steps array only.`
    : `Maximum 2 short paragraphs. Lead with the most important number or fact.`

  return `You are a knowledgeable assistant for ${schoolName} — helping admissions reps answer parent questions quickly and confidently.

Write like a sharp colleague briefing another rep before a parent call. Be direct and conversational. Real numbers only, never invent data. If a specific detail is not in the data, simply omit it — do not mention it is missing, do not suggest contacting anyone, do not add placeholder messages.

${formatHint}

RESPONSE FORMAT — use exactly these four section headers in this order:

**FACTS**
Answer the question using ONLY the school data below. ${noAnswerInstruction}${sensitiveWarning}
End this section with source citations — one per source used:
(Source: [label] | [URL])

${signalsInstruction}

${intelligenceInstruction}

**CARD**
Output a JSON object to drive a structured card view of the answer. Rules:
- "hero": Include ONLY when there is a clear headline number or key fact worth featuring large (e.g. fee range, IB pass rate, number of steps in a process). Shape: {"eyebrow":"short context label","stat":"the headline value","caption":"one brief supporting line"}
- "alerts": 1–2 important flags only. Colors: "yellow"=costs or action required, "red"=not available or warning, "green"=strong result or good news, "blue"=tip or context. Shape: [{"color":"yellow","label":"SHORT LABEL","text":"one sentence"}]
- "rows": Structured facts in key-value format. Max 6. Use for fees, dates, contacts, specific numbers, yes/no facts. Shape: [{"key":"Fee","val":"USD 17,590"}]
- "steps": ONLY for process or how-to questions. Max 6. Shape: [{"num":1,"title":"Step name","desc":"one sentence"}]
Omit any section not relevant to this answer. If none apply, output: {}
Output raw JSON only — no markdown, no code fences. Never write the word "none".

${structuredBlock}${contactsBlock}${newsBlock}
SCHOOL DATA:
${contextBlocks}

QUESTION: ${question}`
}

// ── Parse four-section response ───────────────────────────────────────────────
function parseResponse(text: string) {
  // Only match the four known section headers — avoids false matches on bold
  // inline text like **Annual fees**. Stores both index (start of **HEADER**)
  // and contentStart (first char of section body after header + optional colon).
  const headerRe = /\*\*(FACTS|SIGNALS|INTELLIGENCE|CARD)\*\*[:\s]*/gi
  const headers: { name: string; index: number; contentStart: number }[] = []
  let m: RegExpExecArray | null
  while ((m = headerRe.exec(text)) !== null) {
    headers.push({ name: m[1].toUpperCase(), index: m.index, contentStart: m.index + m[0].length })
  }

  // Slice each section from its contentStart to the *index* of the next header
  const sections: Record<string, string> = {}
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].contentStart
    const end   = i < headers.length - 1 ? headers[i + 1].index : text.length
    sections[headers[i].name] = text.slice(start, end).trim()
  }

  const rawFacts        = sections['FACTS']        || ''
  const rawSignals      = sections['SIGNALS']      || 'none'
  const rawIntelligence = sections['INTELLIGENCE'] || 'none'
  const rawCard         = sections['CARD']         || ''

  // Extract citations from facts
  const sourceLines = rawFacts.match(/\(Source:.*?\)/g) || []
  const sources = sourceLines.map(line => {
    const match = line.match(/\(Source: (.*?) \| (https?:\/\/[^\)]+)\)/)
    return match ? { label: match[1], url: match[2] } : null
  }).filter(Boolean)

  const factsBody = rawFacts.replace(/\(Source:.*?\)\n?/g, '').trim()

  // Scan a string left-to-right for the first { that begins a valid JSON object.
  // Returns { card, textBefore } or null. Using indexOf each time avoids the
  // lastIndexOf bug where nested braces point inside the JSON instead of its start.
  function findFirstJSON(s: string): { card: any; textBefore: string } | null {
    const clean = s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '')
    let pos = 0
    while (pos < clean.length) {
      const idx = clean.indexOf('{', pos)
      if (idx < 0) break
      try {
        const parsed = JSON.parse(clean.slice(idx))
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return { card: parsed, textBefore: clean.slice(0, idx).trim() }
        }
      } catch { /* keep scanning */ }
      pos = idx + 1
    }
    return null
  }

  let card: any = null
  const cardResult = findFirstJSON(rawCard)
  if (cardResult) card = cardResult.card

  // Fallback: if no **CARD** section found, the AI may have appended JSON to intelligence
  let intelligenceBody = rawIntelligence
  if (!card && rawIntelligence !== 'none') {
    const intelResult = findFirstJSON(rawIntelligence)
    if (intelResult) {
      card = intelResult.card
      intelligenceBody = intelResult.textBefore
    }
  }

  // Treat empty object as "no card"
  if (card && Object.keys(card).length === 0) card = null

  return {
    facts: factsBody || text.slice(0, 600).trim(),
    signals: rawSignals === 'none' || rawSignals === '' ? null : rawSignals,
    intelligence: intelligenceBody === 'none' || intelligenceBody === '' ? null : intelligenceBody,
    sources,
    card,
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
const DAILY_DEMO_CAP = 300

export async function POST(req: NextRequest) {
  try {
    const { slug, question } = await req.json()

    if (!slug || !question) {
      return NextResponse.json({ error: 'slug and question required' }, { status: 400 })
    }
    if (question.length > 1000) {
      return NextResponse.json({ error: 'Question too long' }, { status: 400 })
    }

    // Global daily cap — demo only protection
    const { count: todayCount } = await supabase
      .from('chat_questions')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
    if ((todayCount ?? 0) >= DAILY_DEMO_CAP) {
      return NextResponse.json(
        { error: 'Daily limit reached. The demo resets at midnight. Contact us at hello@nanasays.school to learn more.' },
        { status: 429 }
      )
    }

    // Fetch school data, contacts, and location in parallel
    const [{ chunks, structured }, contacts, location] = await Promise.all([
      retrieve(slug, question),
      getContacts(slug),
      getSchoolLocation(slug),
    ])

    if (chunks.length === 0) {
      return NextResponse.json({
        facts: "I don't have any information loaded for this school yet. Please contact NanaSays support.",
        signals: null, intelligence: null, sources: [],
        answer: "I don't have any information loaded for this school yet.",
      })
    }

    const profileRow = chunks.find((r: any) => r.source_type === 'nanasays')
    const schoolName = profileRow?.title?.replace(' — NanaSays Profile Data', '') || slug

    // Detect intent then fetch news in parallel with nothing (already have school data)
    const intent   = detectIntent(question)
    const cardType = detectCardType(question)
    const newsChunks = await retrieveNews(question, location.country, intent)

    const prompt = buildPrompt(schoolName, chunks, structured, contacts, question, newsChunks, cardType)

    const model  = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent(prompt)
    const raw    = result.response.text()
    const usage  = result.response.usageMetadata

    const parsed = parseResponse(raw)

    // Log (fire and forget)
    void supabase.from('chat_questions').insert({
      school_slug: slug,
      question,
      answer:     parsed.facts,
      sources:    parsed.sources.length ? parsed.sources : null,
      tokens_in:  usage?.promptTokenCount     ?? null,
      tokens_out: usage?.candidatesTokenCount ?? null,
      model:      'gemini-2.5-flash',
    }).then(({ error }) => { if (error) console.error('chat_questions insert error:', error.message) })

    return NextResponse.json({
      facts:        parsed.facts,
      signals:      parsed.signals,
      intelligence: parsed.intelligence,
      sources:      parsed.sources,
      card:         parsed.card,
      structured:   structured || null,
      cardType,
      answer:       parsed.facts,
    })

  } catch (err) {
    console.error('school-chat error:', err)
    return NextResponse.json({ error: 'Failed to get response' }, { status: 500 })
  }
}

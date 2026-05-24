import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import { isPaidModeOn } from '@/lib/paid-mode'
import { buildStructuredBlock as buildStructuredBlockShared, projectNotionBackfill } from '@/lib/server/nana-brain.js'

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
type CardType = 'fees' | 'admissions' | 'results' | 'general' | 'brochure' | 'document'

function detectCardType(question: string): CardType {
  const q = question.toLowerCase()
  // Document/brochure intent — checked FIRST so "send me the brochure with the
  // fees" routes to brochure not fees. Detection is delegated to detectDocumentRequest()
  // so this stays a thin classifier.
  const docIntent = detectDocumentRequest(question)
  if (docIntent?.docType === 'brochure') return 'brochure'
  if (docIntent && docIntent.isFileRequest) return 'document'
  if (/fee|cost|tuition|price|how much|afford|deposit|application fee|annual/.test(q)) return 'fees'
  if (/admission|apply|enrol|enroll|process|how do.*get in|intake|steps|join/.test(q)) return 'admissions'
  if (/ib result|score|rank|percentage|pass rate|diploma point|achievement|ib score|average score/.test(q)) return 'results'
  return 'general'
}

// ── Document/brochure request detection (multilingual) ────────────────────────
// Returns the doc_type the user is asking about, the scope hint if any, the
// language hint if any, and isFileRequest=true when the user explicitly wants
// the FILE (not just info on the topic). Per Codex review:
//   - "Send me the boarding fees PDF" → isFileRequest=true (short-circuit to doc card)
//   - "What are the boarding fees?"   → isFileRequest=false (LLM answers,
//                                       matching PDF attached as evidence)
type DocType =
  | 'brochure' | 'fees' | 'rules' | 'application_form' | 'packing_list'
  | 'calendar' | 'timetable' | 'boarding_concept' | 'policy'
  | 'code_of_conduct' | 'terms'
type Scope = 'boarding' | 'day_school' | 'language_course' | 'summer_camp' | 'general' | null
interface DocRequest {
  docType: DocType
  scope: Scope
  language: string | null
  isFileRequest: boolean
}

// Words that explicitly mean "I want the file, not just info" — multilingual.
const FILE_REQUEST_WORDS =
  /\b(send|share|download|get|give)\b|\b(pdf|file|link|document|copy|attach)\b|herunterladen|scarica|herunter|datei|dokument|文件|下载|下載/i

function detectDocumentRequest(question: string): DocRequest | null {
  const explicitFileRequest = FILE_REQUEST_WORDS.test(question)
  const language = detectRequestedLanguage(question)

  // Two-tier matching per Codex review:
  //   • EXACT_DOC_NOUN — the user names the document by its actual title
  //     (e.g. "Preisblatt", "Internatsordnung", "Anmeldeformular"). These are
  //     ALWAYS file requests because nobody types "Preisblatt" to mean "tell me
  //     about fees" — they want the file.
  //   • TOPIC_PATTERN — generic topic phrases (e.g. "boarding fees", "school
  //     rules"). These only become file requests when an explicit file-request
  //     word ("send", "PDF", "download") also appears. Otherwise: docIntent is
  //     returned with isFileRequest=false so the LLM answers + we attach the
  //     PDF as evidence.

  type Rule = { exactDocNoun: RegExp | null, topicPattern: RegExp | null, docType: DocType, scope?: Scope | ((q: string) => Scope) }
  const RULES: Rule[] = [
    // Summer camp — checked BEFORE generic brochure so "summer camp brochure"
    // routes to the camp flyer, not the school's main prospectuses. Maps to
    // brochure doc_type + scope='summer_camp'.
    //
    // exactDocNoun = ONLY the German/Italian document NAMES (Sommer-
    // Sprachschule, corso di tedesco). The English "summer camp" is a TOPIC,
    // not a document title — putting it in topicPattern means a question like
    // "what summer camps are offered?" gets the LLM explainer with a PDF
    // attached, while "send me the summer camp PDF" still short-circuits.
    {
      exactDocNoun: /sommer.?sprachkurs|sommer.?sprachschule|corso.?di.?tedesco/i,
      topicPattern: /summer.?(camp|program|course|school)|holiday.?(camp|program|course)|sommer.?(programm|kurs|camp)|german.?summer|summer.*german/i,
      docType: 'brochure',
      scope: 'summer_camp',
    },
    {
      exactDocNoun: /prospekt|broschüre|broschuere|schulbroschuere|招生简章|簡章/i,
      topicPattern: /brochure|prospectus|prospetto|booklet|catalog(ue)?|info pack|โบรชัวร์/i,
      docType: 'brochure', scope: null,
    },
    {
      exactDocNoun: /preisblatt|preisliste/i,
      // Broad fee topic pattern — matches "boarding fees", "school fees",
      // "annual cost", "tuition", "Preisliste" etc. Combined with the
      // explicitFileRequest gate above, this routes a casual fees question to
      // LLM-with-attachment, and a "send me the fees" / "fees PDF" to the
      // deterministic doc card.
      topicPattern: /\b(fee|fees|tuition|cost|price|kosten|gebühren|gebuhren|tariff|costo|retta)\b/i,
      docType: 'fees',
      scope: (q) =>
        /(boarding|internat)/i.test(q) ? 'boarding'
        : /(day.?school|tagesschule|day.?pupil|ausserkantonal|buendner|bündner)/i.test(q) ? 'day_school'
        : null,
    },
    {
      exactDocNoun: /internatsordnung/i,
      topicPattern: /boarding.?rule|boarding.?polic(y|ies)|boarding.?regulation|hausordnung.*internat/i,
      docType: 'rules', scope: 'boarding',
    },
    {
      exactDocNoun: /schulordnung|hausordnung/i,
      topicPattern: /school.?rule|school.?regulation|reglement|regolamento/i,
      docType: 'rules', scope: 'day_school',
    },
    {
      exactDocNoun: /anmeldeformular|aufnahmeformular/i,
      topicPattern: /application.?form|enrolment.?form/i,
      docType: 'application_form', scope: null,
    },
    {
      exactDocNoun: /packliste/i,
      topicPattern: /packing.?list/i,
      docType: 'packing_list', scope: 'boarding',
    },
    {
      exactDocNoun: /stundenplan|ferienplan|terminplan/i,
      topicPattern: /term.?date|holiday.?plan|school.?calendar|term.?calendar|orario.?scolastico/i,
      docType: 'calendar', scope: null,
    },
    {
      exactDocNoun: /internatskonzept/i,
      topicPattern: /boarding.?concept/i,
      docType: 'boarding_concept', scope: 'boarding',
    },
    {
      exactDocNoun: /codex.?gkd/i,
      topicPattern: /code.?of.?conduct|values.?statement/i,
      docType: 'code_of_conduct', scope: null,
    },
  ]

  for (const rule of RULES) {
    const exact = rule.exactDocNoun?.test(question) ?? false
    const topic = rule.topicPattern?.test(question) ?? false
    if (!exact && !topic) continue
    const scope = typeof rule.scope === 'function' ? rule.scope(question) : (rule.scope ?? null)
    // EXACT noun → always a file request.
    // TOPIC + explicit file-request word → file request.
    // TOPIC alone → still return docIntent so the LLM path can ATTACH the PDF
    //   as evidence, but isFileRequest=false so we don't short-circuit.
    const isFileRequest = exact || (topic && explicitFileRequest)
    return { docType: rule.docType, scope, language, isFileRequest }
  }

  return null
}

// ── Document language hint detection (best-effort) ────────────────────────────
// Order matters: zh-Hant comes BEFORE the generic Chinese branch so "traditional
// Chinese" doesn't get swallowed by `/chinese|mandarin/`.
function detectRequestedLanguage(question: string): string | null {
  const q = question.toLowerCase()
  if (/\btraditional chinese\b/.test(q) || /繁體|繁体|簡章/.test(question))           return 'zh-Hant'
  if (/\b(german|deutsch|allemand|tedesco|in.*german)\b/.test(q))                   return 'de'
  if (/\b(english|englisch|inglese|in.*english|en version)\b/.test(q))              return 'en'
  if (/\b(italian|italiano|italienisch|in.*italian)\b/.test(q))                     return 'it'
  if (/\b(french|francais|français|francese)\b/.test(q))                            return 'fr'
  if (/\b(thai|in.*thai)\b/.test(q) || /ภาษาไทย/.test(question))                    return 'th'
  if (/\b(chinese|mandarin|simplified)\b/.test(q) || /中文|简体|招生简章/.test(question))  return 'zh-Hans'
  return null
}

// ── Document card builder (deterministic, no LLM) ─────────────────────────────
const LANG_NAMES: Record<string, string> = {
  'de': 'German', 'en': 'English', 'it': 'Italian', 'fr': 'French',
  'th': 'Thai',   'zh-Hans': 'Chinese (Simplified)', 'zh-Hant': 'Chinese (Traditional)',
}
const LANG_FLAGS: Record<string, string> = {
  'de': '🇩🇪', 'en': '🇬🇧', 'it': '🇮🇹', 'fr': '🇫🇷',
  'th': '🇹🇭', 'zh-Hans': '🇨🇳', 'zh-Hant': '🇹🇼',
}
const DOC_TYPE_LABELS: Record<string, string> = {
  brochure: 'brochure', fees: 'fee schedule', rules: 'rules document',
  application_form: 'application form', packing_list: 'packing list',
  calendar: 'school calendar', timetable: 'timetable',
  boarding_concept: 'boarding concept', policy: 'policy document',
  code_of_conduct: 'code of conduct', terms: 'terms & conditions',
}
function languageLabel(langs: string[] | null): string {
  if (!langs?.length) return ''
  return langs.map(l => `${LANG_FLAGS[l] || ''} ${LANG_NAMES[l] || l}`.trim()).join(' / ')
}
function docTypeLabel(t: string): string {
  return DOC_TYPE_LABELS[t] || t.replace(/_/g, ' ')
}

async function fetchDocuments(slug: string, docType: DocType, scope: Scope) {
  // Include any PDF row whose status is NOT 'error' — too_large/scanned PDFs
  // are still downloadable. .or() form lets NULL-status rows through too.
  let query = supabase
    .from('school_pdfs')
    .select('url, filename, languages, doc_type, scope, summary, size_mb, status')
    .eq('school_slug', slug)
    .eq('doc_type', docType)
    .or('status.is.null,status.neq.error')
  if (scope) {
    query = query.eq('scope', scope)
  } else if (docType === 'application_form') {
    // Generic "application form" intent must NOT surface language-course
    // application forms (e.g. Anmeldeformular-Deutschkurs). Codex P5 — for
    // schools where the only application_form is a language-course one, we
    // want this query to return zero rows so the admissions-process
    // deterministic fallback fires instead.
    query = query.neq('scope', 'language_course')
  }
  const { data, error } = await query.order('languages')
  return { rows: data || [], error }
}

interface DocCardItem {
  title: string
  url: string
  language: string
  sizeMb: number | null
  summary: string | null
  badge: string | null
}
interface DocCardResult {
  items: DocCardItem[]
  docType: DocType
  scope: Scope
  requestedLang: string | null
  unmatchedRequest: boolean
}

async function buildDocumentCard(
  slug: string, docType: DocType, scope: Scope, requestedLang: string | null,
): Promise<DocCardResult | null> {
  const { rows } = await fetchDocuments(slug, docType, scope)
  if (!rows.length) return null

  // For brochures specifically, drop rows with no detected language — they
  // pollute the multilingual "pick a language" list with unlabeled rows
  // (e.g. a too_large image-only summer-camp flyer where filename gives no
  // language hint). Other doc types (fees, rules, calendar) show fine without
  // a language tag because they're rarely multilingual anyway.
  let candidates = rows
  if (docType === 'brochure' && !requestedLang) {
    const withLang = rows.filter(p => Array.isArray(p.languages) && p.languages.length > 0)
    if (withLang.length > 0) candidates = withLang
  }

  // Filter by requested language if specified
  let filtered = candidates
  let unmatchedRequest = false
  if (requestedLang) {
    const langMatch = candidates.filter(p => Array.isArray(p.languages) && p.languages.includes(requestedLang))
    if (langMatch.length > 0) {
      filtered = langMatch
    } else {
      filtered = candidates
      unmatchedRequest = true
    }
  }

  const items: DocCardItem[] = filtered.map(p => ({
    title: `${languageLabel(p.languages) || 'PDF'} ${docTypeLabel(p.doc_type)}`.trim(),
    url: p.url,
    language: languageLabel(p.languages),
    sizeMb: p.size_mb,
    summary: p.summary?.slice(0, 220) || null,
    badge: p.scope && p.scope !== 'general' ? p.scope.replace(/_/g, ' ') : null,
  }))

  return { items, docType, scope, requestedLang, unmatchedRequest }
}

// Backwards-compat alias for any callers still expecting buildBrochureCard
async function buildBrochureCard(slug: string, requestedLang: string | null) {
  return buildDocumentCard(slug, 'brochure', null, requestedLang)
}

// ── Surroundings intent (location, area, transport, restaurants, hiking) ──────
// One row per school in school_surroundings (narrative + transport + pois).
// Detect specific sub-intent so the answer is targeted rather than dumping the
// whole narrative for a "what's the nearest airport" question.
type SurroundIntent = 'overview' | 'airport' | 'transport' | 'restaurants' | 'hiking' | 'sightseeing' | 'town' | null

function detectSurroundingsIntent(question: string): SurroundIntent {
  const q = question.toLowerCase()
  if (/airport|flughafen|aeroporto|fly into|nearest.*airport/i.test(q))                 return 'airport'
  if (/train|station|bahnhof|stazione|how.*get.*there|how.*to get to|how.*reach/i.test(q)) return 'transport'
  if (/restaurant|food.*nearby|places to eat|cafe|dining/i.test(q))                       return 'restaurants'
  if (/hiking|hike|trail|walking trail|wandern|sentiero|outdoor activit/i.test(q))        return 'hiking'
  if (/sightseeing|tourist|attraction|must.see|day trip|landmark/i.test(q))               return 'sightseeing'
  if (/town|village|local area|surrounding town|near.*school|what.*town/i.test(q))         return 'town'
  if (/what.*(around|nearby)|surrounding|area near|location|where is.*school|tell me about.*area|what.*near/i.test(q)) return 'overview'
  return null
}

interface SurroundingsRow {
  narrative: string | null
  transport: { nearest_airport?: string; nearest_train_station?: string; highway_access?: string } | null
  pois: Array<{ name: string; type: string; distance: string; note: string }> | null
  map_embed_url: string | null
  map_lat: number | null
  map_lng: number | null
}

async function fetchSurroundings(slug: string): Promise<SurroundingsRow | null> {
  const { data } = await supabase
    .from('school_surroundings')
    .select('narrative, transport, pois, map_embed_url, map_lat, map_lng')
    .eq('school_slug', slug)
    .maybeSingle()
  return (data as SurroundingsRow) || null
}

function buildSurroundingsAnswer(intent: SurroundIntent, row: SurroundingsRow, schoolName: string): string {
  const t = row.transport || {}
  const pois = row.pois || []

  const filtered = (types: string[]) =>
    pois.filter(p => types.some(tp => (p.type || '').toLowerCase().includes(tp)))

  const formatPoi = (p: { name: string; type: string; distance: string; note: string }) =>
    `- ${p.name}${p.distance ? ` (${p.distance})` : ''}: ${p.note}`

  if (intent === 'airport' && t.nearest_airport) {
    return `Nearest airport for ${schoolName}: ${t.nearest_airport}.${t.nearest_train_station ? ` From there, ${t.nearest_train_station}.` : ''}`
  }
  if (intent === 'transport') {
    const bits = [
      t.nearest_airport && `Airport: ${t.nearest_airport}.`,
      t.nearest_train_station && `Train: ${t.nearest_train_station}.`,
      t.highway_access && `Road: ${t.highway_access}.`,
    ].filter(Boolean)
    return bits.length ? bits.join(' ') : (row.narrative || '')
  }
  if (intent === 'restaurants') {
    const list = filtered(['restaurant', 'cafe', 'dining', 'food'])
    if (list.length) return `Near ${schoolName}:\n${list.map(formatPoi).join('\n')}`
    // Fallback to narrative excerpt if we don't have specific restaurant POIs
    return row.narrative || `${schoolName} doesn't have specific restaurant entries on file — please check the local town centre.`
  }
  if (intent === 'hiking') {
    const list = filtered(['hike', 'trail', 'outdoor', 'sport', 'mountain'])
    if (list.length) return `Hiking + outdoor near ${schoolName}:\n${list.map(formatPoi).join('\n')}`
    return row.narrative || ''
  }
  if (intent === 'sightseeing') {
    const list = filtered(['sightseeing', 'landmark', 'tourist', 'attraction', 'historical'])
    if (list.length) return `Sightseeing near ${schoolName}:\n${list.map(formatPoi).join('\n')}`
    return row.narrative || ''
  }
  // overview / town / fallback — return the full narrative, optionally with POIs
  let out = row.narrative || ''
  if (pois.length) {
    out += `\n\nKey points of interest:\n${pois.map(formatPoi).join('\n')}`
  }
  return out
}

// ── Media intent (Disentis-only: photos + videos) ─────────────────────────────
// Surfaces school_images + school_videos rows when the parent asks for a photo
// or video. Gated to gymnasium-disentis only: every other school short-circuits
// to `null` so this branch is invisible to the rest of the chatbot. Multilingual
// trigger vocab (en / de / it) — Disentis parents write in all three.
type MediaKind = 'photos' | 'videos'
interface MediaIntent {
  kind: MediaKind
  category: string | null   // null = any
  schoolSlug: string
}

const DISENTIS_SLUG = 'gymnasium-disentis'

// Match order matters — most specific keywords first. The first match wins so
// "show me the dining hall" lands on `dining`, not on generic `campus`.
const IMAGE_CATEGORY_KEYWORDS: Array<[string, RegExp]> = [
  ['dining',         /\b(dining|food|meal|cafeteria|canteen|kitchen|essen|mensa|kueche|kuche|küche|cibo|cucina)\b/i],
  ['arts_music',     /\b(music|concert|choir|orchestra|drama|theater|theatre|art\b|musik|konzert|kunst|musica|concerto)\b/i],
  ['classroom',      /\b(classroom|class\b|lesson|teaching|study\b|klasse|unterricht|lezione)\b/i],
  ['dorm',           /\b(dorm|dormitory|bedroom|boarding(?:\s*house|\s*room)?|internat|zimmer|schlafzimmer|camera\s*da\s*letto)\b/i],
  ['chapel',         /\b(chapel|church|abbey|monastery|kapelle|kirche|kloster|chiesa)\b/i],
  ['outdoor_nature', /\b(outdoor|outside|nature|mountain|alpine|hiking|berg|wald|natur|montagna)\b/i],
  ['sport',          /\b(sport|sports|football|soccer|ski|skiing|gym|tennis|fussball|fußball)\b/i],
  ['event',          /\b(event|ceremony|graduation|festival|matura|feier|veranstaltung|cerimonia)\b/i],
  ['portrait',       /\b(portrait|portraits|students?\s*(?:photos?|pictures?))\b/i],
  ['campus',         /\b(campus|building|grounds|exterior|gebaeude|gebäude|edificio)\b/i],
]

const PHOTO_TRIGGERS =
  /\b(photo|photos|picture|pictures|image|images|gallery|impression|impressions|see\s+(?:some|a)|show\s+(?:me|us)|send\s+(?:me|us|a)?\s*(?:image|photo|picture|pic)|foto|fotos|bild|bilder|immagini|impressioni|zeig|sieh)\b/i

const VIDEO_TRIGGERS =
  /\b(video|videos|youtube|footage|clip|clips|trailer|imagefilm|film)\b/i

// Some phrases imply video without the word "video": "campus tour" / "school tour"
// is a video on Disentis' YouTube channel. Keep this list tight — generic "tour"
// alone is too easily a school visit request.
const VIDEO_PHRASE_TRIGGERS =
  /\b(campus\s+tour|school\s+tour|virtual\s+tour|walk[\s-]?through)\b/i

function detectMediaIntent(question: string, slug: string): MediaIntent | null {
  // Gate: enabled ONLY for Disentis. Every other school's chatbot stays
  // byte-identical to its current behavior because this short-circuits to null.
  if (slug !== DISENTIS_SLUG) return null

  const wantsVideo = VIDEO_TRIGGERS.test(question) || VIDEO_PHRASE_TRIGGERS.test(question)
  const wantsPhoto = PHOTO_TRIGGERS.test(question)
  if (!wantsPhoto && !wantsVideo) return null

  let category: string | null = null
  for (const [cat, re] of IMAGE_CATEGORY_KEYWORDS) {
    if (re.test(question)) { category = cat; break }
  }

  // Video word wins over photo word — "show me a video of the dining hall"
  // is a video request with category=dining.
  return {
    kind: wantsVideo ? 'videos' : 'photos',
    category,
    schoolSlug: slug,
  }
}

// ── Photo card builder ───────────────────────────────────────────────────────
interface PhotoCardItem {
  url: string
  caption: string | null
  category: string
  tags: string[] | null
  width: number | null
  height: number | null
}
interface PhotoCardResult {
  items: PhotoCardItem[]
  categoriesAvailable: string[]
  totalForSchool: number
  category: string | null
}

async function buildPhotoCard(slug: string, category: string | null, limit = 6): Promise<PhotoCardResult | null> {
  // Get every category in one pass + total count for surfacing in the answer.
  const { data: catRows, count: totalForSchool } = await supabase
    .from('school_images')
    .select('category', { count: 'exact' })
    .eq('school_slug', slug)
    .not('r2_url', 'is', null)
  const categoriesAvailable = Array.from(new Set((catRows || []).map(r => r.category).filter(Boolean) as string[])).sort()

  let q = supabase
    .from('school_images')
    .select('r2_url, caption, category, tags, width, height')
    .eq('school_slug', slug)
    .not('r2_url', 'is', null)
  if (category) q = q.eq('category', category)
  q = q.order('vision_pass_at', { ascending: false, nullsFirst: false }).limit(limit)

  const { data: rows } = await q
  const items: PhotoCardItem[] = (rows || []).map(r => ({
    url:      r.r2_url as string,
    caption:  r.caption as string | null,
    category: r.category as string,
    tags:     (r.tags as string[] | null) ?? null,
    width:    (r.width as number | null) ?? null,
    height:   (r.height as number | null) ?? null,
  }))
  if (items.length === 0 && !category) return null  // no photos at all = surface nothing
  return { items, categoriesAvailable, totalForSchool: totalForSchool ?? 0, category }
}

// ── Video card builder ───────────────────────────────────────────────────────
interface VideoCardItem {
  url: string
  title: string
  description: string | null
  thumbnailUrl: string | null
  category: string | null
  publishedAt: string | null
  durationS: number | null
}
interface VideoCardResult {
  items: VideoCardItem[]
  categoriesAvailable: string[]
  totalForSchool: number
  category: string | null
}

// Map image-categorisation vocab → school_videos.category vocab. Builder accepts
// either side — keeps detectMediaIntent simple.
const PHOTO_TO_VIDEO_CATEGORY: Record<string, string> = {
  campus:     'campus_tour',
  arts_music: 'music_arts',
  sport:      'sports',
  // Photo-side `dorm` covers boarding-house imagery; video-side that's the
  // `student_life` bucket on the YouTube channel (no separate "dorm" videos
  // exist). Without this mapping "videos of the boarding life" returned zero.
  dorm:       'student_life',
}

async function buildVideoCard(slug: string, requestedCategory: string | null, limit = 6): Promise<VideoCardResult | null> {
  const videoCategory = requestedCategory
    ? (PHOTO_TO_VIDEO_CATEGORY[requestedCategory] || requestedCategory)
    : null

  const { data: catRows, count: totalForSchool } = await supabase
    .from('school_videos')
    .select('category', { count: 'exact' })
    .eq('school_slug', slug)
  const categoriesAvailable = Array.from(new Set((catRows || []).map(r => r.category).filter(Boolean) as string[])).sort()

  let q = supabase
    .from('school_videos')
    .select('url, title, description, thumbnail_url, category, published_at, duration_s')
    .eq('school_slug', slug)
  if (videoCategory) q = q.eq('category', videoCategory)
  q = q.order('published_at', { ascending: false, nullsFirst: false }).limit(limit)

  const { data: rows } = await q
  const items: VideoCardItem[] = (rows || []).map(r => ({
    url:          r.url as string,
    title:        r.title as string,
    description:  (r.description as string | null) ?? null,
    thumbnailUrl: (r.thumbnail_url as string | null) ?? null,
    category:     (r.category as string | null) ?? null,
    publishedAt:  (r.published_at as string | null) ?? null,
    durationS:    (r.duration_s as number | null) ?? null,
  }))
  if (items.length === 0 && !requestedCategory) return null
  return { items, categoriesAvailable, totalForSchool: totalForSchool ?? 0, category: videoCategory }
}

// ── Media answer text builders ───────────────────────────────────────────────
function prettyCategory(cat: string): string {
  return cat.replace(/_/g, ' ')
}

function buildPhotoFacts(schoolName: string, intent: MediaIntent, card: PhotoCardResult): string {
  const { items, categoriesAvailable, totalForSchool } = card
  const lines: string[] = []
  if (items.length === 0) {
    const wanted = intent.category ? prettyCategory(intent.category) : 'matching'
    lines.push(`I don't have ${wanted} photos of ${schoolName} on file yet.`)
    if (categoriesAvailable.length) {
      lines.push(`Categories I do have: ${categoriesAvailable.map(prettyCategory).join(', ')}.`)
    }
    return lines.join('\n')
  }
  const catLabel = intent.category ? `${prettyCategory(intent.category)} ` : ''
  lines.push(`Here ${items.length === 1 ? 'is 1' : `are ${items.length}`} ${catLabel}photo${items.length === 1 ? '' : 's'} from ${schoolName}${!intent.category ? ` (out of ${totalForSchool} on file)` : ''}:`)
  lines.push('')
  for (const it of items) {
    const alt = it.caption || `${schoolName} ${it.category}`
    // Linked-image markdown: clicking the thumbnail opens the full-size R2
    // photo in a new tab. The renderMarkdown extension on the client picks
    // this `[![alt](src)](dest)` pattern up and wraps the <img> in an <a>.
    lines.push(`[![${alt.replace(/[\[\]]/g, '')}](${it.url})](${it.url})`)
    if (it.caption) lines.push(`_${it.caption}_`)
    lines.push('')
  }
  if (!intent.category && categoriesAvailable.length > 1) {
    lines.push(`Other categories you can ask for: ${categoriesAvailable.filter(c => c !== 'general').map(prettyCategory).join(', ')}.`)
  }
  return lines.join('\n').trim()
}

function buildVideoFacts(schoolName: string, intent: MediaIntent, card: VideoCardResult): string {
  const { items, categoriesAvailable, totalForSchool } = card
  const lines: string[] = []
  if (items.length === 0) {
    const wanted = intent.category ? prettyCategory(intent.category) : 'matching'
    lines.push(`I don't have ${wanted} videos of ${schoolName} on file yet.`)
    if (categoriesAvailable.length) {
      lines.push(`Video categories I do have: ${categoriesAvailable.map(prettyCategory).join(', ')}.`)
    }
    return lines.join('\n')
  }
  const catLabel = intent.category && card.category ? `${prettyCategory(card.category)} ` : ''
  lines.push(`Here ${items.length === 1 ? 'is 1' : `are ${items.length}`} ${catLabel}video${items.length === 1 ? '' : 's'} from ${schoolName}${!intent.category ? ` (out of ${totalForSchool} on the channel)` : ''}:`)
  lines.push('')
  for (const it of items) {
    // Linked-image: clicking the YouTube thumbnail opens the watch URL on
    // YouTube in a new tab — same shape as photos so the client doesn't need
    // a video-specific branch. The bold title link below it stays as an
    // accessible fallback if the thumbnail fails to load.
    if (it.thumbnailUrl) lines.push(`[![${it.title.replace(/[\[\]]/g, '')}](${it.thumbnailUrl})](${it.url})`)
    lines.push(`**[${it.title}](${it.url})**`)
    if (it.description) {
      const trimmed = it.description.length > 220 ? it.description.slice(0, 217) + '…' : it.description
      lines.push(trimmed)
    }
    lines.push('')
  }
  if (!intent.category && categoriesAvailable.length > 1) {
    lines.push(`Other video categories: ${categoriesAvailable.map(prettyCategory).join(', ')}.`)
  }
  return lines.join('\n').trim()
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

  // Always fetch the NanaSays profile row (pinned baseline).
  // D7-3 (2026-05-08): handle BOTH legacy 'nanasays' and new 'nanasays_internal'
  // source_types — the latter is what crawl-school-site.js writes after the
  // self-ref URL fix. Use .in() + .limit(1) instead of .eq() + .single().
  const { data: profileRows } = await supabase
    .from('school_knowledge')
    .select('*')
    .eq('school_slug', slug)
    .in('source_type', ['nanasays', 'nanasays_internal'])
    .limit(1)
  const profileRow = (profileRows && profileRows[0]) || null

  // Check if embeddings exist
  const { count: embCount } = await supabase
    .from('school_knowledge')
    .select('*', { count: 'exact', head: true })
    .eq('school_slug', slug)
    .not('embedding', 'is', null)

  // Helper: drop both internal source_types from candidate lists.
  const isInternalProfile = (r: any) =>
    r?.source_type === 'nanasays' ||
    r?.source_type === 'nanasays_internal' ||
    (typeof r?.source_url === 'string' && r.source_url.startsWith('internal://'))

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
        candidates = vectorResults.filter((r: any) => !isInternalProfile(r))
      }
    } catch {
      // fall through to keyword
      const { data: rows } = await supabase
        .from('school_knowledge')
        .select('*')
        .eq('school_slug', slug)
        .not('source_type', 'in', '("nanasays","nanasays_internal")')
      const keywords = extractKeywords(question)
      candidates = (rows || [])
        .filter((r: any) => !isInternalProfile(r))
        .map(r => ({ ...r, score: scoreChunk(r.content, keywords) }))
        .sort((a, b) => b.score - a.score)
    }
  } else {
    const { data: rows } = await supabase
      .from('school_knowledge')
      .select('*')
      .eq('school_slug', slug)
      .not('source_type', 'in', '("nanasays","nanasays_internal")')
    const keywords = extractKeywords(question)
    candidates = (rows || [])
      .filter((r: any) => !isInternalProfile(r))
      .map(r => ({ ...r, score: scoreChunk(r.content, keywords) }))
      .sort((a, b) => b.score - a.score)
  }

  // Fetch structured data + Notion sidecar (hand-curated UK school facts;
  // wired 2026-05-24 via Notion-sidecar chat-wiring slice).
  // Only clean rows are surfaced; service-role selects only the safe columns
  // — `raw_properties`, `rejected`, `flagged_review` are never returned to the
  // chat surface (Codex r1 RLS guidance).
  const [
    { data: structured },
    { data: notionRow },
  ] = await Promise.all([
    supabase
      .from('school_structured_data')
      .select('*')
      .eq('school_slug', slug)
      .single(),
    supabase
      .from('school_notion_backfill')
      .select('school_slug, status, parsed')
      .eq('school_slug', slug)
      // Codex r3 P1: accept both `clean` + `matched` (see retrieve.js).
      .in('status', ['clean', 'matched'])
      .maybeSingle(),
  ])
  // Project at the fetch boundary (Codex r1 P1.1) so the raw `parsed` blob —
  // which contains boarding_fee_term / boarding_fee_year and raw Notion
  // property shapes — never reaches the prompt or any downstream surface.
  const notion_backfill = projectNotionBackfill(
    notionRow && notionRow.parsed ? notionRow.parsed : null,
    structured || null,
  )

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
    // D7-3 (2026-05-08): defence-in-depth — vector RPC may not have been
    // updated to filter both source types yet. Skip both + internal:// URLs.
    if (isInternalProfile(row)) continue

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

  return { chunks: selected, structured: structured || null, notion_backfill }
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
  // D7-3 (2026-05-08): handle both legacy 'nanasays' and new 'nanasays_internal'.
  if (row.source_type === 'nanasays' || row.source_type === 'nanasays_internal') return 'NanaSays profile data'
  if (row.source_type === 'pdf') return `PDF: ${row.title}`
  return `school website — ${row.category} page`
}

function buildStructuredBlock(structured: any, notionBackfill: any = null): string {
  if (!structured && !notionBackfill) return ''
  // Delegate to the shared canonical-key renderer (nana-brain.js) so the
  // portal assistant surfaces the same sports profile (tier, DMT, coaching
  // staff, cup history, programmes) that /dev/nana-test sees. The shared
  // helper returns the literal '(no structured data)' sentinel when the
  // input is empty — treat that as the empty-block case. Notion sidecar
  // (hand-curated UK facts) is passed through so the school chat surfaces
  // the same class-size / pupil-count / Heathrow-distance lines that the
  // deep-report Nana panel sees.
  const block = buildStructuredBlockShared(structured, notionBackfill)
  if (!block || block === '(no structured data)') return ''
  return `\nVERIFIED STRUCTURED FACTS (extracted from school data — treat as authoritative):\n${block}\n`
}

function buildPrompt(
  schoolName: string,
  chunks: any[],
  structured: any,
  contacts: any[],
  question: string,
  newsChunks: { education: any[]; area: any[] } = { education: [], area: [] },
  cardType: CardType = 'general',
  notionBackfill: any = null,
): string {
  const isSensitive    = chunks.some(c => SENSITIVE_CATEGORIES.has(c.category))
  const structuredBlock = buildStructuredBlock(structured, notionBackfill)
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
  const sources: Array<{ label: string; url: string }> = sourceLines.map(line => {
    const match = line.match(/\(Source: (.*?) \| (https?:\/\/[^\)]+)\)/)
    return match ? { label: match[1], url: match[2] } : null
  }).filter((s): s is { label: string; url: string } => s !== null)

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
  if (!isPaidModeOn()) {
    return NextResponse.json({ error: 'School chat is not available.' }, { status: 410 })
  }

  try {
    const { slug, question } = await req.json()

    if (!slug || !question) {
      return NextResponse.json({ error: 'slug and question required' }, { status: 400 })
    }
    if (question.length > 1000) {
      return NextResponse.json({ error: 'Question too long' }, { status: 400 })
    }

    // ── Per-prospect demo token validation ───────────────────────────────────
    // When the request arrives with `x-demo-token`, validate it against
    // demo_tokens (sha256 of plaintext) and enforce:
    //   • token exists, not revoked, not expired
    //   • requested slug is in token.allowed_slugs (or allowed_slugs is null = all)
    // When the header is absent we fall through to the existing PIN-gated /
    // paid-mode access path. This keeps internal /portal/demo/* working without
    // tokens while still scoping prospect URLs.
    const demoTokenHeader = req.headers.get('x-demo-token')
    if (demoTokenHeader) {
      const tokenHash = crypto.createHash('sha256').update(demoTokenHeader).digest('hex')
      const { data: tokenRow, error: tokenErr } = await supabase
        .from('demo_tokens')
        .select('id, allowed_slugs, expires_at, revoked_at, prospect_name, use_count')
        .eq('token_hash', tokenHash)
        .maybeSingle()

      if (tokenErr || !tokenRow) {
        return NextResponse.json({ error: 'Invalid demo token.' }, { status: 401 })
      }
      if (tokenRow.revoked_at) {
        return NextResponse.json({ error: 'This demo token has been revoked.' }, { status: 403 })
      }
      if (tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() < Date.now()) {
        return NextResponse.json({ error: 'This demo token has expired.' }, { status: 403 })
      }
      if (tokenRow.allowed_slugs && tokenRow.allowed_slugs.length > 0 && !tokenRow.allowed_slugs.includes(slug)) {
        return NextResponse.json({
          error: `This demo token is scoped to ${tokenRow.allowed_slugs.length} school${tokenRow.allowed_slugs.length === 1 ? '' : 's'} and doesn't include "${slug}". Contact your sales rep to expand access.`,
        }, { status: 403 })
      }

      // Bump use_count + last_used_at — fire-and-forget, doesn't gate response.
      void supabase.from('demo_tokens').update({
        last_used_at: new Date().toISOString(),
        use_count: tokenRow.use_count + 1,
      }).eq('id', tokenRow.id)
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

    // Detect cardType + document intent FIRST so we can short-circuit
    // file-request intents before spending an embedding call on retrieve().
    // Hybrid mode (per Codex review): isFileRequest=true → deterministic doc
    // card response (no LLM); otherwise the LLM answers and we ATTACH any
    // matching docs as evidence after.
    const cardType = detectCardType(question)
    const docIntent = detectDocumentRequest(question)
    const surroundIntent = detectSurroundingsIntent(question)
    // Media intent is Disentis-only. detectMediaIntent returns null for every
    // other school, so this branch is invisible to the UK chatbot.
    const mediaIntent = detectMediaIntent(question, slug)

    // ── Surroundings short-circuit (deterministic from school_surroundings) ──
    // Fires when the user asks about location/area/airport/transport/etc. AND
    // we have a school_surroundings row. No LLM call. Returns the curated
    // narrative + relevant transport/POI subset, with the map URL as a source.
    //
    // `&& !mediaIntent` guards a collision: the surroundings "restaurants"
    // intent matches `dining` (for "places to eat nearby"), but Disentis parents
    // asking "photos of the dining hall?" want photos, not a town narrative.
    // When a media intent is also present, photo/video wins.
    if (surroundIntent && !mediaIntent) {
      const [surroundings, schoolRow] = await Promise.all([
        fetchSurroundings(slug),
        supabase.from('schools').select('name, official_website').eq('slug', slug).maybeSingle().then(r => r.data as { name?: string; official_website?: string } | null),
      ])
      if (surroundings && surroundings.narrative) {
        const schoolName = schoolRow?.name || slug
        const facts = buildSurroundingsAnswer(surroundIntent, surroundings, schoolName)
        const sources: Array<{ label: string; url: string }> = []
        if (surroundings.map_lat != null && surroundings.map_lng != null) {
          // Clean (non-iframe) Google Maps URL for the source pill — opens
          // directly in a browser tab when an agent clicks or pastes it.
          sources.push({ label: 'Map', url: `https://maps.google.com/?q=${surroundings.map_lat},${surroundings.map_lng}` })
        } else if (surroundings.map_embed_url) {
          sources.push({ label: 'Map', url: surroundings.map_embed_url.replace(/[?&]output=embed/, '') })
        }
        if (schoolRow?.official_website) sources.push({ label: 'Official school website', url: schoolRow.official_website })

        void supabase.from('chat_questions').insert({
          school_slug: slug, question, answer: facts,
          sources, tokens_in: 0, tokens_out: 0,
          model: 'surroundings-short-circuit',
        }).then(({ error }) => { if (error) console.error('chat_questions insert error:', error.message) })

        return NextResponse.json({
          facts, signals: null, intelligence: null, sources,
          card: surroundings.map_embed_url
            ? { surroundings: { map_embed_url: surroundings.map_embed_url, lat: surroundings.map_lat, lng: surroundings.map_lng, pois: surroundings.pois } }
            : null,
          structured: null,
          cardType: 'general',
          answer: facts,
        })
      }
      // No surroundings row yet — fall through to LLM path
    }

    // ── Media short-circuit (Disentis-only: photos + videos) ─────────────────
    // No LLM call. Pulls school_images / school_videos and returns markdown that
    // the renderMarkdown inline-image extension renders as actual thumbnails.
    if (mediaIntent) {
      const schoolRow = await supabase.from('schools').select('name').eq('slug', slug).maybeSingle().then(r => r.data as { name?: string } | null)
      const schoolName = schoolRow?.name || slug

      if (mediaIntent.kind === 'photos') {
        const card = await buildPhotoCard(slug, mediaIntent.category, 6)
        if (card) {
          const facts = buildPhotoFacts(schoolName, mediaIntent, card)
          const sources = card.items.map((it, idx) => ({
            label: it.caption ? `Photo ${idx + 1}` : `${prettyCategory(it.category)} ${idx + 1}`,
            url: it.url,
          }))
          void supabase.from('chat_questions').insert({
            school_slug: slug, question, answer: facts,
            sources, tokens_in: 0, tokens_out: 0,
            model: 'media-photos-short-circuit',
          }).then(({ error }) => { if (error) console.error('chat_questions insert error:', error.message) })

          return NextResponse.json({
            facts, signals: null, intelligence: null, sources,
            card: { photos: card.items, categoriesAvailable: card.categoriesAvailable },
            structured: null,
            cardType: 'general',
            answer: facts,
          })
        }
      } else {
        const card = await buildVideoCard(slug, mediaIntent.category, 6)
        if (card) {
          const facts = buildVideoFacts(schoolName, mediaIntent, card)
          const sources = card.items.map((it, idx) => ({
            label: it.title.length > 60 ? it.title.slice(0, 57) + '…' : it.title,
            url: it.url,
          }))
          void supabase.from('chat_questions').insert({
            school_slug: slug, question, answer: facts,
            sources, tokens_in: 0, tokens_out: 0,
            model: 'media-videos-short-circuit',
          }).then(({ error }) => { if (error) console.error('chat_questions insert error:', error.message) })

          return NextResponse.json({
            facts, signals: null, intelligence: null, sources,
            card: { videos: card.items, categoriesAvailable: card.categoriesAvailable },
            structured: null,
            cardType: 'general',
            answer: facts,
          })
        }
      }
      // Fall through to LLM path if buildPhotoCard / buildVideoCard returned null
      // (means the slug has zero rows in the table — defensive only; Disentis
      // currently has 67 images + 17 videos).
    }

    // ── Document/Brochure short-circuit (truly zero LLM tokens) ───────────────
    // Only fires when the user has explicitly asked for a FILE, not just info
    // about the topic. Conservative trigger keeps "what are the boarding fees?"
    // on the LLM path while "send me the boarding fees PDF" goes here.
    if (docIntent && docIntent.isFileRequest) {
      const [docCard, schoolRow] = await Promise.all([
        buildDocumentCard(slug, docIntent.docType, docIntent.scope, docIntent.language),
        supabase.from('schools').select('name').eq('slug', slug).maybeSingle().then(r => r.data as { name?: string } | null),
      ])
      if (docCard) {
        const { items, docType, requestedLang: lang, unmatchedRequest } = docCard
        const schoolName = schoolRow?.name || slug
        const typeLabel  = docTypeLabel(docType)
        const factsLines: string[] = []
        if (unmatchedRequest && lang) {
          factsLines.push(`I don't have a ${typeLabel} in ${LANG_NAMES[lang] || lang} for ${schoolName}, but here's what's available:`)
          for (const it of items) factsLines.push(`- ${it.language}: [Download PDF](${it.url})${it.sizeMb ? ` — ${it.sizeMb} MB` : ''}`)
        } else if (items.length === 1) {
          const it = items[0]
          factsLines.push(`Here's the ${it.language ? it.language + ' ' : ''}${typeLabel} for ${schoolName}:`)
          factsLines.push(`📄 [${it.title}](${it.url})${it.sizeMb ? ` — ${it.sizeMb} MB` : ''}`)
          if (it.summary) factsLines.push('', it.summary)
        } else {
          factsLines.push(`${schoolName} publishes ${items.length} ${typeLabel}${items.length > 1 ? 's' : ''}. Pick the right one:`)
          for (const it of items) {
            const labelBits = [it.language, it.badge].filter(Boolean).join(' · ')
            factsLines.push(`- ${labelBits}: [Download PDF](${it.url})${it.sizeMb ? ` — ${it.sizeMb} MB` : ''}`)
          }
        }
        const facts = factsLines.join('\n')

        const sources = items.map(it => ({
          label: `${docTypeLabel(docType)} (${it.language || 'PDF'})`,
          url: it.url,
        }))

        void supabase.from('chat_questions').insert({
          school_slug: slug, question, answer: facts,
          sources, tokens_in: 0, tokens_out: 0,
          model: 'document-short-circuit',
        }).then(({ error }) => { if (error) console.error('chat_questions insert error:', error.message) })

        // Frontend recognizes both `brochures` (legacy) and `documents` (new).
        // Use `brochures` for brochure intent so the existing renderer keeps
        // its brochure styling; use `documents` for everything else.
        const cardField = docType === 'brochure'
          ? { brochures: items }
          : { documents: items, docType }

        return NextResponse.json({
          facts, signals: null, intelligence: null, sources,
          card: cardField,
          structured: null,
          cardType: docType === 'brochure' ? 'brochure' : 'document',
          answer: facts,
        })
      }

      // No matching documents for this intent. Don't fall through to a generic
      // LLM answer for application_form — give a clean deterministic message
      // pointing at the admissions process. (Codex P5: this is exactly the
      // misfire that looks worse than a graceful "no downloadable form".)
      if (docIntent.docType === 'application_form') {
        const { data: contactRows } = await supabase
          .from('school_contacts')
          .select('email, phone, role, name')
          .eq('school_slug', slug)
        const schoolRow2 = await supabase.from('schools').select('name, official_website').eq('slug', slug).maybeSingle()
        const schoolName = schoolRow2.data?.name || slug
        const homepage   = schoolRow2.data?.official_website || ''
        // Prefer a contact row that has BOTH a clean email AND a phone — that's
        // typically the canonical "General Office" / "Admissions" row. Falls
        // back to any clean email otherwise. The shape check guards against
        // database pollution like "68info@..." that can creep in from
        // historical phone+email mis-parses by older extractors.
        const isCleanEmail = (e: string | null | undefined) =>
          !!e && /^[a-z][a-z0-9._%+-]*@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e)
        const isLikelyPhone = (p: string | null | undefined) =>
          !!p && /^[+()\d\s.-]{6,}$/.test(p)
        const canonical = contactRows?.find(c => isCleanEmail(c.email) && isLikelyPhone(c.phone))
        const contactEmail = canonical?.email || contactRows?.find(c => isCleanEmail(c.email))?.email
        const contactPhone = canonical?.phone || contactRows?.find(c => isLikelyPhone(c.phone))?.phone
        const factsLines: string[] = [
          `${schoolName} doesn't publish a downloadable admissions application form — admissions is handled directly by the admissions office.`,
          '',
          `Next step: contact the admissions office to start the application:`,
        ]
        if (contactEmail) factsLines.push(`- Email: ${contactEmail}`)
        if (contactPhone) factsLines.push(`- Phone: ${contactPhone}`)
        if (homepage) factsLines.push(`- Admissions page: ${homepage.replace(/\/+$/, '')}/en/admissions/`)

        const facts = factsLines.join('\n')
        const sources = [{ label: 'Admissions page', url: `${homepage.replace(/\/+$/, '')}/en/admissions/` }]

        void supabase.from('chat_questions').insert({
          school_slug: slug, question, answer: facts,
          sources, tokens_in: 0, tokens_out: 0,
          model: 'admissions-fallback',
        }).then(({ error }) => { if (error) console.error('chat_questions insert error:', error.message) })

        return NextResponse.json({
          facts, signals: null, intelligence: null, sources,
          card: null,
          structured: null,
          cardType: 'admissions',
          answer: facts,
        })
      }
      // Otherwise fall through to LLM
    }

    // Standard path — fetch school data, contacts, location in parallel
    const [{ chunks, structured, notion_backfill }, contacts, location] = await Promise.all([
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

    // D7-3 (2026-05-08): handle both legacy + new internal source types so
    // school-name resolution still finds the profile after T1.4 rename.
    const profileRow = chunks.find((r: any) =>
      r.source_type === 'nanasays' || r.source_type === 'nanasays_internal'
    )
    const schoolName = profileRow?.title?.replace(' — NanaSays Profile Data', '') || slug

    // Detect news intent (cardType already detected above)
    const intent   = detectIntent(question)

    // Codex review: skip news retrieval for pure school-fact questions to keep
    // answers focused. Only fetch news when the user explicitly asks about the
    // local area, recent news, or industry trends. detectIntent already
    // distinguishes 'area' / 'hybrid' (area-related) from 'education' / 'factual'.
    const newsRelevant = intent === 'area' || intent === 'hybrid'
    const newsChunks = newsRelevant
      ? await retrieveNews(question, location.country, intent)
      : { education: [], area: [] }

    const prompt = buildPrompt(schoolName, chunks, structured, contacts, question, newsChunks, cardType, notion_backfill)

    const model  = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent(prompt)
    const raw    = result.response.text()
    const usage  = result.response.usageMetadata

    const parsed = parseResponse(raw)

    // ── Topic-question document attach ───────────────────────────────────────
    // If the question matched a docIntent BUT wasn't a file request (e.g.
    // "what are the boarding fees?"), attach the matching PDF as evidence so
    // the agent has it to share with the parent. The LLM still wrote the
    // answer; the PDF link is supplementary. (Codex hybrid mode.)
    let attachedDocs: DocCardItem[] = []
    if (docIntent && !docIntent.isFileRequest) {
      const docCard = await buildDocumentCard(slug, docIntent.docType, docIntent.scope, docIntent.language)
      if (docCard) attachedDocs = docCard.items
    }

    // ── Layered source fallback (Codex P2) ───────────────────────────────────
    // Always populate at least one source so agents can cite. Order:
    //   1. LLM-parsed citations (already in parsed.sources)
    //   2. Attached document URLs (when docIntent matched)
    //   3. Top non-internal retrieved chunk URL — labelled "Supporting school source"
    //   4. School homepage — labelled "Official school website" — final fallback
    const finalSources: Array<{ label: string; url: string }> = [...parsed.sources]
    if (attachedDocs.length) {
      for (const d of attachedDocs) {
        const label = `${docTypeLabel(docIntent!.docType)} (${d.language || 'PDF'})`
        if (!finalSources.some(s => s && s.url === d.url)) {
          finalSources.push({ label, url: d.url })
        }
      }
    }
    if (finalSources.length === 0) {
      const topChunk = chunks.find((c: any) =>
        c.source_url && !c.source_url.startsWith('internal://') &&
        c.source_type !== 'nanasays' && c.source_type !== 'nanasays_internal',
      )
      if (topChunk) {
        finalSources.push({ label: 'Supporting school source', url: topChunk.source_url })
      }
    }
    if (finalSources.length === 0) {
      const { data: schoolMeta } = await supabase
        .from('schools').select('official_website').eq('slug', slug).maybeSingle()
      if (schoolMeta?.official_website) {
        finalSources.push({ label: 'Official school website', url: schoolMeta.official_website })
      }
    }

    // Merge attached docs into card if no card already present
    let finalCard = parsed.card
    if (attachedDocs.length && !finalCard) {
      finalCard = docIntent!.docType === 'brochure'
        ? { brochures: attachedDocs }
        : { documents: attachedDocs, docType: docIntent!.docType }
    } else if (attachedDocs.length && finalCard) {
      // existing card plus document attach
      finalCard = { ...finalCard, documents: attachedDocs, docType: docIntent!.docType }
    }

    // ── Address / contact attach: surface map link for parent follow-ups ─────
    // When the question is about the school's address, contact info, or
    // directions, attach the surroundings map data so the WhatsApp clipboard
    // gets a tappable Google Maps URL. The agent didn't have to ask a separate
    // "where is it on a map" question.
    const isAddressLike = /\b(address|contact|how do i contact|directions|find.*school|where.*school|phone|email)\b/i.test(question)
    if (isAddressLike) {
      const surroundings = await fetchSurroundings(slug)
      if (surroundings && (surroundings.map_lat != null || surroundings.map_embed_url)) {
        finalCard = {
          ...(finalCard || {}),
          surroundings: {
            map_embed_url: surroundings.map_embed_url,
            lat: surroundings.map_lat,
            lng: surroundings.map_lng,
            pois: surroundings.pois,
          },
        }
      }
    }

    // Log (fire and forget)
    void supabase.from('chat_questions').insert({
      school_slug: slug,
      question,
      answer:     parsed.facts,
      sources:    finalSources.length ? finalSources : null,
      tokens_in:  usage?.promptTokenCount     ?? null,
      tokens_out: usage?.candidatesTokenCount ?? null,
      model:      'gemini-2.5-flash',
    }).then(({ error }) => { if (error) console.error('chat_questions insert error:', error.message) })

    return NextResponse.json({
      facts:        parsed.facts,
      signals:      parsed.signals,
      intelligence: parsed.intelligence,
      sources:      finalSources,
      card:         finalCard,
      structured:   structured || null,
      cardType,
      answer:       parsed.facts,
    })

  } catch (err) {
    console.error('school-chat error:', err)
    return NextResponse.json({ error: 'Failed to get response' }, { status: 500 })
  }
}

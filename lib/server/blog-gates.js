/**
 * blog-gates.js — NanaSays blog quality gate checker
 *
 * 8 gates that every generated post must pass before auto-publish.
 * Gates 1–3, 5–6, 8 are content quality issues Claude can fix on retry.
 * Gates 4 (uniqueness) and 7 (freshness) are topic-level failures — skip topic, no retry.
 *
 * Usage:
 *   import { runGates } from './lib/blog-gates.js'
 *   const { passed, results } = await runGates(post, existingPosts, inputData, supabase)
 */

// ─── Text helpers ─────────────────────────────────────────────────────────────

export function stripHtml(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function countWords(html) {
  return stripHtml(html).split(/\s+/).filter(Boolean).length
}

function extractNumbers(html) {
  // Extract all numeric values: 18,000 or 18000 or 18.5 etc.
  const text = stripHtml(html)
  const matches = text.match(/\b[\d,]+(?:\.\d+)?\b/g) || []
  return matches
    .map(m => parseFloat(m.replace(/,/g, '')))
    .filter(n => !isNaN(n) && n > 0)
}

function extractInputDataNumbers(data) {
  const nums = []
  if (data.fee_avg)       nums.push(Math.round(data.fee_avg))
  if (data.fee_min)       nums.push(data.fee_min)
  if (data.fee_max)       nums.push(data.fee_max)
  if (data.school_count)  nums.push(data.school_count)
  if (data.boarding_count) nums.push(data.boarding_count)
  for (const s of (data.schools || [])) {
    if (s.fees_usd_min) nums.push(s.fees_usd_min)
    if (s.fees_usd_max) nums.push(s.fees_usd_max)
    if (s.age_min != null) nums.push(s.age_min)
    if (s.age_max != null) nums.push(s.age_max)
  }
  for (const count of Object.values(data.curriculum_breakdown || {})) {
    if (count > 0) nums.push(count)
  }
  return nums.filter(n => n != null && n > 0)
}

function isWithin5Percent(a, b) {
  if (b === 0) return a === 0
  return Math.abs(a - b) / b <= 0.05
}

function extractSchoolSlugs(html) {
  const slugs = []
  const re = /href="\/schools\/([a-z0-9-]+)"/g
  let m
  while ((m = re.exec(html)) !== null) slugs.push(m[1])
  return slugs
}

function extractCountrySlugs(html) {
  const slugs = []
  const re = /href="\/countries\/([a-z0-9-]+)"/g
  let m
  while ((m = re.exec(html)) !== null) slugs.push(m[1])
  return slugs
}

const STOP_WORDS = new Set([
  'about', 'above', 'after', 'again', 'against', 'also', 'another', 'because', 'before',
  'being', 'between', 'children', 'could', 'during', 'every', 'family', 'families', 'here',
  'international', 'nana', 'nanasays', 'other', 'parent', 'parents', 'program', 'programme',
  'school', 'schools', 'should', 'student', 'students', 'their', 'there', 'these', 'through',
  'under', 'until', 'which', 'while', 'within', 'without', 'would', 'across', 'whether',
  'where', 'above', 'below', 'often', 'always', 'never', 'available', 'important', 'different',
])

function extractKeywords(html, topN = 20) {
  const text = stripHtml(html).toLowerCase()
  const words = text.match(/\b[a-z]{6,}\b/g) || []
  const freq = {}
  for (const w of words) {
    if (!STOP_WORDS.has(w)) freq[w] = (freq[w] || 0) + 1
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([w]) => w)
}

function keywordOverlapRatio(kw1, kw2) {
  const s1 = new Set(kw1)
  const s2 = new Set(kw2)
  const intersection = [...s1].filter(w => s2.has(w)).length
  const union = new Set([...s1, ...s2]).size
  return union === 0 ? 0 : intersection / union
}

// ─── Gate implementations ─────────────────────────────────────────────────────

function gate1DataDensity(post, inputData) {
  const postNumbers = extractNumbers(post.content)
  const inputNumbers = extractInputDataNumbers(inputData)

  if (inputNumbers.length === 0) {
    return { passed: false, reason: 'No numeric data in inputData to verify against' }
  }

  let verified = 0
  const usedInput = new Set()

  for (const num of postNumbers) {
    for (let i = 0; i < inputNumbers.length; i++) {
      if (usedInput.has(i)) continue
      if (isWithin5Percent(num, inputNumbers[i])) {
        verified++
        usedInput.add(i)
        break
      }
    }
    if (verified >= 5) break
  }

  const passed = verified >= 5
  return {
    passed,
    reason: passed
      ? `${verified} data points verified against input data`
      : `Only ${verified} verified data points (need 5). Post numbers found: ${postNumbers.slice(0, 10).join(', ')}`,
  }
}

function gate2WordCount(post) {
  const wc = countWords(post.content)
  const passed = wc >= 1800
  return {
    passed,
    reason: passed ? `${wc.toLocaleString()} words` : `${wc.toLocaleString()} words (minimum 1,800)`,
  }
}

function gate3InternalLinks(post, inputData) {
  const schoolSlugs = extractSchoolSlugs(post.content)
  const countrySlugs = extractCountrySlugs(post.content)
  const inputSlugSet = new Set((inputData.schools || []).map(s => s.slug))

  const brokenLinks = schoolSlugs.filter(slug => !inputSlugSet.has(slug))
  const uniqueSchoolLinks = [...new Set(schoolSlugs)]

  if (uniqueSchoolLinks.length < 5) {
    return { passed: false, reason: `Only ${uniqueSchoolLinks.length} school links (need 5)` }
  }
  if (countrySlugs.length === 0) {
    return { passed: false, reason: 'No country page link found (need 1)' }
  }
  if (brokenLinks.length > 0) {
    return { passed: false, reason: `Broken school links (not in input data): ${brokenLinks.join(', ')}` }
  }
  return {
    passed: true,
    reason: `${uniqueSchoolLinks.length} school links, ${countrySlugs.length} country link(s), all valid`,
  }
}

async function gate4Uniqueness(post, existingPosts, supabase) {
  // Check exact country+curriculum+city combo
  const { data: duplicate } = await supabase
    .from('blog_posts')
    .select('id, title, published_at')
    .eq('status', 'published')
    .eq('country', post.country || '')
    .eq('curriculum', post.curriculum || '')
    .eq('city', post.city || '')
    .limit(1)

  if (duplicate && duplicate.length > 0) {
    return {
      passed: false,
      reason: `Duplicate country+curriculum+city combo already published: "${duplicate[0].title}" (${duplicate[0].published_at?.slice(0, 10)})`,
      isTopicFailure: true,
    }
  }

  // Keyword overlap check
  const newKeywords = extractKeywords(post.content)
  for (const existing of existingPosts) {
    if (!existing.content) continue
    const existingKeywords = extractKeywords(existing.content)
    const overlap = keywordOverlapRatio(newKeywords, existingKeywords)
    if (overlap > 0.30) {
      return {
        passed: false,
        reason: `${Math.round(overlap * 100)}% keyword overlap with "${existing.title}" (limit 30%)`,
      }
    }
  }

  return { passed: true, reason: 'No duplicate topic or excessive keyword overlap found' }
}

function gate5SearchIntent(post) {
  const title = post.title || ''
  const patterns = [
    /(IB|Cambridge|British|American|French Bac|Montessori|IGCSE|AP).+schools?.+in/i,
    /international school fees? in/i,
    /moving to .+ with kids/i,
    /boarding schools? in/i,
    /.+ vs .+/i,
    /how to choose.+international school/i,
    /application timeline for/i,
    /international schools? in .+/i,
  ]
  const matched = patterns.some(re => re.test(title))
  return {
    passed: matched,
    reason: matched
      ? `Title matches approved search intent pattern`
      : `Title does not match any approved pattern: "${title}"`,
  }
}

function gate6NoHallucination(post, inputData) {
  const schoolSlugs = extractSchoolSlugs(post.content)
  const inputSlugSet = new Set((inputData.schools || []).map(s => s.slug))
  const hallucinated = schoolSlugs.filter(slug => !inputSlugSet.has(slug))

  // Warn about schools mentioned by name but not linked
  const inputSchoolNames = (inputData.schools || []).map(s => s.name?.toLowerCase())
  const postText = stripHtml(post.content).toLowerCase()
  const unlinked = (inputData.schools || [])
    .filter(s => {
      const nameInText = postText.includes(s.name.toLowerCase())
      const slugInLinks = schoolSlugs.includes(s.slug)
      return nameInText && !slugInLinks
    })
    .map(s => s.name)

  if (unlinked.length > 0) {
    console.log(`[gates] Gate 6 note — schools mentioned but not linked: ${unlinked.join(', ')}`)
  }

  if (hallucinated.length > 0) {
    return {
      passed: false,
      reason: `School slugs not in input data (hallucinated): ${hallucinated.join(', ')}`,
    }
  }

  return {
    passed: true,
    reason: `All ${schoolSlugs.length} school links point to schools in the input data`,
  }
}

async function gate7Freshness(post, supabase) {
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()

  let query = supabase
    .from('blog_posts')
    .select('id, title, published_at')
    .eq('status', 'published')
    .gte('published_at', sixtyDaysAgo)

  if (post.country)    query = query.eq('country', post.country)
  if (post.curriculum) query = query.eq('curriculum', post.curriculum)
  if (post.city)       query = query.eq('city', post.city)

  const { data: recent } = await query.limit(1)

  if (recent && recent.length > 0) {
    return {
      passed: false,
      reason: `Similar topic published in last 60 days: "${recent[0].title}" (${recent[0].published_at?.slice(0, 10)})`,
      isTopicFailure: true,
    }
  }

  return { passed: true, reason: 'No similar post in last 60 days' }
}

function gate8Readability(post) {
  const html = post.content

  // Count H2 headings
  const h2count = (html.match(/<h2[^>]*>/gi) || []).length
  if (h2count < 4) {
    return { passed: false, reason: `Only ${h2count} H2 headings (need at least 4)` }
  }

  // Check sections have >= 2 paragraphs each
  // Split content at H2 tags (use lookahead to keep separators)
  const sections = html.split(/<h2[^>]*>[\s\S]*?<\/h2>/i)
  let thinSections = 0
  for (let i = 0; i < sections.length; i++) {
    const pCount = (sections[i].match(/<p[^>]*>/gi) || []).length
    // Allow intro section (before first H2) to have 1+ paragraphs
    const minRequired = i === 0 ? 1 : 2
    if (pCount < minRequired) thinSections++
  }
  if (thinSections > 1) {
    return { passed: false, reason: `${thinSections} sections with fewer than 2 paragraphs` }
  }

  // Check paragraph length
  const pContentRe = /<p[^>]*>([\s\S]*?)<\/p>/gi
  let m
  let longParagraphs = 0
  while ((m = pContentRe.exec(html)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, ' ').trim()
    const words = text.split(/\s+/).filter(Boolean)
    if (words.length > 150) longParagraphs++
  }
  if (longParagraphs > 0) {
    return { passed: false, reason: `${longParagraphs} paragraph(s) exceed 150 words (wall-of-text)` }
  }

  return {
    passed: true,
    reason: `${h2count} H2 headings, all sections have 2+ paragraphs, no wall-of-text paragraphs`,
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function runGates(post, existingPosts, inputData, supabase) {
  const gateChecks = [
    { gate: 'Gate 1 — Data Density',    fn: () => gate1DataDensity(post, inputData) },
    { gate: 'Gate 2 — Word Count',       fn: () => gate2WordCount(post) },
    { gate: 'Gate 3 — Internal Links',   fn: () => gate3InternalLinks(post, inputData) },
    { gate: 'Gate 4 — Uniqueness',       fn: () => gate4Uniqueness(post, existingPosts, supabase) },
    { gate: 'Gate 5 — Search Intent',    fn: () => gate5SearchIntent(post) },
    { gate: 'Gate 6 — No Hallucination', fn: () => gate6NoHallucination(post, inputData) },
    { gate: 'Gate 7 — Freshness',        fn: () => gate7Freshness(post, supabase) },
    { gate: 'Gate 8 — Readability',      fn: () => gate8Readability(post) },
  ]

  const results = []
  for (const { gate, fn } of gateChecks) {
    try {
      const result = await fn()
      results.push({ gate, ...result })
    } catch (err) {
      results.push({ gate, passed: false, reason: `Gate error: ${err.message}` })
    }
  }

  const passed = results.every(r => r.passed)
  return { passed, results }
}

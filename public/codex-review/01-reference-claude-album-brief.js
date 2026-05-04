// claude-album-brief.js — Phase 1 of dynamic album generation.
//
// Single Claude call that returns:
//   - A style brief (visual personality for this album)
//   - A slide plan (what each slide is about; content + role)
//   - Caption, hashtags, alt text
//
// The per-slide HTML is generated separately in Phase 2 (claude-album-slides.js).

import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { detailedSchoolBrief } from './school-snapshot.js'
import { pickAxes, formatAxesForPrompt, formatAxesCompact, triplFromStyleBrief } from './design-axes.js'
import { db } from './db.js'

const CLAUDE_BIN = '/opt/homebrew/bin/claude'
const MODEL = process.env.SOCIAL_CLAUDE_MODEL || 'claude-sonnet-4-6'
const BACKEND = (process.env.CLAUDE_BACKEND || 'cli').toLowerCase()

export async function generateAlbumBrief({ pillar, school, schools, angle, planBrief = null }) {
  // Pre-select design axes BEFORE the Claude call. Claude doesn't choose the
  // motif/scale/density — it just renders what we assign. This is the fix for
  // the "every album looks like diagonal split panels" problem.
  const recentTriples = await loadRecentDesignTriples()
  const axes = pickAxes({ recentTriples })
  console.log(`  [design] ${formatAxesCompact(axes)}`)

  const prompt = buildPrompt({ pillar, school, schools, angle, planBrief, axes })
  let raw
  if (BACKEND === 'cli') raw = callCLI(prompt)
  else if (BACKEND === 'api') raw = await callAPI(prompt)
  else throw new Error(`Unknown CLAUDE_BACKEND=${BACKEND}`)

  const parsed = parseResponse(raw)
  // Attach the chosen axes to the brief so Phase 2 can enforce them per slide
  // and future planner calls can read recent triples for rotation.
  parsed.style_brief = parsed.style_brief || {}
  parsed.style_brief.design_axes = {
    motif: axes.motif.key,
    scale: axes.scale.key,
    density: axes.density.key,
    lean: axes.lean.key,
  }
  parsed._axes = axes // raw axes objects for Phase 2 to re-format
  return parsed
}

async function loadRecentDesignTriples() {
  // Look at the last 5 generated album posts' style_briefs and pull out any
  // design_axes we stored. Used to rotate motifs away from recent ones.
  try {
    const { data } = await db
      .from('social_posts')
      .select('source_data')
      .eq('post_type', 'album')
      .eq('status', 'pending_review')
      .order('created_at', { ascending: false })
      .limit(5)
    return (data || [])
      .map(row => triplFromStyleBrief(row.source_data?.style_brief))
      .filter(Boolean)
  } catch {
    return []
  }
}

function buildPrompt({ pillar, school, schools, angle, planBrief, axes }) {
  const slug = pillar.slug
  const focusLine = angle ? `EDITORIAL FOCUS: ${angle}\n(Let this shape tone, word choice, and which ideas get depth.)\n\n` : ''
  const axesBlock = axes ? `\n${formatAxesForPrompt(axes)}\n\n` : ''

  // If this album is plan-driven, Claude MUST deliver on the approved brief.
  // Headlines, insights, and proof points are contracts — not suggestions.
  const planBriefSection = planBrief ? `APPROVED PLAN BRIEF — YOU MUST DELIVER ON THIS (do not invent different angles or facts):
- Headline the cover MUST echo or directly state: "${planBrief.headline || ''}"
- Audience this album is FOR: ${planBrief.audience || 'parents exploring international schools'}
- Pain point it must address: ${planBrief.pain_point || 'n/a'}
- Key insight it must deliver: ${planBrief.key_insight || 'n/a'}
- Proof points (these MUST appear in the content slides, not generic substitutes):
${(planBrief.proof_points || []).map(p => `  • ${p}`).join('\n') || '  (none — generate factual content)'}
- Reader takeaway to close with: ${planBrief.reader_takeaway || 'n/a'}
- Visual direction suggestion: ${planBrief.visual_direction || '(free choice within brand rules)'}

Generate slide content that is DIRECTLY BUILT FROM the proof points and key insight above. Do not pivot to generic advice. If a proof point is about teacher retention, use real teacher-retention framing in the questions/facts. Cover title must reference or closely paraphrase the headline above.

` : ''

  const slideSpec = slidePlanSpec(slug, school, schools)

  return `${focusLine}${planBriefSection}You are planning a NanaSays Instagram/Facebook carousel album — a Bangkok international schools directory.

Album type: ${slug}
${school ? `\nFEATURED SCHOOL — use these specific facts in the content (do not invent or generalize):\n${detailedSchoolBrief(school)}\n` : ''}
${schools?.length ? `\nFEATURED SCHOOLS (for comparison content — draw real contrasts, not generic framing):\n${schools.map((s, i) => `\n=== School ${i + 1} ===\n${detailedSchoolBrief(s)}`).join('\n')}\n` : ''}

BRAND COLOR LOCK (critical — do not violate):
The ONLY colors permitted anywhere in this album are:
  • Navy #1B3252
  • Teal #34C3A0
  • Teal Dark #239C80
  • White #fff
  • Light #F6F8FA
You may NOT suggest alternative palettes (no forest green, olive, coral, burgundy, gold, cream, etc.) even if the school's brand, region, or topic would traditionally use other colors. The style_brief below describes LAYOUT and MOTIF variation — not color variation. Color is fixed.
${axesBlock}
Return ONLY this JSON — no prose, no markdown fences, no explanation:

{
  "style_brief": {
    "visual_theme": "2 sentences describing how you will EXECUTE the assigned motif + scale + density above. Name the motif explicitly and describe its feel. Must reference the assigned color lean. Example: 'Navy-dominant MAGAZINE-GRID with teal module accents; BOLD scale headlines at 66px; MEDIUM density — one corner glow per slide, thin rule separators.' DO NOT propose a different motif.",
    "cover_approach": "1 sentence about HOW THE COVER executes the assigned motif. Honor the motif's cover guidance above.",
    "content_slide_approach": "1 sentence about HOW CONTENT SLIDES execute the motif. Honor the motif's content guidance above.",
    "closer_approach": "1 sentence about HOW THE CLOSER executes the motif. Honor the motif's closer guidance above.",
    "accent_hint": "Just restate the assigned color lean: 'navy-dominant' | 'teal-dominant' | 'balanced'. No alternatives.",
    "layout_grid": {
      "wordmark_position": "pick ONE and keep it the same on every slide: 'top-left' | 'top-right'. Top-left is strongly preferred — matches NanaSays brand conventions.",
      "wordmark_padding_px": "a single number, the distance from the top/left edge in px. Pick a value between 22 and 32 and use it identically on every slide.",
      "progress_dots_position": "pick ONE: 'bottom-center' | 'bottom-left'. Same on every slide.",
      "slide_counter_position": "pick ONE: 'bottom-right' | 'with-dots' | 'hidden'. Same on every slide.",
      "chrome_bottom_padding_px": "a single number between 22 and 32 for how far from the bottom edge the dots/counter sit. Same on every slide."
    }
  },
  "slides": ${slideSpec.slides_json_shape},
  "copy_en": "2–3 sentence Facebook caption. Factual. No superlatives.",
  "hashtags": ${JSON.stringify(slideSpec.hashtags)},
  "image_alt_en": "one sentence describing the album"
}

SLIDE PLAN RULES:
${slideSpec.rules}

The style_brief should make DIFFERENT choices each time you're called (rotate through motifs: radial glows, diagonal splits, circular badges, timeline rails, bold number heroes, split panels). Don't default to the same look every album.`
}

function slidePlanSpec(slug, school, schools) {
  if (slug === 'school_tour_tips') {
    return {
      slides_json_shape: `[
    { "n": 1, "role": "cover", "title": "catchy cover title (e.g. '12 Questions to Ask on Your School Tour')", "subtitle": "one sentence hook" },
    { "n": 2, "role": "content", "topic": "Academics & Results", "questions": [
        { "number": 1, "question": "specific question text", "why_it_matters": "1-2 sentences" },
        { "number": 2, "question": "...", "why_it_matters": "..." }
      ]},
    { "n": 3, "role": "content", "topic": "second topic (pick a distinct one)", "questions": [...2 questions with numbers 3,4...] },
    { "n": 4, "role": "content", "topic": "third topic", "questions": [...numbers 5,6...] },
    { "n": 5, "role": "content", "topic": "fourth topic", "questions": [...numbers 7,8...] },
    { "n": 6, "role": "content", "topic": "fifth topic", "questions": [...numbers 9,10...] },
    { "n": 7, "role": "content", "topic": "sixth topic", "questions": [...numbers 11,12...] },
    { "n": 8, "role": "cta", "headline": "short CTA headline", "subtitle": "1 sentence", "url": "nanasays.com" }
  ]`,
      rules: `- 8 slides total (1 cover + 6 content + 1 CTA)
- Each content slide has a distinct TOPIC and 2 specific, practical questions a parent would actually ask
- Topics should cover: academics, teaching/support, fees, admissions, culture/wellbeing, facilities (or similar variety)`,
      hashtags: ['internationalschool', 'bangkok', 'schooltour'],
    }
  }

  if (slug === 'admissions_guide') {
    return {
      slides_json_shape: `[
    { "n": 1, "role": "cover", "title": "cover title", "subtitle": "hook" },
    { "n": 2, "role": "content", "period": "Sep – Oct", "theme": "Research & Shortlist", "actions": [
        { "icon": "🔍", "title": "...", "description": "1 sentence" },
        { "icon": "📋", "title": "...", "description": "..." },
        { "icon": "🗓", "title": "...", "description": "..." }
      ]},
    { "n": 3, "role": "content", "period": "Nov – Dec", "theme": "Apply", "actions": [...3 actions...] },
    { "n": 4, "role": "content", "period": "Jan – Feb", "theme": "Assessments & Interviews", "actions": [...3...] },
    { "n": 5, "role": "content", "period": "Mar – Apr", "theme": "Offers & Decisions", "actions": [...3...] },
    { "n": 6, "role": "content", "period": "May – Aug", "theme": "Prepare & Confirm", "actions": [...3...] },
    { "n": 7, "role": "cta", "headline": "CTA", "subtitle": "...", "url": "nanasays.com" }
  ]`,
      rules: `- 7 slides total (1 cover + 5 period slides + 1 CTA)
- Each period slide has 3 concrete actions with icons (emoji)`,
      hashtags: ['internationalschool', 'bangkok', 'admissions'],
    }
  }

  if (slug === 'head_to_head') {
    const names = schools?.map(s => s.name).join(', ') || 'four schools'
    const schoolData = schools?.map(s => ({
      id: s.id, name: s.name, fees_min: s.fees_local_min, fees_max: s.fees_local_max,
      currency: s.fees_local_currency || 'THB', curriculum: s.curriculum, founded: s.founded_year,
    })) || []
    return {
      slides_json_shape: `[
    { "n": 1, "role": "cover", "title": "cover title (neutral, not a ranking)", "subtitle": "one sentence" },
    { "n": 2, "role": "fee_comparison", "heading": "Fees at a Glance", "sub": "Annual tuition · Verified 2024–25", "rows": [
        { "school": "school name", "amount": "฿XXX,XXX", "pct": 60 },
        { "school": "...", "amount": "...", "pct": 75 },
        { "school": "...", "amount": "...", "pct": 85 },
        { "school": "...", "amount": "...", "pct": 95 }
      ]},
    { "n": 3, "role": "spotlight", "heading": "Worth exploring if budget is a priority", "school": "school name", "points": ["fact 1", "fact 2", "fact 3"] },
    { "n": 4, "role": "spotlight", "heading": "Worth exploring if location matters", "school": "...", "points": [...] },
    { "n": 5, "role": "spotlight", "heading": "Worth exploring if track record matters", "school": "...", "points": [...] },
    { "n": 6, "role": "spotlight", "heading": "Worth exploring if curriculum matters", "school": "...", "points": [...] },
    { "n": 7, "role": "closing", "title": "A starting point — not a verdict", "subtitle": "one sentence encouraging visits" }
  ]`,
      rules: `- 7 slides total (cover + fee comparison + 4 spotlights + closing)
- Use the FEATURED SCHOOLS data shown above (real USPs, inspection ratings, fees, results) for every proof point
- Each spotlight picks one school and highlights a REAL contrast from its data (budget/location/track-record/curriculum)
- Neutral framing — never declare a winner`,
      hashtags: ['internationalschool', 'bangkok', 'schoolchoice'],
    }
  }

  if (slug === 'school_spotlight') {
    const s = school || {}
    return {
      slides_json_shape: `[
    { "n": 1, "role": "cover", "title": "${s.name || 'school name'}", "subtitle": "one factual sentence — city, curriculum, age range" },
    { "n": 2, "role": "facts", "topic": "Key Facts", "facts": [
        { "label": "Founded", "value": "XXXX" },
        { "label": "Students", "value": "~X,XXX" },
        { "label": "Ages", "value": "X–XX" },
        { "label": "Curriculum", "value": "..." }
      ]},
    { "n": 3, "role": "facts", "topic": "Fees & Scholarships", "facts": [...3-4 label/value pairs...] },
    { "n": 4, "role": "facts", "topic": "Accreditation", "facts": [...3 label/value pairs...] },
    { "n": 5, "role": "points", "topic": "Worth exploring if…", "points": ["point 1", "point 2", "point 3"] },
    { "n": 6, "role": "cta", "headline": "Learn more", "subtitle": "visit the school's page", "url": "nanasays.com/schools/${s.slug || ''}" }
  ]`,
      rules: `- 6 slides total
- Every "fact" and "point" MUST come from the FEATURED SCHOOL block above (real USPs, results, inspection strengths, fees). Do not invent placeholders or use generic phrases.
- If the school has a marketing profile, pull the specific positioning and "worth exploring if" angles from it.`,
      hashtags: ['internationalschool', (s.city || 'bangkok').toLowerCase(), 'schoolspotlight'],
    }
  }

  // city_roundup fallback
  return {
    slides_json_shape: `[
    { "n": 1, "role": "cover", "title": "Bangkok International Schools", "subtitle": "A factual overview for families exploring options" },
    { "n": 2, "role": "schools_list", "topic": "IB Schools", "schools": [
        { "name": "school name", "tag": "IB · Ages X–XX", "note": "one factual sentence" },
        { "name": "...", "tag": "...", "note": "..." }
      ]},
    { "n": 3, "role": "schools_list", "topic": "British Curriculum", "schools": [...2 schools...] },
    { "n": 4, "role": "schools_list", "topic": "American Curriculum", "schools": [...2 schools...] },
    { "n": 5, "role": "schools_list", "topic": "Multi-Curriculum", "schools": [...2 schools...] },
    { "n": 6, "role": "cta", "headline": "Explore all", "subtitle": "nanasays.com", "url": "nanasays.com" }
  ]`,
    rules: `- 6 slides total (1 cover + 4 curriculum-type slides + 1 CTA)
- Each middle slide lists 2 schools with a short factual tag + note`,
    hashtags: ['internationalschool', 'bangkok', 'education'],
  }
}

function callCLI(prompt) {
  if (!existsSync(CLAUDE_BIN)) throw new Error(`CLAUDE_BIN not found at ${CLAUDE_BIN}`)
  return execSync(`${CLAUDE_BIN} --model ${MODEL} -p -`, {
    input: prompt,
    maxBuffer: 4 * 1024 * 1024,
    timeout: 300_000,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: process.env.HOME || '/Users/moodygarlic',
      PATH: process.env.PATH || '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
    },
  }).trim()
}

async function callAPI(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('CLAUDE_BACKEND=api but ANTHROPIC_API_KEY is not set.')
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = msg.content.find(b => b.type === 'text')
  if (!block) throw new Error('Claude API returned no text')
  return block.text.trim()
}

function parseResponse(raw) {
  const attempts = []
  attempts.push(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim())
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenceMatch) attempts.push(fenceMatch[1].trim())
  const first = raw.indexOf('{'), last = raw.lastIndexOf('}')
  if (first !== -1 && last > first) attempts.push(raw.slice(first, last + 1))

  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate)
      if (!parsed.style_brief || !Array.isArray(parsed.slides)) continue
      return parsed
    } catch {}
  }
  throw new Error(`Album brief: invalid JSON.\n\nRAW:\n${raw.slice(0, 800)}`)
}

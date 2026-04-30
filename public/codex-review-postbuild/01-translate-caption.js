#!/usr/bin/env node
/**
 * translate-caption.js — Thai translation of social post captions.
 *
 * Dual purpose:
 *   - ES-module exports: buildPrompt, validateTranslation, translateCaption
 *     so other scripts / future bulk jobs can reuse the pieces.
 *   - CLI entry: `node translate-caption.js --post=<uuid>` loads the post,
 *     translates copy_en → copy_th via Claude, validates the result,
 *     writes copy_th + copy_th_generated_at + copy_th_model back to the
 *     row, and exits 0. Non-zero exit on any failure with a terse stderr
 *     message.
 *
 * Backend toggle mirrors claude-album-brief.js — CLAUDE_BACKEND=cli|api.
 * Everything else (model, timeout, retries) uses the same env vars as
 * the album generator so operators only configure one set.
 */

import 'dotenv/config'
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { db } from './db.js'

const CLAUDE_BIN = '/opt/homebrew/bin/claude'
const MODEL = process.env.SOCIAL_CLAUDE_MODEL || 'claude-sonnet-4-6'
const BACKEND = (process.env.CLAUDE_BACKEND || 'cli').toLowerCase()

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Translate an English caption into Thai. Returns { copy_th, model } on
 * success or throws with a descriptive Error on any failure (Claude call,
 * empty output, validation mismatch).
 */
export async function translateCaption({ copyEn, school = null, pillarSlug = null }) {
  if (!copyEn || typeof copyEn !== 'string') {
    throw new Error('translateCaption: copyEn (non-empty string) is required')
  }
  const prompt = buildPrompt({ copyEn, school, pillarSlug })
  let raw
  if (BACKEND === 'cli') raw = callCLI(prompt)
  else if (BACKEND === 'api') raw = await callAPI(prompt)
  else throw new Error(`Unknown CLAUDE_BACKEND=${BACKEND}`)

  const copyTh = (raw || '').trim()
  validateTranslation({ copyEn, copyTh })
  return { copy_th: copyTh, model: MODEL }
}

/**
 * Build the translation prompt. Location context is derived from the
 * school row when provided; the prompt never hardcodes Bangkok because
 * the queue legitimately contains non-Bangkok schools (UK boarders,
 * Singapore internationals, etc.) whose Thai audience still cares.
 */
export function buildPrompt({ copyEn, school, pillarSlug }) {
  const name = school?.name || '(school name not provided)'
  const city = school?.city || '(city not provided)'
  const country = school?.country || '(country not provided)'
  const pillar = pillarSlug ? `\n  Pillar: ${pillarSlug}` : ''

  return `You are NanaSays — a friendly Thai parent-to-parent voice on Facebook who shares practical tips about international schools in Bangkok. Translate the English caption below into the voice you'd use when chatting with another mum in your LINE group.

VOICE (most important):
  - Direct, helpful, a little bit "I learned this the hard way" — you're sharing something useful, not lecturing.
  - Address Thai parents directly as คุณพ่อคุณแม่ wherever the English refers to parents, families, or the reader. Also use ผู้ปกครอง / ลูก / เรา where they feel natural. This is the NanaSays voice — a mum talking to other mums — so these address terms should appear in almost every caption, not once in a while.
  - Rhetorical questions work well ("เคยสงสัยไหมคะว่า...", "ลองถามดูสิคะ"). End every mid-caption question with คะ (not ค่ะ).
  - REQUIRED — polite particles at the end: the main body of every caption MUST end with one of: ค่ะ / ค่า / คะ / นะคะ / นะค่ะ. Pick the one that fits the final sentence:
      • ค่ะ — neutral-polite declarative ("…ได้เลยค่ะ")
      • ค่า — warmer, more affectionate declarative ("…คุ้มมากค่า")
      • คะ — softer suggestion or rhetorical question close ("…ลองดูสิคะ", "…ใช่ไหมคะ")
      • นะคะ — gentle reminder ("…ลองดูนะคะ")
      • นะค่ะ — emphasized polite close ("…ขอบคุณนะค่ะ")
    Never end the body on a bare declarative with no particle — it sounds cold. If the caption ends with hashtags, the particle goes on the last sentence BEFORE the hashtag run.
  - Particles นะ, เลย, สิ, กัน are welcome in moderation — they humanize the line — but don't overuse or stack them. Never childish.
  - Restructure aggressively. Break one long English sentence into two or three shorter Thai ones. Convert passive to active. Convert dramatic English reveals into rhetorical questions. A Thai parent should read this and feel another parent wrote it — not a translator.
  - AVOID: news-writing register, academic framing ("แบ่งออกเป็นสองกลุ่มที่มีโครงสร้างต่างกันอย่างชัดเจน"), stiff listings without connectives, anything that sounds word-for-word translated.
  - Length can grow 1.2–1.6× vs source — friendlier phrasing takes a few more syllables. Don't exceed 2×.

PRESERVE EXACTLY (no translation):
  - School names (e.g. "Bangkok Patana School"), campus names, teacher names.
  - Curriculum/programme names in English: IB, IGCSE, A Levels, AP, MYP, PYP.
  - Numbers in Arabic numerals (2,300 not ๒,๓๐๐).
  - URLs, @handles, dates, email addresses, and hashtags — character-for-character.
  - Existing emojis (do not add new ones the source doesn't have).
  - Paragraph breaks (blank lines).

OUTPUT:
  Return ONLY the Thai caption text. No preamble, no "here is the translation:", no JSON, no markdown fences, no explanation.

Context (for cultural accuracy — do NOT translate this):
  School: ${name}
  Location: ${city}, ${country}${pillar}
  Audience: Thai-speaking parents considering international schools

English source to translate:
${copyEn}`
}

/**
 * Validate Claude's output before we write it to the DB. Rejects silent
 * failures (empty response), wrong-language responses, and common prompt
 * regressions like Claude wrapping its answer in a "Here is the
 * translation:" preamble or a markdown fence. Also checks that
 * literal fragments we told it to preserve (URLs, the school name)
 * actually survived the round-trip.
 */
export function validateTranslation({ copyEn, copyTh }) {
  if (!copyTh || copyTh.length === 0) {
    throw new Error('Translation validation: empty output')
  }
  // Must contain at least some Thai script. Unicode block U+0E00-U+0E7F.
  if (!/[฀-๿]/.test(copyTh)) {
    throw new Error('Translation validation: no Thai characters in output')
  }
  // Catch "Here is the Thai translation:" preamble Claude sometimes adds.
  if (/^(here('?s)?\s+(is\s+)?(the\s+)?(thai\s+)?translation|translation:)/i.test(copyTh)) {
    throw new Error('Translation validation: output starts with a preamble')
  }
  // Catch markdown fences / JSON wrapping.
  if (copyTh.startsWith('```') || copyTh.startsWith('{') || copyTh.startsWith('[')) {
    throw new Error('Translation validation: output is wrapped in markdown/JSON')
  }
  // Reasonable length. Thai is often ~60-90% the character count of English
  // (no spaces between words, denser glyphs) but can vary. Allow 0.3x-2.5x.
  const ratio = copyTh.length / Math.max(1, copyEn.length)
  if (ratio < 0.3 || ratio > 2.5) {
    throw new Error(`Translation validation: length ratio out of bounds (${ratio.toFixed(2)}x)`)
  }
  // URLs from source must survive. If the source has a URL, the Thai
  // output must contain that exact URL.
  const urls = copyEn.match(/https?:\/\/[^\s]+/g) || []
  for (const url of urls) {
    if (!copyTh.includes(url)) {
      throw new Error(`Translation validation: URL '${url}' missing from output`)
    }
  }
  // Hashtags from source must survive exactly.
  const hashtags = copyEn.match(/#[A-Za-z0-9_]+/g) || []
  for (const tag of hashtags) {
    if (!copyTh.includes(tag)) {
      throw new Error(`Translation validation: hashtag '${tag}' missing from output`)
    }
  }
  // NanaSays voice: the caption body MUST end with a Thai polite particle.
  // Accepted endings cover the common parent-to-parent closings:
  //   ค่ะ   — neutral-polite declarative
  //   ค่า   — warmer/affectionate declarative
  //   คะ    — softer suggestion or rhetorical-question close ("ลองดูสิคะ")
  //   นะคะ  — gentle reminder/suggestion
  //   นะค่ะ — emphasized polite close
  // We strip trailing hashtags/URLs/whitespace/punctuation first so the
  // particle can sit before a #hashtag run and still count.
  const body = copyTh
    .replace(/(\s*#[^\s#]+)+\s*$/u, '')    // drop trailing hashtag run
    .replace(/(\s*https?:\/\/\S+)+\s*$/u, '') // drop trailing URL run
    .replace(/[\s\p{P}\p{S}]+$/gu, '')     // drop trailing punctuation/emoji/whitespace
  const tail = body.slice(-20)
  if (!/(ค่ะ|ค่า|คะ|นะคะ|นะค่ะ)\s*$/.test(body)) {
    throw new Error(`Translation validation: caption body must end with Thai polite particle ค่ะ / ค่า / คะ / นะคะ / นะค่ะ (last chars: "${tail}")`)
  }
}

// ─── Claude backends ─────────────────────────────────────────────────────────

function callCLI(prompt) {
  if (!existsSync(CLAUDE_BIN)) {
    throw new Error(`Claude CLI not found at ${CLAUDE_BIN}`)
  }
  // execFileSync with an args array — no shell, no quoting surprises.
  // Prompt flows in on stdin so copy_en can contain arbitrary characters.
  return execFileSync(CLAUDE_BIN, ['--model', MODEL, '-p', '-'], {
    input: prompt,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: 120_000,
  }).trim()
}

async function callAPI(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('CLAUDE_BACKEND=api but ANTHROPIC_API_KEY is not set.')
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = msg.content.find(b => b.type === 'text')
  if (!block) throw new Error('Claude API returned no text')
  return block.text.trim()
}

// ─── CLI entry ───────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const postId = args.post
  if (!postId) {
    console.error('Usage: node translate-caption.js --post=<uuid>')
    process.exit(2)
  }

  const { data: post, error: fetchErr } = await db
    .from('social_posts')
    .select('id, copy_en, source_data, social_pillars(slug)')
    .eq('id', postId)
    .single()
  if (fetchErr || !post) {
    console.error(`Post not found: ${postId} (${fetchErr?.message || 'no row'})`)
    process.exit(1)
  }
  if (!post.copy_en) {
    console.error(`Post ${postId} has no copy_en to translate`)
    process.exit(1)
  }

  const school = post.source_data?.school_snapshot || null
  const pillarSlug = post.social_pillars?.slug || null

  console.log(`[translate] post=${postId.slice(0, 8)}… backend=${BACKEND} model=${MODEL}`)
  const t0 = Date.now()
  let result
  try {
    result = await translateCaption({ copyEn: post.copy_en, school, pillarSlug })
  } catch (err) {
    console.error(`Translation failed: ${err.message}`)
    process.exit(1)
  }
  console.log(`[translate] ✓ ${Math.round((Date.now() - t0) / 1000)}s, ${result.copy_th.length} chars`)

  const { error: updateErr } = await db
    .from('social_posts')
    .update({
      copy_th: result.copy_th,
      copy_th_generated_at: new Date().toISOString(),
      copy_th_model: result.model,
    })
    .eq('id', postId)
  if (updateErr) {
    console.error(`DB write failed: ${updateErr.message}`)
    process.exit(1)
  }
  console.log(`[translate] saved to post ${postId}`)
}

function parseArgs(argv) {
  const out = {}
  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=')
      out[k] = v === undefined ? true : v
    }
  }
  return out
}

// Only run main() when invoked as CLI, not when imported.
const isCliEntry = import.meta.url === `file://${process.argv[1]}`
if (isCliEntry) {
  main().catch(err => {
    console.error(`Fatal: ${err.message}`)
    process.exit(1)
  })
}

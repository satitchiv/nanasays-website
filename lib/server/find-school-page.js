/**
 * find-school-page.js
 * Generic topic-to-URL finder using Claude CLI web search.
 *
 * Replaces hardcoded priority-path lists for any topic. Given a school
 * name and a topic ("university destinations", "notable alumni", "fees
 * schedule PDF", etc.), ask Claude to search the web and return the URL
 * of the most relevant page.
 *
 * Usage:
 *   const url = await findSchoolPage('Rossall School', 'university destinations');
 *   // → 'https://www.rossall.org.uk/academic-life/leavers-destinations/'
 *
 * Two-attempt retry: if first prompt returns nothing or an obvious miss,
 * try a second more-specific prompt before giving up.
 */

import { execSync } from 'child_process';
import { fetchAndExtractPdf, isPdfLikeUrl } from './pdf-util.js';

const CLAUDE_BIN = '/opt/homebrew/bin/claude';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function extractUrl(claudeOutput) {
  if (!claudeOutput) return null;
  const trimmed = claudeOutput.trim();
  if (/^none$/i.test(trimmed)) return null;
  const m = trimmed.match(/https?:\/\/[^\s"'<>]+/);
  return m ? m[0] : null;
}

async function askClaude(prompt, timeoutMs = 60_000) {
  try {
    const out = execSync(
      `${CLAUDE_BIN} --model claude-haiku-4-5-20251001 --allowedTools WebSearch -p -`,
      {
        input: prompt,
        maxBuffer: 1 * 1024 * 1024,
        timeout: timeoutMs,
        encoding: 'utf8',
        env: { ...process.env, HOME: process.env.HOME || '/Users/moodygarlic' },
      }
    );
    return extractUrl(out);
  } catch (e) {
    console.warn(`  [find-school-page] Claude CLI error: ${e.message}`);
    return null;
  }
}

/**
 * Find a school's page for a given topic via web search.
 *
 * @param {string} schoolName  - e.g. "Rossall School"
 * @param {string} topic       - e.g. "university destinations 2024"
 * @param {object} [options]
 * @param {string} [options.hint]       - extra guidance for Claude, e.g. "often at /leavers-destinations"
 * @param {string} [options.siteHint]   - restrict to a domain, e.g. "rossall.org.uk"
 * @returns {Promise<string|null>} URL or null
 */
export async function findSchoolPage(schoolName, topic, options = {}) {
  if (!schoolName || !topic) return null;
  const { hint, siteHint } = options;

  const siteClause = siteHint ? ` Prefer results on site:${siteHint}.` : '';
  const hintClause = hint ? ` Hint: ${hint}.` : '';

  // Attempt 1 — direct search
  const prompt1 =
    `Search the web for "${schoolName} ${topic}". ` +
    `Find the official page on the school's website that covers ${topic}.${siteClause}${hintClause} ` +
    `Return ONLY the URL on a single line — no explanation, no markdown. ` +
    `If no specific page exists, return exactly "none".`;

  let url = await askClaude(prompt1);

  // Attempt 2 — narrower variant if first came back empty
  if (!url) {
    const prompt2 =
      `Search Google for "${schoolName}" "${topic}". ` +
      `Look at the top 3 results. Pick the URL that most likely points to the school's own page covering ${topic}. ` +
      `${siteHint ? `It should be on ${siteHint}. ` : ''}` +
      `Return ONLY the URL. If none found, return "none".`;
    url = await askClaude(prompt2);
  }

  return url;
}

/**
 * Fetch a URL's HTML content and upsert into school_knowledge under a
 * specified category. Used after findSchoolPage to inject the found page
 * so existing extractors can use it.
 *
 * @param {string} url
 * @param {string} slug         - school slug
 * @param {string} category     - e.g. 'destinations', 'alumni', 'wellbeing'
 * @param {string} title        - descriptive title
 * @param {object} supabase
 * @returns {Promise<{ saved: boolean, words: number }>}
 */
export async function fetchAndSavePage(url, slug, category, title, supabase) {
  // Route PDFs (including Google Docs exports + ?format=pdf) through pdf-util.
  if (isPdfLikeUrl(url)) {
    const r = await fetchAndExtractPdf(url);
    if (!r.ok) return { saved: false, words: 0, reason: r.reason };
    if (r.words < 50) return { saved: false, words: r.words, reason: 'too few words' };
    const { error } = await supabase.from('school_knowledge').upsert({
      school_slug: slug,
      source_type: 'pdf',
      source_url: url,
      category,
      title,
      content: r.text.slice(0, 60_000), // PDFs can be long; keep a generous cap
      word_count: r.words,
      chunk_index: 0,
    }, { onConflict: 'school_slug,source_url,chunk_index' });
    if (error) return { saved: false, words: r.words, reason: error.message };
    return { saved: true, words: r.words, kind: 'pdf' };
  }

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30_000);
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal, redirect: 'follow' });
    clearTimeout(t);
    if (!res.ok) return { saved: false, words: 0, reason: `HTTP ${res.status}` };
    const html = await res.text();
    const { load } = await import('cheerio');
    const $ = load(html);
    $('nav, header, footer, aside, script, style, noscript').remove();
    // 150k cap (was 16k, then 60k). Bradfield's A-level programme page is
    // ~105k chars with every subject given a half-page rationale; even 60k
    // truncated at H alphabetically. 150k covers the long-tail pages without
    // blowing up Postgres row size.
    const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 150_000);
    const words = text.split(/\s+/).filter(Boolean).length;
    if (words < 50) return { saved: false, words, reason: 'too few words' };
    const { error } = await supabase.from('school_knowledge').upsert({
      school_slug: slug,
      source_type: 'page',
      source_url: url,
      category,
      title,
      content: text,
      word_count: words,
      chunk_index: 0,
    }, { onConflict: 'school_slug,source_url,chunk_index' });
    if (error) return { saved: false, words, reason: error.message };
    return { saved: true, words, kind: 'html', html };
  } catch (e) {
    return { saved: false, words: 0, reason: e.message };
  }
}

/**
 * Scan HTML for PDF links scoring by keyword overlap with the topic.
 * Returns up to `limit` best-matching absolute PDF URLs.
 *
 * Designed to run right after fetchAndSavePage returns kind:'html', so the
 * main HTML page's linked PDFs (fee schedules, curriculum tables, entry
 * requirements) can be auto-ingested — Claude's WebSearch misses these.
 */
export function findLinkedPdfs(html, pageUrl, topicKeywords = [], { limit = 2 } = {}) {
  if (!html) return [];
  const base = new URL(pageUrl);
  const kws = topicKeywords.map(k => k.toLowerCase()).filter(Boolean);
  const seen = new Set();
  const candidates = [];

  // Match every <a href="..."> anchor; we filter to PDF-like URLs via isPdfLikeUrl.
  // This catches .pdf URLs, Google Docs view/export links, and ?format=pdf params.
  const anchorRe = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = anchorRe.exec(html)) !== null) {
    let href = m[1];
    const anchorText = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    try { href = new URL(href, base).toString(); } catch { continue; }
    if (!isPdfLikeUrl(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    const hayLower = (href + ' ' + anchorText).toLowerCase();
    const score = kws.reduce((s, k) => s + (hayLower.includes(k) ? 1 : 0), 0);
    if (score > 0) candidates.push({ url: href, anchorText, score });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit);
}

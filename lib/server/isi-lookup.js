/**
 * isi-lookup.js
 * Fetches the ISI sitemap once, caches it to disk for 7 days, and provides
 * fuzzy name-matching to find a school's ISI profile URL.
 *
 * URL format in sitemap: https://www.isi.net/institutions/school/{name-slug}-{id}
 * We strip the trailing -{id} to get the name slug, then match against our
 * school name (also normalized to a slug).
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { askSchoolFact } from './ask-school-fact.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.join(__dirname, '..', '..', 'data', 'isi-sitemap-cache.json');
const SITEMAP_URL = 'https://www.isi.net/sitemap/institutions-schools.xml';
const CACHE_TTL_DAYS = 7;

// ISI normalizes apostrophes as "-" (so "Blundell's" → "blundell-s").
// We try two forms: stripped ("blundells") and ISI-style ("blundell-s").
function normalize(name, isiStyle = false) {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[''`]/g, isiStyle ? '-' : '') // ISI: apostrophe → hyphen; ours: strip
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normForms(name) {
  const a = normalize(name, false);
  const b = normalize(name, true);
  const forms = [a];
  if (b !== a) forms.push(b);
  // also try stripping leading "the-"
  for (const f of [a, b]) {
    const noThe = f.replace(/^the-/, '');
    if (noThe !== f && !forms.includes(noThe)) forms.push(noThe);
  }
  return forms;
}

// Parse all <loc> URLs from the sitemap XML string.
function parseUrls(xml) {
  const entries = [];
  for (const m of xml.matchAll(/<loc>(https:\/\/www\.isi\.net\/institutions\/school\/([^<]+))<\/loc>/g)) {
    const url  = m[1];
    const slug = m[2]; // e.g. "brighton-college-6301"
    // Strip trailing -NNNN to get the name portion
    const nameSlug = slug.replace(/-\d+$/, '');
    entries.push({ url, nameSlug });
  }
  return entries;
}

async function loadSitemap() {
  // Check cache freshness
  if (existsSync(CACHE_PATH)) {
    try {
      const cached = JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
      const age = (Date.now() - cached.fetchedAt) / (1000 * 60 * 60 * 24);
      if (age < CACHE_TTL_DAYS) return cached.entries;
    } catch { /* stale or corrupt, re-fetch */ }
  }

  console.log('  📡 Fetching ISI sitemap (will cache for 7 days)...');
  const res = await fetch(SITEMAP_URL, {
    headers: { 'User-Agent': 'NanaSays/1.0 school-research' },
  });
  if (!res.ok) throw new Error(`ISI sitemap fetch failed: ${res.status}`);
  const xml = await res.text();
  const entries = parseUrls(xml);
  writeFileSync(CACHE_PATH, JSON.stringify({ fetchedAt: Date.now(), entries }, null, 2));
  console.log(`  ✓ ISI sitemap cached — ${entries.length} schools`);
  return entries;
}

/**
 * Find the ISI profile URL for a school by name.
 * Returns the URL string or null if no confident match.
 *
 * Matching strategy (in priority order):
 *   1. Exact: normalizedName === isiNameSlug
 *   2. ISI slug starts with our normalized name (our name is a prefix of theirs)
 *   3. Our normalized name starts with ISI slug (ISI uses a shorter form)
 *   4. Retry 1-3 after stripping a leading "the-" from both sides
 */
export async function findIsiUrl(schoolName) {
  const entries = await loadSitemap();
  const forms = normForms(schoolName);

  // Priority 1 — exact match on any normalized form
  for (const f of forms) {
    const hit = entries.find(e => e.nameSlug === f);
    if (hit) return hit.url;
  }

  // Priority 2 — ISI slug starts with our name (our name is the school, ISI appended extra)
  // Pick shortest ISI slug (fewest extra words)
  for (const f of forms) {
    const hits = entries
      .filter(e => e.nameSlug.startsWith(f + '-'))
      .sort((a, b) => a.nameSlug.length - b.nameSlug.length);
    if (hits.length) return hits[0].url;
  }

  // Priority 3 — our name starts with ISI slug (ISI uses a shorter form)
  // Require ISI slug to have ≥4 parts to avoid short ambiguous matches like "king-s-school"
  for (const f of forms) {
    const hits = entries
      .filter(e => e.nameSlug.split('-').length >= 4 && f.startsWith(e.nameSlug + '-'))
      .sort((a, b) => b.nameSlug.length - a.nameSlug.length);
    if (hits.length) return hits[0].url;
  }

  // Priority 4 — web search fallback (school not in sitemap or name too different)
  console.log(`  🌐 Sitemap miss for "${schoolName}" — trying web search...`);
  try {
    const answer = await askSchoolFact(
      schoolName,
      'Find the ISI (Independent Schools Inspectorate) profile page URL for this school on isi.net. The URL format is https://www.isi.net/institutions/school/[school-slug]-[number]. Return ONLY the full URL, nothing else.',
      { timeoutMs: 60_000 }
    );
    if (answer) {
      const match = answer.match(/https:\/\/www\.isi\.net\/institutions\/school\/[^\s]+/);
      if (match) {
        console.log(`  📌 Web search found: ${match[0]}`);
        return match[0].trim();
      }
    }
  } catch { /* web search failed, return null */ }

  return null;
}

/** Expose all entries for bulk operations (e.g. batch processing). */
export async function loadAllIsiEntries() {
  return loadSitemap();
}

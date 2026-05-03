/**
 * extract-structured.js
 * Uses Claude CLI to extract structured facts from a school's knowledge base.
 * Shared between extract-structured-data.js batch script and the crawler.
 */

import { execSync } from 'child_process';

const CLAUDE_BIN  = '/opt/homebrew/bin/claude';
const MAX_CONTEXT = 20000; // words fed to Claude

const EXTRACTION_PROMPT = `You are a data extraction assistant for school information.

Extract structured information from the school knowledge base below.
Return ONLY valid JSON — no markdown fences, no explanation, just the JSON object.

Schema:
{
  "languages": ["string"],
  "curriculum": ["string"],
  "fees_min": number | null,
  "fees_max": number | null,
  "fees_currency": "string" | null,
  "fees_by_grade": {
    "currency": "string" | null,
    "vat_included": boolean | null,
    "terms_per_year": number | null,
    "rows": [
      { "phase": "string", "per_term": number | null, "per_year": number | null, "source": "published" | "computed" }
    ],
    "compulsory_extras": [
      { "name": "string", "per_term": number | null, "per_year": number | null, "notes": "string | null" }
    ]
  } | null,
  "staff": [{ "name": "string", "role": "string" }],
  "facilities": ["string"],
  "grade_levels": { "min_age": number | null, "max_age": number | null, "grades": ["string"] },
  "accreditations": ["string"],
  "contacts": [{ "department": "string", "name": "string | null", "email": "string | null", "phone": "string | null" }]
}

Rules:
- languages: ALL languages of instruction offered (not just English) — include home languages, acquisition languages, after-school languages
- curriculum: full programme names (e.g. "IB Primary Years Programme", not "PYP")
- fees: numbers only — remove commas (e.g. 640,000 → 640000). fees_min = lowest ANNUAL tuition, fees_max = highest ANNUAL tuition. fees_currency = ISO code e.g. "THB", "USD", "CHF", "GBP". Fees may appear as a formal table ("Per Annum"/"Annual" columns) OR as plain prose anywhere in an admissions/fees page — e.g. "£20,500 Boarding per term", "Day fees are £15,600 per term", "£4,500 monthly". UK schools almost always publish PER TERM only (3 terms/year) — you MUST multiply per_term × 3 to get the annual figure. If fees_by_grade is populated below, set fees_min = min(rows.per_year) and fees_max = max(rows.per_year).
- fees_by_grade: ALSO look for fee tables OR prose that break down by year group, phase, or day/boarding. UK schools typically publish termly fees (3 terms per year); International schools typically publish annually. For each distinct phase (e.g. "Day Pupils (Years 7 & 8)", "Boarding (Years 9–13)", "Sixth Form boarding", or just "Day"/"Boarding"), capture per_term and/or per_year. If only one is published, compute the other: per_year = per_term × terms_per_year (default 3 for UK schools). Mark source as "published" if the school stated the figure directly, "computed" if you calculated it from the other. Set vat_included=true if fees are explicitly listed as VAT-inclusive. compulsory_extras = any mandatory charges NOT included in the tuition (registration fee, acceptance deposit, lunch, insurance, uniform deposit) — optional music lessons etc. do NOT belong here. Even if the school has only ONE fee level (e.g. all boarders, one flat fee), still populate fees_by_grade with a single row using phase = "All pupils" or similar label. Only return null for fees_by_grade if NO fee numbers at all are found anywhere in the content. Scan carefully — fee amounts often live inside long admissions pages, not just on dedicated fee pages.
- staff: only named individuals with explicit roles (Principal, Head of Admissions, etc.) — max 15 entries
- facilities: physical spaces and amenities (pools, theatres, labs, fields) — not programmes
- grade_levels.grades: use the school's own labels (e.g. ["Early Years", "Year 1-13"])
- accreditations: formal bodies only (CIS, NEASC, IBO, BSO, COBIS, etc.)
- contacts: department contacts found on the website (Admissions, Finance, HR, etc.)
- Use null for unknown scalars, [] for unknown arrays

SCHOOL KNOWLEDGE BASE:
`;

/**
 * extractStructuredData(slug, supabase)
 * Returns the structured data object, or null if extraction fails.
 * Also upserts into school_structured_data table.
 */
export async function extractStructuredData(slug, supabase) {
  // Fetch all rows for this school, prioritising profile + key categories
  const { data: rows } = await supabase
    .from('school_knowledge')
    .select('source_type, source_url, category, title, content, word_count')
    .eq('school_slug', slug)
    .order('source_type', { ascending: false }); // nanasays rows first

  if (!rows || rows.length === 0) {
    console.warn(`[STRUCTURED] No rows found for ${slug}`);
    return null;
  }

  // Filter out short "guard page" stubs that waste prompt budget and
  // push real content out of the window. Common patterns:
  //   - Cookie-banner fallback (SPA sites returning the same 100-200 word
  //     cookie page for every path)
  //   - WAF lockout pages ("You have been locked out...")
  //   - Cloudflare JS challenges ("Checking your browser...")
  //   - 404 stubs ("Page not found")
  // All three appear on non-existent priority-probe paths and get
  // saved with category=fees/admissions/etc because of the URL, not
  // the actual content.
  const STUB_MARKERS = [
    'this website uses cookies',
    'cookie policy',
    'you have been locked out',
    'access denied',
    'checking your browser',
    'cf-browser-verification',
    'page not found',
    '404 not found',
  ];
  const isStub = (row) => {
    if ((row.word_count || 0) >= 250) return false;
    const body = (row.content || '').slice(0, 400).toLowerCase();
    return STUB_MARKERS.some(m => body.includes(m));
  };
  const filteredRows = rows.filter(r => !isStub(r));

  // Build context: profile first, then fees/admissions/curriculum, then general
  const priority = ['nanasays', 'fees', 'admissions', 'curriculum', 'support', 'contact', 'general'];
  // Fee/scholarship URL patterns — anchored by word boundary so "/feeling-future-ready"
  // doesn't match "/fee" and incorrectly sort a blog post into fee priority.
  const feeUrlRe = /\/(fees|fee|tuition|costs|scholarship|bursari|financial)(\/|$|\?|#|-and-|-)/i;
  const sorted   = [...filteredRows].sort((a, b) => {
    // Fee/scholarship URLs always go first regardless of category
    const aFeeUrl = feeUrlRe.test((a.source_url || '').toLowerCase()) ? -1 : 0;
    const bFeeUrl = feeUrlRe.test((b.source_url || '').toLowerCase()) ? -1 : 0;
    if (aFeeUrl !== bFeeUrl) return aFeeUrl - bFeeUrl;
    // Unknown categories (sports, about, boarding, news, etc.) get index 99 —
    // .indexOf() returns -1 which is LESS than admissions (index 2), so we
    // must normalise -1 → 99 explicitly. `?? 99` does NOT catch -1.
    const aiRaw = priority.indexOf(a.source_type === 'nanasays' ? 'nanasays' : a.category);
    const biRaw = priority.indexOf(b.source_type === 'nanasays' ? 'nanasays' : b.category);
    const ai = aiRaw === -1 ? 99 : aiRaw;
    const bi = biRaw === -1 ? 99 : biRaw;
    if (ai !== bi) return ai - bi;
    // Same category: prefer richer content
    return (b.word_count || 0) - (a.word_count || 0);
  });

  let contextWords = 0;
  const contextParts = [];
  for (const row of sorted) {
    const wc = row.word_count || row.content.split(/\s+/).length;
    if (contextWords + wc > MAX_CONTEXT) break;
    contextParts.push(`[${row.source_type === 'nanasays' ? 'PROFILE' : row.category.toUpperCase()}]\n${row.content}`);
    contextWords += wc;
  }

  const prompt = EXTRACTION_PROMPT + contextParts.join('\n\n---\n\n');

  let raw;
  try {
    raw = execSync(
      `${CLAUDE_BIN} --model claude-haiku-4-5-20251001 -p -`,
      {
        input:     prompt,
        maxBuffer: 1 * 1024 * 1024,
        timeout:   120000,
        encoding:  'utf8',
        env:       { ...process.env, HOME: process.env.HOME || '/Users/moodygarlic' },
      }
    ).trim();
  } catch (e) {
    console.error(`[STRUCTURED] Claude CLI error for ${slug}:`, e.message);
    return null;
  }

  // Strip markdown fences if Claude adds them anyway
  const jsonStr = raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    console.error(`[STRUCTURED] JSON parse failed for ${slug}:`, jsonStr.slice(0, 200));
    return null;
  }

  // Upsert into school_structured_data
  const { error } = await supabase
    .from('school_structured_data')
    .upsert({
      school_slug:    slug,
      languages:      parsed.languages      || [],
      curriculum:     parsed.curriculum     || [],
      fees_min:       parsed.fees_min       ?? null,
      fees_max:       parsed.fees_max       ?? null,
      fees_currency:  parsed.fees_currency  ?? null,
      fees_by_grade:  parsed.fees_by_grade  ?? null,
      staff:          parsed.staff          || [],
      facilities:     parsed.facilities     || [],
      grade_levels:   parsed.grade_levels   ?? null,
      accreditations: parsed.accreditations || [],
      contacts:       parsed.contacts       || [],
      extracted_at:   new Date().toISOString(),
      model_used:     'claude-haiku-4-5-20251001',
    }, { onConflict: 'school_slug' });

  if (error) {
    console.error(`[STRUCTURED] DB upsert error for ${slug}:`, error.message);
    return null;
  }

  return parsed;
}

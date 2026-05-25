/**
 * tools.js
 *
 * Tool implementations for the agentic Nana brain. Each tool is a pure async
 * function `(supabase, args) → { result, citations, summary }`:
 *
 *   result:    structured data Claude consumes on the next turn
 *   citations: provenance-rich citation objects: { url, slug, tool, dimension }
 *              — slug is the school the URL was collected for (null if cross-
 *              school), tool is the tool name that surfaced it, dimension is
 *              the dimension the URL evidences (null if cross-cut). Used by
 *              validateAnswer to detect citation/claim-school mismatches —
 *              e.g. a Reed's-tennis URL cannot back an Eton-academic claim
 *              just because it landed in the same agentic transcript.
 *   summary:   one-line human-readable status (yielded as tool_call SSE event)
 *
 * The agentic loop in agentic-loop.js dispatches Claude-emitted JSON actions
 * to these functions and feeds the result back as the next user message.
 */

import { DIMENSIONS, hasRequiredData } from './dimensions.js';
import { KNOWN_DAY_ONLY_NAMES, normalizeSchoolName } from '../school-name-overrides';
import { applyIsiDeepFactToBundle } from './isi-deep-bundle-mapper.js';
// Notion-sidecar wiring (Codex r1 P1.3 route parity): the prose/agentic
// `/api/nana-research` path bypasses retrieve.js → it calls getSchoolFacts
// here, which historically read only school_structured_data. We now fetch
// the Notion sidecar alongside and project it (extractor-wins SSD, fees
// stripped) so the prose/agentic surface gets the same hand-curated facts
// (class size, boarder count, Heathrow miles, lowest entry, etc.) that the
// deep-report Nana panel + school-chat surface see.
import { projectNotionBackfill } from './nana-brain.js';

// Build a provenance-rich citation. `slug` and `dimension` may be null when
// the URL is genuinely cross-school or cross-dimension (e.g. a sports_profile
// roll-up URL that covers all sports). The agentic loop merges by URL across
// tools, so a single tool name per emit is correct.
const cite = (url, slug, tool, dimension = null) => ({
  url,
  slug:      slug      || null,
  tool,
  dimension: dimension || null,
});

// Dedup citation array by composite (url|slug|tool|dimension). Codex P2:
// deduping by URL alone drops multi-school provenance for shared URLs (e.g.
// a league table that legitimately backs claims about several schools in one
// rankSchools/compareSchools call). Composite-key dedup keeps each
// {url, slug, ...} pair distinct so the agentic loop's URL-keyed
// citationProvenance Map can union all slugs at accumulation time.
// Filters falsy URLs so the loop never sees entries without an `url` key.
const dedupCitations = (cites) => {
  const seen = new Set();
  const out = [];
  for (const c of cites) {
    if (!c?.url) continue;
    const key = `${c.url}|${c.slug ?? ''}|${c.tool ?? ''}|${c.dimension ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
};

const ALL_STRUCTURED_COLS = [
  'school_slug', 'sports_profile', 'exam_results', 'university_destinations',
  'fees_min', 'fees_max', 'fees_currency', 'fees_by_grade',
  'scholarships_available', 'bursary_note',
  'pastoral_model', 'pastoral_care', 'wellbeing_staffing',
  'policies_summary', 'student_community',
];

async function loadSchoolMeta(supabase, slugs) {
  if (!slugs?.length) return new Map();
  // Include gender_split + age_min/max so getSchoolFacts can surface them in
  // tell_me_about answers without an extra fields opt-in. Phase-2 close-
  // call fix: fit prompts ("Reed's for our daughter") need gender + age
  // visible so the model frames the answer correctly without confabulating.
  // Column name is `gender_split` (NOT `gender` — that column doesn't exist).
  const { data: rows } = await supabase
    .from('schools')
    .select('slug, name, country, boarding_type, gender_split, age_min, age_max')
    .in('slug', slugs);
  return new Map((rows || []).map(r => [r.slug, r]));
}

// ── _facts loader (P8 / Codex 2026-05-08 Blocker 3) ─────────────────────────
// The 5 new dims (safeguarding_integrity, weekend_life, ethos_match, intl_share,
// device_policy) score from `row.<dim>_facts` shapes that DON'T exist in
// school_structured_data. Without this loader, every new dim would silently
// score 0 once enabled. This function pulls active rows from school_facts and
// folds them into the SSD-shaped row object so dim.rank() can read them.
//
// Returns a Map<slug, dimFactsBundle> where dimFactsBundle is:
//   { safeguarding_facts: { compliance, quality, concerns_count, sources },
//     weekend_life_facts: { weekend_freedom, saturday_school, day_trips, sources },
//     ethos_facts:        { ethos_label, sources },
//     intl_facts:         { intl_pct_overall, intl_pct_boarders, sources },
//     device_policy_facts:{ phone_policy, sources },
//     isi_deep_facts:     { teaching_grade, lgbtq_signal+detail, bullying_signal+detail,
//                           mental_health_signal+detail, diversity_signal, pupil_voice_signal,
//                           wellbeing_spaces_signal, online_safety_signal, pshe_grade,
//                           send_support_grade, recommended_steps_count, inspection_date, sources } }
//
// Returns empty Map if no slugs / no facts. Folding is done by the caller
// (rankSchools / compareSchools) by spreading the bundle into the row.
//
// Note: 3 scorers (inclusive_culture, pastoral_care, teaching_quality_isi) all
// read the same `isi_deep_facts` bundle but pick different sub-fields. Same
// pattern as `safeguarding` → `safeguarding_facts` (one fact-dim → one bundle
// → multiple consumer scorers).
const FACT_DIM_TO_BUNDLE_KEY = {
  safeguarding:    'safeguarding_facts',
  weekend_life:    'weekend_life_facts',
  ethos:           'ethos_facts',
  intl_pupils_pct: 'intl_facts',
  device_policy:   'device_policy_facts',
  isi_deep:        'isi_deep_facts',
};

export async function loadDimFactsBundles(supabase, slugs) {
  const bundles = new Map();
  if (!slugs?.length) return bundles;
  const { data: facts, error } = await supabase
    .from('school_facts')
    .select('school_slug, dimension, fact_type, canonical_key, claim, source_url, confidence')
    .in('school_slug', slugs)
    .in('dimension', Object.keys(FACT_DIM_TO_BUNDLE_KEY))
    .eq('status', 'active');
  if (error) {
    console.error('[loadDimFactsBundles]', error.message);
    return bundles;
  }
  for (const f of facts || []) {
    // T4.16 source-backed ranking gate (2026-05-09): rankSchools /
    // compareSchools can only cite `source_url`, so source-less legacy_backfill
    // facts must not drive user-visible ranked claims. They remain available
    // in school_facts for internal coverage/backfill work.
    if (!f.source_url) continue;
    const bundleKey = FACT_DIM_TO_BUNDLE_KEY[f.dimension];
    if (!bundleKey) continue;
    if (!bundles.has(f.school_slug)) bundles.set(f.school_slug, {});
    const slugBundle = bundles.get(f.school_slug);
    if (!slugBundle[bundleKey]) slugBundle[bundleKey] = { sources: [] };
    const dimBundle = slugBundle[bundleKey];
    // Per-dim canonical_key → bundle field
    if (f.dimension === 'safeguarding') {
      if (f.canonical_key === 'isi_compliance_latest') dimBundle.compliance = f.claim?.value ?? null;
      if (f.canonical_key === 'isi_quality_latest')    dimBundle.quality = f.claim?.value ?? null;
      if (f.canonical_key === 'isi_concerns_latest')   dimBundle.concerns_count = Array.isArray(f.claim?.value) ? f.claim.value.length : 0;
    } else if (f.dimension === 'weekend_life') {
      if (f.canonical_key === 'weekend_freedom_primary') dimBundle.weekend_freedom = f.claim?.value ?? null;
      if (f.canonical_key === 'saturday_school')         dimBundle.saturday_school = f.claim?.value ?? null;
      if (f.canonical_key === 'has_day_trips')           dimBundle.day_trips = f.claim?.value ?? null;
    } else if (f.dimension === 'ethos') {
      if (f.canonical_key === 'ethos_primary') dimBundle.ethos_label = f.claim?.value ?? null;
    } else if (f.dimension === 'intl_pupils_pct') {
      if (f.canonical_key === 'intl_pct_overall')    dimBundle.intl_pct_overall = f.claim?.value ?? null;
      if (f.canonical_key === 'intl_pct_boarders')   dimBundle.intl_pct_boarders = f.claim?.value ?? null;
      if (f.canonical_key === 'intl_pct_sixth_form') dimBundle.intl_pct_sixth_form = f.claim?.value ?? null;
    } else if (f.dimension === 'device_policy') {
      if (f.canonical_key === 'phone_policy_primary') dimBundle.phone_policy = f.claim?.value ?? null;
    } else if (f.dimension === 'isi_deep') {
      // ISI deep extraction (2026-05-10). The per-fact-type → bundle mapping
      // lives in isi-deep-bundle-mapper.js so the smoke test in
      // scripts/smoke-isi-deep-scorers.mjs can exercise the SAME function
      // (per Codex Step 8 review #2). Don't inline the mapping here.
      applyIsiDeepFactToBundle(f, dimBundle);
    }
    if (f.source_url && !dimBundle.sources.includes(f.source_url)) dimBundle.sources.push(f.source_url);
  }
  return bundles;
}

async function loadUkSlugSet(supabase) {
  // Paginate explicitly — schools_status has > 1000 rows with is_uk_evidence=true
  // and the default supabase row cap is 1000.
  const all = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('schools_status')
      .select('school_slug')
      .eq('is_uk_evidence', true)
      .range(offset, offset + PAGE - 1);
    if (error || !data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return new Set(all.map(r => r.school_slug));
}

// ── rankSchools ─────────────────────────────────────────────────────────────
// Pre-enable-1 (Gap A): ctx is the scorer side-channel. Scorers like
// ethos_match / intl_share / device_policy read ctx?.parent?.<pref>_pref
// for parent preferences. Default {} is safe — scorers null-short-circuit
// on missing keys (per dimensions.js gates 3+4).
export async function rankSchools(supabase, args, ctx = {}) {
  const { dimension, limit = 10, restrict_to_slugs } = args || {};
  const dim = DIMENSIONS[dimension];
  if (!dim) {
    return {
      result: {
        error: `Unknown dimension '${dimension}'. Valid: ${Object.keys(DIMENSIONS).join(', ')}`,
      },
      citations: [],
      summary: `rankSchools: unknown dimension '${dimension}'`,
    };
  }

  let q = supabase.from('school_structured_data').select(ALL_STRUCTURED_COLS.join(', ')).range(0, 9999);
  if (restrict_to_slugs?.length) q = q.in('school_slug', restrict_to_slugs);
  const { data: rows, error } = await q;
  if (error) {
    return { result: { error: error.message }, citations: [], summary: 'rankSchools: db error' };
  }

  const ukSlugs = restrict_to_slugs?.length ? null : await loadUkSlugSet(supabase);

  // P8 / Codex Blocker 3 (2026-05-08): if the requested dimension reads from
  // school_facts (one of the new disabled dims), pre-load the _facts bundles
  // so dim.rank() can read row.<dim>_facts. Skipped for legacy SSD-only dims
  // to avoid the extra query.
  const NEW_DIMS_NEEDING_FACTS = new Set([
    'safeguarding_integrity', 'weekend_life', 'ethos_match', 'intl_share', 'device_policy',
    // 2026-05-10 ISI deep extraction:
    'inclusive_culture', 'pastoral_care', 'teaching_quality_isi',
  ]);
  let factsBundles = new Map();
  if (NEW_DIMS_NEEDING_FACTS.has(dimension)) {
    const candidateSlugs = (rows || []).map((r) => r.school_slug);
    factsBundles = await loadDimFactsBundles(supabase, candidateSlugs);
  }

  const scored = [];
  for (const row of rows || []) {
    if (ukSlugs && !ukSlugs.has(row.school_slug)) continue;
    // Fold _facts bundles into the row before required-data + rank checks.
    const bundle = factsBundles.get(row.school_slug);
    const enrichedRow = bundle ? { ...row, ...bundle } : row;
    if (!hasRequiredData(enrichedRow, dimension)) continue;
    const score = dim.rank(enrichedRow, ctx);
    if (score <= 0) continue;
    scored.push({ slug: row.school_slug, score, row: enrichedRow });
  }

  scored.sort((a, b) => b.score - a.score);
  const top  = scored.slice(0, limit);
  const meta = await loadSchoolMeta(supabase, top.map(t => t.slug));

  const ranked = top.map(({ slug, score, row }) => {
    const school = meta.get(slug) || { slug, name: slug };
    return {
      slug,
      name: school.name,
      score: Math.round(score * 10) / 10,
      summary: dim.format(row, school),
      citations: dim.citations(row) || [],
    };
  });

  // Per-row citations are URL strings inside `result.schools[i].citations`
  // (model copies these into final_answer.sources_used). The top-level
  // `citations` returned to the agentic loop carries provenance for the
  // validateAnswer slug-match check.
  const citations = dedupCitations(
    ranked.flatMap(r =>
      (r.citations || []).map(url => cite(url, r.slug, 'rankSchools', dimension)),
    ),
  );
  return {
    result: { dimension, count: ranked.length, schools: ranked },
    citations,
    summary: `Ranked ${ranked.length} schools by ${dim.label.toLowerCase()}`,
  };
}

// ── filterSchools ───────────────────────────────────────────────────────────
export async function filterSchools(supabase, args) {
  const { fees_max, fees_min, gender, boarding, has_sport } = args || {};

  // school_structured_data is the smallest table (~306 rows) — fetch first,
  // then look up status + meta only for those slugs. Avoids row-cap issues
  // on schools (100k+ rows globally) and schools_status (25k+ rows).
  const { data: ssd } = await supabase
    .from('school_structured_data')
    .select('school_slug, fees_min, fees_max')
    .range(0, 9999);
  const ssdSlugs = (ssd || []).map(r => r.school_slug);

  const [{ data: status }, { data: schools }] = await Promise.all([
    supabase
      .from('schools_status')
      .select('school_slug, is_uk_evidence, profile_boarding_type, has_tennis_deep, has_tennis_thin, has_football_extracted, has_rugby_extracted, has_cricket_extracted, has_hockey_extracted')
      .in('school_slug', ssdSlugs)
      .eq('is_uk_evidence', true),
    supabase
      .from('schools')
      .select('slug, name, boarding_type, gender_split')
      .in('slug', ssdSlugs),
  ]);

  const ukSlugs       = new Set((status || []).map(s => s.school_slug));
  const sportFlagsBy  = new Map((status || []).map(s => [s.school_slug, s]));
  const schoolMetaBy  = new Map((schools || []).map(s => [s.slug, s]));

  // Tennis uses has_tennis_deep || has_tennis_thin; other sports use has_<sport>_extracted.
  const sportHas = (flag, sport) => {
    if (!flag) return false;
    if (sport === 'tennis') return flag.has_tennis_deep === true || flag.has_tennis_thin === true;
    return flag[`has_${sport}_extracted`] === true;
  };

  const matched = [];
  for (const row of ssd || []) {
    if (!ukSlugs.has(row.school_slug)) continue;
    const meta = schoolMetaBy.get(row.school_slug);
    if (!meta) continue;

    if (fees_max != null && row.fees_max != null && parseFloat(row.fees_max) > fees_max) continue;
    if (fees_min != null && row.fees_min != null && parseFloat(row.fees_min) < fees_min) continue;

    // Gender filter: strict mode. As of 2026-05-06 the UK target set has
    // 100% gender_split coverage (8 NULLs backfilled). NULL is now an
    // anomaly, not the default — so a school with no gender_split is
    // dropped from gender-filtered results rather than treated as a
    // wildcard. The earlier wildcard logic let St Paul's (boys) leak into
    // girls filter results and Westminster into both.
    if (gender) {
      const want = gender.toLowerCase().replace(/[^a-z]/g, '');
      const got  = (meta.gender_split || '').toLowerCase().replace(/[^a-z]/g, '');
      if (!got) continue;  // strict: no gender data → not eligible
      const isCoed = /coed|mixed/.test(got);
      if (want === 'coed'  && !isCoed)               continue;
      if (want === 'boys'  && !/boys|male/.test(got))  continue;
      if (want === 'girls' && !/girls|female/.test(got)) continue;
    }

    // Boarding filter: reject explicit day-only schools. Two signals checked:
    //   1. `KNOWN_DAY_ONLY_NAMES` override list (shared with recommend-shortlist.ts).
    //      Catches Westminster, St Paul's, Dulwich, Highgate, City of London, etc.
    //      — famous London day schools that have boarding_type=null in the source
    //      data and were silently passing the boarding=true filter.
    //   2. boarding_type contains "day school only" / "day only" (kept from before).
    // The schools.boarding boolean is intentionally NOT consulted: it's broken in
    // the source data (Eton, Harrow, Wycombe Abbey all have boarding=false). The
    // override list + boarding_type text are more reliable.
    if (boarding === true) {
      const statusFlag = sportFlagsBy.get(row.school_slug);
      const bt = (meta.boarding_type || statusFlag?.profile_boarding_type || '').toLowerCase();
      const normName = normalizeSchoolName(meta.name);
      if (KNOWN_DAY_ONLY_NAMES.has(normName))                continue;  // override list
      if (bt && /day school only|day only/.test(bt))         continue;  // explicit textual day-only
    }

    if (has_sport) {
      const flag = sportFlagsBy.get(row.school_slug);
      if (!sportHas(flag, has_sport)) continue;
    }

    matched.push({ slug: row.school_slug, name: meta.name });
  }

  return {
    result: { criteria: { fees_max, fees_min, gender, boarding, has_sport }, count: matched.length, schools: matched },
    citations: [],
    summary: `Filtered to ${matched.length} UK schools matching criteria`,
  };
}

// ── searchSchoolText ────────────────────────────────────────────────────────
export async function searchSchoolText(supabase, args) {
  const { query, slug, limit = 10 } = args || {};
  if (!query) {
    return { result: { error: 'no query' }, citations: [], summary: 'searchSchoolText: missing query' };
  }
  const { retrieveChunks, retrieveChunksGlobal } = await import('./retrieve.js');

  let chunks;
  if (slug) {
    const r = await retrieveChunks(supabase, slug, query, { maxWords: 4000, includeSensitive: false });
    chunks = r.chunks;
  } else {
    const r = await retrieveChunksGlobal(supabase, query, { maxChunks: limit, maxWords: 5000 });
    chunks = r.chunks;
  }

  const items = (chunks || []).slice(0, limit).map(c => ({
    school_slug: c.school_slug,
    title:       c.title,
    category:    c.category,
    excerpt:     (c.content || '').slice(0, 800),
    source_url:  c.source_url,
  }));

  // Vector-search hits have a slug per chunk but no dimension (semantic search
  // is dimension-agnostic). Keeping dimension=null lets validateAnswer's slug
  // check still fire while skipping the dimension check.
  const citations = dedupCitations(
    items.map(i => cite(i.source_url, i.school_slug, 'searchSchoolText', null)),
  );
  return {
    result: { query, count: items.length, chunks: items },
    citations,
    summary: slug
      ? `Searched ${slug} text for "${query.slice(0, 40)}" — ${items.length} chunks`
      : `Searched UK schools for "${query.slice(0, 40)}" — ${items.length} chunks`,
  };
}

// ── compareSchools ──────────────────────────────────────────────────────────
// Pre-enable-1 (Gap A): see rankSchools comment for ctx contract.
export async function compareSchools(supabase, args, ctx = {}) {
  const { slugs, dimensions: dimNames = [] } = args || {};
  if (!Array.isArray(slugs) || slugs.length === 0) {
    return { result: { error: 'no slugs provided' }, citations: [], summary: 'compareSchools: missing slugs' };
  }

  const { data: rows } = await supabase
    .from('school_structured_data')
    .select(ALL_STRUCTURED_COLS.join(', '))
    .in('school_slug', slugs);

  const meta = await loadSchoolMeta(supabase, slugs);
  const rowBy = new Map((rows || []).map(r => [r.school_slug, r]));

  // P8 / Codex 2026-05-08 round-2: parity with rankSchools — if any of the
  // requested dimensions read from school_facts (the 5 new dims), pre-load
  // the _facts bundles and fold them into each row before scoring.
  const NEW_DIMS_NEEDING_FACTS = new Set([
    'safeguarding_integrity', 'weekend_life', 'ethos_match', 'intl_share', 'device_policy',
    // 2026-05-10 ISI deep extraction:
    'inclusive_culture', 'pastoral_care', 'teaching_quality_isi',
  ]);
  const needsFacts = dimNames.some((d) => NEW_DIMS_NEEDING_FACTS.has(d));
  const factsBundles = needsFacts ? await loadDimFactsBundles(supabase, slugs) : new Map();

  const compared = slugs.map(slug => {
    const row = rowBy.get(slug);
    const school = meta.get(slug) || { slug, name: slug };
    const bundle = factsBundles.get(slug);
    const enrichedRow = (row && bundle) ? { ...row, ...bundle } : (row || (bundle ? { school_slug: slug, ...bundle } : null));
    const perDim = {};
    for (const dimName of dimNames) {
      const dim = DIMENSIONS[dimName];
      if (!dim || dim.enabled === false || !enrichedRow) { perDim[dimName] = null; continue; }
      perDim[dimName] = {
        score:     Math.round(dim.rank(enrichedRow, ctx) * 10) / 10,
        summary:   dim.format(enrichedRow, school),
        citations: dim.citations(enrichedRow) || [],
      };
    }
    return { slug, name: school.name, dimensions: perDim };
  });

  // Walk per-(school × dimension) so each citation knows both the slug it
  // was collected for AND the dimension whose evidence it provides.
  const citations = dedupCitations(
    compared.flatMap(c =>
      Object.entries(c.dimensions || {}).flatMap(([dimName, d]) =>
        (d?.citations || []).map(url => cite(url, c.slug, 'compareSchools', dimName)),
      ),
    ),
  );

  return {
    result: { slugs, dimensions: dimNames, schools: compared },
    citations,
    summary: `Compared ${slugs.length} schools across ${dimNames.length} dimensions`,
  };
}

// ── getSchoolFacts ──────────────────────────────────────────────────────────
const ALLOWED_FACT_FIELDS = new Set([
  'curriculum', 'languages', 'fees_min', 'fees_max', 'fees_currency', 'fees_by_grade',
  'scholarships_available', 'bursary_note', 'admissions_format', 'exam_results',
  'university_destinations', 'sports_profile', 'pastoral_care', 'pastoral_model',
  'wellbeing_staffing', 'student_community', 'school_life', 'policies_summary',
  'location_profile', 'facilities', 'staff', 'grade_levels', 'accreditations',
  'contacts', 'sixth_form_curriculum', 'report_verdict', 'report_parent_fit',
  'report_tour_questions',
]);

// Field → dimension map for getSchoolFacts citation provenance. Any field not
// in this map yields dimension=null (slug check still runs; dimension check
// fails open). Keep keys aligned with DIMENSIONS keys in dimensions.js.
const FACT_FIELD_TO_DIMENSION = {
  exam_results:           'academic_strength',
  fees_by_grade:          'fees_value',
  policies_summary:       'pastoral_model',
  wellbeing_staffing:     'pastoral_model',
};
const SPORT_TO_DIMENSION = {
  tennis:   'tennis_strength',
  rugby:    'rugby_standing',
  football: 'football_strength',
  cricket:  'cricket_strength',
  hockey:   'hockey_strength',
};

export async function getSchoolFacts(supabase, args) {
  const { slug, fields } = args || {};
  if (!slug) return { result: { error: 'no slug' }, citations: [], summary: 'getSchoolFacts: missing slug' };

  const requested = (fields || []).filter(f => ALLOWED_FACT_FIELDS.has(f));
  if (requested.length === 0) {
    // Phase 0.5a: dropped sports_profile from default — at ~25KB per school
    // it's the single biggest fetch and almost never needed unless the question
    // is sports-specific. Sports questions hit the compare_two_on_dim plan
    // (which uses fieldsForDimension to request sports_profile explicitly) or
    // ask Claude in the agentic loop to specify fields.
    requested.push('exam_results', 'fees_min', 'fees_max', 'university_destinations');
  }

  // Codex r2 P1.1: ALWAYS include the SSD overlap columns the projector
  // needs to enforce extractor-wins on Notion fields — even when the LLM
  // didn't request them. Without these, `projectNotionBackfill` can't see
  // SSD's authoritative student_community / exam_results / admissions_format /
  // location_profile and would emit duplicate (or stale) Notion numbers.
  // Stripped from `result.data` below so the LLM still only sees what it asked
  // for in the answer surface.
  const NOTION_OVERLAP_COLS = [
    'student_community',
    'exam_results',
    'admissions_format',
    'location_profile',
  ];
  const projectionCols = Array.from(new Set([...requested, ...NOTION_OVERLAP_COLS]));
  const cols = ['school_slug', ...projectionCols].join(', ');
  // Codex r1 P1.3: fetch SSD + Notion sidecar in parallel so the agentic
  // surface gets parity with retrieve.js / pack / school-chat. Projector
  // applies SSD-wins + strips fees + normalises units (notion-projection
  // contract).
  const [{ data: row }, { data: notionRow }] = await Promise.all([
    supabase
      .from('school_structured_data')
      .select(cols)
      .eq('school_slug', slug)
      .maybeSingle(),
    supabase
      .from('school_notion_backfill')
      .select('school_slug, status, parsed')
      .eq('school_slug', slug)
      // Codex r3 P1: accept both `clean` + `matched` (see retrieve.js).
      .in('status', ['clean', 'matched'])
      .maybeSingle(),
  ]);

  const meta = (await loadSchoolMeta(supabase, [slug])).get(slug);
  // Project against the FULL overlap row (Codex r2 P1.1), then strip the
  // projection-only columns so `result.data` shows only what the LLM
  // requested.
  const notion_backfill = projectNotionBackfill(
    notionRow && notionRow.parsed ? notionRow.parsed : null,
    row || null,
  );
  const requestedSet = new Set(requested);
  const dataForLlm = row
    ? Object.fromEntries(
        Object.entries(row).filter(([k]) => k === 'school_slug' || requestedSet.has(k)),
      )
    : null;

  const citations = [];
  const push = (url, dim) => {
    if (url) citations.push(cite(url, slug, 'getSchoolFacts', dim));
  };

  if (row?.exam_results?.source_url) {
    push(row.exam_results.source_url, FACT_FIELD_TO_DIMENSION.exam_results);
  }
  if (row?.fees_by_grade?.source_url) {
    push(row.fees_by_grade.source_url, FACT_FIELD_TO_DIMENSION.fees_by_grade);
  }
  // sports_profile root-level source_urls cover the cross-sport summary —
  // no single dimension owns them, so dimension=null (slug check still works).
  if (Array.isArray(row?.sports_profile?.source_urls)) {
    for (const url of row.sports_profile.source_urls) push(url, null);
  }
  for (const sport of Object.keys(SPORT_TO_DIMENSION)) {
    const ev = row?.sports_profile?.[sport]?.evidence_urls;
    if (Array.isArray(ev)) {
      for (const url of ev) push(url, SPORT_TO_DIMENSION[sport]);
    }
  }
  if (row?.policies_summary?.bullying_policy_url) {
    push(row.policies_summary.bullying_policy_url, FACT_FIELD_TO_DIMENSION.policies_summary);
  }
  if (Array.isArray(row?.wellbeing_staffing?.source_urls)) {
    for (const url of row.wellbeing_staffing.source_urls) {
      push(url, FACT_FIELD_TO_DIMENSION.wellbeing_staffing);
    }
  }

  return {
    result: {
      slug,
      name: meta?.name || slug,
      // School-level metadata always surfaced — small token cost, big payoff
      // for fit/match answers that need gender + age context.
      // Output key stays `gender` for backward compat with tool-result-compact.js;
      // source column is `gender_split` (the only gender column on `schools`).
      gender:        meta?.gender_split   ?? null,
      age_min:       meta?.age_min       ?? null,
      age_max:       meta?.age_max       ?? null,
      boarding_type: meta?.boarding_type ?? null,
      fields:        requested,
      data:          dataForLlm,
      // Hand-curated Notion sidecar facts (Codex r1 P1.3 — agentic parity).
      // Already projected: SSD-wins applied, fees stripped, units normalised.
      // Null when no clean Notion row exists for the slug.
      notion_backfill,
    },
    citations: dedupCitations(citations),
    summary: `Fetched ${requested.length} fields for ${meta?.name || slug}`,
  };
}

// ── searchSafeguarding ──────────────────────────────────────────────────────
export async function searchSafeguarding(supabase, args) {
  const { slug, type } = args || {};
  let q = supabase
    .from('school_sensitive')
    .select('school_slug, source, data_type, source_url, date, severity, title, summary');
  if (slug) q = q.eq('school_slug', slug);
  if (type) q = q.eq('data_type', type);

  const { data: rows } = await q.limit(20);
  const items = rows || [];
  // TODO(N15-N13): once the safeguarding_integrity dimension lands (TASKS.md
  // N13 — "Add 6 more dimensions"), set dimension here so validateAnswer can
  // run the dimension check. Today dimension=null: slug check still gates the
  // citation; dimension check fails open.
  const citations = dedupCitations(
    items.map(i => cite(i.source_url, i.school_slug, 'searchSafeguarding', null)),
  );

  return {
    result: { slug, type, count: items.length, records: items },
    citations,
    summary: `Found ${items.length} sensitive records${slug ? ` for ${slug}` : ''}${type ? ` (type=${type})` : ''}`,
  };
}

// ── registry ────────────────────────────────────────────────────────────────
export const TOOLS = {
  rankSchools, filterSchools, searchSchoolText,
  compareSchools, getSchoolFacts, searchSafeguarding,
};

export const TOOL_DESCRIPTIONS = {
  rankSchools: {
    description: 'Top-N UK schools ranked by a dimension. Dimensions: tennis_strength, rugby_standing, football_strength, cricket_strength, hockey_strength, academic_strength, fees_value, pastoral_care, inclusive_culture, pastoral_model. Use when picking the BEST out of MANY — or out of a filtered/shortlisted scope via restrict_to_slugs. Returns score + summary per school.',
    args: { dimension: 'string (required)', limit: 'number (default 10)', restrict_to_slugs: 'optional string[] (use after filterSchools, OR to rank within a parent shortlist)' },
  },
  filterSchools: {
    description: 'Hard filter UK schools by criteria. Returns matching slugs/names only — no scores or detailed evidence. For recommendation/ranking questions, chain into rankSchools(restrict_to_slugs). For pure list/count questions, filterSchools alone may be enough.',
    args: { fees_max: 'number', fees_min: 'number', gender: 'co-ed|boys|girls', boarding: 'boolean', has_sport: 'tennis|football|rugby|cricket|hockey' },
  },
  searchSchoolText: {
    description: 'Vector search across school website text. With slug = single school. Without slug = all UK schools. Use for narrative/qualitative questions ("what is the culture like"). DO NOT use this for quantitative school facts like class size, pupil count, boarder/intl count, GCSE/A-Level %, Heathrow distance, boarding share, or lowest entry year — those are structured facts available via `getSchoolFacts` which is more reliable (free-text search often returns boarding-house sizes instead of academic class sizes, or other surface-level mismatches).',
    args: { query: 'string (required)', slug: 'optional school slug', limit: 'number (default 10)' },
  },
  compareSchools: {
    description: 'Side-by-side data for a FIXED, NAMED set of 2-4 schools (typical: parent shortlist) across chosen dimensions. Use for comparison/explanation across a defined set. Use rankSchools with restrict_to_slugs instead when the parent asks which one is best/strongest within the set. Returns dimension scores per school.',
    args: { slugs: 'string[] (2-4 named schools)', dimensions: 'string[] (e.g. ["tennis_strength","fees_value"])' },
  },
  getSchoolFacts: {
    description: 'Fetch structured + hand-curated facts for one school. PREFER this tool over searchSchoolText whenever the parent asks a quantitative question with a specific answer. Use AFTER rankSchools/compareSchools to enrich top candidates. ALWAYS pass `fields` matching the question — for sports questions include `sports_profile` explicitly (it is NOT in the default; sports_profile alone is ~25KB).\n\nReturns TWO data surfaces, both populated automatically:\n  1. `data` — extractor-derived structured fields (exam_results, sports_profile, university_destinations, fees_by_grade, scholarships_available, bursary_note, admissions_format, pastoral_care, pastoral_model, wellbeing_staffing, policies_summary, location_profile, facilities, student_community).\n  2. `notion_backfill` — hand-curated UK school facts surfaced for EVERY call (no need to request). Fields available when present: class_size (senior/sixth/average), total_pupils, boarder_count, intl_count, boarding_pct, gcse_pct (+ gcse_pct_alt_band for schools that publish 9-8 instead of 9-7), a_level_pct, lowest_boarding_entry, heathrow_distance (miles). Use these directly for "what\'s the class size?", "how many pupils?", "what % board?", "what\'s the GCSE result?", "lowest boarding entry?", "how far from Heathrow?".\n\nFor safeguarding/red-flag questions, use searchSafeguarding first.',
    args: { slug: 'string', fields: 'string[] from allowed set (default if omitted: exam_results, fees_min, fees_max, university_destinations — sports_profile is NOT in default; hand-curated notion_backfill returns regardless of fields requested)' },
  },
  searchSafeguarding: {
    description: 'Regulatory / inspection / safeguarding records. Use for "any red flags?" or "is this school safe?" questions.',
    args: { slug: 'optional school slug', type: 'optional (isi|charity_commission|companies_house|dfe|ofsted)' },
  },
};

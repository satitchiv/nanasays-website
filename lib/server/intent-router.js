/**
 * intent-router.js
 *
 * Pattern-matches a parent's question into one of 7 known shapes and emits a
 * deterministic tool plan. Caller (route.ts → prose-runner.js) executes the
 * plan and asks the model to write a single prose answer using the results.
 *
 * If nothing matches, returns null and the caller falls through to the
 * existing agentic loop in scripts/lib/agentic-loop.js.
 *
 * Pure functions — no DB / network. Safe to unit-test offline.
 *
 * The 7 patterns (priority order):
 *   1. compare_two_on_dim         — "compare A and B on tennis"
 *   2. shortlist_rank_or_compare  — "rank my shortlist"
 *   3. top_n_for_dim              — "best schools for academics"
 *   4. tell_me_about_school       — "tell me about Eton"
 *   5. safeguarding_or_pastoral   — "any safeguarding concerns at S?"
 *   6. fees_value                 — "what are S's fees?" or "best value schools"
 *   7. fact_lookup                — "S's curriculum / admissions / boarding"
 */

import { DIMENSIONS, fieldsForDimension } from './dimensions.js';

// Keyword → dimension key map. Entries for dimensions that don't yet exist
// (football/cricket/hockey) are intentionally listed; detectDimension only
// returns them once the DIMENSIONS export contains them (Phase C).
const DIMENSION_ALIASES = {
  // tennis
  tennis: 'tennis_strength',
  // rugby
  rugby: 'rugby_standing',
  // academics
  academic:    'academic_strength',
  academics:   'academic_strength',
  exam:        'academic_strength',
  exams:       'academic_strength',
  results:     'academic_strength',
  grades:      'academic_strength',
  gcse:        'academic_strength',
  'a-level':   'academic_strength',
  'a level':   'academic_strength',
  alevel:      'academic_strength',
  ib:          'academic_strength',
  oxbridge:    'academic_strength',
  // fees / value
  fees:        'fees_value',
  fee:         'fees_value',
  cost:        'fees_value',
  costs:       'fees_value',
  affordable:  'fees_value',
  scholarship: 'fees_value',
  scholarships:'fees_value',
  bursary:     'fees_value',
  bursaries:   'fees_value',
  // pastoral
  pastoral:    'pastoral_model',
  wellbeing:   'pastoral_model',
  culture:     'pastoral_model',
  safeguarding:'pastoral_model',
  // ISI deep extraction (2026-05-10) — multi-word priority phrases below
  // override these aliases via the `phrases` list in detectDimension().
  // 'pastoral care' (multi-word) routes to pastoral_care, while bare
  // 'pastoral' still routes to pastoral_model. Longest-match wins.
  'pastoral care':         'pastoral_care',
  'mental health':         'pastoral_care',
  'anti-bullying':         'pastoral_care',
  'anti bullying':         'pastoral_care',
  bullying:                'pastoral_care',
  'inclusive culture':     'inclusive_culture',
  'inclusive school':      'inclusive_culture',
  inclusion:               'inclusive_culture',
  inclusive:               'inclusive_culture',
  inclusivity:             'inclusive_culture',
  diversity:               'inclusive_culture',
  lgbtq:                   'inclusive_culture',
  'lgbtq+':                'inclusive_culture',
  lgbt:                    'inclusive_culture',
  'pupil voice':           'inclusive_culture',
  // future (Phase C)
  football: 'football_strength',
  cricket:  'cricket_strength',
  hockey:   'hockey_strength',
};

function detectDimension(q) {
  // Pre-enable-4: never return a disabled dim (mirrors dimensions.js contract).
  // Multi-word phrases first (longest, most specific) — these win over
  // dimension-level keywords regex which is checked next. Per Codex Step 8
  // review (2026-05-10): the older pastoral_model dim's regex captures
  // 'pastoral|wellbeing|bullying|mental health' — needs explicit phrase
  // priority so the new ISI-deep pastoral_care + inclusive_culture dims
  // get first crack at their natural-language probes.
  const phrases = [
    'a-level', 'a level',
    // ISI deep extraction priority phrases. Includes single words
    // ('lgbtq', 'bullying') that overlap with older dim regexes (e.g.
    // pastoral_model includes 'bullying') — listing them here forces the
    // newer ISI-deep dim to win.
    'pastoral care', 'mental health', 'anti-bullying', 'anti bullying',
    'inclusive culture', 'inclusive school', 'pupil voice',
    'lgbtq+', 'lgbtq', 'lgbt',
    'bullying',
  ];
  for (const p of phrases) {
    if (q.includes(p)) {
      const dim = DIMENSION_ALIASES[p];
      if (dim && DIMENSIONS[dim] && DIMENSIONS[dim].enabled !== false) return dim;
    }
  }
  // Then dimension-level keywords regex (most reliable, hand-tuned per dimension).
  for (const [name, dim] of Object.entries(DIMENSIONS)) {
    if (dim.enabled === false) continue;
    if (dim.keywords && dim.keywords.test(q)) return name;
  }
  // Finally aliases — only return if the dimension actually exists in
  // DIMENSIONS. Use word-boundary regex (NOT substring) so words like
  // "coffee" don't match the "fee" alias and "library" doesn't match "ib".
  for (const [keyword, dimName] of Object.entries(DIMENSION_ALIASES)) {
    if (!DIMENSIONS[dimName] || DIMENSIONS[dimName].enabled === false) continue;
    const wb = new RegExp(`\\b${keyword.replace(/[-]/g, '[- ]')}\\b`, 'i');
    if (wb.test(q)) return dimName;
  }
  return null;
}

function detectTopN(q) {
  // "top 5", "best 12 schools", "5 best schools", "give me the 8 strongest"
  const beforeAdj = q.match(/\b(?:top|best|recommend|leading|strongest)\s+(\d+)\b/i);
  const afterCount = q.match(/\b(\d+)\s+(?:best|top|strongest|leading)\s+\w*schools?\b/i);
  const giveMe    = q.match(/\b(?:give|show|list)\s+(?:me\s+)?(?:the\s+)?(\d+)\b/i);
  const m = beforeAdj || afterCount || giveMe;
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(n, 30);
}

// Trigger regexes per intent. Anchored on word boundaries to avoid matching
// substrings inside school names or unrelated words.
const COMPARE_RE      = /\b(compare|comparison|versus|vs\.?|difference|which is better|head[- ]to[- ]head|between)\b/i;
// Slice 6: widened to recognise "rank these/those" / "compare these" /
// "which of those" — patterns parents naturally reach for when they have
// a shortlist already loaded. The shortlist-size guard at the call site
// keeps this from hijacking global discovery queries.
const SHORTLIST_RE    = /\b(shortlist|my schools|(?:these|those) schools?|(?:rank|sort|prioriti[sz]e) (?:them|these|those)|compare (?:them|these|those)|which of (?:these|those|them)|my options)\b/i;
const TOP_N_RE        = /\b(top|best|strongest|leading|rank|recommend|recommendations?)\b/i;
const SCHOOLS_RE      = /\bschools?\b/i;
// Slice 6 — explicit lens framing. Catches "create a lens for these",
// "make a lens for them", "build a pastoral lens for these schools".
// Don't rely on Pass-2 alone if the classifier gate would block it
// (Codex r1 c3-classifier finding).
const LENS_RE         = /\b(create|build|make|apply|use)\b.*\blens\b.*\b(these|those|them|shortlist|options)\b/i;
// Slice 6.5 — topic-lens framing. Catches "create a lens for rugby",
// "make a music lens", "build a drama view". Doesn't require a deictic
// (these/those/them) because the topic itself anchors the query. Routes
// to shortlist_rank_or_compare so Pass-1 produces shortlist-scoped prose
// about the topic, and Pass-2 picks option D propose_create_topic_lens.
const TOPIC_LENS_RE   = /\b(create|build|make)\b\s+(?:a|an|the)?\s*\w*\s*\blens\b/i;
// Slice 6 — verb-only signal for rule 2b (shortlist + comparison verb,
// no explicit deictic). Separate from TOP_N_RE because top_n includes
// "top|best|leading|strongest|recommend" which we want to send to
// global discovery (top_n_for_dim) when shortlist is set.
const SHORTLIST_VERB_RE = /\b(rank|sort|prioriti[sz]e)\b/i;
// Slice 6 — global discovery escape hatch for rule 2b. When the parent
// has a shortlist BUT explicitly asks for top/best/leading/strongest/
// recommended SCHOOLS (the noun is required), let top_n_for_dim win
// over the new shortlist fallback. Codex c3-classifier finding.
const GLOBAL_DISCOVERY_RE = /\b(top|best|leading|strongest|recommend(?:ed|s|ing)?)\s+\w*\s*schools?\b/i;
// Slice 6 — value/affordability signal. detectDimension returns ONE
// dimension at a time, so a query like "rank by academics AND
// value-for-money" picks academic_strength and never fetches fees.
// When this regex matches and the picked dimension isn't already
// fees_value, ALSO pull fees_value so the model can do
// value-for-money reasoning. Manual-test fix 2026-05-09.
const VALUE_SIGNAL_RE = /\b(value|money|afford(?:able|ability)?|cost|costs|cheap|cheapest|expensive|worth|bursar(?:y|ies)?|scholarships?)\b/i;
// Slice 6 commit 8b — "add a row about X" / "include a column for Y" /
// "track phone policy". Routes to shortlist_rank_or_compare via rule
// 2b so Pass-2 can emit a propose_add_row proposal. Without this,
// natural "add a row" phrasings fall through to legacy:global where
// the shortlist context is lost.
const ADD_ROW_RE = /\b(add|include|track|show)\b[\s\S]{0,40}\b(rows?|columns?|dimensions?|categor(?:y|ies))\b/i;
// Phase-2 close-call broadening: cover natural phrasings parents actually
// use ("known for", "honest take", "right for", "should we send/consider",
// "how does X handle/feel"). Without these, prompts like "What's Reed's
// known for?" fall through to legacy:global where the JSON path is
// terser and more error-prone.
const TELL_ME_RE      = /\b(tell me about|overview|verdict|summary|what do you think|is .{1,30} good|describe|known for|right (?:for|fit)|good fit|honest take|how does .{1,30} (?:handle|feel|work)|should we (?:send|consider|look at))\b/i;
// FIT_RE matches the "[School] for [our|my|a] [adjective|hyphenated-adj]*
// [son|daughter|child|...]" pattern parents use for fit/match queries.
// Combined with a target slug, this routes through tell_me_about_school's
// prose path instead of the legacy single/global JSON path.
//
// Allows 0–4 descriptor words (incl. hyphenated like "hockey-obsessed"
// and comma-separated like "anxious, artistic") between the determiner
// and the noun. Word chars + hyphens, comma-or-space separator.
//
// Codex tightenings:
// - Drop `year ?\d+` terminal: "Eton for a year 9 entry" is fact_lookup
// - `(?![-\w])` after the noun blocks "child-centered curriculum" type
//   false positives (where the apparent noun is actually a hyphen-prefix
//   of a compound).
// - End-of-clause requirement: after the noun, must be punctuation
//   (?.!,;:—–), end-of-string, OR a relative-pronoun/transition word
//   (who/that/aiming/looking/seeking/hoping/with/in). Blocks "for the
//   boy choir" type noun-noun phrases that look fit-shaped but aren't.
const FIT_RE          = /\bfor (?:our|my|a|an|the) (?:[\w-]+,?\s+){0,4}(?:son|daughter|child|kid|teenager|boy|girl)(?![-\w])(?:\s*(?:[?.!,;:—–]|\b(?:who|that|aiming|looking|seeking|hoping|with|in)\b)|\s*$)/i;
const SAFEGUARDING_RE = /\b(safeguarding|pastoral|wellbeing|bullying|mental health|boarding house|house system|matron|tutor)\b/i;
const FEES_RE         = /\b(fees?|cost|costs|cheap|cheapest|expensive|affordab(le|ility)|value|worth it|bursar(y|ies)|scholarships?)\b/i;
const FACT_LOOKUP_RE  = /\b(admissions?|entry|sixth form|13\+|11\+|boarding|day pupils?|curriculum|gcse|a[- ]level|ib|sports facilities|location|address)\b/i;

/**
 * routeIntent(question, ctx)
 *
 * @param {string} question  — parent's raw question
 * @param {object} ctx       — { mentionedSlugs: string[], activeSchoolSlug: string|null, shortlistSlugs: string[] }
 *
 * @returns {object|null}    — null on no match (caller should fall through to agentic loop)
 *
 * On match:
 *   {
 *     intent: string,
 *     confidence: 'high' | 'medium',
 *     uiIntent: 'verdict' | 'compare' | 'report' | 'none',
 *     recommendedSchoolSlugs: string[],
 *     plan: {
 *       mode: 'deterministic',
 *       tools: [{ name, args }, ...],
 *       parallel: boolean,
 *       answerStyle: 'prose'
 *     }
 *   }
 */
export function routeIntent(question, ctx = {}) {
  if (typeof question !== 'string' || question.trim().length === 0) return null;
  const q = question.toLowerCase();

  // Defensive: filter slug arrays to non-empty strings so a stray null/undefined
  // from upstream callers doesn't end up as `targetSlug = undefined` etc.
  const isStr = (s) => typeof s === 'string' && s.length > 0;
  const mentionedSlugs   = Array.isArray(ctx.mentionedSlugs)  ? ctx.mentionedSlugs.filter(isStr)  : [];
  const activeSchoolSlug = typeof ctx.activeSchoolSlug === 'string' && ctx.activeSchoolSlug ? ctx.activeSchoolSlug : null;
  const shortlistSlugs   = Array.isArray(ctx.shortlistSlugs)  ? ctx.shortlistSlugs.filter(isStr)  : [];

  const dimension = detectDimension(q);
  const n         = detectTopN(q);

  // Effective single-school target: explicit mention, or active-school fallback
  // when nothing else is named. Used by intents 4-7.
  const targetSlug =
    mentionedSlugs.length === 1                                  ? mentionedSlugs[0]
    : mentionedSlugs.length === 0 && activeSchoolSlug            ? activeSchoolSlug
    : null;

  // 1. compare_two_on_dim — must beat top_n on "which is better, X or Y on tennis"
  if (mentionedSlugs.length >= 2 && COMPARE_RE.test(q)) {
    const slugs = mentionedSlugs.slice(0, 4);
    const dims  = dimension ? [dimension] : ['academic_strength', 'fees_value', 'pastoral_model'];
    // Multi-dim signal: detectDimension returns one dimension. If the
    // query also has a value/affordability signal AND we picked a
    // non-fees primary, also pull fees so the answer can reason on
    // value-for-money (manual-test fix 2026-05-09).
    if (dimension && dimension !== 'fees_value' && VALUE_SIGNAL_RE.test(q)) dims.push('fees_value');
    return {
      intent: 'compare_two_on_dim',
      confidence: 'high',
      uiIntent: 'compare',
      recommendedSchoolSlugs: slugs,
      plan: {
        mode: 'deterministic',
        tools: [
          { name: 'compareSchools', args: { slugs, dimensions: dims } },
          // Phase 0.5a: when we know the dimension, fetch only the relevant
          // fields. Avoids pulling the 25KB sports_profile blob for academic
          // / fees / pastoral comparisons. If dimension is null (multi-dim
          // fallback), tools.js default fires (sans sports_profile per
          // Phase 0.5a step 3).
          ...slugs.map(slug => {
            const fields = fieldsForDimension(dimension);
            return { name: 'getSchoolFacts', args: fields ? { slug, fields } : { slug } };
          }),
        ],
        parallel: true,
        answerStyle: 'prose',
      },
    };
  }

  // 2. shortlist_rank_or_compare
  if (shortlistSlugs.length >= 2 && SHORTLIST_RE.test(q)) {
    const slugs = shortlistSlugs.slice(0, 4);
    const dims  = dimension ? [dimension] : ['academic_strength', 'pastoral_model', 'fees_value'];
    if (dimension && dimension !== 'fees_value' && VALUE_SIGNAL_RE.test(q)) dims.push('fees_value');
    return {
      intent: 'shortlist_rank_or_compare',
      confidence: 'high',
      uiIntent: 'compare',
      recommendedSchoolSlugs: slugs,
      plan: {
        mode: 'deterministic',
        tools: [
          { name: 'compareSchools', args: { slugs, dimensions: dims } },
        ],
        parallel: false,
        answerStyle: 'prose',
      },
    };
  }

  // 2b. Slice-6 fallback — shortlist + comparison/rank/lens verb, but no
  // explicit "these"/"them"/"those" deictic. Catches the natural parent
  // phrasings the manual-test surfaced:
  //   "Compare these on bursary support"  (COMPARE_RE matches "compare")
  //   "Rank by academics and value"       (SHORTLIST_VERB_RE matches "rank")
  //   "Create a pastoral-care lens for these"  (LENS_RE matches)
  //
  // Guards (all required to fire):
  //   - shortlistSlugs.length >= 2 — rule only applies when the parent
  //     has actually built a shortlist; can't hijack first-time queries.
  //   - mentionedSlugs.length === 0 — explicit slug names go to rule 1
  //     (compare_two_on_dim) which is more specific.
  //   - !GLOBAL_DISCOVERY_RE — escape hatch for "what are the best schools
  //     for tennis in Surrey?" — those route to top_n_for_dim even when
  //     the parent has an unrelated shortlist loaded.
  //
  // Returns the same plan shape as rule 2 — same tool, same dims, same
  // uiIntent. Slice-6 Pass-2 extractor decides re-rank vs add-row vs
  // create-lens from prose framing once the question is in the
  // comparison-intent set.
  if (
    shortlistSlugs.length >= 2 &&
    mentionedSlugs.length === 0 &&
    !GLOBAL_DISCOVERY_RE.test(q) &&
    (COMPARE_RE.test(q) || SHORTLIST_VERB_RE.test(q) || LENS_RE.test(q) || TOPIC_LENS_RE.test(q) || ADD_ROW_RE.test(q))
  ) {
    const slugs = shortlistSlugs.slice(0, 4);
    const dims  = dimension ? [dimension] : ['academic_strength', 'pastoral_model', 'fees_value'];
    if (dimension && dimension !== 'fees_value' && VALUE_SIGNAL_RE.test(q)) dims.push('fees_value');
    return {
      intent: 'shortlist_rank_or_compare',
      confidence: 'medium',
      uiIntent: 'compare',
      recommendedSchoolSlugs: slugs,
      plan: {
        mode: 'deterministic',
        tools: [
          { name: 'compareSchools', args: { slugs, dimensions: dims } },
        ],
        parallel: false,
        answerStyle: 'prose',
      },
    };
  }

  // 3. top_n_for_dim — global "top/best schools for X"
  if (TOP_N_RE.test(q) && SCHOOLS_RE.test(q) && dimension) {
    return {
      intent: 'top_n_for_dim',
      confidence: 'high',
      uiIntent: 'compare',
      recommendedSchoolSlugs: [],
      plan: {
        mode: 'deterministic',
        tools: [
          { name: 'rankSchools', args: { dimension, limit: n || 8 } },
        ],
        parallel: false,
        answerStyle: 'prose',
      },
    };
  }

  // 4. safeguarding_or_pastoral — must precede tell_me_about so questions
  //    like "tell me about safeguarding at Eton" get the safeguarding tool.
  if (targetSlug && SAFEGUARDING_RE.test(q)) {
    return {
      intent: 'safeguarding_or_pastoral',
      confidence: 'high',
      uiIntent: 'verdict',
      recommendedSchoolSlugs: [targetSlug],
      plan: {
        mode: 'deterministic',
        tools: [
          { name: 'searchSafeguarding', args: { slug: targetSlug } },
          { name: 'getSchoolFacts',     args: { slug: targetSlug, fields: ['pastoral_model','pastoral_care','wellbeing_staffing','policies_summary'] } },
        ],
        parallel: true,
        answerStyle: 'prose',
      },
    };
  }

  // 5. fees_value — school-specific must precede tell_me_about so
  //    "tell me about Eton's fees" gets the fees-focused field set.
  //    Global "best value schools" branch falls below tell_me_about.
  if (targetSlug && FEES_RE.test(q)) {
    return {
      intent: 'fees_value',
      confidence: 'high',
      uiIntent: 'verdict',
      recommendedSchoolSlugs: [targetSlug],
      plan: {
        mode: 'deterministic',
        tools: [
          { name: 'getSchoolFacts', args: { slug: targetSlug, fields: ['fees_min','fees_max','fees_currency','fees_by_grade','scholarships_available','bursary_note'] } },
        ],
        parallel: false,
        answerStyle: 'prose',
      },
    };
  }

  // 6. tell_me_about_school — generic overview, OR a "{school} for [a/our/my]
  //    [son/daughter/...]" fit prompt. Both route to the same prose-runner
  //    plan since the answering surface is identical (full-school context).
  //    Pass an explicit compact field list so we don't get only the default
  //    exam/sports/fees subset and miss verdict/admissions/pastoral/location.
  if (targetSlug && (TELL_ME_RE.test(q) || FIT_RE.test(q))) {
    return {
      intent: 'tell_me_about_school',
      confidence: 'high',
      uiIntent: 'verdict',
      recommendedSchoolSlugs: [targetSlug],
      plan: {
        mode: 'deterministic',
        tools: [
          { name: 'getSchoolFacts', args: { slug: targetSlug, fields: [
            'report_verdict', 'report_parent_fit',
            'exam_results', 'university_destinations',
            'fees_min', 'fees_max', 'fees_currency',
            'pastoral_model', 'pastoral_care',
            'location_profile', 'sports_profile',
          ] } },
          { name: 'searchSchoolText',  args: { slug: targetSlug, query: question, limit: 6 } },
        ],
        parallel: true,
        answerStyle: 'prose',
      },
    };
  }

  // 7. fees_value (global discovery — "best value schools" / "cheapest").
  //    Codex P2 #10: require explicit discovery language (top_n / cheapest /
  //    best value), not just plain "schools" — otherwise "Why do schools
  //    have such high fees?" misroutes to a ranking.
  const isGlobalFeesDiscovery =
    FEES_RE.test(q) && (
      TOP_N_RE.test(q) ||
      /\b(cheap|cheapest|best value|most affordable|lowest fees?)\b/i.test(q)
    );
  if (isGlobalFeesDiscovery) {
    return {
      intent: 'fees_value',
      confidence: 'medium',
      uiIntent: 'compare',
      recommendedSchoolSlugs: [],
      plan: {
        mode: 'deterministic',
        tools: [
          { name: 'rankSchools', args: { dimension: 'fees_value', limit: n || 8 } },
        ],
        parallel: false,
        answerStyle: 'prose',
      },
    };
  }

  // 8. fact_lookup — school-scoped specific facts (admissions/curriculum/etc)
  if (targetSlug && FACT_LOOKUP_RE.test(q)) {
    // Phase 0.5a: derive fields from detected dimension when possible.
    // tools.js default no longer includes sports_profile, so a question
    // like "what sports facilities does X have?" needs explicit opt-in.
    let factFields;
    if (dimension) {
      factFields = fieldsForDimension(dimension);
    } else if (/\bsports?\b/i.test(q)) {
      // Generic "sports" / "sports facilities" question with no specific sport.
      factFields = ['sports_profile', 'facilities'];
    }
    const factArgs = factFields ? { slug: targetSlug, fields: factFields } : { slug: targetSlug };
    return {
      intent: 'fact_lookup',
      confidence: 'medium',
      uiIntent: 'verdict',
      recommendedSchoolSlugs: [targetSlug],
      plan: {
        mode: 'deterministic',
        tools: [
          { name: 'getSchoolFacts',   args: factArgs },
          { name: 'searchSchoolText', args: { slug: targetSlug, query: question, limit: 6 } },
        ],
        parallel: true,
        answerStyle: 'prose',
      },
    };
  }

  return null;
}

// Internal helpers exported for tests
export const _internals = { detectDimension, detectTopN, DIMENSION_ALIASES };

/**
 * Umbrella router — parent-realistic question detection (2026-05-14)
 *
 * Why this exists:
 *   The strict intent router in intent-router.js fires for narrow dim-target
 *   questions ("how strong is the rugby?", "fees?") but NULLs on broad parent
 *   questions ("how safe?", "worth the money?", "will my shy kid be happy?").
 *   Diagnostic data (~/notes/closeout-2026-05-14-nana-smoke-comprehensive.md)
 *   showed 25/30 parent-realistic questions hit NULL intent, causing the chat
 *   to fall back to chunk-only retrieval and miss ISI-deep facts already in
 *   school_facts. The smoking-gun example: P03 "safe online at Sevenoaks?" got
 *   "I don't have data" despite Sevenoaks having 2 active
 *   isi_online_safety_education rows.
 *
 * Architecture:
 *   This router runs IN PARALLEL to the strict intent-router and is purely
 *   ADDITIVE. It maps natural parent phrasings to umbrella concepts; each
 *   umbrella declares which ISI-deep fact_types and which school_structured_data
 *   profile fields are relevant. The caller (nana-brain.js runOneQuestionStream)
 *   loads the union of facts/fields when NANA_UMBRELLA_V1=on and injects them
 *   into the LLM context alongside the existing chunk retrieval. When the flag
 *   is off, this module is unreachable from the runtime path.
 *
 * Mirrored pattern: pack-prompt-injection.js (env-flag-gated additive context).
 */

const UMBRELLAS = {
  safety: {
    triggers: [
      // physical / emotional / general safety
      'safe', 'safety', 'safeguarding', 'protect', 'protection',
      // bullying
      'bully', 'bullied', 'picked on', 'mean kids',
      // online safety
      'online safety', 'social media', 'cyberbully', 'internet safety',
      // mental health
      'mental health', 'meltdown', 'crisis', 'breakdown',
      // pastoral / wellbeing — closes smoke finding #2 (2026-05-14):
      // "pastoral support" / "student wellbeing" / "wellbeing support" fell back
      // to pastoral_model + school marketing instead of firing the safety
      // umbrella's ISI deep facts + SSD wellbeing_staffing field.
      'pastoral', 'wellbeing', 'well-being', 'welfare',
      // behaviour / discipline
      'expel', 'expulsion', 'suspended', 'discipline', 'behaviour issue', 'behavior issue',
      // substance / harm
      'drugs', 'alcohol', 'vaping', 'abuse', 'harm', 'hurt',
    ],
    isiDeepFactTypes: [
      'isi_bullying_culture',
      'isi_mental_health_provision',
      'isi_online_safety_education',
      'isi_wellbeing_spaces',
    ],
    profileFields: [
      'policies_summary',
      'wellbeing_staffing',
      'location_profile',
      'pastoral_care',
      'pastoral_model',
    ],
  },

  fit_culture: {
    triggers: [
      'happy', 'unhappy', 'fit in', 'belong', 'belongs',
      'kind of kids', 'type of kids', 'students like', 'social mix',
      'stuck-up', 'stuck up', 'snobby', 'posh', 'elitist',
      'strict', 'lenient', 'relaxed', 'uptight',
      'friendly', 'cliquey', 'cliques',
      'competitive', 'supportive', 'pushy',
      'shy', 'introvert', 'extrovert', 'outgoing',
      'diverse', 'inclusive', 'welcoming',
    ],
    isiDeepFactTypes: [
      'isi_diversity_culture',
      'isi_pupil_voice',
      'isi_community_service',
      'isi_personal_development',
    ],
    profileFields: [
      'student_community',
      'sports_profile',
      'pastoral_care',
      'pastoral_model',
    ],
  },

  money_value: {
    // Parent-walkthrough insight (2026-05-14): a UK boarding parent's total cost
    // includes visiting travel (drive time, train fares, exeat weekends); an
    // international parent's total cost includes airport proximity. So
    // location_profile belongs here, not just in intl_boarding.
    triggers: [
      'worth', 'value for money', 'expensive', 'cheap', 'afford',
      'fees', 'cost', 'costs', 'budget', 'price',
      'bursary', 'scholarship', 'financial aid', 'means-tested',
      'extras', 'hidden cost', 'on top of',
      // location-as-cost (user catch)
      'airport', 'drive to', 'how far', 'visiting', 'visit them',
      // comparisons
      'cheaper', 'vs eton', 'vs harrow', 'vs winchester',
    ],
    isiDeepFactTypes: [],  // ISI deep doesn't carry fee/value data
    profileFields: [
      'fees_by_grade',
      'fees_min',
      'fees_max',
      'fees_currency',
      'scholarships_available',
      'bursary_note',
      'university_destinations',
      'exam_results',
      'location_profile',     // ← user-flagged inclusion
    ],
  },

  outcomes: {
    triggers: [
      'oxford', 'cambridge', 'oxbridge', 'russell group', 'ivy league', 'top university',
      'a-level', 'a levels', 'gcse', 'ib results', 'exam results', 'grades',
      'teachers any good', 'teaching quality',
      'leavers', 'after school', 'post-school', 'go to university',
      'jobs', 'career outcomes',
      'alumni',
      'gifted', 'bright kid', 'high achiever',
    ],
    isiDeepFactTypes: [
      'isi_personal_development',
    ],
    profileFields: [
      'exam_results',
      'university_destinations',
      'curriculum',
      'pastoral_care',  // SEN/academic-stress support
    ],
  },

  academic_fit: {
    // Distinct from outcomes — this is about pressure + fit + support for a
    // specific kid, not "will they succeed".
    triggers: [
      'too academic', 'too much pressure', 'pushed too hard',
      'challenged', 'under-challenged', 'bored',
      'help my kid', 'kid struggling', 'struggling academically',
      'sen', 'eal', 'dyslexic', 'dyslexia', 'learning support', 'special needs',
      'rigorous', 'demanding',
    ],
    isiDeepFactTypes: [],
    profileFields: [
      'curriculum',
      'pastoral_care',
      'exam_results',
    ],
  },

  intl_boarding: {
    triggers: [
      'international', 'overseas', 'abroad', 'foreign', 'expat',
      'visa', 'guardianship', 'guardian',
      'moving from', 'relocating',
      'boarding house', 'dormitory', 'dorm', 'weekly boarding', 'full boarding',
      'exeat', 'term break', 'half-term',
      'settle in', 'homesick', 'first term', 'transition',
      'english as a second', 'language support',
    ],
    isiDeepFactTypes: [
      'isi_diversity_culture',
      'isi_wellbeing_spaces',
    ],
    profileFields: [
      'location_profile',
      'student_community',
      'pastoral_care',
    ],
  },

  practicality: {
    // Pure logistics — smallest umbrella.
    triggers: [
      'open day', 'open days', 'should we visit', 'visit before applying',
      'how do i apply', 'application process',
      'school year', 'term dates', 'start date',
      'join mid-year', 'mid year', 'join late',
    ],
    isiDeepFactTypes: [],
    profileFields: [
      'location_profile',
    ],
  },
}

/**
 * detectUmbrellas(question)
 * Returns the array of umbrella names whose triggers match this question.
 * Multiple umbrellas can match (e.g. "is it worth the £18k boarding fee" hits
 * money_value AND intl_boarding because of "boarding").
 */
export function detectUmbrellas(question) {
  const q = (question || '').toLowerCase()
  const matched = []
  for (const [name, def] of Object.entries(UMBRELLAS)) {
    if (def.triggers.some((t) => q.includes(t))) matched.push(name)
  }
  return matched
}

/**
 * Union of ISI-deep fact_types across the matched umbrellas. Used to query
 * school_facts directly without over-fetching.
 */
export function unionIsiDeepFactTypes(umbrellas) {
  const set = new Set()
  for (const u of umbrellas) {
    const def = UMBRELLAS[u]
    if (def) def.isiDeepFactTypes.forEach((t) => set.add(t))
  }
  return [...set]
}

/**
 * Union of school_structured_data profile fields the umbrella(s) need.
 * Caller uses this to know which columns to project in a getSchoolFacts call.
 */
export function unionProfileFields(umbrellas) {
  const set = new Set()
  for (const u of umbrellas) {
    const def = UMBRELLAS[u]
    if (def) def.profileFields.forEach((f) => set.add(f))
  }
  return [...set]
}

/** Test/inspection helper — full registry */
export const _registry = UMBRELLAS

// ── Comparison-target detection (N3, 2026-05-15) ─────────────────────────────
//
// Why this lives here (not in intent-router.js):
//   intent-router only fires when 2+ slugs are mentioned. On a school report
//   page the host is implicit ("this school is cheaper than Eton"), so only
//   ONE slug appears in the question text yet the parent's mental model is
//   comparative. We need to recognise that here, where the umbrella layer
//   can also widen profile-field loading to BOTH sides.
//
// Pattern matrix (parent battery targets):
//   P15 "Is this school cheaper than Eton?"          → cheaper than
//   P26 "How does this school compare to Eton?"      → compare
//   P29 "How is this school different from Sevenoaks?" → different from
//
// Anti-patterns we deliberately do NOT fire on:
//   • "compare to a state grammar"  → no DB slug, target resolves to null
//   • "comparable A-levels to GCSEs" → no slug + 'compare' inside another word
//   • "different teachers each year" → 'different' without a from/to/than
//
// COMPARISON_RE alternates explicit phrases over the `\b…\b` boundaries
// rather than a single open `\bcompare\b` to keep the false-positive rate
// near zero on the rest of the parent battery (which has 0/24 false hits
// on the broader pattern in offline trials).
const COMPARISON_RE = /\b(?:compared?|comparison|versus|vs\.?|differ|different\s+(?:from|to|than)|cheaper\s+than|pricier\s+than|more\s+expensive\s+than|less\s+expensive\s+than|better\s+than|worse\s+than|how\s+does[^?]*?\s+(?:compare|differ|stack)|head[- ]to[- ]head)\b/i

/**
 * canonicalSlugBase(slug)
 *
 * Strips the trailing `-school | -college | -uk` suffix so two slug variants
 * for the same school collapse to the same root. FAMOUS_SHORT_NAMES has at
 * least two entries where the registered slug lacks the suffix
 * ('charterhouse' / 'bedales'), but parents will land on the page whose
 * Next.js route slug includes it ('charterhouse-school' / 'bedales-school').
 * Without this, the host-collision filter in `detectComparisonTarget`
 * would let the alias slip past and Nana would "compare" the school to
 * itself — see Codex r1 P1 (2026-05-15).
 */
function canonicalSlugBase(slug) {
  if (typeof slug !== 'string' || !slug) return ''
  // Codex r2 P2 (2026-05-15): loop-strip stacked terminal suffixes so
  // `reeds-school-uk` → `reeds-school` → `reeds` (single regex replace
  // only stripped one suffix and `reeds-school-uk` was not collapsing to
  // `reeds`). Cap iterations to avoid runaway on pathological input.
  let s = slug.toLowerCase()
  for (let i = 0; i < 4; i += 1) {
    const next = s.replace(/-(school|college|uk)$/i, '')
    if (next === s) break
    s = next
  }
  return s
}

/**
 * detectComparisonTarget(question, hostSlug, supabase)
 *
 * Returns a single TARGET slug (string) when the question is comparative
 * AND a non-host school is named, else null. Caller (umbrella-injection.js)
 * uses this to optionally load a second school's profile fields and render
 * them as a COMPARISON SCHOOL block alongside the host's UMBRELLA CONTEXT.
 *
 * Imports detectMentionedSlugs lazily to avoid a tight import cycle between
 * umbrella-router → nana-brain (which already imports umbrella-injection
 * → umbrella-router). The lazy import keeps this file tree-shakeable from
 * test fixtures that mock the slug detector.
 *
 * Host-collision filter (Codex r1 P1, 2026-05-15): we filter on both the
 * exact host slug AND its canonical base (`-school | -college | -uk`
 * stripped). This protects against alias-mapped famous names: if host is
 * `charterhouse-school` but `expandFamousShortNames` returns `'charterhouse'`
 * for the bare-form mention, strict equality would not catch the collision
 * and the function would happily try to compare the school to its own alias.
 *
 * Cap of 1: even if the question names multiple schools beside the host
 * ("compare this to Eton and Harrow"), we return only the first non-host
 * slug. A multi-target comparison block would balloon the prompt and
 * confuse the LLM's mental model — N3 v1 is host-vs-one.
 */
export async function detectComparisonTarget(question, hostSlug, supabase, opts = {}) {
  if (typeof question !== 'string' || !question.trim()) return null
  if (!COMPARISON_RE.test(question)) return null

  // INVARIANT (Codex r2 NIT, 2026-05-15): the import below MUST stay dynamic.
  // Module graph: nana-brain.js → umbrella-injection.js → umbrella-router.js,
  // so a static `import { detectMentionedSlugs } from './nana-brain.js'` here
  // creates a circular reference that deadlocks ESM module-load. The dynamic
  // import resolves AFTER nana-brain has finished loading. Test fixtures can
  // override the resolver via opts.resolveSlugs without paying the import cost.
  const resolveSlugs = opts.resolveSlugs || (async (q) => {
    const [{ detectMentionedSlugs }, { expandFamousShortNames }] = await Promise.all([
      import('./nana-brain.js'),
      import('./famous-names.js'),
    ])
    const detected = await detectMentionedSlugs(supabase, q)
    return expandFamousShortNames(q, detected)
  })

  const candidates = await resolveSlugs(question)
  if (!Array.isArray(candidates) || candidates.length === 0) return null

  const host = typeof hostSlug === 'string' ? hostSlug : null
  const hostBase = canonicalSlugBase(host)
  for (const slug of candidates) {
    if (!slug || typeof slug !== 'string') continue
    if (slug === host) continue
    if (hostBase && canonicalSlugBase(slug) === hostBase) continue
    return slug
  }
  return null
}

export { canonicalSlugBase as _canonicalSlugBase }

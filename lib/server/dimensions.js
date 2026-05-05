/**
 * dimensions.js
 *
 * Canonical "parent decision axes" — the dimensions Nana can rank schools on.
 * Each dimension is backed by columns in `school_structured_data` and provides:
 *
 *   rank(row):         numeric score, higher = stronger on this dimension
 *   format(row, school): compact human-readable summary (~300 chars) for Claude
 *   citations(row):    array of URLs eligible for the validateAnswer whitelist
 *   requires_field:    dot-path that must be non-null (data quality gate)
 *   keywords:          regex hint for question matching
 *
 * Used by tools.js (rankSchools, getSchoolFacts) to drive the agentic loop.
 *
 * Adding a new dimension:
 *   1. Append an entry below
 *   2. rank() must be defensive against null/undefined nested fields
 *   3. format() should stay under ~500 chars (Claude token budget)
 *   4. citations() must return real URLs from the structured data, never slugs
 */

// Tier dominates ranking. A national-elite school always beats a national-strong
// one, regardless of how many regional cups it has. Within a tier, cup quality
// and alumni provide the ordering. The extractor already classifies tier
// thoughtfully — we trust that signal heavily.
const TIER_SCORE = {
  'national-elite':  50,
  'national-strong': 25,
  'regional':        10,
  'local':           5,
  'unknown':         0,
};

const RESULT_SCORE = {
  'winner':                5,
  'runner-up':             3,
  'finalist':              3,
  'late rounds finalist':  2.5,
  'semi-finalist':         2,
  'quarter-finalist':      1,
  'participation':         0.5,
};

// Cup tournament names that indicate national-tier competition (vs regional/county).
// Cups matching this pattern get a 2× score bonus — a Youll Cup win is worth more
// than a county-league win.
const NATIONAL_CUP_RE = /\b(youll|aberdare|glanville|national|championship|isfa|ista clark|english schools|british schools)\b/i;

function getAt(row, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), row);
}

function scoreCupResults(cups, { nationalBonus = false } = {}) {
  if (!Array.isArray(cups) || cups.length === 0) return 0;
  let s = 0;
  for (const c of cups) {
    const r = (c.result || '').toLowerCase().trim();
    const base = RESULT_SCORE[r] ?? 0;
    const mult = nationalBonus && NATIONAL_CUP_RE.test(c.tournament || '') ? 2 : 1;
    s += base * mult;
  }
  return s;
}

export const DIMENSIONS = {
  tennis_strength: {
    label:           'Tennis competitive strength',
    description:     'Cup wins, competitive tier, alumni in pro tennis, team count.',
    keywords:        /\b(tennis|youll|aberdare|lta|wimbledon|atp|wta|glanville)\b/i,
    requires_field:  'sports_profile.tennis.competitive_tier',

    rank: (row) => {
      const t = row?.sports_profile?.tennis;
      if (!t) return 0;
      const tierScore = TIER_SCORE[t.competitive_tier] ?? 0;
      const cupScore  = scoreCupResults(t.cup_results, { nationalBonus: true });
      const alumniProCount = (t.notable_alumni ?? []).filter(a =>
        /\b(atp|wta|grand slam|olympic|wimbledon|davis cup|professional)\b/i.test(
          `${a.achievement || ''} ${a.notes || ''}`
        )
      ).length;
      const alumniScore = Math.min(alumniProCount * 2, 8);
      const teamsRaw = t.school_teams_visible?.value ?? t.school_teams_visible ?? 0;
      const teamsScore = Math.min(teamsRaw / 10, 3);
      return tierScore + cupScore + alumniScore + teamsScore;
    },

    format: (row, school) => {
      const t = row?.sports_profile?.tennis;
      if (!t) return null;
      const cups = (t.cup_results ?? [])
        .map(c => `${c.tournament || ''} ${c.year || ''} ${c.result || ''}`.trim())
        .filter(Boolean)
        .join('; ');
      const alumni = (t.notable_alumni ?? [])
        .slice(0, 3)
        .map(a => a.name)
        .filter(Boolean)
        .join(', ');
      return [
        `${school.name} — tennis.`,
        t.competitive_tier && `Tier: ${t.competitive_tier}.`,
        cups && `Cup results: ${cups}.`,
        alumni && `Alumni: ${alumni}.`,
        t.competitive_tier_reasoning && `Reasoning: ${t.competitive_tier_reasoning.slice(0, 250)}`,
      ].filter(Boolean).join(' ');
    },

    citations: (row) => row?.sports_profile?.tennis?.evidence_urls ?? [],
  },

  rugby_standing: {
    label:           'Rugby competitive standing',
    description:     'Competitive tier, DMT / SOCS rankings, cup runs, programme depth.',
    keywords:        /\b(rugby|scrum|lineout|dmt|daily mail trophy|continental tyres)\b/i,
    requires_field:  'sports_profile.rugby.competitive_tier',

    rank: (row) => {
      const r = row?.sports_profile?.rugby;
      if (!r) return 0;
      const tierScore = TIER_SCORE[r.competitive_tier] ?? 0;
      const dmtRank = r.dmt_ranking?.rank ?? 999;
      const dmtScore = dmtRank <= 50 ? 8 : dmtRank <= 100 ? 5 : dmtRank <= 200 ? 2 : 0;
      const socsRows = r.socs?.performance ?? [];
      const socsCur = socsRows.find(s => s.is_live) || socsRows[0];
      const socsRatio = socsCur?.total ? socsCur.rank / socsCur.total : 1;
      const socsScore = socsRatio < 0.1 ? 5 : socsRatio < 0.25 ? 3 : 0;
      const cupScore = scoreCupResults(r.cup_results);
      return tierScore + dmtScore + socsScore + cupScore;
    },

    format: (row, school) => {
      const r = row?.sports_profile?.rugby;
      if (!r) return null;
      const dmt = r.dmt_ranking?.rank;
      const socsCur = (r.socs?.performance ?? []).find(s => s.is_live);
      const cups = (r.cup_results ?? [])
        .map(c => `${c.tournament || ''} ${c.year || ''} ${c.result || ''}`.trim())
        .filter(Boolean)
        .join('; ');
      return [
        `${school.name} — rugby.`,
        r.competitive_tier && `Tier: ${r.competitive_tier}.`,
        dmt && `DMT rank: ${dmt}.`,
        socsCur && `SOCS Performance: rank ${socsCur.rank}/${socsCur.total} (${socsCur.season}).`,
        cups && `Cups: ${cups}.`,
      ].filter(Boolean).join(' ');
    },

    citations: (row) =>
      row?.sports_profile?.rugby?.evidence_urls ??
      row?.sports_profile?.source_urls ??
      [],
  },

  // ── Football, Cricket, Hockey ──────────────────────────────────────────────
  // Modeled on rugby_standing. extract-batch-sports.js uses scraped SOCS
  // archives at scripts/data/shared/<sport>-competitions/ as authoritative
  // context for Claude when setting competitive_tier — the SOCS data isn't
  // stamped into sports_profile.<sport> directly (unlike rugby), so we lean
  // on competitive_tier + cup runs + alumni + team count for the score.
  // Football schema quirk: uses `cup_competitions` not `cup_results` (TASKS.md
  // N12 — pending rename + 21-school backfill); rank/format handle both.

  football_strength: {
    label:           'Football competitive strength',
    description:     'Competitive tier, ISFA / ESFA cup runs, programme depth, notable alumni.',
    keywords:        /\b(football|soccer|isfa|esfa|first xi|first eleven|premier league)\b/i,
    requires_field:  'sports_profile.football.competitive_tier',

    rank: (row) => {
      const f = row?.sports_profile?.football;
      if (!f) return 0;
      const tierScore  = TIER_SCORE[f.competitive_tier] ?? 0;
      const cups       = f.cup_results ?? f.cup_competitions ?? [];
      const cupScore   = scoreCupResults(cups, { nationalBonus: true });
      const alumniProCount = (f.notable_alumni ?? []).filter(a =>
        /\b(premier league|championship|football league|la liga|bundesliga|serie a|england|professional|national team|fifa|world cup)\b/i.test(
          `${a.achievement || ''} ${a.notes || ''}`
        )
      ).length;
      const alumniScore = Math.min(alumniProCount * 2, 8);
      // school_teams_visible may be a primitive number or a provenanced
      // {value, source} object after the deterministic SOCS team-count
      // override. Read both shapes (mirrors tennis_strength).
      const teamsRaw = f.school_teams_visible?.value ?? f.school_teams_visible ?? 0;
      const teamsScore = Math.min(teamsRaw / 10, 3);
      return tierScore + cupScore + alumniScore + teamsScore;
    },

    format: (row, school) => {
      const f = row?.sports_profile?.football;
      if (!f) return null;
      const cups = (f.cup_results ?? f.cup_competitions ?? [])
        .map(c => `${c.tournament || ''} ${c.year || ''} ${c.result || ''}`.trim())
        .filter(Boolean)
        .join('; ');
      const alumni = (f.notable_alumni ?? [])
        .slice(0, 3)
        .map(a => a.name)
        .filter(Boolean)
        .join(', ');
      const teamsVal = f.school_teams_visible?.value ?? f.school_teams_visible;
      return [
        `${school.name} — football.`,
        f.competitive_tier && `Tier: ${f.competitive_tier}.`,
        cups   && `Cup results: ${cups}.`,
        alumni && `Alumni: ${alumni}.`,
        teamsVal != null && `Teams visible: ${teamsVal}.`,
        f.competitive_tier_reasoning && `Reasoning: ${f.competitive_tier_reasoning.slice(0, 250)}`,
      ].filter(Boolean).join(' ');
    },

    citations: (row) =>
      row?.sports_profile?.football?.evidence_urls ??
      row?.sports_profile?.source_urls ??
      [],
  },

  cricket_strength: {
    label:           'Cricket competitive strength',
    description:     'Competitive tier, national cup runs, ECB accreditation, notable alumni.',
    keywords:        /\b(cricket|cricketer|ecb|t20|wisden|county cricket|test cricket|first xi)\b/i,
    requires_field:  'sports_profile.cricket.competitive_tier',

    rank: (row) => {
      const c = row?.sports_profile?.cricket;
      if (!c) return 0;
      const tierScore = TIER_SCORE[c.competitive_tier] ?? 0;
      const cups      = c.cup_results ?? c.cup_competitions ?? [];
      const cupScore  = scoreCupResults(cups, { nationalBonus: true });
      const alumniProCount = (c.notable_alumni ?? []).filter(a =>
        /\b(test|odi|t20i|england|county|first[- ]class|professional|national team|ecb)\b/i.test(
          `${a.achievement || ''} ${a.notes || ''}`
        )
      ).length;
      const alumniScore = Math.min(alumniProCount * 2, 8);
      // school_teams_visible may be primitive or {value, source} provenance.
      const teamsRaw   = c.school_teams_visible?.value ?? c.school_teams_visible ?? 0;
      const teamsScore = Math.min(teamsRaw / 10, 3);
      // ECB accreditation is a meaningful but minor signal (programme quality).
      const ecbScore = c.ecb_accredited ? 2 : 0;
      return tierScore + cupScore + alumniScore + teamsScore + ecbScore;
    },

    format: (row, school) => {
      const c = row?.sports_profile?.cricket;
      if (!c) return null;
      const cups = (c.cup_results ?? c.cup_competitions ?? [])
        .map(x => `${x.tournament || ''} ${x.year || ''} ${x.result || ''}`.trim())
        .filter(Boolean)
        .join('; ');
      const alumni = (c.notable_alumni ?? [])
        .slice(0, 3)
        .map(a => a.name)
        .filter(Boolean)
        .join(', ');
      const teamsVal = c.school_teams_visible?.value ?? c.school_teams_visible;
      return [
        `${school.name} — cricket.`,
        c.competitive_tier && `Tier: ${c.competitive_tier}.`,
        c.ecb_accredited && `ECB accredited${c.ecb_accreditation_type ? ` (${c.ecb_accreditation_type})` : ''}.`,
        cups   && `Cup results: ${cups}.`,
        alumni && `Alumni: ${alumni}.`,
        teamsVal != null && `Teams visible: ${teamsVal}.`,
        c.competitive_tier_reasoning && `Reasoning: ${c.competitive_tier_reasoning.slice(0, 250)}`,
      ].filter(Boolean).join(' ');
    },

    citations: (row) =>
      row?.sports_profile?.cricket?.evidence_urls ??
      row?.sports_profile?.source_urls ??
      [],
  },

  hockey_strength: {
    label:           'Hockey competitive strength',
    description:     'Competitive tier, ISHC cup runs, astroturf facilities, notable alumni.',
    keywords:        /\b(hockey|ishc|england hockey|astro|astroturf|gb hockey|olympic hockey)\b/i,
    requires_field:  'sports_profile.hockey.competitive_tier',

    rank: (row) => {
      const h = row?.sports_profile?.hockey;
      if (!h) return 0;
      const tierScore = TIER_SCORE[h.competitive_tier] ?? 0;
      const cups      = h.cup_results ?? h.cup_competitions ?? [];
      const cupScore  = scoreCupResults(cups, { nationalBonus: true });
      const alumniProCount = (h.notable_alumni ?? []).filter(a =>
        /\b(gb|england|olympic|commonwealth|euro|world cup|professional|national squad|premier division)\b/i.test(
          `${a.achievement || ''} ${a.notes || ''}`
        )
      ).length;
      const alumniScore = Math.min(alumniProCount * 2, 8);
      // school_teams_visible may be primitive or {value, source} provenance.
      const teamsRaw    = h.school_teams_visible?.value ?? h.school_teams_visible ?? 0;
      const teamsScore  = Math.min(teamsRaw / 10, 3);
      // Astroturf pitches: most competitive school hockey is on astro;
      // multiple pitches signals investment + ability to run B/C/D teams.
      const astro       = h.astroturf_pitches ?? 0;
      const astroScore  = astro >= 2 ? 3 : astro >= 1 ? 1 : 0;
      return tierScore + cupScore + alumniScore + teamsScore + astroScore;
    },

    format: (row, school) => {
      const h = row?.sports_profile?.hockey;
      if (!h) return null;
      const cups = (h.cup_results ?? h.cup_competitions ?? [])
        .map(x => `${x.tournament || ''} ${x.year || ''} ${x.result || ''} ${x.gender ? `(${x.gender})` : ''}`.trim())
        .filter(Boolean)
        .join('; ');
      const alumni = (h.notable_alumni ?? [])
        .slice(0, 3)
        .map(a => a.name)
        .filter(Boolean)
        .join(', ');
      const teamsVal = h.school_teams_visible?.value ?? h.school_teams_visible;
      return [
        `${school.name} — hockey.`,
        h.competitive_tier && `Tier: ${h.competitive_tier}.`,
        h.astroturf_pitches != null && `Astroturf pitches: ${h.astroturf_pitches}.`,
        cups   && `Cup results: ${cups}.`,
        alumni && `Alumni: ${alumni}.`,
        teamsVal != null && `Teams visible: ${teamsVal}.`,
        h.competitive_tier_reasoning && `Reasoning: ${h.competitive_tier_reasoning.slice(0, 250)}`,
      ].filter(Boolean).join(' ');
    },

    citations: (row) =>
      row?.sports_profile?.hockey?.evidence_urls ??
      row?.sports_profile?.source_urls ??
      [],
  },

  academic_strength: {
    label:           'Academic strength',
    description:     'Exam results (GCSE / A-level / IB) and university destinations (Oxbridge, Russell Group).',
    keywords:        /\b(academic|academics|results|grades|gcse|a.?level|a level|ib|oxbridge|oxford|cambridge|russell|university|destinations|exam)\b/i,
    requires_field:  'exam_results',

    rank: (row) => {
      const ex = row?.exam_results;
      const ud = row?.university_destinations;
      let score = 0;
      if (ex?.gcse?.pct_7_to_9 != null)   score += ex.gcse.pct_7_to_9 / 10;
      if (ex?.gcse?.pct_8_and_9 != null)  score += ex.gcse.pct_8_and_9 / 5;
      if (ex?.gcse?.pct_9 != null)        score += ex.gcse.pct_9 / 3;
      if (ex?.a_level?.pct_a_star_a != null) score += ex.a_level.pct_a_star_a / 10;
      if (ex?.a_level?.pct_a_star != null)   score += ex.a_level.pct_a_star / 5;
      const oxbridge =
        ud?.oxbridge_acceptances ??
        ((ud?.oxford_count ?? 0) + (ud?.cambridge_count ?? 0));
      score += Math.min(oxbridge * 0.6, 12);
      score += Math.min((ud?.russell_group_count ?? 0) * 0.1, 5);
      score += Math.min((ud?.medicine_dentistry_vet_count ?? 0) * 0.2, 4);
      return score;
    },

    format: (row, school) => {
      const ex = row?.exam_results;
      const ud = row?.university_destinations;

      // Prefer normalised percentage fields over free-text `notes` so the
      // ranking summary line is comparable across schools. Some schools'
      // notes say "36 pupils got Grade 9s" (count) while others say
      // "92% A*-B" (percentage) — mixing them in a list breaks parents'
      // ability to compare. Numeric % first, notes only as fallback.
      const gcseStruct = [
        ex?.gcse?.pct_9        != null && `${Math.round(ex.gcse.pct_9)}% Grade 9`,
        ex?.gcse?.pct_8_and_9  != null && `${Math.round(ex.gcse.pct_8_and_9)}% Grade 8-9`,
        ex?.gcse?.pct_7_to_9   != null && `${Math.round(ex.gcse.pct_7_to_9)}% Grade 7-9`,
      ].filter(Boolean).join(', ');
      const aLevelStruct = [
        ex?.a_level?.pct_a_star    != null && `${Math.round(ex.a_level.pct_a_star)}% A*`,
        ex?.a_level?.pct_a_star_a  != null && `${Math.round(ex.a_level.pct_a_star_a)}% A*–A`,
      ].filter(Boolean).join(', ');

      const gcseLine    = gcseStruct    || (ex?.gcse?.notes    ? ex.gcse.notes.slice(0, 160) : null);
      const aLevelLine  = aLevelStruct  || (ex?.a_level?.notes ? ex.a_level.notes.slice(0, 160) : null);
      const ibLine      = ex?.ib?.notes ? ex.ib.notes.slice(0, 120) : null;

      const oxbridge =
        ud?.oxbridge_acceptances ??
        ((ud?.oxford_count ?? 0) + (ud?.cambridge_count ?? 0));
      const udParts = [
        oxbridge && `${oxbridge} Oxbridge`,
        ud?.russell_group_count && `${ud.russell_group_count} Russell Group`,
        ud?.medicine_dentistry_vet_count && `${ud.medicine_dentistry_vet_count} Medicine/Vet`,
      ].filter(Boolean).join(', ');

      return [
        `${school.name} — academics.`,
        gcseLine    && `GCSE: ${gcseLine}.`,
        aLevelLine  && `A-level: ${aLevelLine}.`,
        ibLine      && `IB: ${ibLine}.`,
        udParts     && `Destinations: ${udParts}.`,
      ].filter(Boolean).join(' ');
    },

    citations: (row) => {
      const out = [];
      if (row?.exam_results?.source_url) out.push(row.exam_results.source_url);
      const udUrls = row?.university_destinations?.source_urls;
      if (Array.isArray(udUrls)) out.push(...udUrls);
      return out;
    },
  },

  fees_value: {
    label:           'Fees & affordability',
    description:     'Annual fees, scholarship breadth, bursary provision.',
    keywords:        /\b(fees|fee|cost|costs|cheap|expensive|affordable|scholarship|bursary|price|under)\b/i,
    requires_field:  'fees_min',

    rank: (row) => {
      const fmin = parseFloat(row?.fees_min || 0);
      const fmax = parseFloat(row?.fees_max || 0);
      if (!fmin && !fmax) return 0;
      const avg = fmin && fmax ? (fmin + fmax) / 2 : (fmin || fmax);
      const feeScore = avg > 0 ? Math.min(100000 / avg, 6) : 0;
      const scholarshipsLen = Array.isArray(row?.scholarships_available)
        ? row.scholarships_available.length
        : 0;
      const scholarshipScore = Math.min(scholarshipsLen * 0.3, 2);
      const bursaryScore = row?.bursary_note ? 1 : 0;
      return feeScore + scholarshipScore + bursaryScore;
    },

    format: (row, school) => {
      const fmin = row?.fees_min;
      const fmax = row?.fees_max;
      const cur  = row?.fees_currency || 'GBP';
      const scholarships = (row?.scholarships_available || [])
        .slice(0, 3)
        .filter(Boolean)
        .join('; ');
      return [
        `${school.name} — fees.`,
        (fmin || fmax) && `Fees ${cur} ${fmin || '?'} – ${fmax || '?'} per year.`,
        scholarships && `Scholarships: ${scholarships}.`,
        row?.bursary_note && `Bursary: ${String(row.bursary_note).slice(0, 200)}.`,
      ].filter(Boolean).join(' ');
    },

    citations: (row) => {
      const out = [];
      if (row?.fees_by_grade?.source_url) out.push(row.fees_by_grade.source_url);
      return out;
    },
  },

  pastoral_model: {
    label:           'Pastoral & wellbeing',
    description:     'Pastoral structure, wellbeing staffing, published safeguarding policies.',
    keywords:        /\b(pastoral|wellbeing|happy|safe|safeguarding|bullying|mental health|house system|tutor|tutorial)\b/i,
    requires_field:  'pastoral_model',

    rank: (row) => {
      let score = 0;
      if (row?.pastoral_model && row.pastoral_model.length > 30) score += 3;
      const totalStaff = row?.wellbeing_staffing?.total_staff;
      if (totalStaff) score += Math.min(totalStaff / 4, 3);
      const ratio = row?.wellbeing_staffing?.ratio_per_pupil;
      if (ratio && ratio > 0) score += Math.min(50 / ratio, 3);
      if (row?.policies_summary?.bullying_policy_published === true) score += 2;
      if (row?.pastoral_care && row.pastoral_care.length > 100) score += 1;
      return score;
    },

    format: (row, school) => {
      const total = row?.wellbeing_staffing?.total_staff;
      const ratio = row?.wellbeing_staffing?.ratio_per_pupil;
      return [
        `${school.name} — pastoral.`,
        row?.pastoral_model && `Model: ${row.pastoral_model.slice(0, 200)}.`,
        total && `Wellbeing staff: ${total}${ratio ? ` (1 per ${ratio} pupils)` : ''}.`,
        row?.policies_summary?.bullying_policy_published === true && `Bullying policy: published.`,
        row?.pastoral_care && `Pastoral care: ${row.pastoral_care.slice(0, 200)}.`,
      ].filter(Boolean).join(' ');
    },

    citations: (row) => {
      const out = [];
      if (row?.policies_summary?.bullying_policy_url) out.push(row.policies_summary.bullying_policy_url);
      if (Array.isArray(row?.wellbeing_staffing?.source_urls)) {
        out.push(...row.wellbeing_staffing.source_urls);
      }
      return out;
    },
  },
};

/**
 * Hint to Claude about which dimensions match a question.
 * Returns dimension names whose keyword regex hits the question.
 * Claude is free to ignore the hint and pick any dimension.
 */
export function suggestDimensions(question) {
  const matched = [];
  for (const [name, dim] of Object.entries(DIMENSIONS)) {
    if (dim.keywords?.test(question)) matched.push(name);
  }
  return matched;
}

/**
 * Quality gate — does this row have enough data for the dimension to rank it?
 * Skips schools with thin coverage so they don't pollute leaderboards.
 */
export function hasRequiredData(row, dimensionName) {
  const dim = DIMENSIONS[dimensionName];
  if (!dim) return false;
  const v = getAt(row, dim.requires_field);
  return v != null && v !== '';
}

export function listDimensions() {
  return Object.entries(DIMENSIONS).map(([name, d]) => ({
    name,
    label: d.label,
    description: d.description,
  }));
}

/**
 * Map a dimension name to the school_structured_data fields a tool should
 * fetch when answering on that dimension. Returns null for unknown
 * dimensions — caller should fall back to `tools.js` getSchoolFacts default.
 *
 * Used by intent-router compare_two_on_dim plan (Phase 0.5a) to avoid
 * pulling 25KB sports_profile blobs on academic / fees / pastoral
 * comparisons.
 */
export function fieldsForDimension(dimensionName) {
  switch (dimensionName) {
    case 'tennis_strength':
    case 'rugby_standing':
    case 'football_strength':
    case 'cricket_strength':
    case 'hockey_strength':
      return ['sports_profile'];
    case 'academic_strength':
      return ['exam_results', 'university_destinations'];
    case 'fees_value':
      return ['fees_min', 'fees_max', 'fees_currency', 'fees_by_grade'];
    case 'pastoral_model':
      return ['pastoral_model', 'pastoral_care', 'wellbeing_staffing'];
    default:
      return null;
  }
}

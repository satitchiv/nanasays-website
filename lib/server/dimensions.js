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
//
// Vocabulary audit (2026-05-06) revealed two extractor labels missing from this
// map that were silently scoring 0:
//   - 'national'      → 29 rugby schools (rank 41-80 in Daily Mail Trophy per
//                       extractor reasoning) including Tonbridge, Sherborne,
//                       Bedford, Hampton, St Paul's London, Reed's, Whitgift,
//                       Sevenoaks, Rugby School, Oundle, Bromsgrove…
//   - 'recreational'  → 59 rugby schools (school-level only, often girls' /
//                       creative-focused schools where rugby isn't primary)
const TIER_SCORE = {
  'national-elite':  50,
  'national-strong': 25,
  'national':        18,  // mid-national tier (DMT rank 41-80 / SOCS top quartile)
  'regional':        10,
  'local':           5,
  'recreational':    5,   // synonym for "school-level only"
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

// ── Rugby layered scoring helpers (Phase 2 dimension 1) ─────────────────────
//
// Each helper takes the raw `sports_profile.rugby` object and returns a
// component score. They are intentionally pure + null-safe so the test
// harness (scripts/score-rugby.js) can import + score 138 schools without
// touching the dimension wrapper.

const RUGBY_TIER_SCORE = {
  'national-elite':  22,
  'national-strong': 16,
  'national':        11,
  'regional':         6,
  'recreational':     2,
  'local':            2,
  'unknown':          0,
};

// Cup classifiers — see formula design doc. National-cup pattern matches
// real RFU/national knockouts; festival pattern matches the major
// invitational sevens. Daily Mail Trophy is intentionally absent — it's a
// ranking and is scored via dmt_ranking instead.
const RUGBY_NATIONAL_CUP_RE =
  /\b(continental tyres|natwest cup|champions trophy|rfu u18|rfu schools|national schools cup|national cup|champions cup|youll cup|aberdare)\b/i;
const RUGBY_NATIONAL_FESTIVAL_RE =
  /\b(rosslyn park|national 7s|national sevens|national schools sevens)\b/i;
const RUGBY_DMT_SKIP_RE = /\b(daily mail|dmt)\b/i;

const RUGBY_CUP_NATIONAL_POINTS = {
  'winner':           6,
  'runner-up':        4,
  'finalist':         4,
  'national finalist':4,
  'semi-finalist':    2,
  'quarter-finalist': 1,
};
const RUGBY_CUP_FESTIVAL_POINTS = {
  'winner':           3,
  'regional winner':  3,
  'runner-up':        2,
  'finalist':         2,
  'semi-finalist':    1,
};

// Pro-pathway keyword filter for notable_alumni. Hits true England-senior /
// Lions / Premiership-club references, not "1st XV captain 1982".
const RUGBY_PRO_PATHWAY_RE =
  /\b(england\s+(captain|international|senior|world\s+cup|six\s+nations)|british\s+.{0,12}lions|premiership|six\s+nations|olympic|world\s+cup\s+winner|saracens|harlequins|bath\s+rugby|gloucester|exeter\s+chiefs|leicester\s+tigers|bristol\s+bears|sale\s+sharks|northampton\s+saints|wasps|professional\s+contract|first[- ]class)\b/i;

// Layer-3 partnership signal mined from competitive_tier_reasoning text.
// Matched only when a Premiership-club name appears NEAR a partnership word
// (avoids false positives where a club name is just an alumnus's employer).
// Bidirectional: real reasoning text uses both orderings — "Saracens
// partnership" (Tonbridge) AND "partnerships with Saracens" (Tonbridge again).
const RUGBY_PARTNERSHIP_CLUB_RE =
  /\b(saracens|harlequins|bath\s+rugby|leicester\s+tigers|gloucester|exeter\s+chiefs|bristol\s+bears|northampton\s+saints|sale\s+sharks|wasps)\b/i;
// Trailing \b would block plural "partnerships" / "academies" because `s`
// is a word char; we keep the leading \b and drop the trailing one to
// match common stems.
const RUGBY_PARTNERSHIP_WORD_RE =
  /\b(partnerships?|academ(?:y|ies)|alliances?|pathways?|alignment)/i;

// (Tradition bonus removed in Codex round 2: a hardcoded opinion in a
// production rank path isn't evidence-backed, even as a tiebreaker. The
// formula passes its golden criteria without it — Sedbergh stays #2,
// Wellington #1.)

// ── v3 additions (2026-05-06) ────────────────────────────────────────────
// Three new score components wire in extractor fields the v2 formula
// ignored: coaching pedigree, facilities depth, and live pathway players.
// All three are populated on a meaningful slice of UK rugby data
// (head_coach.notable 27/138, coaching_staff 71/138, facilities[] 87/138,
// current_pathway_players 32/138, academy_zone.external_partner 32/138).
// Codex v3 review approved the design with two tweaks: use max() across
// team-count proxies rather than summing them, and broaden the coaching
// regex separately from the alumni regex.

// Coaching credential regex — broader than alumni's pro-pathway regex.
// Coaches are described by credentials (RFU Level 4), past role
// (Director of Rugby at X, ex-academy manager), or playing pedigree
// (former Bath Rugby prop). Conservative — generic "experienced coach"
// shouldn't qualify for the 3-point pedigree bonus.
// Pro-club name list reused across the coaching pedigree branches. Kept
// as a string so it can be embedded into the broader regex below.
const RUGBY_PRO_CLUB_NAMES =
  'gloucester|saracens|harlequins|bath\\s+rugby|leicester\\s+tigers|exeter\\s+chiefs|bristol\\s+bears|northampton\\s+saints|sale\\s+sharks|wasps';

const RUGBY_COACHING_PEDIGREE_RE = new RegExp(
  '\\b(' +
    // Strong playing pedigree (subset of pro-pathway, restated for coaches)
    'former (?:england|wales|scotland|ireland|british .{0,10}lions|premiership|' + RUGBY_PRO_CLUB_NAMES + ')' +
    '|england\\s+(?:a|u\\d{2}|international|capped)' +
    '|(?:premiership|' + RUGBY_PRO_CLUB_NAMES + ')\\s+(?:player|prop|hooker|flanker|number 8|fly[- ]?half|scrum[- ]?half|centre|wing|fullback|captain)' +
    '|professional rugby (?:player|coach|career)' +
    '|(?:rfu|world rugby) level [3-5]' +
    // Codex round 3: tightened. v2 had "academy (coach|manager|director|partnership|head)"
    // which double-counted partnerships now scored in pathway_score; trimmed
    // to the actual coaching-role variants only.
    '|academy (?:coach|manager|director|head)' +
    // Codex round 3: tightened. v2 was "director of rugby at" (any context),
    // which matched "Director of Rugby at Harrow School". Restricted to
    // pro-club targets so it scores Wasps/Saracens-pedigree only.
    '|director of rugby at (?:' + RUGBY_PRO_CLUB_NAMES + ')' +
    '|international (?:coach|player)' +
  ')\\b', 'i'
);

// Coaching title regex — Director of Rugby / Head of Rugby is a
// structural commitment signal (full-time dedicated leadership) vs
// "Master in Charge" or a teacher-doubling-as-rugby-coach.
const RUGBY_COACHING_DOR_TITLE_RE = /\b(director of rugby|head of rugby|rugby professional)\b/i;

// Facilities keyword regex — picks out rugby-specific facility signals
// from the facilities[] array. Each distinct keyword is counted once.
const RUGBY_FACILITY_KEYWORDS_RE =
  /\b(astro\s*turf|astroturf|astro\s*pitch|3g\s*pitch|floodlit|floodlight|scrum\s*machine|analysis\s*(?:suite|room)|performance\s*analysis|hudl|sportscode|rugby\s*barn|indoor\s*training|s\s*(?:and|&)\s*c|strength\s*(?:and|&)\s*conditioning|rugby\s*pitch(?:es)?|rugby\s*facilit)/gi;

// Effective tier — extractor's `competitive_tier` floored against the
// school's best DMT rank in the last 5 seasons. Catches programmes in a
// current dip whose history clearly evidences a higher level (Tonbridge
// peak=11 but current=90, tagged 'national'; Whitgift peak=6 but current=45).
// Without this, the formula punishes a single down season too hard.
function rugbyEffectiveTier(rugby) {
  const labelled = rugby?.competitive_tier || 'unknown';
  const labelledScore = RUGBY_TIER_SCORE[labelled] ?? 0;
  const hist = Array.isArray(rugby?.dmt_ranking?.rank_history) ? rugby.dmt_ranking.rank_history : [];
  if (hist.length === 0) return labelled;
  const peak = Math.min(...hist.map(h => (typeof h?.rank === 'number' ? h.rank : Infinity)));
  const avg = rugby?.dmt_ranking?.rank_3y_avg;
  // Tier floor by peak — aligned with the extractor's own band definitions
  // (extract-rugby.js system prompt): national-elite = DMT top 10, national-
  // strong = DMT 11-40, national = DMT 41-80. A 5-year peak inside one of
  // these bands is evidence the programme can play at that level even if the
  // current season has dipped below.
  //
  // Codex round 2: the elite floor requires stronger evidence than a single
  // top-10 finish. Either ≥2 top-10 seasons OR 1 top-10 with rank_3y_avg ≤ 25
  // (sustained near-elite — the season was inside the top tier and the rest
  // weren't far below). Without this, schools like Rugby School (one rank-9
  // season followed by collapse to 89/68/45/30) get the full 22-point elite
  // tier on a single peak — too lenient for a multi-year programme score.
  const top10Seasons = hist.filter(h => typeof h?.rank === 'number' && h.rank <= 10).length;
  const elite_qualifies = top10Seasons >= 2
                       || (top10Seasons >= 1 && typeof avg === 'number' && avg <= 25);
  let floorTier = labelled;
  if (elite_qualifies && labelledScore < RUGBY_TIER_SCORE['national-elite']) floorTier = 'national-elite';
  else if (peak <= 40 && labelledScore < RUGBY_TIER_SCORE['national-strong']) floorTier = 'national-strong';
  else if (peak <= 80 && labelledScore < RUGBY_TIER_SCORE['national'])        floorTier = 'national';
  return floorTier;
}

function rugbyTierScore(rugby) {
  return RUGBY_TIER_SCORE[rugbyEffectiveTier(rugby)] ?? 0;
}

function rugbyDmtScore(rugby) {
  const dmt = rugby?.dmt_ranking;
  if (!dmt) return 0;
  const cur = dmt.current_rank;
  const avg = dmt.rank_3y_avg;
  const hist = Array.isArray(dmt.rank_history) ? dmt.rank_history : [];

  // Current-season rank — capped at 8 so a single hot season can't dominate.
  // Tuning rationale (2026-05-06): v1 weighted current_rank up to 10 which
  // over-rewarded one-season flukes. Top-rugby identity is the multi-year
  // average; current is the corroborating signal.
  const curScore =
    cur == null ? 0 :
    cur <=   5  ? 8 :
    cur <=  10  ? 6 :
    cur <=  25  ? 4 :
    cur <=  50  ? 3 :
    cur <= 100  ? 1 : 0;

  // 3-year average — the dominant DMT sub-signal. Sustained top-10 average
  // (Sedbergh 10, Wellington/Brighton ~11) is the strongest correctness gate.
  const avgScore =
    avg == null ? 0 :
    avg <=  10  ? 8 :
    avg <=  25  ? 6 :
    avg <=  50  ? 3 : 0;

  // Historic-peak signal: the best (lowest) rank in the last 5 seasons.
  // Catches schools currently in a dip (Tonbridge cur=90 was 11, Whitgift
  // cur=45 was 6) without overvaluing a one-season high.
  const peak = hist.length
    ? Math.min(...hist.map(h => (typeof h?.rank === 'number' ? h.rank : Infinity)))
    : Infinity;
  const peakScore =
    peak <=  5  ? 4 :
    peak <= 15  ? 3 :
    peak <= 30  ? 2 : 0;

  // Consistency: count of seasons in top-30 across the rank history.
  const top30Seasons = hist.filter(h => typeof h?.rank === 'number' && h.rank <= 30).length;
  const trajScore =
    top30Seasons >= 4 ? 4 :
    top30Seasons >= 3 ? 3 :
    top30Seasons >= 2 ? 2 : 0;

  return Math.min(curScore + avgScore + peakScore + trajScore, 22);
}

function rugbySocsScore(rugby) {
  const rows = rugby?.socs?.performance;
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  const cur = rows.find(r => r?.is_live) || rows[0];
  if (!cur || !cur.total || !cur.rank) return 0;
  const ratio = cur.rank / cur.total;
  return ratio < 0.05 ? 8
       : ratio < 0.10 ? 6
       : ratio < 0.20 ? 4
       : ratio < 0.35 ? 2 : 0;
}

function rugbyCupScore(rugby) {
  const cups = rugby?.cup_results;
  if (!Array.isArray(cups) || cups.length === 0) return 0;
  let total = 0;
  for (const c of cups) {
    const tournament = (c?.tournament || '').toString();
    if (RUGBY_DMT_SKIP_RE.test(tournament)) continue;  // dedupe vs dmt_score
    const result = (c?.result || '').toString().toLowerCase().trim();
    if (RUGBY_NATIONAL_CUP_RE.test(tournament)) {
      total += RUGBY_CUP_NATIONAL_POINTS[result] ?? 0;
    } else if (RUGBY_NATIONAL_FESTIVAL_RE.test(tournament)) {
      total += RUGBY_CUP_FESTIVAL_POINTS[result] ?? 0;
    }
    // Regional/county cups score 0 — they don't differentiate top schools.
  }
  return Math.min(total, 18);
}

function rugbyDepthScore(rugby) {
  // Three independent team-count proxies. Codex v3 directive: take max() —
  // they're all evidence for the same thing, so summing them double-counts.

  // Source 1: school_teams_visible (dual-shape from extractors).
  const stv = rugby?.school_teams_visible;
  let stvTeamCountScore = 0;
  if (stv && typeof stv === 'object' && typeof stv.value === 'number') {
    // SOCS deterministic counter — narrow scale (1–15).
    const v = stv.value;
    stvTeamCountScore = v >= 8 ? 3 : v >= 5 ? 2 : v >= 3 ? 1 : 0;
  } else if (typeof stv === 'number') {
    // Legacy extractor — wide scale (0–52).
    stvTeamCountScore = stv >= 25 ? 3 : stv >= 15 ? 2 : stv >= 8 ? 1 : 0;
  }

  // Source 2: programmes[].team_levels[] — the most faithful structured
  // signal (Oakham 21 distinct teams, Radley 23, Tonbridge 22). 70%
  // populated; this should win when present.
  const programmes = Array.isArray(rugby?.programmes) ? rugby.programmes : [];
  const allTeamLevels = programmes.flatMap(p =>
    Array.isArray(p?.team_levels) ? p.team_levels : []);
  const distinctTeams = new Set(
    allTeamLevels
      .map(t => (t == null ? '' : t.toString().toLowerCase().trim()))
      .filter(Boolean)
  );
  const programmeTeamCountScore =
    distinctTeams.size >= 20 ? 3 :
    distinctTeams.size >= 14 ? 2 :
    distinctTeams.size >=  8 ? 1 : 0;

  // Source 3: reasoning-text team count (legacy fallback for schools
  // without programmes[] but with "26 distinct rugby teams" in the
  // tier reasoning).
  const reason = (rugby?.competitive_tier_reasoning || '').toString();
  let bestTeams = 0;
  const teamMatches = [...reason.matchAll(/(\d+)\s+(?:[\w-]+\s+){0,3}teams?\b/gi)];
  for (const m of teamMatches) {
    const idx = m.index ?? 0;
    const ctx = reason.slice(Math.max(0, idx - 60), idx + m[0].length + 30);
    if (/rugby/i.test(ctx)) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > bestTeams) bestTeams = n;
    }
  }
  const reasonTeamCountScore =
    bestTeams >= 30 ? 3 :
    bestTeams >= 20 ? 2 :
    bestTeams >= 12 ? 1 : 0;

  // Codex v3: max() across competing proxies, not sum.
  const teamCountScore = Math.max(stvTeamCountScore, programmeTeamCountScore, reasonTeamCountScore);

  // Age-group span — pathway breadth from U12 → 1st XV signals true depth.
  const allAgeGroups = programmes.flatMap(p =>
    Array.isArray(p?.age_groups) ? p.age_groups : []);
  const distinctAges = new Set(
    allAgeGroups
      .map(a => (a == null ? '' : a.toString().toLowerCase().replace(/\s/g, '')))
      .filter(Boolean)
  );
  const ageSpanScore = distinctAges.size >= 6 ? 1 : 0;

  // Partnership signal moved to rugbyPathwayScore (Codex v3 directive)
  // so structured `academy_zone.external_partner` and reasoning-text
  // mining live in one place rather than double-counting here.
  return Math.min(teamCountScore + ageSpanScore, 4);
}

// Coaching pedigree + structural commitment + staff size.
function rugbyCoachingScore(rugby) {
  const hc = rugby?.head_coach || {};
  const notableText = [hc?.notable, hc?.role, hc?.title].filter(Boolean).join(' ');
  const titleText   = [hc?.title,   hc?.role].filter(Boolean).join(' ');
  const staff = Array.isArray(rugby?.coaching_staff) ? rugby.coaching_staff : [];

  // Pedigree signal — ex-pro / international / RFU L3-5 / academy role.
  // Conservative: text must hit one of the named credentials, not just
  // mention "experienced coach" or generic title.
  const headPedigreeScore = RUGBY_COACHING_PEDIGREE_RE.test(notableText) ? 3 : 0;

  // Structural commitment — full-time dedicated rugby leadership title
  // (Director of Rugby / Head of Rugby) vs ad-hoc "Master in Charge".
  const dorTitleScore = RUGBY_COACHING_DOR_TITLE_RE.test(titleText) ? 1 : 0;

  // Staff size as a programme-depth proxy. Coaches are usually structured
  // by year group or backs/forwards — a deep programme runs 5+ named
  // coaches across age groups.
  const staffSize = staff.filter(s => s?.name).length;
  const staffScore = staffSize >= 6 ? 2 : staffSize >= 3 ? 1 : 0;

  return Math.min(headPedigreeScore + dorTitleScore + staffScore, 6);
}

// Facilities — rugby-specific kit + sheer breadth.
function rugbyFacilitiesScore(rugby) {
  const f = rugby?.facilities;
  // Schema variant: Harrow has facilities as an object (newer extractor).
  // The object form lists boolean fields per facility type — we don't
  // score it for v3 (1 school out of 138), but we pass through gracefully.
  if (!Array.isArray(f) || f.length === 0) return 0;

  const text = f.map(x => (x == null ? '' : x.toString())).join(' | ').toLowerCase();
  const matches = text.match(RUGBY_FACILITY_KEYWORDS_RE) || [];
  const keywordHits = new Set(matches.map(m => m.toLowerCase().replace(/\s+/g, ' ')));

  // Two signals: (a) any structured facilities array of meaningful size;
  // (b) how many distinct rugby-specific keywords show up.
  const baseScore = f.length >= 5 ? 1 : 0;
  const keywordScore =
    keywordHits.size >= 4 ? 3 :
    keywordHits.size >= 2 ? 2 :
    keywordHits.size >= 1 ? 1 : 0;
  return Math.min(baseScore + keywordScore, 4);
}

// Pathway = live academy players + structured partnership + scholarship.
// Owns the partnership signal (was in rugbyDepthScore in v2).
function rugbyPathwayScore(rugby) {
  let score = 0;

  // Live pathway players — current pupils with England U18 / academy
  // contracts. Direct future-pro signal.
  const players = Array.isArray(rugby?.current_pathway_players) ? rugby.current_pathway_players : [];
  const pathwayCount = players.filter(p => p?.name && p?.level).length;
  score += pathwayCount >= 3 ? 2 : pathwayCount >= 1 ? 1 : 0;

  // Premiership-club partnership: structured field is primary; reasoning-
  // text + head-coach text is fallback when the structured field is
  // empty (avoids double-counting Oakham's Leicester Tigers tie that's
  // mentioned in BOTH academy_zone AND head_coach.notable).
  const structuredPartner = (rugby?.academy_zone?.external_partner || '').toString();
  let partnershipPoints = 0;
  if (RUGBY_PARTNERSHIP_CLUB_RE.test(structuredPartner)) {
    partnershipPoints = 1;
  } else {
    const reason = (rugby?.competitive_tier_reasoning || '').toString();
    const coachNotable = (rugby?.head_coach?.notable || '').toString();
    const fallbackText = `${reason}\n${coachNotable}`;
    const clubsHit = new Set();
    for (const m of fallbackText.matchAll(new RegExp(RUGBY_PARTNERSHIP_CLUB_RE.source, 'gi'))) {
      const idx = m.index ?? 0;
      const window = fallbackText.slice(Math.max(0, idx - 25), idx + m[0].length + 25);
      if (RUGBY_PARTNERSHIP_WORD_RE.test(window)) clubsHit.add(m[1].toLowerCase());
    }
    partnershipPoints = clubsHit.size >= 2 ? 2 : clubsHit.size >= 1 ? 1 : 0;
  }
  score += partnershipPoints;

  // Rugby academy scholarship — institutional commitment to recruiting
  // and developing rugby talent. Boolean.
  if (rugby?.academy_scholarship === true) score += 1;

  return Math.min(score, 4);
}

function rugbyAlumniScore(rugby) {
  const alumni = rugby?.notable_alumni;
  if (!Array.isArray(alumni) || alumni.length === 0) return 0;
  let pathwayHits = 0;
  for (const a of alumni) {
    const text = [
      a?.known_for, a?.achievement, a?.notes, a?.current_role, a?.level,
    ].filter(Boolean).join(' ');
    if (RUGBY_PRO_PATHWAY_RE.test(text)) pathwayHits += 1;
  }
  return pathwayHits >= 3 ? 6
       : pathwayHits >= 2 ? 4
       : pathwayHits >= 1 ? 2 : 0;
}

/**
 * Full breakdown for a school's rugby block. Used by `rugby_standing.rank`
 * and exported for the test harness. `slug` is optional — only needed if
 * you want the tradition bonus folded in.
 */
export function rugbyScoreBreakdown(rugby, slug = null) {
  const tier       = rugbyTierScore(rugby);
  const dmt        = rugbyDmtScore(rugby);
  const socs       = rugbySocsScore(rugby);
  const cup        = rugbyCupScore(rugby);
  const depth      = rugbyDepthScore(rugby);
  const alumni     = rugbyAlumniScore(rugby);
  const coaching   = rugbyCoachingScore(rugby);
  const facilities = rugbyFacilitiesScore(rugby);
  const pathway    = rugbyPathwayScore(rugby);
  const total = tier + dmt + socs + cup + depth + alumni + coaching + facilities + pathway;
  // `slug` parameter retained (signature compat) but no longer consumed —
  // tradition bonus was dropped in Codex round 2.
  void slug;
  return { tier, dmt, socs, cup, depth, alumni, coaching, facilities, pathway, total };
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
    description:     'Competitive tier, DMT / SOCS rankings, cup runs, programme depth, pro alumni pathway.',
    keywords:        /\b(rugby|scrum|lineout|dmt|daily mail trophy|continental tyres)\b/i,
    requires_field:  'sports_profile.rugby.competitive_tier',

    // Layered model (Phase 2 dimension 1, 2026-05-06).
    // Total = tier + dmt + socs + cup + depth + alumni + coaching +
    // facilities + pathway  (range 0..94; max 22+22+8+18+4+6+6+4+4). v3
    // adds coaching pedigree (head_coach.notable + DoR title + staff
    // size), facilities (rugby-specific keyword density), and pathway
    // (live academy players + structured Premiership-club partner +
    // scholarship flag).
    // Design + golden test in ~/notes/phase2-rugby-{golden,formula-design}.md.
    //
    // Hidden-bug fixes vs Phase 1:
    //   - DMT key is `current_rank`, not `rank` (old code always read undefined → 0).
    //   - notable_alumni text lives in `known_for` for most schools and `achievement`
    //     for some (e.g. Harrow); old code only checked `achievement`/`notes`.
    //   - cup_results sometimes contains Daily Mail Trophy entries — those are
    //     rankings, not knockouts; we skip them so DMT isn't double-counted.
    //   - school_teams_visible is dual-shape: legacy bare-number (range 0..52, all
    //     team mentions) vs newer SOCS deterministic counter (range 1..15, unique
    //     TID anchors only). Different scales — score branches per shape.
    rank: (row) => row?.sports_profile?.rugby
      ? rugbyScoreBreakdown(row.sports_profile.rugby, row.school_slug ?? null).total
      : 0,

    format: (row, school) => {
      const r = row?.sports_profile?.rugby;
      if (!r) return null;
      const cur = r.dmt_ranking?.current_rank;
      const avg = r.dmt_ranking?.rank_3y_avg;
      const socsCur = (r.socs?.performance ?? []).find(s => s.is_live)
                  || (r.socs?.performance ?? [])[0];
      const cups = (r.cup_results ?? [])
        .filter(c => !/daily mail|dmt/i.test(c.tournament || ''))
        .map(c => `${c.tournament || ''} ${c.year || ''} ${c.result || ''}`.trim())
        .filter(Boolean)
        .join('; ');
      return [
        `${school.name} — rugby.`,
        r.competitive_tier && `Tier: ${r.competitive_tier}.`,
        cur && `DMT current rank: ${cur}${avg ? ` (3y avg ${avg})` : ''}.`,
        socsCur?.rank && socsCur?.total &&
          `SOCS Performance: rank ${socsCur.rank}/${socsCur.total} (${socsCur.season}).`,
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

  // ─────────────────────────────────────────────────────────────────────────
  // P8 (research-panel-excellence-plan.md): five new dimensions, all SHIPPED
  // DISABLED. They will not appear in suggestDimensions() output, listDimensions()
  // output, or any rankSchools/compareSchools call until their `enabled` flag
  // is flipped to true. Flip per-dim only after P6/P7 produces ≥50% UK coverage
  // on the underlying field AND golden ranking on 10 known-tier schools matches.
  // ─────────────────────────────────────────────────────────────────────────

  safeguarding_integrity: {
    enabled: true,  // T4.16 P10 (2026-05-09): source-backed ISI smoke passed.
    label:           'Safeguarding & inspection record',
    description:     'Latest ISI inspection compliance + educational quality + named concerns. Sources: school_facts dimension=safeguarding (parsed from ISI PDFs).',
    keywords:        /\b(safe|safeguarding|inspection|isi|compliance|complaint|sanction)\b/i,
    requires_field:  'safeguarding_facts',
    rank: (row) => {
      // row.safeguarding_facts is a normalized {compliance, quality, concerns_count} shape
      // assembled by tools.js when this dim is enabled. Until then, returns 0.
      const f = row?.safeguarding_facts;
      if (!f) return 0;
      let score = 0;
      if (f.compliance === 'met') score += 5;
      else if (f.compliance === 'partially_met') score += 2;
      if (f.quality === 'excellent') score += 4;
      else if (f.quality === 'good') score += 3;
      else if (f.quality === 'sound') score += 1;
      if (typeof f.concerns_count === 'number') score -= Math.min(f.concerns_count, 3);
      return Math.max(0, score);
    },
    format: (row, school) => {
      const f = row?.safeguarding_facts;
      if (!f) return `${school.name} — safeguarding: no parsed inspection data.`;
      return `${school.name} — ISI compliance: ${f.compliance ?? 'unknown'}; quality: ${f.quality ?? 'unknown'}; ${f.concerns_count ?? 0} key concerns.`;
    },
    citations: (row) => row?.safeguarding_facts?.sources ?? [],
  },

  weekend_life: {
    enabled: true,  // T4.16 P10 (2026-05-09): source-backed smoke passed for first dim enable.
    label:           'Weekend life',
    description:     'How weekends are structured for boarders — full programme vs flexi-home vs limited.',
    keywords:        /\b(weekend|saturday|sunday|trip|free time|home for weekend)\b/i,
    requires_field:  'weekend_life_facts',
    rank: (row) => {
      const f = row?.weekend_life_facts;
      if (!f) return 0;
      let score = 0;
      if (f.weekend_freedom === 'full_weekend_program') score += 4;
      else if (f.weekend_freedom === 'optional_weekend_activities') score += 2;
      if (f.saturday_school === true) score += 1;
      if (f.day_trips === true) score += 1;
      return score;
    },
    format: (row, school) => {
      const f = row?.weekend_life_facts;
      if (!f) return `${school.name} — weekend life: no extracted data.`;
      return `${school.name} — weekends: ${f.weekend_freedom ?? 'unknown'}${f.saturday_school ? ', Sat school' : ''}${f.day_trips ? ', day trips' : ''}.`;
    },
    citations: (row) => row?.weekend_life_facts?.sources ?? [],
  },

  ethos_match: {
    enabled: true,  // T4.16 P10 (2026-05-09): source-backed ethos smoke passed after provenance backfill.
    label:           'Ethos match',
    description:     'School ethos (C of E / RC / secular / faith / mixed) vs parent preference.',
    keywords:        /\b(ethos|christian|catholic|cofe|secular|faith|religious|values|chapel)\b/i,
    requires_field:  'ethos_facts',
    rank: (row, ctx) => {
      const f = row?.ethos_facts;
      if (!f) return 0;
      const want = ctx?.parent?.ethos_pref ?? null;
      if (!want) return 0;
      let score = 1;
      if (f.ethos_label === want) score += 4;
      else if (f.ethos_label === 'mixed_faith') score += 2;
      return score;
    },
    format: (row, school) => {
      const f = row?.ethos_facts;
      if (!f) return `${school.name} — ethos: no extracted data.`;
      return `${school.name} — ethos: ${f.ethos_label ?? 'unknown'}.`;
    },
    citations: (row) => row?.ethos_facts?.sources ?? [],
  },

  intl_share: {
    // T4.16 Gap B wiring is live, but source-backed coverage is too sparse
    // for production ranking after the 2026-05-09 citation gate.
    enabled: false,
    label:           'International pupil %',
    description:     '% of pupils who are international / overseas. Pulled from school_facts dim=intl_pupils_pct.',
    keywords:        /\b(international|overseas|abroad|foreign|expat)\b/i,
    requires_field:  'intl_facts',
    rank: (row, ctx) => {
      const pct = row?.intl_facts?.intl_pct_overall;
      if (typeof pct !== 'number') return 0;
      const want = ctx?.parent?.intl_pref ?? null;
      if (!want) return 0;
      if (want === 'low') return Math.max(0, 5 - pct / 10);
      return Math.min(pct / 10, 5);
    },
    format: (row, school) => {
      const pct = row?.intl_facts?.intl_pct_overall;
      if (typeof pct !== 'number') return `${school.name} — intl share: no data.`;
      return `${school.name} — international pupils: ${pct.toFixed(1)}%.`;
    },
    citations: (row) => row?.intl_facts?.sources ?? [],
  },

  // ── ISI deep extraction (2026-05-10) ─────────────────────────────────────
  // Three scorers that read the same `isi_deep_facts` bundle. Bundle shape
  // documented in tools.js loadDimFactsBundles(). Coverage: 397 active facts
  // across 44 schools. inclusive_culture + pastoral_care are enabled live;
  // teaching_quality_isi stays disabled (1/44 schools, 2024+ ISI format
  // dropped quality grades).

  inclusive_culture: {
    // Enabled 2026-05-10 after Codex Step 8 R1+R2 review (router phrase
    // priority + shared isi-deep mapper + formatter wellbeing fix all
    // landed). 14/44 schools have lgbtq_inclusion + 43 have diversity_culture
    // + 43 have pupil_voice. Most schools produce non-zero scores.
    enabled: true,
    label:           'Inclusive culture',
    description:     'LGBTQ+ inclusion, diversity culture, and pupil voice — sourced from ISI inspection reports.',
    keywords:        /\b(inclusiv|inclusion|lgbtq|diversity|belonging|culture|pupil voice)\b/i,
    requires_field:  'isi_deep_facts',
    rank: (row, ctx) => {
      const f = row?.isi_deep_facts;
      if (!f) return 0;
      // Gate-3 contract: null short-circuit when parent didn't express a preference.
      const want = ctx?.parent?.lgbtq_pref ?? null;
      if (!want) return 0;

      // LGBTQ+ signal (5-point) — detail trumps signal when present, since
      // detail captures the qualitative strength (e.g. active_pupil_led_group
      // is the strongest evidence of inclusive culture).
      const lgbtqDetailMap = {
        active_pupil_led_group: 5,
        explicitly_taught:      4,
        mentioned_in_policy:    3,
        not_mentioned:          1,
      };
      const lgbtqSignalFallbackMap = { strong: 4, present: 3, limited: 2 };

      const diversitySignalMap = { strong: 3, present: 2, limited: 1 };
      const pupilVoiceSignalMap = { strong: 2, present: 1, limited: 1 };

      const lgbtqDetail = f.lgbtq_detail;
      const lgbtqScore = (lgbtqDetail && lgbtqDetailMap[lgbtqDetail])
        ?? lgbtqSignalFallbackMap[f.lgbtq_signal]
        ?? 0;
      const diversityScore = diversitySignalMap[f.diversity_signal] ?? 0;
      const pupilVoiceScore = pupilVoiceSignalMap[f.pupil_voice_signal] ?? 0;

      const total = lgbtqScore + diversityScore + pupilVoiceScore;  // 0-10
      // Parent who said lgbtq is "important" wants positive scores;
      // 'no-preference' was normalized to null in ctx.parent → already
      // short-circuited above.
      return want === 'important' ? total : 0;
    },
    format: (row, school) => {
      const f = row?.isi_deep_facts;
      if (!f) return `${school.name} — inclusive culture: no ISI data.`;
      const parts = [];
      if (f.lgbtq_detail) parts.push(`LGBTQ+: ${f.lgbtq_detail.replace(/_/g, ' ')}`);
      else if (f.lgbtq_signal) parts.push(`LGBTQ+: ${f.lgbtq_signal}`);
      if (f.diversity_signal) parts.push(`diversity: ${f.diversity_signal}`);
      if (f.pupil_voice_signal) parts.push(`pupil voice: ${f.pupil_voice_signal}`);
      if (parts.length === 0) return `${school.name} — ISI report did not address inclusive culture.`;
      return `${school.name} — ${parts.join('; ')}.`;
    },
    citations: (row) => row?.isi_deep_facts?.sources ?? [],
  },

  pastoral_care: {
    // Enabled 2026-05-10 after Codex Step 8 R1+R2 review. 21/44 schools
    // have bullying_culture + 31 mental_health + 41 wellbeing_spaces.
    enabled: true,
    label:           'Pastoral care',
    description:     'Mental health support, anti-bullying culture, and PSHE quality — from ISI inspection reports.',
    keywords:        /\b(pastoral|wellbeing|mental health|bullying|counsell|welfare|support)\b/i,
    requires_field:  'isi_deep_facts',
    rank: (row, ctx) => {
      const f = row?.isi_deep_facts;
      if (!f) return 0;
      const want = ctx?.parent?.pastoral_pref ?? null;
      if (!want) return 0;

      // Bullying — detail trumps signal when present (controlled vocab).
      const bullyingDetailMap = {
        rare_swiftly_addressed: 5,
        rare:                   4,
        addressed:              3,
        concern_noted:          1,
        not_mentioned:          2,
      };
      const bullyingSignalFallbackMap = { strong: 4, present: 3, limited: 2 };

      // Mental health — detail also trumps signal.
      const mentalHealthDetailMap = {
        on_site_plus_external: 5,
        on_site_staff:         4,
        external_only:         2,
        not_mentioned:         1,
      };
      const mentalHealthSignalFallbackMap = { strong: 4, present: 3, limited: 2 };

      const psheGradeMap = { excellent: 3, good: 2, sound: 1, unsatisfactory: 0, not_assessed: 1 };
      const wellbeingSignalMap = { strong: 2, present: 1, limited: 1 };

      const bullyingScore     = (f.bullying_detail && bullyingDetailMap[f.bullying_detail])
        ?? bullyingSignalFallbackMap[f.bullying_signal] ?? 0;
      const mentalHealthScore = (f.mental_health_detail && mentalHealthDetailMap[f.mental_health_detail])
        ?? mentalHealthSignalFallbackMap[f.mental_health_signal] ?? 0;
      const psheScore         = psheGradeMap[f.pshe_grade] ?? 0;
      const wellbeingScore    = wellbeingSignalMap[f.wellbeing_spaces_signal] ?? 0;

      const total = bullyingScore + mentalHealthScore + psheScore + wellbeingScore;  // 0-15
      // 'high_priority' wants the full score; 'standard' weighs it less.
      if (want === 'high_priority') return total;
      if (want === 'standard')      return total * 0.5;
      return 0;
    },
    format: (row, school) => {
      const f = row?.isi_deep_facts;
      if (!f) return `${school.name} — pastoral care: no ISI data.`;
      const parts = [];
      if (f.bullying_detail) parts.push(`bullying ${f.bullying_detail.replace(/_/g, ' ')}`);
      else if (f.bullying_signal) parts.push(`bullying ${f.bullying_signal}`);
      if (f.mental_health_detail) parts.push(`mental health ${f.mental_health_detail.replace(/_/g, ' ')}`);
      else if (f.mental_health_signal) parts.push(`mental health ${f.mental_health_signal}`);
      if (f.pshe_grade) parts.push(`PSHE ${f.pshe_grade}`);
      // Codex Step 8 finding #4: rank() reads wellbeing_spaces but format()
      // didn't, so a wellbeing-only score would summarise as "no data".
      if (f.wellbeing_spaces_signal) parts.push(`wellbeing spaces ${f.wellbeing_spaces_signal}`);
      if (parts.length === 0) return `${school.name} — ISI report did not address pastoral care.`;
      return `${school.name} — ${parts.join('; ')}.`;
    },
    citations: (row) => row?.isi_deep_facts?.sources ?? [],
  },

  teaching_quality_isi: {
    enabled: false,
    label:           'Teaching quality (ISI)',
    description:     'Quality of teaching as graded by ISI inspectors. Only available for old-format inspections (2022-2023).',
    keywords:        /\b(teaching|academic|lessons|teachers|classroom|learning quality)\b/i,
    requires_field:  'isi_deep_facts',
    rank: (row, ctx) => {
      const f = row?.isi_deep_facts;
      if (!f) return 0;
      // No parent-pref gate — teaching quality is universally signal-positive
      // for academic-leaning families. ctx is allowed to be undefined.
      const gradeMap = { excellent: 5, good: 4, sound: 3, unsatisfactory: 1, not_assessed: 0 };
      return gradeMap[f.teaching_grade] ?? 0;
    },
    format: (row, school) => {
      const f = row?.isi_deep_facts;
      if (!f) return `${school.name} — teaching quality (ISI): no data.`;
      if (!f.teaching_grade) return `${school.name} — teaching grade not assessed (post-2024 ISI format does not assign quality grades).`;
      return `${school.name} — ISI teaching quality: ${f.teaching_grade}.`;
    },
    citations: (row) => row?.isi_deep_facts?.sources ?? [],
  },

  device_policy: {
    // T4.16 Gap B wiring is live, but source-backed coverage is too sparse
    // for production ranking after the 2026-05-09 citation gate.
    enabled: false,
    label:           'Phone / device policy',
    description:     'Are phones banned / restricted / open? Pulled from school_facts dim=device_policy.',
    keywords:        /\b(phone|mobile|device|screen|smartphone)\b/i,
    requires_field:  'device_policy_facts',
    rank: (row, ctx) => {
      const f = row?.device_policy_facts;
      if (!f) return 0;
      // Pre-enable-1 r1 (Codex): null-short-circuit when parent has no phone
      // preference — matches the gate-3/4 contract used by intl_share +
      // ethos_match. A neutral 0 is the right "no signal" reading; defaulting
      // to 'strict' was an opinionated guess that biased scoring before the
      // parent expressed a view.
      const want = ctx?.parent?.phone_pref ?? null;
      if (!want) return 0;
      const map = {
        phones_banned_full: 5,
        phones_banned_during_school: 4,
        phones_restricted_lower_school: 3,
        phones_allowed_supervised: 2,
        phones_allowed_open: 1,
      };
      const score = map[f.phone_policy];
      // Pre-enable-1 r2 (Codex): unknown/missing phone_policy must score 0,
      // not invert to 6 under 'flexible'. Previously `score ?? 0` then
      // `6 - 0 = 6` gave max points to no-data.
      if (typeof score !== 'number') return 0;
      return want === 'flexible' ? 6 - score : score;
    },
    format: (row, school) => {
      const f = row?.device_policy_facts;
      if (!f) return `${school.name} — device policy: no data.`;
      return `${school.name} — phones: ${f.phone_policy ?? 'unknown'}.`;
    },
    citations: (row) => row?.device_policy_facts?.sources ?? [],
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
    // P8: dims with `enabled: false` are coding-ahead-of-data — skip until
    // their underlying P6/P7 facts populate to ≥50% UK coverage.
    if (dim.enabled === false) continue;
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
  if (dim.enabled === false) return false; // P8: don't accept disabled dims
  const v = getAt(row, dim.requires_field);
  return v != null && v !== '';
}

export function listDimensions() {
  return Object.entries(DIMENSIONS)
    .filter(([, d]) => d.enabled !== false) // P8: hide disabled dims
    .map(([name, d]) => ({
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

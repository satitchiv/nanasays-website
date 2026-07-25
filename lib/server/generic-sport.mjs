// generic-sport.mjs — registry + deterministic scorer for sports WITHOUT a
// dedicated *_strength dimension (golf, swimming, rowing, …).
//
// Why this exists (2026-07-05): parents ask "which schools are best for
// golf?" and the chat had NO deterministic path — golf isn't one of the five
// extracted sports (tennis/rugby/football/cricket/hockey), so detectDimension
// returned null, the question fell to the slow agentic loop, and even there
// rankSchools had no dimension to rank on. Meanwhile the GENERIC fields of
// school_structured_data.sports_profile already carry real evidence for
// ~35 sports across 158 schools (measured live 2026-07-05: golf appears in
// 104 profiles, swimming 133, rowing 50):
//
//   signature_sports[]        — school's headline sports
//   sport_categories          — { major[], academy[], optional[] }
//   sports_offered[]          — every sport mentioned
//   teams_by_sport[]          — { sport, gender, team_count, team_levels[] }
//   competitions_entered[]    — { name, scope, sport, featured, … }
//   recent_achievements[]     — free-shape objects/strings
//   facilities[]              — free-text strings ("Five par-3 practice holes")
//   scholarships              — object (sport scholarship notes)
//   coaching_staff[]          — free-shape objects
//   representative_honours    — free shape
//   source_urls[]             — citation URLs for the whole profile
//
// scoreSportOffering() turns those into a deterministic 0–33 score plus
// human-readable evidence strings. dimensions.js wraps each registry entry
// into a `<sport>_offering` dimension so rankSchools / compareSchools /
// intent-router work unchanged.
//
// Scoring model (documented so the weights are auditable):
//   signature_sports hit                +6   (school's own headline pick)
//   sport_categories: academy           +5   (dedicated academy programme)
//                     major             +4   (one of the school's main sports)
//                     optional          +1   (offered, not emphasised)
//                     (highest single category only — no stacking)
//   teams_by_sport                      +min(team total, 4)
//   competitions_entered                +2 per entry (cap 4), +1 if any
//                                       national scope (cap 6 total)
//   recent_achievements                 +2 per matching entry (cap 4)
//   facilities                          +2 (any sport-specific facility)
//   scholarships text                   +2
//   coaching_staff mention              +1
//   representative_honours              +2
//   sports_offered                      +1 (baseline "it exists")
//
// A school that merely lists the sport scores ~1–2; an academy-level
// programme with national competition entries scores ~10–15. Sanity-checked
// against live rows: ACS Cobham golf ≈ 13, Bloxham golf ≈ 5, Alleyn's ≈ 2.
//
// Pure module — no imports, no DB, no network. Safe for node --test and for
// structured-cols.mjs (a leaf module) to import.

// Registry order matters twice: (a) detectGenericSport returns the FIRST
// regex hit, so multiword sports (water polo) sit above their collision
// (polo); (b) dimensions.js registers dims in this order, and
// detectDimension's keyword loop respects insertion order.
//
// 2026-07-05 Thai alternates: parents type mixed Thai/English ("โรงเรียนไหน
// ดีที่สุดสำหรับกอล์ฟ"). Thai codepoints are non-word chars to JS regex, so
// \b can never anchor around them — Thai alternates sit OUTSIDE the \b(...)\b
// groups as bare alternations. These regexes also scan DB content
// (scoreSportOffering), where Thai never appears — no false-positive risk.
export const GENERIC_SPORTS = {
  golf:         { label: 'Golf',          re: /\bgolf(?:ers?|ing)?\b|กอล์ฟ/i },
  swimming:     { label: 'Swimming',      re: /\bswim(?:ming|mers?|s)?\b|ว่ายน้ำ/i },
  // (?<!sail(?:ing)?[-\s]) keeps "Sailing Regatta" evidence out of rowing
  // while preserving "Henley Royal Regatta" / bare "regatta" as rowing.
  rowing:       { label: 'Rowing',        re: /\browing\b|\browers?\b|\bsculling\b|(?<!sail(?:ing)?[-\s])\bregattas?\b|พายเรือ/i },
  athletics:    { label: 'Athletics',     re: /\bathletics\b|\btrack\s*(?:and|&)\s*field\b|กรีฑา/i },
  cross_country:{ label: 'Cross country', re: /\bcross[-\s]country\b/i },
  netball:      { label: 'Netball',       re: /\bnetball\b|เน็?ตบอล/i },
  basketball:   { label: 'Basketball',    re: /\bbasketball\b|บาสเก็?ตบอล/i },
  badminton:    { label: 'Badminton',     re: /\bbadminton\b|แบดมินตัน/i },
  squash:       { label: 'Squash',        re: /\bsquash\b|สควอช/i },
  sailing:      { label: 'Sailing',       re: /\bsailing\b|\bsailors?\b|เรือใบ/i },
  equestrian:   { label: 'Equestrian',    re: /\bequestrian\b|\bhorse[-\s]?riding\b|\bshow[-\s]?jumping\b|\bdressage\b|\beventing\b|\bpony\s+club\b|ขี่ม้า/i },
  lacrosse:     { label: 'Lacrosse',      re: /\blacrosse\b|ลาครอส/i },
  fencing:      { label: 'Fencing',       re: /\bfencing\b|\bfencers?\b|ฟันดาบ/i },
  water_polo:   { label: 'Water polo',    re: /\bwater[-\s]?polo\b|โปโลน้ำ/i },
  gymnastics:   { label: 'Gymnastics',    re: /\bgymnast(?:ics?|s)?\b|ยิมนาสติก/i },
  climbing:     { label: 'Climbing',      re: /\b(?:rock[-\s])?climbing\b|\bbouldering\b|ปีนผา/i },
  skiing:       { label: 'Skiing',        re: /\bski(?:ing|ers?)?\b|สกี/i },
  // Covers target rifle / clay pigeon / smallbore — all appear as distinct
  // sports_offered values in live data; one dimension is enough for parents.
  shooting:     { label: 'Shooting',      re: /\bshooting\b|\btarget\s+rifle\b|\bclay\s+pigeon\b|\bsmallbore\b|\bmarksman\w*\b|ยิงปืน/i },
  table_tennis: { label: 'Table tennis',  re: /\btable[-\s]tennis\b|\bping[-\s]?pong\b|ปิงปอง|เทเบิลเทนนิส/i },
  volleyball:   { label: 'Volleyball',    re: /\bvolleyball\b|วอลเลย์บอล/i },
  // Lookbehind keeps "water polo" out even if water_polo's entry is ever
  // reordered below this one; the Thai lookahead does the same for โปโลน้ำ.
  polo:         { label: 'Polo',          re: /(?<!water[-\s])\bpolo\b|โปโล(?!น้ำ)/i },
  fives:        { label: 'Fives',         re: /\bfives\b/i },
  rackets:      { label: 'Rackets',       re: /\brackets\b/i },
  rounders:     { label: 'Rounders',      re: /\brounders\b/i },
  padel:        { label: 'Padel',         re: /\bpadel\b|พาเดล/i },
  futsal:       { label: 'Futsal',        re: /\bfutsal\b|ฟุตซอล/i },
  triathlon:    { label: 'Triathlon',     re: /\btriathlon\b|\baquathlon\b|\bbiathlon\b|ไตรกีฬา/i },
  judo:         { label: 'Judo & martial arts', re: /\bjudo\b|\bkarate\b|\btaekwondo\b|\bmartial\s+arts\b|ยูโด|เทควันโด|คาราเต้/i },
  dance:        { label: 'Dance',         re: /\bdance\b|\bdancers?\b|เต้น|นาฏศิลป์/i },
  trampolining: { label: 'Trampolining',  re: /\btrampolin(?:e|ing|ist)s?\b|แทรมโพลีน/i },
};

export const GENERIC_SPORT_KEYS = Object.keys(GENERIC_SPORTS);

// Dimension name for a registry key: golf → golf_offering. "_offering" (not
// "_strength") signals to the model that the evidence is programme/offering
// level, not the competitive-tier data the big-five dimensions carry.
export function genericSportDimName(key) {
  return `${key}_offering`;
}

export const GENERIC_SPORT_DIM_NAMES = GENERIC_SPORT_KEYS.map(genericSportDimName);

// First registry entry whose regex hits the text. Used by tests and any
// caller that wants sport detection without loading dimensions.js (the
// intent-router itself detects via DIMENSIONS[dim].keywords, which wraps
// these same regexes).
export function detectGenericSport(text) {
  if (typeof text !== 'string' || !text) return null;
  for (const [key, spec] of Object.entries(GENERIC_SPORTS)) {
    if (spec.re.test(text)) return { key, label: spec.label, dimension: genericSportDimName(key) };
  }
  return null;
}

// Map a parent-entered sport label ('Golf', 'horse riding', 'Clay Pigeon
// Shooting') to a registry key. Used by score-for-build-mode.ts for
// interests_sports entries that the big-five normalizeSportLabel dropped.
export function matchGenericSportLabel(label) {
  if (typeof label !== 'string' || !label.trim()) return null;
  const hit = detectGenericSport(label);
  return hit ? hit.key : null;
}

// ── Scorer internals ────────────────────────────────────────────────────────

// Render any nested value into searchable text without throwing on odd
// shapes. Depth-limited JSON stringify substitute for regex matching only.
function toText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v); } catch { return ''; }
}

function arr(v) {
  if (Array.isArray(v)) return v;
  // teams_by_sport is an array in all live rows, but older extractor runs
  // may have object maps — accept both.
  if (v && typeof v === 'object') return Object.values(v);
  return [];
}

const clamp1dp = (n) => Math.round(n * 10) / 10;

/**
 * Deterministic offering score for one sport from the GENERIC fields of a
 * school's sports_profile. Returns { score, evidence[], breakdown }.
 * score = 0 means "no evidence this school offers the sport" — callers
 * (rankSchools score<=0 filter) drop the school rather than guessing.
 */
export function scoreSportOffering(sportsProfile, sportKey) {
  const spec = GENERIC_SPORTS[sportKey];
  const empty = { score: 0, evidence: [], breakdown: {} };
  if (!spec || !sportsProfile || typeof sportsProfile !== 'object') return empty;

  const re = spec.re;
  const sp = sportsProfile;
  const evidence = [];
  const breakdown = {};
  let score = 0;

  // signature_sports — the school's own headline pick.
  const signature = arr(sp.signature_sports).some((s) => re.test(toText(s)));
  if (signature) {
    score += 6; breakdown.signature = 6;
    evidence.push(`listed among the school's signature sports`);
  }

  // sport_categories — highest single category only.
  const cats = sp.sport_categories && typeof sp.sport_categories === 'object' ? sp.sport_categories : {};
  const inAcademy  = arr(cats.academy).some((s) => re.test(toText(s)));
  const inMajor    = arr(cats.major).some((s) => re.test(toText(s)));
  const inOptional = arr(cats.optional).some((s) => re.test(toText(s)));
  if (inAcademy) {
    score += 5; breakdown.category = 5;
    evidence.push(`academy-level programme`);
  } else if (inMajor) {
    score += 4; breakdown.category = 4;
    evidence.push(`one of the school's major sports`);
  } else if (inOptional) {
    score += 1; breakdown.category = 1;
    evidence.push(`offered as an optional sport`);
  }

  // teams_by_sport — visible team structure.
  const teamEntries = arr(sp.teams_by_sport).filter((t) => t && re.test(toText(t.sport ?? t)));
  if (teamEntries.length) {
    let teamTotal = 0;
    const levelSamples = [];
    for (const t of teamEntries) {
      const levels = arr(t.team_levels).map(toText).filter(Boolean);
      const n = typeof t.team_count === 'number' && t.team_count > 0
        ? t.team_count
        : Math.max(levels.length, 1);
      teamTotal += n;
      levelSamples.push(...levels.slice(0, 3));
    }
    const pts = Math.min(teamTotal, 4);
    score += pts; breakdown.teams = pts;
    evidence.push(
      levelSamples.length
        ? `${teamTotal} team${teamTotal === 1 ? '' : 's'} (${levelSamples.slice(0, 4).join(', ')})`
        : `${teamTotal} team${teamTotal === 1 ? '' : 's'} fielded`,
    );
  }

  // competitions_entered — sport-tagged with scope in live data.
  const comps = arr(sp.competitions_entered).filter((c) => c && re.test(toText(c)));
  if (comps.length) {
    let pts = Math.min(comps.length * 2, 4);
    const national = comps.some((c) => /\bnational\b/i.test(toText(c.scope ?? '')));
    if (national) pts = Math.min(pts + 1, 6);
    score += pts; breakdown.competitions = pts;
    const names = comps.map((c) => toText(c.name ?? c)).filter(Boolean).slice(0, 2);
    evidence.push(
      `competes in ${names.join(', ') || 'external competitions'}${national ? ' (national scope)' : ''}`,
    );
  }

  // recent_achievements — free shape; regex over stringified entries.
  const achievements = arr(sp.recent_achievements).filter((a) => a && re.test(toText(a)));
  if (achievements.length) {
    const pts = Math.min(achievements.length * 2, 4);
    score += pts; breakdown.achievements = pts;
    // Live shape is { year, level, title } — render human-readable, never
    // raw JSON (the string reaches the parent via the prose answer).
    const a = achievements[0];
    const title = typeof a === 'string'
      ? a
      : toText(a.title ?? a.achievement ?? a.note ?? a.name ?? a.summary ?? '') || toText(a);
    const year = typeof a === 'object' && a.year ? ` (${a.year})` : '';
    evidence.push(`recent result: ${title.slice(0, 120)}${year}`);
  }

  // facilities — free-text strings.
  const facilityHits = arr(sp.facilities).map(toText).filter((f) => f && re.test(f));
  if (facilityHits.length) {
    score += 2; breakdown.facilities = 2;
    evidence.push(`facilities: ${facilityHits[0].slice(0, 100)}`);
  }

  // scholarships — object; a named sport scholarship is a strong signal.
  if (sp.scholarships && re.test(toText(sp.scholarships))) {
    score += 2; breakdown.scholarships = 2;
    evidence.push(`sport scholarship material mentions ${spec.label.toLowerCase()}`);
  }

  // coaching_staff — named coach for this sport.
  if (arr(sp.coaching_staff).some((c) => c && re.test(toText(c)))) {
    score += 1; breakdown.coaching = 1;
    evidence.push(`named coaching staff`);
  }

  // representative_honours — pupils picked for county/national squads.
  if (sp.representative_honours && re.test(toText(sp.representative_honours))) {
    score += 2; breakdown.honours = 2;
    evidence.push(`representative honours recorded`);
  }

  // sports_offered — baseline existence signal.
  if (arr(sp.sports_offered).some((s) => re.test(toText(s)))) {
    score += 1; breakdown.offered = 1;
    if (evidence.length === 0) evidence.push(`listed among sports offered`);
  }

  return { score: clamp1dp(score), evidence, breakdown };
}

/**
 * scoreSportBreadth (2026-07-05) — overall sport-programme strength across
 * ALL sports, for "strong academics plus sports" / "best sporty schools"
 * questions where the parent names no specific sport. Same generic
 * sports_profile fields as scoreSportOffering, but counted across the whole
 * programme instead of regex-filtered to one sport.
 *
 * Scoring model (auditable):
 *   signature_sports          +2 per sport (cap 6)   — headline programmes
 *   sport_categories.academy  +2 per sport (cap 6)   — dedicated academies
 *   sport_categories.major    +1 per sport (cap 4)
 *   teams_by_sport            +min(total teams / 4, 4) — visible depth
 *   competitions_entered      +min(count / 2, 3)
 *   facilities                +min(count / 3, 3)
 *   scholarships (any text)   +2
 *   representative_honours    +1
 *
 * Range ~0-29; a school that merely lists sports scores ~1-3, a serious
 * multi-academy programme lands 15+. Returns { score, evidence[] } with
 * human-readable evidence (never raw JSON — strings reach the parent).
 */
export function scoreSportBreadth(sportsProfile) {
  const empty = { score: 0, evidence: [] };
  if (!sportsProfile || typeof sportsProfile !== 'object') return empty;
  const sp = sportsProfile;
  const evidence = [];
  let score = 0;

  const names = (list) => arr(list).map(toText).filter(Boolean);

  const signature = names(sp.signature_sports);
  if (signature.length) {
    score += Math.min(signature.length * 2, 6);
    evidence.push(`signature sports: ${signature.slice(0, 4).join(', ')}`);
  }

  const cats = sp.sport_categories && typeof sp.sport_categories === 'object' ? sp.sport_categories : {};
  const academy = names(cats.academy);
  const major   = names(cats.major);
  if (academy.length) {
    score += Math.min(academy.length * 2, 6);
    evidence.push(`academy-level programmes: ${academy.slice(0, 3).join(', ')}`);
  }
  if (major.length) {
    score += Math.min(major.length, 4);
    evidence.push(`${major.length} major sports`);
  }

  const teamEntries = arr(sp.teams_by_sport).filter(Boolean);
  if (teamEntries.length) {
    let teamTotal = 0;
    const sportsWithTeams = new Set();
    for (const t of teamEntries) {
      const levels = arr(t.team_levels).map(toText).filter(Boolean);
      const n = typeof t.team_count === 'number' && t.team_count > 0
        ? t.team_count
        : Math.max(levels.length, 1);
      teamTotal += n;
      const sportName = toText(t.sport ?? '');
      if (sportName) sportsWithTeams.add(sportName.toLowerCase());
    }
    score += Math.min(teamTotal / 4, 4);
    evidence.push(`${teamTotal} teams across ${sportsWithTeams.size || teamEntries.length} sports`);
  }

  const comps = arr(sp.competitions_entered).filter(Boolean);
  if (comps.length) {
    score += Math.min(comps.length / 2, 3);
    evidence.push(`enters ${comps.length} external competitions`);
  }

  const facilities = names(sp.facilities);
  if (facilities.length) {
    score += Math.min(facilities.length / 3, 3);
    evidence.push(`${facilities.length} sport facilities listed`);
  }

  if (sp.scholarships && toText(sp.scholarships).trim().length > 2) {
    score += 2;
    evidence.push('sport scholarships offered');
  }

  if (sp.representative_honours && toText(sp.representative_honours).trim().length > 2) {
    score += 1;
    evidence.push('representative honours recorded');
  }

  return { score: clamp1dp(score), evidence };
}

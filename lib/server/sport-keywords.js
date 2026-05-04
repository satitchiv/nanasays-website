/**
 * sport-keywords.js — shared filter + ranker for sport-specific chunk selection.
 *
 * Each `extract-<sport>-strength.js` calls `filterAndRankChunks(chunks, sport)`
 * to narrow `school_knowledge` rows to sport-relevant pages and rank them so
 * the most informative pages land first in the prompt.
 *
 * Tennis still inlines its own filter at extract-tennis-strength.js:71-115;
 * this module is the rugby/cricket/hockey successor pattern. Tennis can be
 * migrated later if desired.
 */

export const SPORT_KEYWORDS = {
  tennis: {
    bodyRegex: /tennis|aberdare|youll|lta|wimbledon|\brpdc\b|henman|draper/i,
    urlPathRegex: /\/tennis/i,
    contentSignals: /(court|coach|academy|indoor|outdoor)/i,
    repeatRegex: /tennis/gi,
    repeatThreshold: 3,
  },
  rugby: {
    // Body keywords: include sponsorship history (Continental Tyres / NatWest /
    // Daily Mail Cup), competitions (Rosslyn Park / Schools Cup), pathway terms
    // (PDG, ERCA/ERACA, HEADCASE), and gameplay terms (XV, scrum, sevens).
    // Codex review noted: do NOT include rival school names — over-matches on
    // schools that merely played against Sedbergh/Harrow.
    bodyRegex: /\brugby\b|\bxv\b|scrum|natwest|continental.?tyres|daily.?mail.?cup|rosslyn.?park|\bsevens?\b|england.?rugby|\brfu\b|premiership.?rugby|\bpdg\b|developing.?player|\berca\b|\beraca\b|headcase|st.?joseph.?s.?festival/i,
    urlPathRegex: /\/rugby/i,
    contentSignals: /(pitch|coach|academy|director.?of.?rugby|scrum|fixtures|\bxv\b|s&c|head.?of.?rugby|tour|sevens)/i,
    repeatRegex: /\brugby\b/gi,
    repeatThreshold: 3,
  },
};

export const COMMON_URL_PATTERNS = {
  alumni: /hall.?of.?fame|or-hall|alumni/i,
  staff: /staff.?list|contact/i,
  facilities: /\/facilit|\/facilities/i,
  scholarships: /scholarship/i,
  academySport: /academy.?sport|individual.?sport/i,
};

/**
 * Filter and rank `school_knowledge` chunks for one sport.
 * Returns chunks ordered: most-relevant first, longest-first within tier.
 *
 * @param {Array} chunks - rows with { content, source_url, category, title, word_count }
 * @param {string} sport - key of SPORT_KEYWORDS
 * @param {{filterV2?: boolean}} options
 */
export function filterAndRankChunks(chunks, sport, options = {}) {
  const filterV2 = options.filterV2 !== false;
  const sk = SPORT_KEYWORDS[sport];
  if (!sk) throw new Error(`Unknown sport: ${sport}`);

  const keep = (chunks || []).filter(c => {
    const body = (c.content || '').toLowerCase();
    const title = (c.title || '').toLowerCase();
    const url = (c.source_url || '').toLowerCase();
    if (sk.bodyRegex.test(body + ' ' + title + ' ' + url)) return true;
    if (c.category === 'sports') return true;
    if (COMMON_URL_PATTERNS.scholarships.test(url)) return true;
    if (COMMON_URL_PATTERNS.alumni.test(url)) return true;
    if (COMMON_URL_PATTERNS.staff.test(url)) return true;
    return false;
  });

  const seen = new Set();
  const unique = keep.filter(c => {
    if (seen.has(c.source_url)) return false;
    seen.add(c.source_url);
    return true;
  });

  const tier = (c) => {
    const u = (c.source_url || '').toLowerCase();
    const b = (c.content || '').toLowerCase();
    if (sk.urlPathRegex.test(u)) return 1;
    if (COMMON_URL_PATTERNS.academySport.test(u)) return 2;
    if (filterV2 && COMMON_URL_PATTERNS.facilities.test(u)) return 2;
    if (COMMON_URL_PATTERNS.alumni.test(u)) return 3;
    if (COMMON_URL_PATTERNS.staff.test(u)) return 4;
    if (filterV2 && sk.bodyRegex.test(b) && sk.contentSignals.test(b)) return 4;
    const matches = b.match(sk.repeatRegex);
    if (matches && matches.length >= sk.repeatThreshold) return 5;
    return 6;
  };

  unique.sort((a, b) => {
    const ta = tier(a), tb = tier(b);
    if (ta !== tb) return ta - tb;
    return (b.word_count || 0) - (a.word_count || 0);
  });

  return unique;
}

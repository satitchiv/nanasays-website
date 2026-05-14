// Slice 8 Step 0.7 — rowTopic() canonicalizer.
//
// Maps comparison-row labels (e.g. "Rugby strength", "DMT current rank",
// "Boarding fee · per term") to fine-grained topic keys consumed by
// Build 4's per-topic verdict scoring. DecisionCategory in
// verdict-generator.ts still collapses sports to one bucket for rubric
// weighting; rowTopic() exists alongside it, NOT as a replacement.
//
// Order in the regex chain matters: most-specific first (named sport,
// then sport-other; oxbridge before STEM; fees before boarding; pastoral
// before boarding). Word-boundary patterns deliberately tightened where
// `\b` allowed punctuation leaks (`DMT-style` was matching rugby in
// earlier drafts — now `\bdmt` requires whitespace + 40-char rank lookahead).

export type RowTopic =
  | 'rugby' | 'tennis' | 'cricket' | 'hockey' | 'football' | 'netball'
  | 'rowing' | 'swimming' | 'equestrian' | 'athletics' | 'sport-other'
  | 'academics-stem' | 'academics-humanities' | 'academics-results'
  | 'oxbridge' | 'curriculum' | 'class-size'
  | 'boarding' | 'pastoral' | 'safeguarding' | 'wellbeing'
  | 'fees' | 'scholarships' | 'admissions'
  | 'location' | 'commute'
  | 'school-type' | 'community' | 'international'
  | 'music' | 'drama' | 'visual-arts' | 'arts-other'
  | 'send-learning-support'
  | 'faith-ethos'
  | 'leavers-destinations'
  | 'co-curricular'
  | 'outdoor-ccf'
  | 'diversity-inclusion'
  | 'discipline-behaviour'
  | 'other'

function normalise(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function rowTopic(label: string): RowTopic {
  const l = normalise(label)

  // ── Sports ──────────────────────────────────────────────────────────
  // r4 NIT #1 + r3 P1 #3: dmt requires WHITESPACE after (not just
  // word-boundary, which `-` satisfies) AND rank/ranking within 40
  // chars. Rejects `DMT-style`, `DMT-related rank promotion`,
  // `bare DMT mention`. Rugby-context branch unchanged.
  if (/\brugby\b|\b1st xv\b|\bdmt(?=\s[\s\S]{0,40}\brank(ing)?\b)|\brugby[\s\S]*\bdmt\b|\bsocs[\s\S]*rugby/.test(l)) return 'rugby'
  if (/\btennis\b/.test(l))                                                   return 'tennis'
  if (/\bcricket\b/.test(l))                                                  return 'cricket'
  if (/\bhockey\b/.test(l))                                                   return 'hockey'
  if (/\bfootball\b|\bsoccer\b/.test(l))                                      return 'football'
  if (/\bnetball\b/.test(l))                                                  return 'netball'
  if (/\brow(ing)?\b|\bregatta\b/.test(l))                                    return 'rowing'
  if (/\bswim(ming)?\b/.test(l))                                              return 'swimming'
  if (/\bequestrian\b|\bhorse\b/.test(l))                                     return 'equestrian'
  if (/\bathletics?\b|\btrack and field\b/.test(l))                           return 'athletics'
  if (/\bsports?\s+(department|programme|coaching|facility|facilities|provision|tier|strength)\b/.test(l)) return 'sport-other'
  if (/\bsports?\s+(scholar|teacher|director|coach)/.test(l))                 return 'sport-other'
  if (/\b(director|head|coach)\s+of\s+sports?\b/.test(l))                     return 'sport-other'
  if (/\bphysical education\b|\bp\.?e\.?\b/.test(l))                          return 'sport-other'

  // ── Arts ────────────────────────────────────────────────────────────
  if (/\bmusic\b|\borchestra\b|\bensemble\b|\bchoral\b|\bchoir\b|\bconcert\b/.test(l)) return 'music'
  if (/\bdrama\b|\btheatre\b|\bperform(ance|ing)\b|\bschool play\b|\bschool plays\b/.test(l)) return 'drama'
  if (/\bart(s)?\s+(gallery|department|programme|studios?|scholarship(s)?)\b/.test(l)) return 'visual-arts'
  if (/\bgallery\b|\bsculpture\b|\bpainting\b/.test(l))                       return 'visual-arts'
  if (/\bcreative arts?\b|\bperforming arts?\b/.test(l))                      return 'arts-other'

  // ── Academic ────────────────────────────────────────────────────────
  if (/\boxbridge\b|\boxford\b|\bcambridge\b/.test(l))                        return 'oxbridge'
  if (/\bgcse\b|\ba.level\b|\bib\b|\bgrade\b|\bresults?\b/.test(l))           return 'academics-results'
  if (/\bmaths?\b|\bsciences?\b|\bphysics\b|\bchem(istry|s)?\b|\bbio(logy|s)?\b|\bcomputing\b|\bstem\b/.test(l)) return 'academics-stem'
  if (/\benglish\b|\bhistor(y|ical)\b|\blanguages?\b|\bclassics\b|\bhumanities?\b/.test(l)) return 'academics-humanities'
  if (/\bcurriculum\b|\bsubject\b/.test(l))                                   return 'curriculum'
  if (/\bclass size\b|\bpupil.teacher\b/.test(l))                             return 'class-size'

  // ── Leavers / destinations ──────────────────────────────────────────
  if (/\bleavers?\b|\bgap year\b|\buniversit(y|ies)\s+(placement|offers?|destinations?|outcomes?)\b|\bleaver destinations?\b|\bdestinations? after (school|year 13)\b/.test(l)) return 'leavers-destinations'

  // ── SEND / learning support ────────────────────────────────────────
  if (/\bsen\b|\bdyslex(ia|ic)\b|\beal\b|\blearning support\b|\bspecial educational needs\b/.test(l)) return 'send-learning-support'
  if (/\bsend\s+(provision|support|programme|coordinator|department|policy|register)/.test(l)) return 'send-learning-support'

  // ── Diversity / inclusion ───────────────────────────────────────────
  if (/\bdiversit(y|ies)\b|\binclusion\b|\bedi\b|\blgbtq\b/.test(l))          return 'diversity-inclusion'

  // ── Faith / ethos ───────────────────────────────────────────────────
  if (/\bchurch of england\b|\bcofe\b|\banglican\b|\bcatholic\b|\bquaker\b|\bmethodist\b|\bjewish\b|\bmuslim\b|\bchapel\b|\bfaith\b|\bsecular\b|\bmulti.faith\b|\bethos\b/.test(l)) return 'faith-ethos'

  // ── Discipline / behaviour ──────────────────────────────────────────
  if (/\bbehaviour\b|\bdiscipline\b|\bcode of conduct\b|\bexpulsion\b|\bexclusion(s)?\b/.test(l)) return 'discipline-behaviour'

  // ── Fees / scholarships ─────────────────────────────────────────────
  if (/\bscholarship(s)?\b|\bbursar(y|ies)\b|\bmeans.tested\b|\bremission\b/.test(l)) return 'scholarships'
  if (/\bfee(s)?\b|\bcost\b|\bdeposit\b|\bbudget\b|\bafford/.test(l))         return 'fees'

  // ── Pastoral / safeguarding ─────────────────────────────────────────
  if (/\bsafeguard|\bisi\b|\binspection(s)?\b|\bcompliance\b/.test(l))        return 'safeguarding'
  if (/\bpastoral\b|\bcare\b|\btutor\b/.test(l))                              return 'pastoral'
  if (/\bwellbeing\b|\bwelfare\b|\bmental health\b|\bmental.health\b/.test(l)) return 'wellbeing'

  // ── Admissions / location / commute ─────────────────────────────────
  if (/\badmission(s)?\b|\bentry\b|\bdeadline(s)?\b|\bassessment(s)?\b|\binterview(s)?\b/.test(l)) return 'admissions'
  if (/\bcommute\b|\btravel\b|\bdistance\b|\bminutes\b|\bairport\b|\bstation\b/.test(l)) return 'commute'
  if (/\blocation\b|\bregion\b|\bcounty\b|\bsouth.?west\b|\baddress\b/.test(l)) return 'location'

  // ── Outdoor / CCF ───────────────────────────────────────────────────
  if (/\bccf\b|\bcombined cadet force\b|\bduke of edinburgh\b|\bd\s*of\s*e\b|\boutdoor (education|programme|pursuit)\b|\bexpedition(s)?\b/.test(l)) return 'outdoor-ccf'

  // ── Co-curricular ───────────────────────────────────────────────────
  if (/\bco.curricular\b|\bextra.curricular\b|\bclub(s)?\b|\bsociet(y|ies)\b/.test(l)) return 'co-curricular'
  if (/\b(co|extra).curricular activities\b|\bactivities\s+(programme|offered|range)\b/.test(l)) return 'co-curricular'

  // ── Boarding ────────────────────────────────────────────────────────
  if (/\bboarding\b|\bboarder(s)?\b|\bhouse(s)?\b|\bweekend\b|\bdormitory\b/.test(l)) return 'boarding'

  // ── School type / community / international ─────────────────────────
  // `senior` requires school/years/forms context — bare "senior" matches
  // "senior leadership team" etc which aren't school-type labels.
  if (/\bschool type\b|\bage range\b|\bprep\b|\bsenior\s+(school|years|forms?)\b|\bco.?ed\b|\bgirls\b|\bboys\b/.test(l)) return 'school-type'
  if (/\binternational\b|\bintl\b/.test(l))                                   return 'international'
  if (/\bpupil(s)?\b|\bcommunity\b|\bsize\b/.test(l))                         return 'community'

  return 'other'
}

export function isSportTopic(topic: RowTopic): boolean {
  return [
    'rugby', 'tennis', 'cricket', 'hockey', 'football', 'netball',
    'rowing', 'swimming', 'equestrian', 'athletics', 'sport-other',
  ].includes(topic)
}

export function isAcademicTopic(topic: RowTopic): boolean {
  return [
    'academics-stem', 'academics-humanities', 'academics-results',
    'oxbridge', 'curriculum',
  ].includes(topic)
}

export function isArtsTopic(topic: RowTopic): boolean {
  return ['music', 'drama', 'visual-arts', 'arts-other'].includes(topic)
}

export function isPastoralTopic(topic: RowTopic): boolean {
  return ['pastoral', 'safeguarding', 'wellbeing', 'discipline-behaviour'].includes(topic)
}

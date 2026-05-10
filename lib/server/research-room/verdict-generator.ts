import 'server-only'
import crypto from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ComparisonData, ComparisonRow, RowCell } from '@/components/nana/comparison-placeholder'

export type ResearchVerdictRankedSchool = {
  slug: string
  name: string
  rank: number
  summary: string
  strengths: string[]
  reservations: string[]
}

export type ResearchVerdict = {
  format: 'research_verdict_v1' | 'research_verdict_v2'
  decision_model?: 'evidence_pool_v2'
  confidence?: 'low' | 'medium' | 'high'
  decision_factors?: string[]
  headline: string
  ranked_schools: ResearchVerdictRankedSchool[]
  dissenting_view: string
  best_for_child: string
  evidence_gaps: string[]
  sources: Array<{ url: string; label?: string; school_slug?: string }>
}

export type ResearchVerdictRecord = {
  id: string
  input_hash: string
  verdict_json: ResearchVerdict
  body_markdown: string
  generated_at: string
  cache_status?: 'current' | 'stale'
}

type BuildArgs = {
  comparisonData: ComparisonData
  childName?: string | null
  childProfile?: Record<string, unknown> | null
  sessionId: string
  childId: string
  baseLensKind: 'general' | 'child_fit'
  activeLensId?: string | null
  lensWeightsByRowId?: Record<string, number>
}

type DecisionCategory =
  | 'sport'
  | 'boarding'
  | 'pastoral'
  | 'academics'
  | 'fees'
  | 'location'
  | 'admissions'
  | 'school_stage'
  | 'scholarship'
  | 'community'
  | 'other'

type Direction = 'higher' | 'lower' | 'text'

type Rubric = {
  topPriority: string | null
  boardingPref: string | null
  homeRegion: string | null
  budgetRange: string | null
  budgetMaxAnnual: number | null
  curriculumPref: string | null
  classSizePref: string | null
  senNeed: string | null
  childGender: string | null
  childYear: number | null
}

type Signal = {
  text: string
  impact: number
  category: DecisionCategory
}

type ScoredSchool = {
  slug: string
  name: string
  score: number
  categoryScores: Partial<Record<DecisionCategory, number>>
  strengths: Signal[]
  reservations: Signal[]
  evidenceCells: number
  totalCells: number
  evidenceThin: boolean
}

const CATEGORIES: DecisionCategory[] = [
  'sport',
  'boarding',
  'pastoral',
  'academics',
  'fees',
  'location',
  'admissions',
  'school_stage',
  'scholarship',
  'community',
  'other',
]

function cellText(cell: RowCell | undefined): string {
  if (!cell || cell.kind === 'empty') return ''
  if (cell.kind === 'value') return [cell.primary, cell.sub].filter(Boolean).join(' - ')
  if (cell.kind === 'lights') return cell.lights.map(l => `${l.label}: ${l.tone}`).join('; ')
  return ''
}

function isMeaningfulCellText(text: string): boolean {
  if (!text) return false
  const t = text.toLowerCase().trim()
  return !/^(no data|no usable data|n\/a|none|unknown|not available|not found)(\s*[·-].*)?$/.test(t)
}

function profileString(profile: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!profile) return null
  for (const key of keys) {
    const value = profile[key]
    if (typeof value === 'string' && value.trim()) return value.trim().toLowerCase()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return null
}

function parseBudgetMaxAnnual(raw: string | null): number | null {
  if (!raw) return null
  const kMatches = Array.from(raw.matchAll(/(\d+(?:\.\d+)?)\s*k/gi))
  if (kMatches.length > 0) {
    return Math.max(...kMatches.map(m => Number(m[1]) * 1000))
  }
  const plain = Array.from(raw.matchAll(/\b(\d{4,6})\b/g)).map(m => Number(m[1]))
  const finite = plain.filter(n => Number.isFinite(n) && n > 0)
  return finite.length ? Math.max(...finite) : null
}

function parseChildYear(raw: string | null): number | null {
  if (!raw) return null
  const year = raw.match(/year[-\s]*(\d{1,2})/i)
  if (year) return Number(year[1])
  const plain = raw.match(/\b(\d{1,2})\b/)
  return plain ? Number(plain[1]) : null
}

function buildRubric(childProfile: Record<string, unknown> | null | undefined): Rubric {
  const budgetRange = profileString(childProfile, ['budget_range', 'budget'])
  return {
    topPriority:      profileString(childProfile, ['top_priority', 'priority']),
    boardingPref:     profileString(childProfile, ['boarding_pref', 'boarding']),
    homeRegion:       profileString(childProfile, ['home_region', 'region']),
    budgetRange,
    budgetMaxAnnual:  parseBudgetMaxAnnual(budgetRange),
    curriculumPref:   profileString(childProfile, ['curriculum_pref', 'curriculum']),
    classSizePref:    profileString(childProfile, ['class_size_pref', 'class_size']),
    senNeed:          profileString(childProfile, ['sen_need', 'sen']),
    childGender:      profileString(childProfile, ['child_gender', 'gender']),
    childYear:        parseChildYear(profileString(childProfile, ['child_year', 'year'])),
  }
}

function normaliseLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ')
}

function rowCategory(label: string): DecisionCategory {
  const l = normaliseLabel(label)
  if (/(rugby|tennis|sport|socs|dmt|fixture|team|1st xv|athletic|football|cricket|hockey|netball|swim|row(ing)?|equestrian)/.test(l)) return 'sport'
  if (/(scholarship|bursary|means-tested|means tested)/.test(l)) return 'scholarship'
  if (/(fee|cost|deposit|registration|application fee|extras|afford|budget)/.test(l)) return 'fees'
  if (/(boarding|boarder|house|houseparent|weekend|day pupils|full board|lowest boarding entry)/.test(l)) return 'boarding'
  if (/(pastoral|tutor|wellbeing|welfare|care|safeguard|isi|inspection|support)/.test(l)) return 'pastoral'
  if (/(gcse|a-level|a level|ib|academic|result|grade|oxbridge|university|curriculum|sixth form)/.test(l)) return 'academics'
  if (/(location|travel|distance|heathrow|airport|station|city|region|south west|south-west)/.test(l)) return 'location'
  if (/(admission|entry|deadline|assessment|exam|interview|application)/.test(l)) return 'admissions'
  if (/(school type|age range|prep|preparatory|primary|senior|co-ed|girls|boys)/.test(l)) return 'school_stage'
  if (/(pupil|community|size|international|day)/.test(l)) return 'community'
  return 'other'
}

function rowDirection(label: string): Direction {
  const l = normaliseLabel(label)
  if (/(rank|ranking|dmt|socs|position|league table)/.test(l)) return 'lower'
  if (/(fee|cost|travel|distance|minutes|registration|deposit|class size|house size)/.test(l)) return 'lower'
  if (/(gcse|a-level|a level|a\*|result|grade|scholarship|bursary|boarding pupils|boarding ratio|team count|teams|depth|pathway|score|percentage|%)/.test(l)) return 'higher'
  return 'text'
}

// Row clustering — collapse near-duplicate rows before scoring.
//
// Without this, "Rugby standing" / "Rugby strength" / "Rugby strength
// summary" / "Recent rugby success" / "Recent rugby highlights" /
// "Rugby-related note" all carry the same fact about a school but each
// gets scored independently, inflating sport-strong schools 4-6×. Same
// problem on rank rows ("Rugby rank" + "DMT current rank" +
// "SOCS performance rank" + "SOCS Performance" + "SOCS rank") and on
// fees ("Boarding fee · per year" + "Boarding fee range").
const ROW_CLUSTERS: Array<{ key: string; pattern: RegExp; preferredLabel: string }> = [
  { key: 'rugby:strength',
    pattern: /^(rugby (standing|strength|strength summary)|recent rugby (success|highlights)|rugby-related note)$/i,
    preferredLabel: 'Rugby strength' },
  { key: 'rugby:rank',
    pattern: /^(rugby rank|dmt( current)? rank|socs( performance)? rank|socs performance|league table)$/i,
    preferredLabel: 'Rugby ranking (DMT / SOCS)' },
  { key: 'fees:annual',
    pattern: /^(boarding fee (range|. per year)|annual fees?)$/i,
    preferredLabel: 'Boarding fee · per year' },
  { key: 'fees:per-term',
    pattern: /^boarding fee . per term$/i,
    preferredLabel: 'Boarding fee · per term' },
  { key: 'tennis:strength',
    pattern: /^(tennis programme strength|tennis standing)$/i,
    preferredLabel: 'Tennis programme strength' },
  { key: 'tennis:teams',
    pattern: /^(number of tennis teams|tennis team count)$/i,
    preferredLabel: 'Tennis team count' },
]

function clusterKey(label: string): { key: string; preferredLabel: string } {
  const norm = normaliseLabel(label)
  for (const cluster of ROW_CLUSTERS) {
    if (cluster.pattern.test(norm)) return cluster
  }
  return { key: `row:${norm}`, preferredLabel: label }
}

function evidenceCellScore(cell: RowCell): number {
  if (cell.kind === 'empty') return 0
  if (cell.kind === 'lights') return 5 + cell.lights.length
  let score = 10
  if (cell.sub && /https?:\/\//.test(cell.sub)) score += 4
  if (cell.sub) score += 1
  if (cell.primary.length > 40) score += 1
  return score
}

function pickBetterCell(a: RowCell, b: RowCell): RowCell {
  return evidenceCellScore(b) > evidenceCellScore(a) ? b : a
}

function clusterRows(rows: ComparisonRow[]): ComparisonRow[] {
  const map = new Map<string, { label: string; cells: RowCell[]; firstIndex: number; ids: string[] }>()
  rows.forEach((row, idx) => {
    const { key, preferredLabel } = clusterKey(row.label)
    const isClustered = !key.startsWith('row:')
    const current = map.get(key)
    if (!current) {
      map.set(key, {
        label: isClustered ? preferredLabel : row.label,
        cells: row.cells.slice(),
        firstIndex: idx,
        ids: [row.id],
      })
      return
    }
    current.cells = current.cells.map((existing, i) => pickBetterCell(existing, row.cells[i] ?? { kind: 'empty' }))
    current.ids.push(row.id)
  })
  return Array.from(map.values())
    .sort((a, b) => a.firstIndex - b.firstIndex)
    .map(c => ({
      id: `cluster|${c.ids.join('|')}`,
      label: c.label,
      cells: c.cells,
      removable: false,
    }))
}

function moneyValues(text: string): number[] {
  return Array.from(text.matchAll(/[£$]\s*([0-9][0-9,]*(?:\.\d+)?)/g))
    .map(m => Number(m[1].replace(/,/g, '')))
    .filter(n => Number.isFinite(n))
}

function numericSignal(text: string, label: string): number | null {
  const l = normaliseLabel(label)
  const ratio = text.replace(/,/g, '').match(/\b(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\b/)
  if (ratio && /(rank|ranking|dmt|socs|position)/.test(l)) return Number(ratio[1])
  if (ratio && /(ratio|share|pupils|boarders|boarding)/.test(l)) {
    const numerator = Number(ratio[1])
    const denominator = Number(ratio[2])
    return denominator > 0 ? numerator / denominator * 100 : null
  }

  const money = moneyValues(text)
  if (money.length > 0) return Math.max(...money)

  const percent = text.match(/(-?\d+(?:\.\d+)?)\s*%/)
  if (percent) return Number(percent[1])

  const plain = text.replace(/,/g, '').match(/\b(-?\d+(?:\.\d+)?)\b/)
  if (plain) return Number(plain[1])
  return null
}

function southWestMatch(text: string): boolean {
  return /(south[-\s]?west|somerset|devon|dorset|cornwall|gloucestershire|wiltshire|taunton|bath|bristol|exeter|plymouth)/i.test(text)
}

function isStructuralNoiseValue(text: string): boolean {
  // Co-ed boarding strings are useful as structural fits but they
  // shouldn't be promoted as "strengths" — every co-ed boarding school
  // gets the same line and it crowds out evidence-backed ones.
  const parts = text.toLowerCase().split(/\s*[·\-]\s*/).map(p => p.trim()).filter(Boolean)
  if (parts.length === 0) return false
  return parts.every(p => /^(co[-\s]?ed|day \+ boarding|day only|boarding|boarding school|day|boys|girls)$/.test(p))
}

function qualitativeScore(text: string, label: string, category: DecisionCategory, rubric: Rubric): number {
  const t = text.toLowerCase()
  const l = label.toLowerCase()
  let score = 0

  if (/(excellent|strong|specific|available|integrated|clear|high|national-elite|national elite|national-strong|national strong|elite|dedicated|specialist)/.test(t)) score += 1.1
  if (/(best|highest|strongest|leading|compulsory|full|seven nights|7 nights|houseparent|saturday|weekend|academy|pathway|winner|finalist|champion)/.test(t)) score += 0.7
  if (/(unknown|not found|no data|no usable data|unclear|missing|limited|weak|not available|does not|none)/.test(t)) score -= 1.0

  const boardingEvidence = category === 'boarding' || /school type|boarding/.test(l)
  if (rubric.boardingPref?.includes('full') && boardingEvidence) {
    if (/(full boarding|7 nights|seven nights|boarder|houseparent|house system|integrated into boarding)/.test(t)) score += 1.0
    if (/(day only|no boarding|non-boarding|^day$)/.test(t.trim())) score -= 2.6
  }

  if (rubric.homeRegion?.includes('south') && rubric.homeRegion?.includes('west') && category === 'location') {
    if (southWestMatch(text)) score += 1.0
    else if (text.trim().length > 1) score -= 1.4   // outside south-west — material to a south-west home
  }

  if (rubric.curriculumPref?.includes('a-level') || rubric.curriculumPref?.includes('a level')) {
    if (/(a-level|a level)/.test(`${l} ${t}`)) score += 0.5
    if (/\bib\b/.test(`${l} ${t}`) && !/(a-level|a level)/.test(`${l} ${t}`)) score -= 0.35
  }

  if (rubric.childGender === 'girl' && category === 'school_stage') {
    if (/\bboys?\b/.test(t) && !/(co-ed|coed|mixed)/.test(t)) score -= 3.0
    if (/(girls|co-ed|coed|mixed)/.test(t)) score += 0.45
  }
  if (rubric.childGender === 'boy' && category === 'school_stage') {
    if (/\bgirls?\b/.test(t) && !/(co-ed|coed|mixed)/.test(t)) score -= 3.0
    if (/(boys|co-ed|coed|mixed)/.test(t)) score += 0.45
  }

  if (rubric.senNeed && !rubric.senNeed.includes('no-concern') && category === 'pastoral') {
    if (/(sen|send|learning support|additional needs|support)/.test(t)) score += 0.7
  }

  return score
}

function yearAwareUpperFraction(rubric: Rubric): number {
  if (!rubric.childYear) return 0.6
  if (rubric.childYear <= 8)  return 0.4   // prep / lower years
  if (rubric.childYear <= 11) return 0.7   // GCSE years (Year 10 sits here)
  return 0.9                                // sixth form
}

function budgetAdjustment(text: string, label: string, rubric: Rubric): number {
  if (!rubric.budgetMaxAnnual) return 0
  const l = label.toLowerCase()
  if (!/(fee|cost|boarding fee)/.test(l) || /(registration|deposit|application)/.test(l)) return 0

  const money = moneyValues(text)
  if (money.length === 0) return 0

  // For a fee range like "£11,754–£54,342" we can't claim £11k OR £54k
  // is the parent-relevant fee. Year 10 boarders pay near the upper-middle
  // of the range; sixth form is at the top; prep is at the bottom. Use a
  // year-aware fraction so a Year-10 brief isn't compared against the
  // Year-13 sticker price.
  let annual: number
  if (money.length >= 2) {
    const lo = Math.min(...money)
    const hi = Math.max(...money)
    annual = lo + (hi - lo) * yearAwareUpperFraction(rubric)
  } else {
    annual = money[0]
  }
  if (/term/.test(l)) annual *= 3

  if (annual <= rubric.budgetMaxAnnual) return 0.35
  const over = annual - rubric.budgetMaxAnnual
  return -Math.min(2.4, over / 5000)   // £5k over = -1 raw — was /10000
}

function categoryCap(category: DecisionCategory, rubric: Rubric): number {
  // Caps lowered now that rugby/SOCS/fees rows are clustered. The old
  // 16-cap on sport assumed 17 separate sport rows; clustered we only
  // have ~6-8 distinct sport signals.
  if (category === 'sport')        return rubric.topPriority === 'sport' ? 11 : 6
  if (category === 'boarding')     return rubric.boardingPref?.includes('full') ? 9 : 6
  if (category === 'pastoral')     return rubric.senNeed && !rubric.senNeed.includes('no-concern') ? 8 : 6
  if (category === 'fees')         return rubric.budgetMaxAnnual ? 7 : 5
  if (category === 'location')     return rubric.homeRegion ? 5 : 4
  if (category === 'academics')    return 7
  if (category === 'admissions')   return rubric.childYear && rubric.childYear >= 8 ? 5 : 3
  if (category === 'scholarship')  return 5
  if (category === 'school_stage') return 9
  if (category === 'community')    return 4
  return 4
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function lensWeightForRow(row: ComparisonRow, weights: Record<string, number> | undefined): number {
  if (!weights) return 0
  const ids = row.id.replace(/^cmp-|^cluster\|/, '').split('|').filter(Boolean)
  let out = 0
  for (const id of ids) {
    const raw = weights[id] ?? weights[`cmp-${id}`]
    if (typeof raw === 'number' && Number.isFinite(raw)) out = Math.max(out, raw)
  }
  return out
}

function rowWeight(row: ComparisonRow, category: DecisionCategory, rubric: Rubric, lensWeight: number): number {
  const l = row.label.toLowerCase()
  let weight = 1

  if (category === 'sport') weight = rubric.topPriority === 'sport' ? 3.2 : 1.5
  if (category === 'boarding') weight = rubric.boardingPref?.includes('full') ? 2.5 : 1.4
  if (category === 'pastoral') weight = rubric.senNeed && !rubric.senNeed.includes('no-concern') ? 2.4 : 1.5
  if (category === 'fees') weight = rubric.budgetMaxAnnual ? 2.2 : 1.1
  if (category === 'location') weight = rubric.homeRegion ? 1.7 : 0.9
  if (category === 'academics') weight = /(a-level|a level)/.test(l) ? 1.8 : 1.2
  if (category === 'admissions') weight = rubric.childYear && rubric.childYear >= 8 ? 1.5 : 1.0
  if (category === 'scholarship') weight = 1.5
  if (category === 'school_stage' && /school type/.test(l) && rubric.boardingPref?.includes('full')) weight = 2.0
  if (category === 'community') weight = 0.7
  if (/class size/.test(l) && rubric.classSizePref?.includes('no-preference')) weight *= 0.35

  if (lensWeight > 0) weight *= 1 + Math.min(1.25, lensWeight / 5)
  return clamp(weight, 0.25, 4.25)
}

function cleanValueForSummary(value: string): string {
  return value
    .split(/\s+·\s+|\s+-\s+/)
    .filter(part => {
      const p = part.trim()
      if (!p) return false
      if (/^https?:\/\//.test(p)) return false
      if (/^[a-z_]+(?:\.[a-z_]+)*$/.test(p)) return false
      return true
    })
    .join(' · ')
    .replace(/\s+/g, ' ')
    .trim()
}

function summarizeSignal(rowLabel: string, value: string): string {
  const clean = cleanValueForSummary(value)
  return `${rowLabel}: ${clean}`.slice(0, 170)
}

function pushSignal(list: Signal[], signal: Signal): void {
  const key = signal.text.toLowerCase()
  if (list.some(s => s.text.toLowerCase() === key)) return
  list.push(signal)
}

function isWeakStrengthCandidate(value: string, category: DecisionCategory): boolean {
  const t = value.trim().toLowerCase()
  if (isStructuralNoiseValue(t)) return true
  // Boilerplate from chat extraction that doesn't differentiate schools.
  if (category === 'pastoral' && /^tutor meets regularly/.test(t)) return true
  return false
}

function applyDelta(
  school: ScoredSchool,
  category: DecisionCategory,
  delta: number,
  signalText: string,
  rawValue: string,
  rubric: Rubric,
): void {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.05) return
  const current = school.categoryScores[category] ?? 0
  const cap = categoryCap(category, rubric)
  const negativeCap = category === 'school_stage' ? 10 : cap * 0.75
  let applied = delta

  if (delta > 0) {
    applied = Math.min(delta, Math.max(0, cap - current))
  } else {
    applied = Math.max(delta, -negativeCap - current)
  }
  if (Math.abs(applied) < 0.05) return

  school.categoryScores[category] = current + applied
  school.score += applied

  const signal = { text: signalText, impact: applied, category }
  if (applied >= 0.75 && !isWeakStrengthCandidate(rawValue, category)) pushSignal(school.strengths, signal)
  if (applied <= -0.5) pushSignal(school.reservations, signal)
}

function addSchoolStageAdjustments(scored: ScoredSchool[], rubric: Rubric): void {
  for (const school of scored) {
    const identity = `${school.name} ${school.slug}`.toLowerCase()
    if (rubric.childYear && rubric.childYear >= 9 && /(prep|preparatory|primary)/.test(identity)) {
      applyDelta(
        school,
        'school_stage',
        -8,
        `School stage: ${school.name} appears to be a prep/primary-stage option for a Year ${rubric.childYear} brief`,
        '',
        rubric,
      )
    }
  }
}

function applyEvidenceThinAnnotation(scored: ScoredSchool[]): void {
  // Schools with thin coverage shouldn't show 5 "evidence missing" pills
  // — that's a presentation problem, not a fit problem. Replace those
  // pills with a single honest "evidence sparse — confirm with admissions"
  // line so the verdict reads like advisor work.
  for (const school of scored) {
    if (!school.evidenceThin) continue
    school.reservations = school.reservations.filter(r => !/evidence missing$/i.test(r.text))
    const note = `Evidence sparse — only ${school.evidenceCells}/${school.totalCells} comparison rows have data; rank below the lead is provisional. Confirm with admissions.`
    if (!school.reservations.some(r => r.text.startsWith('Evidence sparse'))) {
      school.reservations.unshift({ text: note, impact: -0.5, category: 'other' })
    }
  }
}

function scoreSchools(data: ComparisonData, rubric: Rubric, lensWeightsByRowId?: Record<string, number>): ScoredSchool[] {
  const clustered = clusterRows(data.rows)
  const scored: ScoredSchool[] = data.schools.map(s => ({
    slug: s.slug,
    name: s.name,
    score: 0,
    categoryScores: Object.fromEntries(CATEGORIES.map(c => [c, 0])) as Partial<Record<DecisionCategory, number>>,
    strengths: [],
    reservations: [],
    evidenceCells: 0,
    totalCells: clustered.length,
    evidenceThin: false,
  }))

  // Pre-pass — count meaningful coverage per school. A "No usable data"
  // string is a value but not actually evidence, so treat it as missing
  // for coverage even though it still scores as a small negative signal.
  for (const row of clustered) {
    row.cells.forEach((cell, idx) => {
      if (isMeaningfulCellText(cellText(cell))) {
        const school = scored[idx]
        if (school) school.evidenceCells += 1
      }
    })
  }
  for (const school of scored) {
    school.evidenceThin = school.totalCells > 0 && school.evidenceCells / school.totalCells < 0.4
  }

  for (const row of clustered) {
    const category = rowCategory(row.label)
    const direction = rowDirection(row.label)
    const weight = rowWeight(row, category, rubric, lensWeightForRow(row, lensWeightsByRowId))
    const rowValues = row.cells.map(cellText)
    const numericValues = rowValues.map(value => value ? numericSignal(value, row.label) : null)
    const finiteNumbers = numericValues.filter((n): n is number => n != null && Number.isFinite(n))
    const min = finiteNumbers.length ? Math.min(...finiteNumbers) : null
    const max = finiteNumbers.length ? Math.max(...finiteNumbers) : null

    rowValues.forEach((value, idx) => {
      const school = scored[idx]
      if (!school) return

      if (!value) {
        // Soften the per-row missing-evidence penalty for schools with
        // already-thin coverage so they aren't double-punished.
        const baseMissing = weight >= 2 ? -0.22 : -0.08
        const missing = school.evidenceThin ? baseMissing * 0.4 : baseMissing
        applyDelta(school, category, missing * weight, `${row.label}: evidence missing`, '', rubric)
        return
      }

      let delta = qualitativeScore(value, row.label, category, rubric) * weight
      const n = numericValues[idx]
      if (direction !== 'text' && n != null && min != null && max != null && max !== min) {
        const normalised = (n - min) / (max - min)
        const numericDelta = direction === 'lower'
          ? (0.5 - normalised) * 2
          : (normalised - 0.5) * 2
        delta += numericDelta * weight
      }
      delta += budgetAdjustment(value, row.label, rubric) * weight

      applyDelta(school, category, delta, summarizeSignal(row.label, value), value, rubric)
    })
  }

  addSchoolStageAdjustments(scored, rubric)
  applyEvidenceThinAnnotation(scored)
  return scored.sort((a, b) => b.score - a.score)
}

function categoryLabel(category: DecisionCategory): string {
  if (category === 'school_stage') return 'school stage'
  return category.replace('_', ' ')
}

function topCategoryNames(school: ScoredSchool, limit: number): DecisionCategory[] {
  return Object.entries(school.categoryScores)
    .filter(([, score]) => typeof score === 'number' && (score as number) > 0.5)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, limit)
    .map(([category]) => category as DecisionCategory)
}

function topCategoriesText(school: ScoredSchool): string {
  const cats = topCategoryNames(school, 2).map(categoryLabel)
  return cats.length > 0 ? cats.join(' and ') : 'the available evidence'
}

function uniqueSignalTexts(signals: Signal[], limit: number): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const signal of signals.slice().sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))) {
    const key = signal.text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(signal.text)
    if (out.length >= limit) break
  }
  return out
}

function formatBudgetRange(raw: string): string {
  const m = raw.match(/(\d+)\s*k?\s*[-\s–]+\s*(\d+)\s*k?$/i)
  if (m) return `£${m[1]}k–£${m[2]}k`
  return raw
}

function formatCurriculum(raw: string): string {
  const m = raw.replace(/[-_]+/g, ' ').trim().toLowerCase()
  if (m === 'a level') return 'A-level'
  if (m === 'ib') return 'IB'
  if (m === 'a level or ib' || m === 'a-level or ib') return 'A-level or IB'
  return raw
}

function formatRegion(raw: string): string {
  return raw.replace(/[-_]+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase())
}

function decisionFactors(rubric: Rubric): string[] {
  const out: string[] = [
    'Evidence pool: every current general, child-fit, and chat-added comparison row, with near-duplicate rugby/SOCS/fees rows clustered.',
  ]
  if (rubric.topPriority)    out.push(`Top priority weighted up: ${rubric.topPriority.replace(/-/g, ' ')}.`)
  if (rubric.boardingPref)   out.push(`Boarding preference considered: ${rubric.boardingPref.replace(/-/g, ' ')}.`)
  if (rubric.homeRegion)     out.push(`Location preference considered: ${formatRegion(rubric.homeRegion)} (schools outside it pay a soft penalty).`)
  if (rubric.budgetRange)    out.push(`Budget range considered: ${formatBudgetRange(rubric.budgetRange)} (year-aware estimate from each school's fee range).`)
  if (rubric.curriculumPref) out.push(`Curriculum preference considered: ${formatCurriculum(rubric.curriculumPref)}.`)
  if (rubric.childYear)      out.push(`School-stage check applied for Year ${rubric.childYear}.`)
  return out.slice(0, 7)
}

function buildSummary(school: ScoredSchool, idx: number, top: ScoredSchool | undefined): string {
  if (idx === 0) {
    return `${school.name} leads on the weighted evidence pool, especially ${topCategoriesText(school)}.`
  }
  if (school.evidenceThin) {
    return `${school.name} sits below the lead mostly because the comparison has thin data on it — confirm key rows with admissions before deciding.`
  }
  const gap = top ? top.score - school.score : 0
  if (gap <= 1.5) {
    return `${school.name} is close to the lead; a small change in the high-priority evidence could move it up.`
  }
  return `${school.name} trails ${top?.name ?? 'the leader'} on the current child-weighted evidence.`
}

function bestForChildLine(top: ScoredSchool | undefined, childLabel: string, rubric: Rubric): string {
  if (!top) return `There is not enough comparison data yet to form a verdict for ${childLabel} brief.`
  const reasons: string[] = []
  const positive = topCategoryNames(top, 4)
  if (positive.includes('sport') && rubric.topPriority === 'sport') reasons.push('strongest sport evidence in the shortlist')
  if (positive.includes('boarding') && rubric.boardingPref?.includes('full')) reasons.push('full-boarding fit')
  if (positive.includes('location') && rubric.homeRegion) reasons.push('location matches the home region')
  if (positive.includes('academics') && (rubric.curriculumPref?.includes('a-level') || rubric.curriculumPref?.includes('a level'))) reasons.push('A-level academic profile')
  if (positive.includes('fees') && rubric.budgetMaxAnnual) reasons.push(`fees within the ${formatBudgetRange(rubric.budgetRange ?? '')} band`)
  const tail = reasons.length ? ` — ${reasons.slice(0, 3).join(', ')}.` : '.'
  return `For ${childLabel} current brief, ${top.name} is the practical first choice on the full Research Room evidence pool${tail}`
}

function dissentingViewLine(top: ScoredSchool | undefined, second: ScoredSchool | undefined): string {
  if (!second) return 'This verdict is provisional until at least two schools have enough evidence in the comparison.'
  if (!top) return ''
  let bestCat: DecisionCategory | null = null
  let bestGap = 0
  for (const c of CATEGORIES) {
    const tScore = top.categoryScores[c] ?? 0
    const sScore = second.categoryScores[c] ?? 0
    if (sScore - tScore > bestGap) {
      bestGap = sScore - tScore
      bestCat = c
    }
  }
  if (bestCat && bestGap > 0.6) {
    return `${second.name} is the main challenger; it actually beats ${top.name} on ${categoryLabel(bestCat)}, so if that matters more to the family than ${top.name}'s gaps, the order can flip.`
  }
  return `${second.name} is the main challenger. If its reservations are less important to the family than ${top.name}'s gaps, the order could reasonably change.`
}

function collectEvidenceGaps(data: ComparisonData, scored: ScoredSchool[], rubric: Rubric): string[] {
  // Group rows by canonical cluster so "Rugby standing" / "Rugby strength
  // summary" / "Rugby strength" report once, not three times.
  const byCluster = new Map<string, { label: string; missing: number; weight: number }>()
  for (const row of data.rows) {
    const missing = row.cells.filter(c => !isMeaningfulCellText(cellText(c))).length
    if (missing === 0) continue
    const category = rowCategory(row.label)
    const weight = rowWeight(row, category, rubric, 0)
    const { key, preferredLabel } = clusterKey(row.label)
    const isClustered = !key.startsWith('row:')
    const label = isClustered ? preferredLabel : row.label
    const existing = byCluster.get(key)
    if (existing) {
      existing.missing = Math.max(existing.missing, missing)
      existing.weight = Math.max(existing.weight, weight)
    } else {
      byCluster.set(key, { label, missing, weight })
    }
  }

  const gaps = Array.from(byCluster.values())
    .sort((a, b) => (b.missing * b.weight) - (a.missing * a.weight))
    .slice(0, 6)
    .map(g => `${g.label}: ${g.missing} school${g.missing === 1 ? '' : 's'} missing evidence`)

  const thin = scored.filter(s => s.evidenceThin)
  if (thin.length > 0) {
    gaps.unshift(`Coverage thin on ${thin.map(s => s.name).join(' + ')}; rank below the lead is provisional until those rows are filled.`)
  }
  return gaps.slice(0, 6)
}

function collectSources(data: ComparisonData): ResearchVerdict['sources'] {
  const out: ResearchVerdict['sources'] = []
  const seen = new Set<string>()
  for (const row of data.rows) {
    row.cells.forEach((cell, idx) => {
      if (cell.kind !== 'value' || !cell.sub) return
      const urlMatch = cell.sub.match(/https?:\/\/\S+/)
      const url = urlMatch?.[0]
      if (!url || seen.has(url)) return
      seen.add(url)
      const school = data.schools[idx]
      const { key, preferredLabel } = clusterKey(row.label)
      const isClustered = !key.startsWith('row:')
      out.push({ url, label: isClustered ? preferredLabel : row.label, school_slug: school?.slug })
    })
  }
  return out.slice(0, 12)
}

function confidenceFor(data: ComparisonData, scored: ScoredSchool[]): ResearchVerdict['confidence'] {
  const totalCells = data.rows.length * data.schools.length
  const present = data.rows.reduce((sum, row) => sum + row.cells.filter(c => isMeaningfulCellText(cellText(c))).length, 0)
  const coverage = totalCells > 0 ? present / totalCells : 0
  const gap = scored[0] && scored[1] ? scored[0].score - scored[1].score : 0
  const thinCount = scored.filter(s => s.evidenceThin).length
  if (data.schools.length < 2 || data.rows.length < 4 || coverage < 0.35) return 'low'
  if (thinCount > scored.length / 2) return 'low'
  if (coverage >= 0.65 && gap >= 3 && thinCount === 0) return 'high'
  return 'medium'
}

function buildMarkdown(verdict: ResearchVerdict): string {
  const lines: string[] = [
    `# ${verdict.headline}`,
    '',
    verdict.best_for_child,
    '',
    '## Decision factors',
  ]

  for (const factor of verdict.decision_factors ?? []) lines.push(`- ${factor}`)

  lines.push('', '## Current ranking')

  for (const school of verdict.ranked_schools) {
    lines.push('', `### ${school.rank}. ${school.name}`, school.summary)
    if (school.strengths.length > 0) {
      lines.push('', 'Strengths:')
      for (const s of school.strengths.slice(0, 3)) lines.push(`- ${s}`)
    }
    if (school.reservations.length > 0) {
      lines.push('', 'Reservations:')
      for (const r of school.reservations.slice(0, 3)) lines.push(`- ${r}`)
    }
  }

  lines.push('', '## Dissenting view', verdict.dissenting_view)
  if (verdict.evidence_gaps.length > 0) {
    lines.push('', '## Evidence gaps')
    for (const gap of verdict.evidence_gaps) lines.push(`- ${gap}`)
  }
  lines.push('', '## Next checks')
  lines.push('- Confirm the highest-priority evidence gaps directly with admissions.')
  lines.push('- Ask each school the same follow-up question so the comparison stays fair.')
  lines.push('- Revisit the verdict after any new row is added to the comparison.')

  return lines.join('\n')
}

function stableHashValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableHashValue)
  if (!value || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = stableHashValue((value as Record<string, unknown>)[key])
  }
  return out
}

export function buildResearchVerdictDraft(args: BuildArgs): { inputHash: string; verdict: ResearchVerdict; bodyMarkdown: string } {
  const rubric = buildRubric(args.childProfile)
  const scored = scoreSchools(args.comparisonData, rubric, args.lensWeightsByRowId)
  const top = scored[0]
  const second = scored[1]
  const childLabel = args.childName ? `${args.childName}'s` : 'your child\'s'
  const confidence = confidenceFor(args.comparisonData, scored)

  const ranked = scored.map((s, idx) => ({
    slug: s.slug,
    name: s.name,
    rank: idx + 1,
    summary: buildSummary(s, idx, top),
    strengths: uniqueSignalTexts(s.strengths, 5),
    reservations: uniqueSignalTexts(s.reservations, 5),
  }))

  const verdict: ResearchVerdict = {
    format: 'research_verdict_v2',
    decision_model: 'evidence_pool_v2',
    confidence,
    decision_factors: decisionFactors(rubric),
    headline: top ? `${top.name} is the best current fit for ${args.childName ?? 'this child'}` : 'No verdict yet',
    ranked_schools: ranked,
    best_for_child: bestForChildLine(top, childLabel, rubric),
    dissenting_view: dissentingViewLine(top, second),
    evidence_gaps: collectEvidenceGaps(args.comparisonData, scored, rubric),
    sources: collectSources(args.comparisonData),
  }

  const hashPayload = {
    version: 2,
    sessionId: args.sessionId,
    childId: args.childId,
    activeLensId: args.activeLensId ?? null,
    baseLensKind: args.baseLensKind,
    schools: args.comparisonData.schools,
    rows: args.comparisonData.rows,
    childProfile: args.childProfile ?? {},
    lensWeightsByRowId: args.lensWeightsByRowId ?? {},
  }
  const inputHash = crypto.createHash('sha256').update(JSON.stringify(stableHashValue(hashPayload))).digest('hex')
  const bodyMarkdown = buildMarkdown(verdict)
  return { inputHash, verdict, bodyMarkdown }
}

export async function loadCachedResearchVerdict(
  supabase: SupabaseClient,
  args: {
    sessionId: string
    childId: string
    lensId: string | null
    baseLensKind: 'general' | 'child_fit'
    inputHash: string
  },
): Promise<ResearchVerdictRecord | null> {
  let q = supabase
    .from('research_verdicts')
    .select('id, input_hash, verdict_json, body_markdown, generated_at')
    .eq('session_id', args.sessionId)
    .eq('child_id', args.childId)
    .eq('input_hash', args.inputHash)

  q = args.lensId
    ? q.eq('lens_id', args.lensId)
    : q.is('lens_id', null).eq('base_lens_kind', args.baseLensKind)

  const { data, error } = await q.maybeSingle()
  if (error) throw new Error(`loadCachedResearchVerdict: ${error.message}`)
  if (!data) {
    let fallback = supabase
      .from('research_verdicts')
      .select('id, input_hash, verdict_json, body_markdown, generated_at')
      .eq('session_id', args.sessionId)
      .eq('child_id', args.childId)
      .order('generated_at', { ascending: false })
      .limit(1)

    fallback = args.lensId
      ? fallback.eq('lens_id', args.lensId)
      : fallback.is('lens_id', null).eq('base_lens_kind', args.baseLensKind)

    const { data: stale, error: staleError } = await fallback.maybeSingle()
    if (staleError) throw new Error(`loadCachedResearchVerdict fallback: ${staleError.message}`)
    if (!stale) return null
    return {
      id: stale.id,
      input_hash: stale.input_hash,
      verdict_json: stale.verdict_json as ResearchVerdict,
      body_markdown: stale.body_markdown,
      generated_at: stale.generated_at,
      cache_status: 'stale',
    }
  }
  return {
    id: data.id,
    input_hash: data.input_hash,
    verdict_json: data.verdict_json as ResearchVerdict,
    body_markdown: data.body_markdown,
    generated_at: data.generated_at,
    cache_status: 'current',
  }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ComparisonData, RowCell, SchoolColumn } from '@/components/nana/comparison-placeholder'

// Real-data shape mapper for the Research Room Comparison table.
// Reads shortlisted_schools × schools × school_structured_data × school_sensitive
// for the active user and produces a ComparisonData payload that
// ComparisonView already knows how to render.

type StructuredRow = {
  school_slug:        string
  fees_min:           number | null
  fees_max:           number | null
  fees_currency:      string | null
  exam_results:       Record<string, unknown> | null
  university_destinations: Record<string, unknown> | null
  admissions_format:  Record<string, unknown> | null
  sports_profile:     Record<string, unknown> | null
  student_community:  Record<string, unknown> | null
  bursary_note:       string | null
}

type SchoolMeta = {
  slug:          string
  name:          string
  city:          string | null
  region:        string | null
  boarding:      boolean | null
  gender_split:  string | null
}

type ISIRow = {
  school_slug: string
  date:        string | null
  title:       string | null
  summary:     string | null
}

// ─── Boarding name list (mirrors recommend-shortlist.ts) ──────────────────
function normalizeSchoolName(name: string | null | undefined): string {
  if (!name) return ''
  return name.toLowerCase()
    .replace(/['‘’]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/\b(school|college)\b/g, '')
    .replace(/\s+/g, ' ').trim()
}
const KNOWN_FULL_BOARDING_NAMES = new Set<string>([
  'eton','harrow','winchester','rugby','tonbridge','sherborne','sherborne girls',
  'marlborough','repton','uppingham','oundle','stowe','radley','wellington',
  'bradfield','bedales','cheltenham','cheltenham ladies','clifton','cranleigh',
  'lancing','roedean','wycombe abbey','st marys ascot','st marys calne',
  'benenden','downe house','queenswood','tudor hall','woldingham','headington',
  'malvern','malvern st james','bromsgrove','worth','stonyhurst','ampleforth',
  'sedbergh','pocklington','queen ethelburgas collegiate','rossall','oakham',
  'ellesmere','concord','gordonstoun','loretto','fettes','glenalmond',
  'merchiston castle','strathallan','millfield','shrewsbury','sevenoaks',
  'felsted','kings canterbury','kings ely','st edwards oxford','leys',
  'kent canterbury','kings taunton','taunton','monkton combe','mount kelly',
  'kingswood bath','wells cathedral','dauntseys','canford','bryanston',
  'eastbourne','ardingly','hurstpierpoint','caterham','shiplake','reeds',
  'reading blue coat','mill hill foundation','st leonards','st edmunds canterbury',
  'denstone','milton abbey','haileybury','charterhouse','bishops stortford',
  'hurtwood house','queen annes','queen annes caversham',
])

// ─── Sport tier short label (uses same prose-keyword scan as recommender) ─
function sportShortLabel(tier: string | null | undefined): string {
  if (!tier) return '—'
  const lc = tier.toLowerCase()
  if (/national.elite|elite.national|national.champion|leading.uk|top 1\b|top 1%|one of the uk's leading/.test(lc)) return 'National elite'
  if (/national.strong|nationally.competitive|nationally.strong|national.level|nationally|leading independent|sector.leading|elite.tier/.test(lc)) return 'National strong'
  if (/regional.strong|strong regional|regional.national|national.regional|strong national|strong.competitive/.test(lc)) return 'Regional-strong'
  if (/regional|county/.test(lc)) return 'Regional'
  if (/local|school.level|recreational|inter.house/.test(lc)) return 'Local'
  return 'Mid-tier'
}

// ─── Cell builders ────────────────────────────────────────────────────────

function feesCell(s: StructuredRow): RowCell {
  const min = typeof s.fees_min === 'number' ? s.fees_min : null
  const max = typeof s.fees_max === 'number' ? s.fees_max : null
  const cur = s.fees_currency ?? 'GBP'
  if (min == null && max == null) return { kind: 'empty' }
  const sym = cur === 'GBP' ? '£' : cur === 'USD' ? '$' : ''
  const fmt = (n: number) => `${sym}${n.toLocaleString()}`
  if (min != null && max != null && max !== min) {
    return { kind: 'value', primary: `${fmt(min)}–${fmt(max)}`, numeric: true }
  }
  return { kind: 'value', primary: fmt(min ?? max!), numeric: true }
}

function aLevelPctCell(s: StructuredRow): RowCell {
  const al = (s.exam_results as any)?.a_level as Record<string, unknown> | undefined
  const pct = al?.pct_a_star_a
  if (typeof pct !== 'number') return { kind: 'empty' }
  return { kind: 'value', primary: `${Math.round(pct)}%`, numeric: true }
}

function oxbridgeCell(s: StructuredRow): RowCell {
  const u = s.university_destinations
  if (!u) return { kind: 'empty' }
  const ox = Number(u.oxford_count ?? 0)
  const cam = Number(u.cambridge_count ?? 0)
  const total = ox + cam
  if (!total) return { kind: 'empty' }
  const yr = u.year ? ` (${String(u.year).slice(-2)})` : ''
  return { kind: 'value', primary: `${total} places${yr}`, sub: 'Oxford + Cambridge' }
}

function houseSizeCell(s: StructuredRow): RowCell {
  const total = (s.student_community as any)?.total_pupils
  if (typeof total !== 'number') return { kind: 'empty' }
  let sub = ''
  if (total <= 400) sub = 'Small'
  else if (total <= 800) sub = 'Mid-size'
  else if (total <= 1200) sub = 'Larger'
  else sub = 'Very large'
  return { kind: 'value', primary: `~${total.toLocaleString()}`, sub }
}

function sportCell(s: StructuredRow): RowCell {
  const tier = (s.sports_profile as any)?.competitive_tier as string | undefined
  const label = sportShortLabel(tier)
  if (label === '—') return { kind: 'empty' }
  return { kind: 'value', primary: label }
}

function isiCell(isi: ISIRow | undefined): RowCell {
  if (!isi) return { kind: 'empty' }
  const yr = isi.date ? ` (${isi.date.slice(0, 4)})` : ''
  // Try to extract grade from title/summary — ISI uses Excellent / Good / Sound
  const text = `${isi.title ?? ''} ${isi.summary ?? ''}`.toLowerCase()
  let grade = '—'
  if (/\bexcellent\b/.test(text)) grade = 'Excellent'
  else if (/\bgood\b/.test(text)) grade = 'Good'
  else if (/\bsound\b/.test(text)) grade = 'Sound'
  else if (/\bunsatisfactory\b/.test(text)) grade = 'Unsatisfactory'
  if (grade === '—') return { kind: 'value', primary: 'Inspected', sub: isi.date?.slice(0, 4) }
  return { kind: 'value', primary: grade, sub: yr.replace(/[()\s]/g, '') }
}

function entryWindowCell(s: StructuredRow): RowCell {
  const af = s.admissions_format as any
  const ep = af?.entry_points
  if (!ep) return { kind: 'empty' }
  // entry_points can be array of strings, array of objects, or a string
  let label = ''
  if (Array.isArray(ep)) {
    const first = ep.find(x => x != null)
    if (typeof first === 'string') label = first
    else if (first && typeof first === 'object') label = (first as any).label ?? (first as any).year ?? JSON.stringify(first).slice(0, 50)
  } else if (typeof ep === 'string') {
    label = ep
  }
  label = label.trim().slice(0, 40)
  if (!label) return { kind: 'empty' }
  return { kind: 'value', primary: label }
}

function bursaryCell(s: StructuredRow): RowCell {
  const note = s.bursary_note
  if (!note || !note.trim()) return { kind: 'empty' }
  // Pull a short headline — first sentence or up to 50 chars
  const trimmed = note.replace(/\s+/g, ' ').trim()
  const m = trimmed.match(/up to (\d+%)/i) ?? trimmed.match(/(\d+% bursary)/i)
  if (m) return { kind: 'value', primary: m[0] }
  const short = trimmed.length > 40 ? trimmed.slice(0, 37) + '…' : trimmed
  return { kind: 'value', primary: short }
}

function fourLightCell(s: StructuredRow): RowCell {
  const al = (s.exam_results as any)?.a_level as Record<string, unknown> | undefined
  const aaPct = typeof al?.pct_a_star_a === 'number' ? al.pct_a_star_a : null
  const total = (s.student_community as any)?.total_pupils
  const ox = Number((s.university_destinations as any)?.oxford_count ?? 0)
  const cam = Number((s.university_destinations as any)?.cambridge_count ?? 0)
  const oxbridge = ox + cam
  const bursary = (s.bursary_note ?? '').toLowerCase()

  type Tone = 'green' | 'amber' | 'red'
  const acad: Tone = aaPct == null ? 'amber' : aaPct >= 60 ? 'green' : aaPct >= 40 ? 'amber' : 'red'
  const past: Tone = typeof total === 'number'
    ? total <= 800 ? 'green' : total <= 1200 ? 'amber' : 'red'
    : 'amber'
  const val: Tone = /up to (90|100)/.test(bursary) ? 'green'
    : /up to (50|70|80)/.test(bursary) ? 'amber'
    : bursary ? 'amber' : 'red'
  const amb: Tone = oxbridge >= 10 ? 'green' : oxbridge >= 3 ? 'amber' : 'red'

  return {
    kind: 'lights',
    lights: [
      { label: 'Acad', tone: acad },
      { label: 'Past', tone: past },
      { label: 'Val',  tone: val  },
      { label: 'Amb',  tone: amb  },
    ],
  }
}

function boardingCell(meta: SchoolMeta): RowCell {
  const norm = normalizeSchoolName(meta.name)
  const knownBoarding = KNOWN_FULL_BOARDING_NAMES.has(norm)
  const flag = meta.boarding === true || knownBoarding
  const gender = (meta.gender_split ?? '').toLowerCase()
  const sub =
    gender === 'boys' || gender === 'boys only' ? 'Boys' :
    gender === 'girls' || gender === 'girls only' ? 'Girls' :
    gender ? 'Co-ed' : ''
  if (flag) return { kind: 'value', primary: 'Boarding', sub: sub || 'Day + boarding' }
  return { kind: 'value', primary: 'Day', sub }
}

// ─── Main entrypoint ──────────────────────────────────────────────────────

export async function loadComparisonData(
  supabase: SupabaseClient,
  userId: string,
): Promise<ComparisonData> {
  // 1. Shortlist
  const { data: rows } = await supabase
    .from('shortlisted_schools')
    .select('school_slug, added_at')
    .eq('user_id', userId)
    .order('added_at', { ascending: true })

  const slugs = (rows ?? []).map((r: { school_slug: string }) => r.school_slug)
  if (slugs.length === 0) return { schools: [], rows: [] }

  // 2. Parallel fetch metadata + structured + ISI rows
  const [schoolsRes, structRes, isiRes] = await Promise.all([
    supabase.from('schools')
      .select('slug, name, city, region, boarding, gender_split')
      .in('slug', slugs),
    supabase.from('school_structured_data')
      .select('school_slug, fees_min, fees_max, fees_currency, exam_results, university_destinations, admissions_format, sports_profile, student_community, bursary_note')
      .in('school_slug', slugs),
    supabase.from('school_sensitive')
      .select('school_slug, date, title, summary')
      .in('school_slug', slugs)
      .eq('source', 'isi')
      .order('date', { ascending: false }),
  ])

  const schoolMap = new Map<string, SchoolMeta>(
    (schoolsRes.data ?? []).map((s: any) => [s.slug, s])
  )
  const structMap = new Map<string, StructuredRow>(
    (structRes.data ?? []).map((s: any) => [s.school_slug, s])
  )
  // Take latest ISI per school (rows already sorted desc)
  const isiMap = new Map<string, ISIRow>()
  for (const i of (isiRes.data ?? []) as ISIRow[]) {
    if (!isiMap.has(i.school_slug)) isiMap.set(i.school_slug, i)
  }

  // 3. Build columns (school headers) — one per slug, in shortlist order
  const schools: SchoolColumn[] = []
  for (const slug of slugs) {
    const m = schoolMap.get(slug)
    if (!m) continue
    const metaParts = [m.region ?? m.city, m.gender_split].filter(Boolean)
    schools.push({
      slug,
      name: m.name,
      meta: metaParts.join(' · ') || '—',
    })
  }

  if (schools.length === 0) return { schools: [], rows: [] }

  // 4. Build the 10 rows
  const cellsFor = (rowKey: string): RowCell[] => {
    return schools.map(col => {
      const struct = structMap.get(col.slug) ?? {} as StructuredRow
      const meta = schoolMap.get(col.slug)!
      const isi = isiMap.get(col.slug)
      switch (rowKey) {
        case 'fees':       return feesCell(struct)
        case 'a-star-a':   return aLevelPctCell(struct)
        case 'oxbridge':   return oxbridgeCell(struct)
        case 'pastoral':   return houseSizeCell(struct)
        case 'sport':      return sportCell(struct)
        case 'isi':        return isiCell(isi)
        case 'y9-entry':   return entryWindowCell(struct)
        case 'bursary':    return bursaryCell(struct)
        case 'four-light': return fourLightCell(struct)
        case 'boarding':   return boardingCell(meta)
        default:           return { kind: 'empty' }
      }
    })
  }

  const tableRows = [
    { id: 'fees',       label: 'Fees',           emphasis: 'annual',     blurb: 'Senior fees from the school site',   cells: cellsFor('fees') },
    { id: 'a-star-a',   label: 'A*–A',           emphasis: 'A-level',    blurb: 'Share of grades at A* or A',          cells: cellsFor('a-star-a') },
    { id: 'oxbridge',   label: 'Oxbridge',       emphasis: 'recent yr',  blurb: 'Leavers placed at Oxford or Cambridge', cells: cellsFor('oxbridge') },
    { id: 'pastoral',   label: 'Total pupils',                            blurb: 'School-wide; smaller = closer pastoral',  cells: cellsFor('pastoral') },
    { id: 'sport',      label: 'Sport tier',                              blurb: 'Competitive standing across major sports', cells: cellsFor('sport') },
    { id: 'isi',        label: 'ISI inspection',                          blurb: 'Most recent overall outcome',         cells: cellsFor('isi') },
    { id: 'y9-entry',   label: 'Entry window',                            blurb: 'Earliest published entry point',     cells: cellsFor('y9-entry') },
    { id: 'bursary',    label: 'Bursary',                                 blurb: 'Maximum means-tested fee remission', cells: cellsFor('bursary') },
    { id: 'four-light', label: '4-light verdict', blurb: 'Acad / Past / Val / Amb (heuristic)',                        cells: cellsFor('four-light') },
    { id: 'boarding',   label: 'Boarding',                                blurb: 'Type · gender mix',                  cells: cellsFor('boarding') },
  ]

  return { schools, rows: tableRows }
}

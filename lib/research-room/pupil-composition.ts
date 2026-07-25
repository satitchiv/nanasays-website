export type NotionBackfillRow = {
  school_slug: string
  status: string
  parsed: Record<string, unknown> | null
}

export type PupilComposition = {
  total: number
  boarding: number
  day: number
  international: number | null
  boardingPct: number
  dayPct: number
  internationalPct: number | null
  source: 'school_structured_data' | 'school_notion_backfill'
}

export type PupilCompositionResolution =
  | { status: 'ready'; composition: PupilComposition; reasons: string[] }
  | { status: 'insufficient' | 'conflict'; composition: null; reasons: string[] }

const PERCENT_TOLERANCE = 2

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function positiveCount(value: unknown): number | null {
  const number = finiteNumber(value)
  return number != null && number >= 0 ? Math.round(number) : null
}

function percent(value: unknown): number | null {
  const number = finiteNumber(value)
  if (number == null || number < 0 || number > 100) return null
  return number
}

function roundedPercent(value: number): number {
  return Math.round(value)
}

function explicitBoarderCount(
  structured: Record<string, unknown> | null,
  community: Record<string, unknown>,
): number | null {
  const normalized = positiveCount(community.boarder_count)
  if (normalized != null) return normalized

  const schoolLife = structured?.school_life
  const boardingLife = schoolLife && typeof schoolLife === 'object' && !Array.isArray(schoolLife)
    ? (schoolLife as Record<string, unknown>).boarding_life
    : null
  for (const text of [boardingLife, community.notes]) {
    if (typeof text !== 'string') continue
    const match = text.match(/\b(\d{2,4})\s+(?:full[- ]?)?boarders?\b/i)
    if (match) return positiveCount(Number(match[1]))
  }
  return null
}

function buildComposition({
  total,
  boarding,
  day,
  international,
  boardingPct,
  dayPct,
  source,
}: {
  total: number
  boarding: number
  day: number
  international: number | null
  boardingPct: number
  dayPct: number
  source: PupilComposition['source']
}): PupilComposition {
  return {
    total,
    boarding,
    day,
    international,
    boardingPct: roundedPercent(boardingPct),
    dayPct: roundedPercent(dayPct),
    internationalPct: international == null
      ? null
      : roundedPercent((international / total) * 100),
    source,
  }
}

function structuredComposition(
  structured: Record<string, unknown> | null,
): PupilCompositionResolution {
  const community = structured?.student_community
  if (!community || typeof community !== 'object' || Array.isArray(community)) {
    return { status: 'insufficient', composition: null, reasons: ['No structured pupil community'] }
  }
  const values = community as Record<string, unknown>
  const total = positiveCount(values.total_pupils)
  const boardingPct = percent(values.boarding_pct)
  const dayPct = percent(values.day_pct)
  if (total == null || total <= 0 || boardingPct == null || dayPct == null) {
    return {
      status: 'insufficient',
      composition: null,
      reasons: ['Structured total, boarding percentage and day percentage are not all available'],
    }
  }
  if (Math.abs(boardingPct + dayPct - 100) > PERCENT_TOLERANCE) {
    return {
      status: 'conflict',
      composition: null,
      reasons: ['Structured boarding and day percentages do not total approximately 100%'],
    }
  }

  const explicitBoarding = explicitBoarderCount(structured, values)
  const explicitDay = positiveCount(values.day_count)
  const boarding = explicitBoarding ?? Math.round(total * boardingPct / 100)
  const day = explicitDay ?? total - boarding
  if (boarding < 0 || day < 0 || Math.abs(boarding + day - total) > 1) {
    return {
      status: 'conflict',
      composition: null,
      reasons: ['Structured boarding and day counts do not reconcile with total pupils'],
    }
  }

  const explicitInternational = positiveCount(values.intl_count)
  const internationalPct = percent(values.pct_international)
  const international = explicitInternational
    ?? (internationalPct == null ? null : Math.round(total * internationalPct / 100))
  if (international != null && international > total) {
    return {
      status: 'conflict',
      composition: null,
      reasons: ['Structured international pupil count exceeds total pupils'],
    }
  }

  return {
    status: 'ready',
    composition: buildComposition({
      total,
      boarding,
      day,
      international,
      boardingPct: explicitBoarding == null ? boardingPct : boarding / total * 100,
      dayPct: explicitBoarding == null ? dayPct : day / total * 100,
      source: 'school_structured_data',
    }),
    reasons: [],
  }
}

function notionComposition(
  _structured: Record<string, unknown> | null,
  notion: NotionBackfillRow | null,
): PupilCompositionResolution {
  if (!notion?.parsed || !['clean', 'matched'].includes(notion.status)) {
    return { status: 'insufficient', composition: null, reasons: ['No approved Notion sidecar record'] }
  }
  const total = positiveCount(notion.parsed.total_pupils)
  const boarding = positiveCount(notion.parsed.boarder_count)
  const international = positiveCount(notion.parsed.intl_count)
  const storedBoardingPct = percent(notion.parsed.boarding_ratio)
  if (total == null || total <= 0 || boarding == null) {
    return {
      status: 'insufficient',
      composition: null,
      reasons: ['Notion total and boarding count are not both available'],
    }
  }
  if (boarding > total || (international != null && international > total)) {
    return {
      status: 'conflict',
      composition: null,
      reasons: ['A Notion pupil count exceeds total pupils'],
    }
  }

  const reasons: string[] = []
  const ratioFromCounts = boarding / total * 100
  if (
    storedBoardingPct != null
    && Math.abs(ratioFromCounts - storedBoardingPct) > PERCENT_TOLERANCE
  ) {
    // Counts are displayed elsewhere in the same comparison. Deriving the mix
    // from those counts keeps all three rows internally consistent even when
    // the stored percentage came from a different school year.
    reasons.push('Stored Notion boarding ratio differs from pupil counts; using count-derived ratio')
  }

  const day = total - boarding
  const boardingPct = ratioFromCounts
  return {
    status: 'ready',
    composition: buildComposition({
      total,
      boarding,
      day,
      international,
      boardingPct,
      dayPct: 100 - boardingPct,
      source: 'school_notion_backfill',
    }),
    reasons,
  }
}

export function resolvePupilComposition(
  structured: Record<string, unknown> | null,
  notion: NotionBackfillRow | null,
): PupilCompositionResolution {
  const structuredResult = structuredComposition(structured)
  if (structuredResult.status === 'ready' || structuredResult.status === 'conflict') {
    return structuredResult
  }
  return notionComposition(structured, notion)
}

function formatClassSizeValue(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return String(Math.round(value))
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const range = value as Record<string, unknown>
  const min = positiveCount(range.min)
  const max = positiveCount(range.max)
  if (min == null || max == null || min <= 0 || max < min) return null
  return min === max ? String(min) : `${min}–${max}`
}

export function resolveNotionClassSize(
  notion: NotionBackfillRow | null,
): { value: string; source: string } | null {
  if (!notion?.parsed || !['clean', 'matched'].includes(notion.status)) return null
  const classSize = notion.parsed.class_size
  if (!classSize || typeof classSize !== 'object' || Array.isArray(classSize)) return null
  const values = classSize as Record<string, unknown>
  const senior = formatClassSizeValue(values.senior)
  const sixth = formatClassSizeValue(values.sixth)
  const average = formatClassSizeValue(values.average)
  const value = senior && sixth
    ? `Senior ${senior} · Sixth ${sixth}`
    : senior ?? sixth ?? (average ? `~${average} avg` : null)
  return value ? { value, source: 'school_notion_backfill.parsed.class_size' } : null
}

export type ComparisonBatchCell = {
  value?: string | number | null
  source?: string | null
  evidence_kind?: 'nana_database' | 'web_search'
}

export type ComparisonBatchSchool = {
  slug: string
  name: string
}

export type ComparisonBatchTopic = {
  id: string
  label: string
}

export type ComparisonBatchIssue = {
  school_slug: string
  topic_id: string
  reason: string
}

export type ComparisonBatchTopicCoverage = {
  id: string
  label: string
  ready_schools: number
  missing_schools: number
  coverage_percent: number
  requested_count: number
  missing_school_slugs: string[]
}

export type ComparisonTopicBatchReport = {
  schools_evaluated: number
  topics_evaluated: number
  cells_evaluated: number
  ready_cells: number
  missing_cells: number
  complete_topics: number
  partial_topics: number
  empty_topics: number
  issues: ComparisonBatchIssue[]
  source_counts: Record<string, number>
  topics: ComparisonBatchTopicCoverage[]
}

function hasUsableValue(cell: ComparisonBatchCell | null): boolean {
  return (typeof cell?.value === 'string' && cell.value.trim().length > 0)
    || (typeof cell?.value === 'number' && Number.isFinite(cell.value))
}

export function buildComparisonTopicBatchReport({
  schools,
  topics,
  requestedCountByTopic = new Map(),
  resolveCell,
}: {
  schools: ComparisonBatchSchool[]
  topics: ComparisonBatchTopic[]
  requestedCountByTopic?: ReadonlyMap<string, number>
  resolveCell: (
    topic: ComparisonBatchTopic,
    school: ComparisonBatchSchool,
  ) => ComparisonBatchCell | null
}): ComparisonTopicBatchReport {
  const issues: ComparisonBatchIssue[] = []
  const sourceCounts = new Map<string, number>()
  const topicCoverage: ComparisonBatchTopicCoverage[] = []
  let readyCells = 0

  for (const topic of topics) {
    const missingSchoolSlugs: string[] = []
    let topicReady = 0

    for (const school of schools) {
      let cell: ComparisonBatchCell | null
      try {
        cell = resolveCell(topic, school)
      } catch (error) {
        issues.push({
          school_slug: school.slug,
          topic_id: topic.id,
          reason: error instanceof Error ? error.message : 'resolver threw',
        })
        missingSchoolSlugs.push(school.slug)
        continue
      }

      if (!cell) {
        missingSchoolSlugs.push(school.slug)
        continue
      }
      if (!hasUsableValue(cell)) {
        issues.push({
          school_slug: school.slug,
          topic_id: topic.id,
          reason: 'resolver returned an unusable value',
        })
        missingSchoolSlugs.push(school.slug)
        continue
      }
      if (cell.evidence_kind === 'web_search') {
        issues.push({
          school_slug: school.slug,
          topic_id: topic.id,
          reason: 'UK database batch returned web-search evidence',
        })
        missingSchoolSlugs.push(school.slug)
        continue
      }

      topicReady += 1
      readyCells += 1
      const source = cell.source?.trim() || 'trusted_database_resolver'
      sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1)
    }

    topicCoverage.push({
      id: topic.id,
      label: topic.label,
      ready_schools: topicReady,
      missing_schools: missingSchoolSlugs.length,
      coverage_percent: schools.length === 0
        ? 0
        : Math.round((topicReady / schools.length) * 1000) / 10,
      requested_count: requestedCountByTopic.get(topic.label.toLowerCase()) ?? 0,
      missing_school_slugs: missingSchoolSlugs,
    })
  }

  const cellsEvaluated = schools.length * topics.length
  return {
    schools_evaluated: schools.length,
    topics_evaluated: topics.length,
    cells_evaluated: cellsEvaluated,
    ready_cells: readyCells,
    missing_cells: cellsEvaluated - readyCells,
    complete_topics: topicCoverage.filter(topic => topic.missing_schools === 0).length,
    partial_topics: topicCoverage.filter(topic =>
      topic.ready_schools > 0 && topic.missing_schools > 0
    ).length,
    empty_topics: topicCoverage.filter(topic => topic.ready_schools === 0).length,
    issues,
    source_counts: Object.fromEntries(
      Array.from(sourceCounts)
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
    topics: topicCoverage,
  }
}

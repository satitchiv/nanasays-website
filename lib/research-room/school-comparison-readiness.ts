export function partitionComparisonReadySchools<T extends { slug: string }>(
  schools: T[],
  structuredSchoolSlugs: ReadonlySet<string>,
): { ready: T[]; unready: T[] } {
  const ready: T[] = []
  const unready: T[] = []
  for (const school of schools) {
    if (structuredSchoolSlugs.has(school.slug)) ready.push(school)
    else unready.push(school)
  }
  return { ready, unready }
}

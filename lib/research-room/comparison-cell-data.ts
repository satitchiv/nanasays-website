export type ComparisonStoredCell = {
  value?: unknown
  [key: string]: unknown
}

export type ComparisonCellData = Record<string, ComparisonStoredCell>

function isCellData(value: unknown): value is ComparisonCellData {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function hasComparisonValueForSchools(
  cellData: unknown,
  schoolSlugs: string[],
): boolean {
  if (!isCellData(cellData)) return false
  return schoolSlugs.some(slug => {
    const value = cellData[slug]?.value
    return value != null && value !== ''
  })
}

export function omitComparisonSchoolCell(
  cellData: unknown,
  schoolSlug: string,
): { changed: boolean; cells: ComparisonCellData } {
  if (!isCellData(cellData)) return { changed: false, cells: {} }
  if (!Object.prototype.hasOwnProperty.call(cellData, schoolSlug)) {
    return { changed: false, cells: cellData }
  }
  const cells = { ...cellData }
  delete cells[schoolSlug]
  return { changed: true, cells }
}

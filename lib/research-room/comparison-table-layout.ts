const DESKTOP_LABEL_COLUMN_WIDTH = 260
const DESKTOP_SCHOOL_COLUMN_MIN_WIDTH = 220
const DESKTOP_TABLE_MIN_WIDTH = 1100

/**
 * Keep the grid row's containing block at least as wide as all of its tracks.
 * Sticky cells are constrained by that containing block, so a fixed 1100px
 * table makes the left column slide away once a wide shortlist scrolls past
 * the parent's right edge.
 */
export function comparisonTableMinWidth(schoolCount: number): number {
  const safeCount = Math.max(0, Math.floor(schoolCount))
  return Math.max(
    DESKTOP_TABLE_MIN_WIDTH,
    DESKTOP_LABEL_COLUMN_WIDTH + safeCount * DESKTOP_SCHOOL_COLUMN_MIN_WIDTH,
  )
}

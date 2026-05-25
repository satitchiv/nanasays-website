// Tab A Step 4 (2026-05-25). Pure projection helper extracted from
// research-context-pack.ts so the SSD-vs-USD precedence logic can be
// unit-tested without the Supabase client mock surface.
//
// Mirrors the pattern of subject-strengths-projection.mjs (.mjs imported
// from .ts via the existing tsconfig.json + Next.js setup).

/** @param {unknown} v @returns {number|null} */
export function toNum(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  // String coercion (Postgres `numeric` columns serialize as strings).
  // Use Number.isFinite to reject Infinity / overflow, not just !isNaN.
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return null
}

/**
 * Pick fees from SSD (preferred — post-2026-05-15 fees-currency migration
 * normalised these to local currency) with USD fallback when SSD has no
 * fees. Preserves nulls when only one side is populated so the renderer
 * can format as "from £X/yr" / "up to £Y/yr".
 *
 * @param {{fees_min?: unknown, fees_max?: unknown, fees_currency?: unknown}|null|undefined} ssdRow
 * @param {{fees_usd_min?: unknown, fees_usd_max?: unknown}|null|undefined} metaRow
 * @returns {{fees_min: number|null, fees_max: number|null, fees_currency: string|null}}
 */
export function projectMetaFees(ssdRow, metaRow) {
  const ssdFeesMin = ssdRow ? toNum(ssdRow.fees_min) : null
  const ssdFeesMax = ssdRow ? toNum(ssdRow.fees_max) : null
  const ssdCurrency = ssdRow && typeof ssdRow.fees_currency === 'string' && ssdRow.fees_currency.trim() !== ''
    ? ssdRow.fees_currency.trim().toUpperCase()
    : null

  if (ssdFeesMin != null || ssdFeesMax != null) {
    return { fees_min: ssdFeesMin, fees_max: ssdFeesMax, fees_currency: ssdCurrency }
  }
  if (metaRow && (metaRow.fees_usd_min != null || metaRow.fees_usd_max != null)) {
    return {
      fees_min: toNum(metaRow.fees_usd_min),
      fees_max: toNum(metaRow.fees_usd_max),
      fees_currency: 'USD',
    }
  }
  return { fees_min: null, fees_max: null, fees_currency: null }
}

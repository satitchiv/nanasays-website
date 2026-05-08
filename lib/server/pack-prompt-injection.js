/**
 * pack-prompt-injection.js — turn a Research Context Pack into a compact
 * prompt-injectable string.
 *
 * The .ts assembler (research-context-pack.ts) returns a structured pack.
 * This file is plain JS so the existing .js runners (nana-brain.js,
 * agentic-loop.js, prose-runner.js) can consume it without TS imports.
 *
 * Per ~/notes/research-panel-excellence-plan.md §6 — privacy-first.
 * The assembler already redacted the pack; this file just serializes
 * fields the model needs into prose. We never re-emit raw JSON of
 * proposed_actions, child_profile, or comparison cell `note` fields.
 *
 * Behaviour with NANA_PACK_V1=off:
 *   route.ts will not pass `pack` in streamOpts → runners see undefined
 *   → buildPackContextString returns null → no injection happens →
 *   chatbot behaviour is byte-identical to before.
 */

/**
 * Build a single prompt-injectable string from a pack. Returns null when
 * the pack is missing/empty so callers can `if (s) prompt += s`.
 *
 * @param {object|null|undefined} pack
 * @returns {string|null}
 */
export function buildPackContextString(pack) {
  if (!pack || typeof pack !== 'object') return null
  const lines = []

  // Parent + child summary (always present in pack)
  const p = pack.parent ?? {}
  const parentBits = []
  if (p.child_year) parentBits.push(`child entering ${p.child_year}`)
  if (p.boarding_pref) parentBits.push(`prefers ${p.boarding_pref} boarding`)
  if (p.budget_band) parentBits.push(`budget ${p.budget_band}`)
  if (p.top_priority) parentBits.push(`top priority: ${p.top_priority}`)
  if (p.region) parentBits.push(`based in ${p.region}`)
  if (parentBits.length > 0) lines.push(`Parent: ${parentBits.join('; ')}.`)

  const c = pack.child
  if (c) {
    const childBits = []
    if (c.age_band && c.age_band !== 'unknown') childBits.push(`child age band ${c.age_band}`)
    if (c.gender_pref_for_school) childBits.push(`looking for ${c.gender_pref_for_school} schools`)
    if (Array.isArray(c.fit_signals) && c.fit_signals.length > 0) childBits.push(`fit signals: ${c.fit_signals.slice(0, 5).join(', ')}`)
    if (Array.isArray(c.dealbreakers) && c.dealbreakers.length > 0) childBits.push(`dealbreakers: ${c.dealbreakers.slice(0, 5).join(', ')}`)
    if (childBits.length > 0) lines.push(`Child: ${childBits.join('; ')}.`)
  }

  // Session summary (if present)
  if (pack.session?.rolling_summary) {
    lines.push(`Session so far: ${String(pack.session.rolling_summary).slice(0, 400)}`)
  }

  // Shortlist
  if (Array.isArray(pack.shortlist) && pack.shortlist.length > 0) {
    lines.push(`Shortlist (${pack.shortlist.length}): ${pack.shortlist.slice(0, 8).join(', ')}.`)
  }

  // Comparison table state — row names + (per-school) values where present
  if (pack.comparison?.rows?.length > 0) {
    const rowSummary = pack.comparison.rows
      .slice(0, 8)
      .map((r) => {
        const cellPreviews = Object.entries(r.cells || {})
          .slice(0, 4)
          .map(([slug, cell]) => {
            const v = cell?.value ?? null
            const s = cell?.score ?? null
            if (v == null && s == null) return null
            return `${slug}=${v ?? ''}${s != null ? `(${s})` : ''}`
          })
          .filter(Boolean)
          .join('; ')
        return `${r.row_name} [w=${r.weight}]${cellPreviews ? ' — ' + cellPreviews : ''}`
      })
      .join('\n  ')
    lines.push(`Comparison table (lens=${pack.comparison.lens_kind}):\n  ${rowSummary}`)
  }

  // Recent messages — assistant has session memory now
  if (Array.isArray(pack.recent_messages) && pack.recent_messages.length > 0) {
    const msgs = pack.recent_messages
      .slice(-3)
      .map((m) => `[${m.role}] ${String(m.content).slice(0, 200)}`)
      .join('\n  ')
    lines.push(`Recent turns:\n  ${msgs}`)
  }

  // Schools-in-scope: a one-line summary per slug. Tools.js still does the
  // heavy lifting; this is just so the model knows what's covered.
  const schools = pack.schools && typeof pack.schools === 'object' ? pack.schools : {}
  const slugs = Object.keys(schools)
  if (slugs.length > 0) {
    const summaries = slugs.slice(0, 5).map((slug) => {
      const s = schools[slug]
      const m = s?.meta ?? {}
      const bits = []
      bits.push(m.name ?? slug)
      if (m.boarding_type) bits.push(m.boarding_type)
      if (m.gender_split) bits.push(m.gender_split)
      if (m.fees_min_gbp != null) bits.push(`£${m.fees_min_gbp}`)
      if (s?.source) bits.push(`source=${s.source}`)
      if (Array.isArray(s?.missing_dims) && s.missing_dims.length > 0) {
        bits.push(`missing: ${s.missing_dims.slice(0, 3).join(',')}`)
      }
      return `  ${slug}: ${bits.join(' | ')}`
    })
    lines.push(`In-scope schools (${slugs.length}):\n${summaries.join('\n')}`)
  }

  // Visit notes (rare, intent-gated by assembler)
  if (Array.isArray(pack.visit_notes) && pack.visit_notes.length > 0) {
    const vn = pack.visit_notes
      .slice(0, 5)
      .map((n) => `${n.slug} (${n.visited_at}): ${String(n.note).slice(0, 200)}`)
      .join('\n  ')
    lines.push(`Past visit notes:\n  ${vn}`)
  }

  // Partner brief (rare, intent-gated)
  if (pack.partner_brief?.body_markdown) {
    lines.push(`Earlier brief: ${String(pack.partner_brief.body_markdown).slice(0, 600)}`)
  }

  if (lines.length === 0) return null

  // One terse header so the model knows the next block is grounded context.
  return [
    '── RESEARCH CONTEXT PACK ──',
    ...lines,
    '── END PACK ──',
  ].join('\n')
}

/**
 * Pure boolean: should this runner inject pack context?
 * Centralised so all runners agree on the gating rule.
 */
export function shouldInjectPack(pack) {
  if (!pack || typeof pack !== 'object') return false
  // Always inject if any of these signals are present.
  if (pack.parent && (pack.parent.child_year || pack.parent.top_priority)) return true
  if (pack.child) return true
  if (Array.isArray(pack.shortlist) && pack.shortlist.length > 0) return true
  if (pack.comparison?.rows?.length > 0) return true
  if (pack.session?.rolling_summary) return true
  return false
}

/**
 * Tiny telemetry helper — log pack stats once per request.
 */
export function logPackTelemetry(tag, pack) {
  if (!pack) {
    console.log(`[pack:${tag}] no pack (NANA_PACK_V1 off or assembler returned null)`)
    return
  }
  const meta = pack.meta ?? {}
  const slugCount = pack.schools ? Object.keys(pack.schools).length : 0
  console.log(
    `[pack:${tag}] tokens≈${meta.estimated_tokens ?? '?'} bytes=${meta.bytes ?? '?'} schools=${slugCount} elapsed=${meta.elapsed_ms ?? '?'}ms overflow=[${(meta.overflow_actions ?? []).join(',') || 'none'}]`,
  )
}

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

// Tab A Step 4 (2026-05-25): currency-aware fees rendering. Picks a glyph
// from a closed set of currencies we actually see in production (UK GBP,
// Thai THB, Swiss CHF, EUR for European partners, USD fallback). Unknown
// well-formed ISO codes render as a 3-letter prefix ("AED 25,000") rather
// than guessing a symbol. Malformed/garbage codes get no prefix at all.
const ISO_CURRENCY_RE = /^[A-Z]{3}$/
function feesSymbolPrefix(code) {
  switch (code) {
    case 'GBP': return '£'
    case 'USD': return '$'
    case 'EUR': return '€'
    case 'CHF': return 'CHF '
    case 'THB': return '฿'
    default:
      // Codex r1 Q3: only echo if it looks like a real ISO 4217 code so
      // a malformed DB string ("£GBP", "n/a", etc.) doesn't leak into
      // the prompt.
      if (typeof code === 'string' && ISO_CURRENCY_RE.test(code)) return `${code} `
      return ''
  }
}
function formatFeesLine(meta) {
  if (!meta || typeof meta !== 'object') return null
  const min = typeof meta.fees_min === 'number' && Number.isFinite(meta.fees_min) ? meta.fees_min : null
  const max = typeof meta.fees_max === 'number' && Number.isFinite(meta.fees_max) ? meta.fees_max : null
  if (min == null && max == null) return null
  const sym = feesSymbolPrefix(meta.fees_currency)
  const fmt = (n) => `${sym}${n.toLocaleString('en-US')}`
  // Codex r1 Q2: a single-sided value renders "from"/"up to" so the
  // model doesn't read a min-only / max-only number as an exact figure.
  if (min != null && max != null) {
    if (min === max) return `fees ${fmt(min)}/yr`
    return `fees ${fmt(min)}–${fmt(max)}/yr`
  }
  if (min != null) return `fees from ${fmt(min)}/yr`
  return `fees up to ${fmt(max)}/yr`
}

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
      // Tab A Step 4 (2026-05-25): truth-in-labelling fees. Use the actual
      // currency code (from SSD fees_currency post-2026-05-15 migration, or
      // 'USD' when only the USD-converted fallback is available) to pick the
      // symbol. Format as range when min != max, single value otherwise.
      const feesLine = formatFeesLine(m)
      if (feesLine) bits.push(feesLine)
      // Notion sidecar highlights (2026-05-24 wiring slice). These are facts
      // SSD doesn't currently cover for most UK schools — surfacing here so
      // the model sees them in the pack-string variant used by the Research
      // Room. Reducer `dropped_notion_backfill` nulls these when over budget;
      // we treat that as a no-op (no bits added). Phrasing is full-word per
      // Codex r1 P2 — abbreviations like `brd` / `%brd` were too cryptic.
      const nb = s?.notion_backfill
      if (nb && typeof nb === 'object') {
        if (typeof nb.total_pupils === 'number') bits.push(`${nb.total_pupils.toLocaleString()} pupils`)
        if (typeof nb.boarder_count === 'number') bits.push(`${nb.boarder_count.toLocaleString()} boarders`)
        // `boarding_pct` is the projected key (projector normalises decimals).
        if (typeof nb.boarding_pct === 'number') bits.push(`${Math.round(nb.boarding_pct)}% boarding`)
        // class_size sub-field may be scalar OR {min, max} range — render both
        // shapes per the 2026-05-25 projector update (6 elite UK schools have
        // ranges in production data).
        const csz = nb.class_size?.senior ?? nb.class_size?.sixth ?? nb.class_size?.average ?? null
        if (typeof csz === 'number') {
          bits.push(`class size ~${csz}`)
        } else if (csz && typeof csz === 'object' && typeof csz.min === 'number' && typeof csz.max === 'number') {
          bits.push(`class size ${csz.min}–${csz.max}`)
        }
      }
      // Curated meta (Tab A Step 3, 2026-05-25). 15 fields from the schools
      // table parents ask about that SSD/Notion don't cover: head + tenure,
      // houses, EAL, Thai community, open day, prospectus, bus, food, USP.
      // Conditional — each line only emits when its data is present, so
      // small/incomplete schools don't bloat the prompt. Reducer
      // `dropped_curated_meta` nulls this when over budget. Phrasing kept
      // full-word (no abbreviations) per Notion-sidecar precedent.
      const cm = s?.curated_meta
      if (cm && typeof cm === 'object') {
        if (cm.head_of_school) {
          let headLine = `head: ${cm.head_of_school}`
          if (cm.head_tenure_start) {
            const yr = String(cm.head_tenure_start).slice(0, 4)
            if (/^\d{4}$/.test(yr)) headLine += ` (since ${yr})`
          }
          bits.push(headLine)
        }
        if (cm.house_system) bits.push(`house system: ${cm.house_system}`)
        if (Array.isArray(cm.house_names) && cm.house_names.length > 0) {
          const shown = cm.house_names.slice(0, 6).join(', ')
          const more = cm.house_names.length > 6 ? '…' : ''
          // Codex r1 P7: prefer the pre-cap house_count when present, so
          // schools with many houses (e.g. Eton 25) don't appear to have
          // only 12 (the projection cap).
          const count = typeof cm.house_count === 'number' && cm.house_count > 0
            ? cm.house_count
            : cm.house_names.length
          bits.push(`houses (${count}): ${shown}${more}`)
        }
        if (cm.eal_support === true) {
          const ealParts = ['EAL: yes']
          if (typeof cm.eal_hours_per_week === 'number') ealParts.push(`${cm.eal_hours_per_week} hrs/week`)
          if (typeof cm.eal_cost_usd === 'number') ealParts.push(`$${cm.eal_cost_usd}`)
          bits.push(ealParts.join(', '))
        } else if (cm.eal_support === false) {
          bits.push('EAL: no')
        }
        if (typeof cm.thai_students === 'number' && cm.thai_students > 0) {
          bits.push(`${cm.thai_students} Thai students`)
        }
        if (cm.thai_community) bits.push(`Thai community: ${cm.thai_community}`)
        if (cm.bus_service === true) bits.push('school bus: yes')
        if (cm.food_options) bits.push(`food: ${cm.food_options}`)
        if (cm.open_day_text) {
          const url = cm.open_day_url ? ` (${cm.open_day_url})` : ''
          bits.push(`open day: ${cm.open_day_text}${url}`)
        } else if (cm.open_day_url) {
          bits.push(`open day: ${cm.open_day_url}`)
        }
        if (cm.prospectus_url) bits.push(`prospectus: ${cm.prospectus_url}`)
        if (cm.unique_selling_points) bits.push(`USP: ${cm.unique_selling_points}`)
      }
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

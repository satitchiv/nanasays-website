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
// Tab A Step 10 v2 Commit 3 (2026-05-26), Codex r2 defense-in-depth.
// The assembler's projection layer sanitises everything entering the
// pack, but the renderer should not blindly trust its input — a direct
// pack construction (e.g. tests, or a future caller that bypasses the
// projection) shouldn't be able to inject control chars or non-http
// URL schemes into the prompt. Same guards as research-context-pack.ts
// httpUrl().
function isSafePromptUrl(s) {
  if (typeof s !== 'string') return false
  if (!s || /\s/.test(s)) return false
  try {
    const u = new URL(s)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    if (u.username || u.password) return false
    return true
  } catch {
    return false
  }
}

// Codex r3: text-field render-time sanity pass. Same strategy as the
// projection layer's sanitizeForPrompt (strip C0 controls + DEL, collapse
// whitespace, trim). Applied on every text interpolation of the fields
// touched by this commit so a direct pack construction can't inject
// instructions on a continuation line. Returns '' for non-string so
// downstream truthiness checks (`if (sanitised) bits.push(...)`) work.
function sanitizeRenderText(s) {
  if (typeof s !== 'string') return ''
  // \uHHHH form keeps the source readable; same regex as the
  // assembler's sanitizeForPrompt in research-context-pack.ts.
  return s.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim()
}

// Variant for array fields — sanitise each item then drop empties.
function sanitizeRenderArray(items) {
  if (!Array.isArray(items)) return []
  const out = []
  for (const item of items) {
    const t = sanitizeRenderText(item)
    if (t) out.push(t)
  }
  return out
}

// Tab A Step 10 v2 Commit 3 (2026-05-26). Date helper for ISI fields.
// schools.isi_report_date is a Postgres `date` serialised as "YYYY-MM-DD";
// we render as "Month YYYY" so Nana riffs naturally in chat ("ISI inspected
// in March 2023") rather than parroting raw ISO strings back at parents.
const ISI_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
function formatIsiDate(dateStr) {
  if (typeof dateStr !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim())
  if (!m) return null
  const monthIdx = parseInt(m[2], 10) - 1
  if (monthIdx < 0 || monthIdx >= 12) return null
  return `${ISI_MONTHS[monthIdx]} ${m[1]}`
}

// Tab A Step 10 v2 Commit 3 (2026-05-26). ISI inspectorate narrative block.
// Renders multi-line indented prose (gate: isi_summary present). Caller
// appends it after the per-school bits line so it reads as a continuation
// of that school's summary, not a disconnected section.
//
// Format:
//   ISI inspection (Month YYYY): Excellent academic, Excellent pastoral
//   summary: <prose>
//   key strengths: a; b; c; d
//   areas for improvement: x; y
//
// Each sub-line is omitted when its field is null/empty — sparse schools
// render just the header + summary. Non-UK schools (isi_summary === null)
// produce no block at all.
function renderISINarrative(cm) {
  if (!cm || typeof cm !== 'object') return null
  // Codex r3 defense-in-depth: sanitise every text field at render time.
  const summary = sanitizeRenderText(cm.isi_summary)
  if (!summary) return null
  const lines = []
  const date = formatIsiDate(cm.isi_report_date)
  const verdictParts = []
  const academic = sanitizeRenderText(cm.isi_academic_quality)
  if (academic) verdictParts.push(`${academic} academic`)
  const pastoral = sanitizeRenderText(cm.isi_pastoral_care)
  if (pastoral) verdictParts.push(`${pastoral} pastoral`)
  const dateSpan = date ? ` (${date})` : ''
  const verdictSpan = verdictParts.length > 0 ? `: ${verdictParts.join(', ')}` : ''
  lines.push(`ISI inspection${dateSpan}${verdictSpan}`)
  lines.push(`summary: ${summary}`)
  const safeStrengths = sanitizeRenderArray(cm.isi_key_strengths)
  if (safeStrengths.length > 0) {
    // Cap at 4 — 4 bullets is enough for Nana to riff; full 8 would
    // bloat token budget. Strengths are already projection-capped at 8,
    // so the slice here is the second narrower cap.
    lines.push(`key strengths: ${safeStrengths.slice(0, 4).join('; ')}`)
  }
  const safeAreas = sanitizeRenderArray(cm.isi_areas_for_improvement)
  if (safeAreas.length > 0) {
    lines.push(`areas for improvement: ${safeAreas.slice(0, 2).join('; ')}`)
  }
  // Indent continuation lines so the block visibly belongs to the school.
  return lines.join('\n      ')
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
        // Codex r3 defense-in-depth: every text field is sanitised at
        // render time too, not just at projection. Even if a future
        // caller bypasses the projection, embedded newlines/control
        // chars can no longer break the per-school line.
        const head = sanitizeRenderText(cm.head_of_school)
        if (head) {
          let headLine = `head: ${head}`
          const tenure = sanitizeRenderText(cm.head_tenure_start)
          if (tenure) {
            const yr = tenure.slice(0, 4)
            if (/^\d{4}$/.test(yr)) headLine += ` (since ${yr})`
          }
          bits.push(headLine)
        }
        const houseSystem = sanitizeRenderText(cm.house_system)
        if (houseSystem) bits.push(`house system: ${houseSystem}`)
        const safeHouseNames = sanitizeRenderArray(cm.house_names)
        if (safeHouseNames.length > 0) {
          const shown = safeHouseNames.slice(0, 6).join(', ')
          const more = safeHouseNames.length > 6 ? '…' : ''
          // Codex r1 P7: prefer the pre-cap house_count when present.
          const count = typeof cm.house_count === 'number' && cm.house_count > 0
            ? cm.house_count
            : safeHouseNames.length
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
        const thaiCommunity = sanitizeRenderText(cm.thai_community)
        if (thaiCommunity) bits.push(`Thai community: ${thaiCommunity}`)
        if (cm.bus_service === true) bits.push('school bus: yes')
        const food = sanitizeRenderText(cm.food_options)
        if (food) bits.push(`food: ${food}`)
        // URL fields validated by isSafePromptUrl (Codex r2).
        const safeOpenDayUrl = isSafePromptUrl(cm.open_day_url) ? cm.open_day_url : null
        const openDayText = sanitizeRenderText(cm.open_day_text)
        if (openDayText) {
          const url = safeOpenDayUrl ? ` (${safeOpenDayUrl})` : ''
          bits.push(`open day: ${openDayText}${url}`)
        } else if (safeOpenDayUrl) {
          bits.push(`open day: ${safeOpenDayUrl}`)
        }
        if (isSafePromptUrl(cm.prospectus_url)) bits.push(`prospectus: ${cm.prospectus_url}`)
        const usp = sanitizeRenderText(cm.unique_selling_points)
        if (usp) bits.push(`USP: ${usp}`)
        // Tab A Step 10 v2 Commit 3 (2026-05-26). A-slice fields.
        if (typeof cm.founded_year === 'number') {
          bits.push(`est. ${cm.founded_year}`)
        }
        const isiDate = formatIsiDate(cm.isi_report_date)
        if (isiDate) bits.push(`ISI inspected ${isiDate}`)
        const safeTopUnis = sanitizeRenderArray(cm.top_universities)
        if (safeTopUnis.length > 0) {
          bits.push(`top universities: ${safeTopUnis.slice(0, 10).join(', ')}`)
        }
        const alumni = sanitizeRenderText(cm.alumni_notable)
        if (alumni) bits.push(`alumni: ${alumni}`)
        if (isSafePromptUrl(cm.instagram_url)) bits.push(`instagram: ${cm.instagram_url}`)
        if (isSafePromptUrl(cm.youtube_url)) bits.push(`youtube: ${cm.youtube_url}`)
        if (isSafePromptUrl(cm.logo_url)) bits.push(`logo: ${cm.logo_url}`)
        if (isSafePromptUrl(cm.hero_image)) bits.push(`hero image: ${cm.hero_image}`)
        if (Array.isArray(cm.school_pdfs) && cm.school_pdfs.length > 0) {
          const pdfList = cm.school_pdfs
            .map((p) => {
              if (!p || !isSafePromptUrl(p.url)) return null
              const title = sanitizeRenderText(p.title)
              return title ? `${title} (${p.url})` : null
            })
            .filter(Boolean)
            .join('; ')
          if (pdfList) bits.push(`documents: ${pdfList}`)
        }
      }
      if (s?.source) bits.push(`source=${s.source}`)
      if (Array.isArray(s?.missing_dims) && s.missing_dims.length > 0) {
        bits.push(`missing: ${s.missing_dims.slice(0, 3).join(',')}`)
      }
      // Tab A Step 10 v2 Commit 3 (2026-05-26). ISI narrative (B-slice)
      // renders as an indented continuation block beneath the school's
      // bits line. Null when isi_summary is absent (most non-UK schools).
      const isiBlock = renderISINarrative(s?.curated_meta)
      const summary = `  ${slug}: ${bits.join(' | ')}`
      return isiBlock ? `${summary}\n      ${isiBlock}` : summary
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

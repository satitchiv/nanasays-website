/**
 * tool-result-compact.js
 *
 * Compact tool results for injection into LLM context. Used by:
 *  - prose-runner.js (single-shot prose path)
 *  - agentic-loop.js (multi-turn loop, per-turn injection)
 *
 * Background: agentic-loop.js used to inject `JSON.stringify(result, null, 2)`
 * at every turn. For getSchoolFacts on sports-heavy schools that's ~25KB of
 * alumni names and cup descriptions per call. By turn 3-4 the model is
 * reading 50-100KB of decoration before any new question. This module
 * compacts each tool result to a structured plain-text rendering that uses
 * 30-50% fewer tokens and reads just as well to the model.
 *
 * The previous implementation in prose-runner.js used
 * `JSON.stringify(v).slice(0, 400)` as its object fallback. For nested
 * fields like `sports_profile` (5 sport sub-objects of ~4KB each) this kept
 * tennis only and chopped the other four mid-string — losing rugby /
 * cricket / football / hockey evidence_urls entirely. compactValue() below
 * recurses one level into nested objects so each sub-key gets a fair share
 * of the budget.
 *
 * Sports profile carve-out: generic compaction reads the first 6 keys of
 * each sport sub-object, which silently dropped competitive_tier /
 * dmt_ranking / socs / cup_results / programmes / current_pathway_players
 * for rugby on every school. We now route sports_profile through
 * `renderSportsProfileLines` (canonical key contract, see nana-brain.js)
 * so the model sees tier, DMT rank, coaches, cup history, etc.
 */

import { renderSportsProfileLines } from './nana-brain.js';

const FIELD_BUDGET_DEFAULT = 400;
const FALLBACK_BUDGET      = 2000;
const HARD_LIMIT_DEFAULT   = 4096;   // last-resort cap at injection sites

/**
 * Compact a single value to within roughly `budget` chars.
 * Top-level entry: recurses one level into nested objects so a
 * sports_profile-style blob with N sub-objects renders all N (each
 * summarised) instead of only the first.
 */
export function compactValue(value, budget = FIELD_BUDGET_DEFAULT) {
  if (value == null) return '';
  if (typeof value === 'string') {
    return value.length > budget ? value.slice(0, budget - 1) + '…' : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every(v => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
      const inline = value.slice(0, 6).map(v => String(v).slice(0, 60)).join(', ');
      return value.length > 6 ? `[${inline}, +${value.length - 6}]` : `[${inline}]`;
    }
    // Array of objects — render first 3 flattened, then count.
    const head = value.slice(0, 3).map(v => flatten(v, 120)).join('; ');
    return value.length > 3 ? `[${head}; +${value.length - 3} more]` : `[${head}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return '{}';
    // Cap entries by budget to prevent high-cardinality objects from
    // exploding past their field budget (Codex flag #1). With FIELD_BUDGET
    // of 400, that's ~5 entries max; with 1500 it's ~18.
    const maxEntries = Math.max(3, Math.ceil(budget / 80));
    const used = entries.slice(0, maxEntries);
    const perSubKey = Math.max(80, Math.floor((budget * 1.5) / used.length));
    const rendered = used.map(([k, v]) => `${k}: ${flatten(v, perSubKey)}`).join('; ');
    return entries.length > used.length
      ? `${rendered}; +${entries.length - used.length} more keys`
      : rendered;
  }
  return String(value);
}

/**
 * Render a value flatly — no further recursion past one nested level.
 * Called from compactValue for sub-values inside an object.
 */
function flatten(value, budget) {
  if (value == null) return '';
  if (typeof value === 'string') {
    return value.length > budget ? value.slice(0, budget - 1) + '…' : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every(v => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
      const inline = value.slice(0, 3).map(v => String(v).slice(0, 50)).join(', ');
      return value.length > 3 ? `[${inline}, +${value.length - 3}]` : `[${inline}]`;
    }
    // Array of objects: peek first item's key set + total count.
    const firstKeys = typeof value[0] === 'object' && value[0]
      ? Object.keys(value[0]).slice(0, 3).join(',')
      : 'items';
    return `[${value.length} × {${firstKeys}}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    // Codex flag #3: if the nested object is primitive-only, render inline
    // (e.g. `{maths=0.91, english=0.88}`) instead of the lazy `{Nk}` summary.
    // Important for things like exam_results.by_subject where per-subject
    // data is genuinely useful for the model.
    const allPrimitive = entries.every(([, v]) =>
      v == null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
    );
    if (allPrimitive && entries.length <= 8) {
      const inline = entries.map(([k, v]) => {
        if (v == null) return `${k}=`;
        if (typeof v === 'string') return `${k}="${v.slice(0, 40)}${v.length > 40 ? '…' : ''}"`;
        return `${k}=${v}`;
      }).join(', ');
      return inline.length > budget ? inline.slice(0, budget - 1) + '…' : `{${inline}}`;
    }

    // Mixed / deeper objects — use the per-key sub-renderer with array inlining.
    const parts = entries.slice(0, 6).map(([k, v]) => {
      let sub;
      if (v == null) sub = '';
      else if (typeof v === 'string') sub = `"${v.slice(0, 50)}${v.length > 50 ? '…' : ''}"`;
      else if (typeof v === 'number' || typeof v === 'boolean') sub = String(v);
      else if (Array.isArray(v)) {
        // For arrays inside a nested object, inline first 3 primitive items
        // so URLs and short labels survive — citations originate here.
        // Codex flag #4: bumped 2 → 3 so the model has more URLs to cite from.
        if (v.length === 0) sub = '[]';
        else if (v.every(x => typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean')) {
          const head = v.slice(0, 3).map(x => String(x).slice(0, 50)).join(', ');
          sub = v.length > 3 ? `[${head}, +${v.length - 3}]` : `[${head}]`;
        }
        else sub = `[${v.length}]`;
      }
      else if (typeof v === 'object') sub = `{${Object.keys(v).length}k}`;
      else sub = String(v);
      return `${k}=${sub}`;
    });
    return `{${parts.join(', ')}${entries.length > 6 ? ', …' : ''}}`;
  }
  return String(value);
}

/**
 * Public API: render a tool's result object as a model-friendly text block.
 * Per-tool branches preserve known shapes (e.g. rankSchools' sorted score
 * list). The getSchoolFacts branch uses compactValue() so each top-level
 * field — including nested ones like sports_profile — gets a fair render.
 *
 * Codex flag #5: every per-tool branch null-guards array items, since DB
 * shape drift can hand us nulls even when the upstream producer doesn't
 * intend to.
 */
export function compactToolResult(toolName, result) {
  if (!result) return '(no result)';

  // Score is an internal heuristic (see scripts/lib/dimensions.js — not a
  // published metric). We hide it from the model so prose answers cite the
  // underlying evidence (Youll Cup wins, alumni, etc.) and the rank position
  // rather than a number parents have no anchor for. Sort order is preserved
  // by list position, so rank intel is intact.
  if (toolName === 'rankSchools' && Array.isArray(result.schools)) {
    return result.schools.map((s, i) => {
      if (!s) return `${i + 1}. (no data)`;
      const urls = Array.isArray(s.citations) ? s.citations.slice(0, 3).join(' ') : '';
      const head = `${i + 1}. ${s.name} [slug=${s.slug}] — ${s.summary || ''}`.trim();
      return urls ? `${head}\n   sources: ${urls}` : head;
    }).join('\n');
  }

  if (toolName === 'compareSchools' && Array.isArray(result.schools)) {
    return result.schools.map(s => {
      if (!s) return '(no data)';
      const dims = Object.entries(s.dimensions || {})
        .map(([d, v]) => {
          if (!v) return `  ${d}: (no data)`;
          const urls = Array.isArray(v.citations) ? v.citations.slice(0, 2).join(' ') : '';
          const summary = `  ${d}: ${v.summary || ''}`;
          return urls ? `${summary}\n     sources: ${urls}` : summary;
        })
        .join('\n');
      return `${s.name} [slug=${s.slug}]:\n${dims}`;
    }).join('\n\n');
  }

  if (toolName === 'getSchoolFacts' && result.data) {
    const lines = [`${result.name} (${result.slug}):`];
    // Surface school-level metadata first (gender, age range, boarding) so
    // the model never misses fit-critical context like "boys-only 11–16"
    // even if the requested-fields list doesn't cover it.
    const meta = [];
    if (result.gender)        meta.push(`gender=${result.gender}`);
    if (result.age_min || result.age_max) meta.push(`ages=${result.age_min ?? '?'}–${result.age_max ?? '?'}`);
    if (result.boarding_type) meta.push(`boarding=${result.boarding_type}`);
    if (meta.length) lines.push(`  meta: ${meta.join(', ')}`);
    for (const [k, v] of Object.entries(result.data)) {
      if (k === 'sports_profile' && v && typeof v === 'object') {
        const sportLines = renderSportsProfileLines(v).filter(l => l.trim().startsWith('•'));
        if (sportLines.length) {
          lines.push(`  sports_profile:`);
          for (const sl of sportLines) lines.push(`  ${sl}`);
        }
        continue;
      }
      lines.push(`  ${k}: ${compactValue(v, FIELD_BUDGET_DEFAULT)}`);
    }
    return lines.join('\n');
  }

  if (toolName === 'searchSchoolText' && Array.isArray(result.chunks)) {
    return result.chunks.map(c => {
      if (!c) return '[unknown] (no data)';
      return `[${c.school_slug || 'unknown'}] ${c.title || c.category || 'excerpt'} — ${(c.excerpt || '').slice(0, 300)} (${c.source_url || ''})`;
    }).join('\n');
  }

  if (toolName === 'searchSafeguarding' && Array.isArray(result.records)) {
    return result.records.map(r => {
      if (!r) return '[unknown] (no data)';
      return `[${r.school_slug || 'unknown'}] ${r.source || '?'}/${r.data_type || '?'}: ${r.title || ''} — ${r.summary || ''} (severity: ${r.severity || 'n/a'}; ${r.source_url || ''})`;
    }).join('\n');
  }

  if (toolName === 'filterSchools' && Array.isArray(result.schools)) {
    return result.schools.map(s => {
      if (!s) return '(unknown)';
      return `${s.name || s.slug || '?'} (${s.slug || '?'})`;
    }).join('; ');
  }

  // Unknown tool: fall through to the recursive compactor with a generous
  // budget. Bounded by the hard limit at the call site (see injectToolResult).
  return compactValue(result, FALLBACK_BUDGET);
}

/**
 * Inject-site wrapper. Compacts the tool result, then enforces a hard byte
 * limit (last-resort guard against future tools we haven't projected). Logs
 * a warning if truncation fires so we notice in production logs.
 *
 * Used by both agentic-loop.js (per-turn injection) and prose-runner.js
 * (single-shot tool block assembly) so both paths get the same protection.
 * (Codex flag #2 + #6: 4KB cap, applied symmetrically.)
 */
export function injectToolResult(toolName, result, hardLimit = HARD_LIMIT_DEFAULT) {
  let compact = compactToolResult(toolName, result);
  if (compact.length > hardLimit) {
    console.warn(`[tool-compact] ${toolName} compacted to ${compact.length} chars; hard-truncating to ${hardLimit}`);
    compact = compact.slice(0, hardLimit) + `\n…[truncated, +${compact.length - hardLimit} chars]`;
  }
  return compact;
}

// Recommender Phase 2 (2026-05-21, Codex r1 P1.3): project the heavy
// subject_strengths v2.0 blob down to a chat-pack-friendly shape.
//
// The raw column is 10-20KB per school (9 subject buckets × items[] each).
// With 8 shortlisted schools that's 80-160KB landing in `pack.schools[slug]
// .structured` — well past the per-school token cap (250-350) and large
// enough to push the whole pack over budget. The pack reducers drop
// `structured` wholesale on overflow, which nukes EVERY field (fees, exam
// results, sports_profile, etc.) just because subject_strengths is heavy.
//
// Projection rules:
//  - schema_version: kept (1 short string, useful for downstream sanity)
//  - top-3 non-empty subject buckets (by item count): keep summary_paragraph
//    + up to 3 item URL stubs (source_url only, no per-item polymorphic fields)
//  - all OTHER non-empty subjects: count-only stub `{ items: [], item_count }`
//    so the renderer can still emit "biology: 2 items" without summary
//  - school_cohort: capped to 3 items + summary if present
//  - provenance, _health: stripped (extractor diagnostics — not chat-useful)
//  - empty buckets (items=0 AND no summary): dropped
//
// Returns `null` when the resulting projection has no subject content
// (only schema_version would survive) so the pack's missing_dims logic
// stays accurate.
//
// Lives in .mjs (no TS types) so test runners that fail on transitive
// `import type` syntax can still exercise it directly.

const SS_META_KEYS = new Set(['schema_version', 'provenance', '_health']);

// Codex r2 P2: whitelist canonical subjects so a future diagnostic / unknown
// top-level key (with an `items` array) can't consume a top-3 slot and then
// silently vanish at render time. The renderer only emits these 9 subject
// keys (plus school_cohort, handled separately below).
const CANONICAL_SUBJECTS = [
  'maths', 'biology', 'chemistry', 'physics',
  'english', 'history', 'modern_languages',
  'computer_science', 'economics_business',
];
const CANONICAL_SUBJECT_INDEX = new Map(CANONICAL_SUBJECTS.map((k, i) => [k, i]));

// Codex r2 P2 (cap summaries in projection so the per-school token estimate
// after projection stays predictable — the overflow reducers run AFTER
// projection but BEFORE the renderer truncates to 240 chars).
const SUMMARY_CAP_CHARS = 480;

function _pickSourceUrl(item) {
  if (item && typeof item === 'object' && typeof item.source_url === 'string') {
    return item.source_url;
  }
  return null;
}

function _capSummary(s) {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (!t) return null;
  return t.length > SUMMARY_CAP_CHARS ? t.slice(0, SUMMARY_CAP_CHARS - 1) + '…' : t;
}

// Codex r3 P2 (2026-05-21): half-projected inputs (some buckets projected
// {items:[], item_count:N}, others raw {items:[...]}) need a shared count
// helper so re-projection preserves the projected count instead of treating
// items.length=0 as "empty" and dropping the bucket.
function _bucketCount(bucket) {
  if (bucket && Number.isFinite(bucket.item_count) && bucket.item_count >= 0) {
    return bucket.item_count;
  }
  return Array.isArray(bucket?.items) ? bucket.items.length : 0;
}

// Codex r2 P2 (idempotency): detect already-projected shapes so double calls
// pass through cleanly. A projected bucket has numeric `item_count` set. If
// every present subject bucket has `item_count`, the input has been projected
// already — return it as-is.
// Codex r4 P2 (2026-05-21): school_cohort must participate in the projected-
// shape guard too. A doc with projected subjects + a raw cohort would
// previously short-circuit at the entry guard and skip cohort capping /
// field stripping entirely.
function _isAlreadyProjected(ss) {
  if (!ss || typeof ss !== 'object') return false;
  let sawProjected = false;
  for (const [key, val] of Object.entries(ss)) {
    if (SS_META_KEYS.has(key)) continue;
    if (!val || typeof val !== 'object') continue;
    if (key === 'school_cohort') {
      // A projected cohort has numeric item_count. Raw cohort (no
      // item_count) → not fully projected, run the full pipeline.
      if (typeof val.item_count !== 'number') return false;
      sawProjected = true;
      continue;
    }
    if (!CANONICAL_SUBJECT_INDEX.has(key)) return false;
    sawProjected = true;
    if (typeof val.item_count !== 'number') return false;
  }
  return sawProjected;
}

export function projectSubjectStrengths(ss) {
  if (!ss || typeof ss !== 'object') return null;
  if (_isAlreadyProjected(ss)) return ss;

  const subjects = [];
  let schoolCohort = null;
  for (const [key, val] of Object.entries(ss)) {
    if (SS_META_KEYS.has(key)) continue;
    if (!val || typeof val !== 'object') continue;
    if (key === 'school_cohort') { schoolCohort = val; continue; }
    // Codex r2 P2: only accept canonical subject keys. Anything else is
    // either extractor diagnostics or future scope — don't promote it.
    if (!CANONICAL_SUBJECT_INDEX.has(key)) continue;
    const summary = _capSummary(val.summary_paragraph_for_chatbot);
    // Codex r3 P2: use _bucketCount so half-projected input (mixed raw +
    // projected count-only stubs) preserves projected `item_count` instead
    // of being treated as empty (items.length=0 → dropped).
    subjects.push({ key, count: _bucketCount(val), summary, bucket: val });
  }
  // Codex r2 P2: a subject with NO items but a real summary paragraph is
  // still content — keep it. Stated rule in the helper docstring matches.
  const nonEmpty = subjects.filter(s => s.count > 0 || s.summary);
  // Codex r2 P2: tiebreak by canonical subject order (rather than relying on
  // JSONB key insertion order). Sort by count DESC, then by canonical index.
  nonEmpty.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return (CANONICAL_SUBJECT_INDEX.get(a.key) ?? 99) - (CANONICAL_SUBJECT_INDEX.get(b.key) ?? 99);
  });
  const top3 = new Set(nonEmpty.slice(0, 3).map(s => s.key));

  const projected = {};
  if (typeof ss.schema_version === 'string') projected.schema_version = ss.schema_version;

  for (const { key, count, summary, bucket } of nonEmpty) {
    if (top3.has(key)) {
      const items = (Array.isArray(bucket.items) ? bucket.items : [])
        .slice(0, 3)
        .map(i => ({ source_url: _pickSourceUrl(i) }));
      projected[key] = {
        items,
        item_count: count,
        summary_paragraph_for_chatbot: summary,
      };
    } else {
      // Count-only stub; no summary even if one exists. Below-top-3 subjects
      // are rendered as a short "N items" line and are not chat-critical
      // (parents focused on top-3 subjects). Keeps per-school token cost
      // bounded — 6 below-top-3 stubs × ~30 bytes vs ~480 bytes-with-summary.
      projected[key] = { items: [], item_count: count };
    }
  }
  if (schoolCohort) {
    const items = Array.isArray(schoolCohort.items) ? schoolCohort.items : [];
    const summary = _capSummary(schoolCohort.summary_paragraph_for_chatbot);
    // Codex r3 P2 + r4 P2: preserve already-projected item_count so a
    // half-projected cohort (items capped to 3 but item_count=N) survives
    // re-projection; gate retention on cohortCount > 0 || summary instead
    // of items.length so projected count-only stubs aren't dropped.
    const cohortCount = _bucketCount(schoolCohort);
    if (cohortCount > 0 || summary) {
      projected.school_cohort = {
        items: items.slice(0, 3).map(i => ({ source_url: _pickSourceUrl(i) })),
        item_count: cohortCount,
        summary_paragraph_for_chatbot: summary,
      };
    }
  }
  if (Object.keys(projected).filter(k => k !== 'schema_version').length === 0) return null;
  return projected;
}

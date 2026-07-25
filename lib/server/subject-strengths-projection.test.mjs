// Tests for projectSubjectStrengths (Recommender Phase 2, Codex r1 P1.3).
//
// Run via:
//   cd website
//   node --test lib/server/subject-strengths-projection.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectSubjectStrengths } from './subject-strengths-projection.mjs';

test('projectSubjectStrengths returns null for null/undefined/non-object input', () => {
  assert.equal(projectSubjectStrengths(null), null);
  assert.equal(projectSubjectStrengths(undefined), null);
  assert.equal(projectSubjectStrengths('string'), null);
  assert.equal(projectSubjectStrengths(42), null);
});

test('top-3 subjects by item count get summary + ≤3 item URL stubs; others get count-only', () => {
  const ss = {
    schema_version: 'v2.0',
    provenance: { extractor_version: 'v2.2', extracted_at: '2026-05-21' },
    _health:    { drop_reasons: {} },
    maths:    { items: new Array(10).fill({ source_url: 'https://x/m', category: 'subject_outcome_statistic' }),
                summary_paragraph_for_chatbot: 'Maths summary text.' },
    biology:  { items: new Array(8).fill({  source_url: 'https://x/b' }), summary_paragraph_for_chatbot: 'Bio summary.' },
    physics:  { items: new Array(6).fill({  source_url: 'https://x/p' }), summary_paragraph_for_chatbot: 'Phys summary.' },
    chemistry:{ items: new Array(3).fill({  source_url: 'https://x/c' }), summary_paragraph_for_chatbot: 'Chem summary.' },
    history:  { items: [{ source_url: 'https://x/h' }], summary_paragraph_for_chatbot: 'Hist tiny.' },
    english:  { items: [], summary_paragraph_for_chatbot: null },
  };
  const out = projectSubjectStrengths(ss);
  assert.ok(out, 'projection should be non-null');
  assert.equal(out.schema_version, 'v2.0', 'schema_version preserved');
  assert.equal(out.provenance, undefined, 'provenance stripped');
  assert.equal(out._health,    undefined, '_health stripped');
  assert.equal(out.english,    undefined, 'empty bucket dropped');
  // Top-3 = maths(10) biology(8) physics(6) — full projection
  for (const top of ['maths', 'biology', 'physics']) {
    assert.ok(out[top], `top-3 "${top}" present`);
    assert.equal(typeof out[top].summary_paragraph_for_chatbot, 'string',
      `top-3 "${top}" keeps summary`);
    assert.ok(Array.isArray(out[top].items), `top-3 "${top}" has items array`);
    assert.ok(out[top].items.length > 0 && out[top].items.length <= 3,
      `top-3 "${top}" items capped at 3, got ${out[top].items.length}`);
  }
  // Below-top-3 = chemistry(3), history(1) — count-only stubs
  for (const [key, count] of [['chemistry', 3], ['history', 1]]) {
    assert.ok(out[key], `count-only "${key}" stub present`);
    assert.equal(out[key].items.length, 0, `"${key}" stub has empty items`);
    assert.equal(out[key].item_count, count, `"${key}" item_count = ${count}`);
    assert.equal(out[key].summary_paragraph_for_chatbot, undefined,
      `"${key}" stub carries no summary`);
  }
});

test('projection drops per-item polymorphic fields except source_url', () => {
  const ss = {
    schema_version: 'v2.0',
    maths: {
      items: new Array(10).fill({
        source_url: 'https://x/m',
        category: 'subject_outcome_statistic',
        a_star_pct: 72.8,
        source_quote: 'A long quote that should be stripped',
        team_members: [{ pupil_name: 'leak' }],
      }),
      summary_paragraph_for_chatbot: 'M.',
    },
  };
  const out = projectSubjectStrengths(ss);
  for (const item of out.maths.items) {
    assert.deepEqual(Object.keys(item), ['source_url'],
      `projected item must have only source_url, got: ${JSON.stringify(item)}`);
  }
});

test('school_cohort preserved with summary + capped items', () => {
  const ss = {
    schema_version: 'v2.0',
    school_cohort: {
      items: new Array(5).fill({ source_url: 'https://x/sc', extracted_via_layer: 1 }),
      summary_paragraph_for_chatbot: 'Cohort-wide outcomes summary.',
    },
  };
  const out = projectSubjectStrengths(ss);
  assert.ok(out?.school_cohort, 'school_cohort preserved');
  assert.equal(out.school_cohort.summary_paragraph_for_chatbot, 'Cohort-wide outcomes summary.');
  assert.ok(out.school_cohort.items.length <= 3, 'school_cohort items capped at 3');
  assert.equal(out.school_cohort.item_count, 5, 'item_count = 5');
});

test('all-empty subjects + meta only → null', () => {
  const ss = {
    schema_version: 'v2.0',
    provenance: { extractor_version: 'v2.2' },
    maths:   { items: [], summary_paragraph_for_chatbot: null },
    biology: { items: [], summary_paragraph_for_chatbot: '' },
  };
  assert.equal(projectSubjectStrengths(ss), null,
    'all-empty subjects should project to null');
});

test('school_cohort alone (no subject buckets) survives projection', () => {
  const ss = {
    schema_version: 'v2.0',
    school_cohort: { items: [{ source_url: 'https://x' }], summary_paragraph_for_chatbot: 'Cohort.' },
  };
  const out = projectSubjectStrengths(ss);
  assert.ok(out, 'projection non-null when only school_cohort survives');
  assert.ok(out.school_cohort, 'school_cohort retained');
});

test('item with missing source_url becomes { source_url: null } (not dropped)', () => {
  const ss = {
    schema_version: 'v2.0',
    maths: {
      items: new Array(10).fill({ category: 'notable_current_pupil' /* no source_url */ }),
      summary_paragraph_for_chatbot: 'M.',
    },
  };
  const out = projectSubjectStrengths(ss);
  assert.equal(out.maths.items.length, 3, 'still capped at 3 items');
  for (const i of out.maths.items) {
    assert.equal(i.source_url, null, 'missing url becomes null, not dropped');
  }
});

test('Codex r2 P2: projection is now idempotent (already-projected input passes through)', () => {
  // Run a raw blob through once, then run the OUTPUT through again — should
  // be byte-equivalent (no drop of count-only stubs, no re-collapse).
  const raw = {
    schema_version: 'v2.0',
    maths:    { items: new Array(10).fill({ source_url: 'https://x/m' }), summary_paragraph_for_chatbot: 'M.' },
    biology:  { items: new Array(3).fill({ source_url: 'https://x/b' }), summary_paragraph_for_chatbot: 'B.' },
  };
  const projectedOnce  = projectSubjectStrengths(raw);
  const projectedTwice = projectSubjectStrengths(projectedOnce);
  assert.deepEqual(projectedTwice, projectedOnce,
    'double-projection must be a no-op (idempotency guard via item_count detection)');
});

test('Codex r2 P2: summary-only subject (items=0 but real summary) is preserved', () => {
  // A bucket with no extracted items but a non-empty summary paragraph
  // (e.g. a future extractor that emits a chat-ready cohort line without
  // structured items) must survive projection rather than getting dropped.
  const ss = {
    schema_version: 'v2.0',
    history: { items: [], summary_paragraph_for_chatbot: 'Strong history cohort outcomes.' },
  };
  const out = projectSubjectStrengths(ss);
  assert.ok(out?.history, 'history bucket with summary-only must be preserved');
  assert.equal(out.history.item_count, 0);
  assert.equal(out.history.summary_paragraph_for_chatbot, 'Strong history cohort outcomes.');
});

test('Codex r2 P2: tiebreak uses canonical subject order (not JS object insertion order)', () => {
  // Three subjects with count=5. Without tiebreak, insertion order would
  // pick economics_business, modern_languages, english (since those are
  // declared first below). With canonical tiebreak: english, history,
  // modern_languages — alphabetical within the canonical order list.
  const ss = {
    schema_version: 'v2.0',
    economics_business: { items: new Array(5).fill({ source_url: 'https://x' }), summary_paragraph_for_chatbot: 'E.' },
    modern_languages:   { items: new Array(5).fill({ source_url: 'https://x' }), summary_paragraph_for_chatbot: 'L.' },
    english:            { items: new Array(5).fill({ source_url: 'https://x' }), summary_paragraph_for_chatbot: 'En.' },
    history:            { items: new Array(5).fill({ source_url: 'https://x' }), summary_paragraph_for_chatbot: 'H.' },
  };
  const out = projectSubjectStrengths(ss);
  // Top-3 should be english, history, modern_languages (canonical positions 4, 5, 6).
  // economics_business (position 8) gets count-only stub.
  assert.ok(out.english?.summary_paragraph_for_chatbot,            'english is in top-3 (canonical 4)');
  assert.ok(out.history?.summary_paragraph_for_chatbot,            'history is in top-3 (canonical 5)');
  assert.ok(out.modern_languages?.summary_paragraph_for_chatbot,   'modern_languages is in top-3 (canonical 6)');
  // economics_business gets a count-only stub (no summary) — below-top-3
  // subjects always drop summary to keep token cost bounded.
  assert.equal(out.economics_business?.items?.length, 0,           'economics_business stub items empty');
  assert.equal(out.economics_business?.item_count, 5,              'economics_business stub keeps original count');
  assert.equal(out.economics_business?.summary_paragraph_for_chatbot, undefined,
    'count-only stub drops summary even when present');
})

test('Codex r2 P2: non-canonical subject keys are ignored (future diagnostic guard)', () => {
  // A diagnostic key like `_diagnostics` or `extra` with an items[] shape
  // should NOT consume a top-3 slot. Only the 9 canonical subjects qualify.
  const ss = {
    schema_version: 'v2.0',
    maths: { items: new Array(10).fill({ source_url: 'https://x' }), summary_paragraph_for_chatbot: 'M.' },
    _diagnostics: { items: new Array(50).fill({ source_url: 'https://x' }), summary_paragraph_for_chatbot: 'D.' },
    future_subject: { items: new Array(20).fill({ source_url: 'https://x' }), summary_paragraph_for_chatbot: 'F.' },
  };
  const out = projectSubjectStrengths(ss);
  assert.ok(out?.maths,        'canonical maths preserved');
  assert.equal(out._diagnostics,    undefined, '_diagnostics dropped');
  assert.equal(out.future_subject,  undefined, 'future_subject dropped');
});

test('Codex r3 P2: half-projected input preserves projected item_count (no erasure)', () => {
  // Mixed shape — `maths` is raw (items=[...10]), `biology` is already a
  // count-only stub (items=[] + item_count=7). Re-projection must NOT drop
  // biology just because items.length=0. The bucket-count helper reads
  // item_count first.
  const halfProjected = {
    schema_version: 'v2.0',
    maths:   { items: new Array(10).fill({ source_url: 'https://x/m' }), summary_paragraph_for_chatbot: 'M.' },
    biology: { items: [], item_count: 7 },   // already projected stub
    physics: { items: new Array(2).fill({ source_url: 'https://x/p' }), summary_paragraph_for_chatbot: 'P.' },
  }
  const out = projectSubjectStrengths(halfProjected)
  assert.ok(out, 'projection should be non-null')
  // Top-3 ordering by count: maths(10), biology(7), physics(2) — biology
  // MUST be in the top-3 and preserve count=7 despite items=[].
  assert.ok(out.biology, 'projected stub biology must survive re-projection')
  assert.equal(out.biology.item_count, 7, 'projected biology item_count preserved (not erased to 0)')
  // Maths is top-1 (10 items + summary)
  assert.equal(out.maths.item_count, 10)
  // Physics is top-3 (2 items + summary)
  assert.equal(out.physics.item_count, 2)
})

test('Codex r3 P2: half-projected school_cohort preserves item_count', () => {
  // Cohort already projected to 3 items but item_count=5. Re-projection
  // must preserve item_count=5, NOT collapse to items.length=3.
  const halfProjected = {
    schema_version: 'v2.0',
    school_cohort: {
      items: new Array(3).fill({ source_url: 'https://x' }),
      item_count: 5,
      summary_paragraph_for_chatbot: 'Cohort.',
    },
    maths: { items: new Array(2).fill({ source_url: 'https://x/m' }), summary_paragraph_for_chatbot: 'M.' },
  }
  const out = projectSubjectStrengths(halfProjected)
  assert.ok(out?.school_cohort, 'school_cohort retained')
  assert.equal(out.school_cohort.item_count, 5, 'cohort item_count preserved (not collapsed to 3)')
})

test('Codex r4 P2: school_cohort count-only stub (items=[], item_count=5) survives re-projection', () => {
  const halfProjected = {
    schema_version: 'v2.0',
    school_cohort: { items: [], item_count: 5 },
    maths: { items: new Array(5).fill({ source_url: 'https://x' }), summary_paragraph_for_chatbot: 'M.', item_count: 5 },
  }
  const out = projectSubjectStrengths(halfProjected)
  assert.ok(out?.school_cohort, 'school_cohort stub must survive')
  assert.equal(out.school_cohort.item_count, 5)
})

test('Codex r4 P2: projected subjects + raw school_cohort triggers full re-projection (cohort capped)', () => {
  // Subjects are projected, but cohort is raw with 5 items + heavy per-item
  // fields. Without the fix, _isAlreadyProjected would return true (cohort
  // ignored), short-circuit at entry, and skip cohort capping. With the fix,
  // raw cohort makes _isAlreadyProjected return false → full re-projection
  // runs → cohort gets capped to 3 items + per-item fields stripped.
  const halfProjected = {
    schema_version: 'v2.0',
    maths:   { items: [{ source_url: 'https://x' }], item_count: 10, summary_paragraph_for_chatbot: 'M.' },
    biology: { items: [{ source_url: 'https://x' }], item_count: 6,  summary_paragraph_for_chatbot: 'B.' },
    physics: { items: [{ source_url: 'https://x' }], item_count: 4,  summary_paragraph_for_chatbot: 'P.' },
    school_cohort: {
      items: new Array(5).fill({ source_url: 'https://x', source_quote: 'long quote', extracted_via_layer: 1 }),
      summary_paragraph_for_chatbot: 'Cohort summary.',
      // NOTE: no item_count → triggers _isAlreadyProjected=false
    },
  }
  const out = projectSubjectStrengths(halfProjected)
  assert.ok(out?.school_cohort, 'cohort retained after re-projection')
  // Items capped to 3, per-item fields stripped to source_url only
  assert.ok(out.school_cohort.items.length <= 3, `cohort items capped, got ${out.school_cohort.items.length}`)
  for (const it of out.school_cohort.items) {
    assert.deepEqual(Object.keys(it), ['source_url'],
      `cohort item must keep only source_url, got: ${JSON.stringify(it)}`)
  }
  assert.equal(out.school_cohort.item_count, 5, 'cohort item_count = 5 (from raw items)')
  assert.equal(out.school_cohort.summary_paragraph_for_chatbot, 'Cohort summary.')
})

test('Codex r2 P2: summary paragraph is capped to ~480 chars during projection', () => {
  const longSummary = 'A'.repeat(1000);
  const ss = {
    schema_version: 'v2.0',
    maths: { items: [{ source_url: 'https://x' }], summary_paragraph_for_chatbot: longSummary },
  };
  const out = projectSubjectStrengths(ss);
  assert.ok(out.maths.summary_paragraph_for_chatbot.length <= 481,
    `summary should be capped, got length=${out.maths.summary_paragraph_for_chatbot.length}`);
  assert.ok(out.maths.summary_paragraph_for_chatbot.endsWith('…'),
    'trim marker appended');
});

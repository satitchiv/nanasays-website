// RRV-8 — counselor reply shape + gap→alternative routing tests (2026-07-20).
//
// (a) neighbourHasData() must reject a getSchoolFacts result whose `data` and
//     `notion_backfill` are both entirely null — that's the exact shape
//     tools.js returns for a school with nothing on the requested fields,
//     and its `summary` still reads "Fetched N fields for X" regardless, so
//     the model must never see it as a block to route a gap to.
// (b) buildUserMessage must label role:'primary'/'neighbour' tool blocks and
//     only append SINGLE_SCHOOL_SHAPE_NOTE / GAP_ROUTING_NOTE for the 3
//     single-school intents this card touches — comparison-shaped intents
//     keep their existing COMPARE_COMPLETENESS_NOTE untouched.
//
// Run via:
//   cd website
//   node --experimental-strip-types --import ./lib/server/_test-stub-server-only.mjs \
//     --test lib/server/prose-runner-gap-routing.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUserMessage,
  neighbourHasData,
  SINGLE_SCHOOL_SHAPE_NOTE,
  GAP_ROUTING_NOTE,
} from './prose-runner.js';

// ── neighbourHasData ─────────────────────────────────────────────────────

test('neighbourHasData: all-null data + null notion_backfill → false', () => {
  const result = {
    slug: 'brighton-college', name: 'Brighton College',
    data: { school_slug: 'brighton-college', pastoral_model: null, pastoral_care: null },
    notion_backfill: null,
  };
  assert.equal(neighbourHasData(result), false);
});

test('neighbourHasData: notion_backfill entirely null-valued object → false', () => {
  const result = {
    slug: 'brighton-college', name: 'Brighton College',
    data: null,
    notion_backfill: { class_size: null, total_pupils: null },
  };
  assert.equal(neighbourHasData(result), false);
});

test('neighbourHasData: one real data field → true', () => {
  const result = {
    slug: 'wellington-college', name: 'Wellington College',
    data: { school_slug: 'wellington-college', pastoral_model: 'House-based, full boarding', pastoral_care: null },
    notion_backfill: null,
  };
  assert.equal(neighbourHasData(result), true);
});

test('neighbourHasData: only notion_backfill populated → true', () => {
  const result = {
    slug: 'wellington-college', name: 'Wellington College',
    data: { school_slug: 'wellington-college', pastoral_model: null },
    notion_backfill: { class_size: { senior: 16 } },
  };
  assert.equal(neighbourHasData(result), true);
});

test('neighbourHasData: keyed-but-all-null nested object (skeleton JSONB) → false', () => {
  // Structured fact fields (pastoral_model, wellbeing_staffing, …) are JSONB
  // objects, not scalars — a naive "has keys" check would pass a skeleton
  // like this even though nothing inside it is real data.
  const result = {
    slug: 'brighton-college', name: 'Brighton College',
    data: {
      school_slug: 'brighton-college',
      pastoral_model: { summary: null, source_url: null },
      wellbeing_staffing: { team: [], notes: '', source_urls: [] },
      policies_summary: '   ',
    },
    notion_backfill: null,
  };
  assert.equal(neighbourHasData(result), false);
});

test('neighbourHasData: nested array with one real entry → true', () => {
  const result = {
    slug: 'brighton-college', name: 'Brighton College',
    data: {
      school_slug: 'brighton-college',
      wellbeing_staffing: { team: [{ role: 'Counsellor', count: 1 }], notes: null },
    },
    notion_backfill: null,
  };
  assert.equal(neighbourHasData(result), true);
});

test('neighbourHasData: missing/malformed result → false, never throws', () => {
  assert.equal(neighbourHasData(null), false);
  assert.equal(neighbourHasData(undefined), false);
  assert.equal(neighbourHasData({}), false);
  assert.equal(neighbourHasData({ error: 'no slug' }), false);
});

// ── buildUserMessage: role labeling + scoped notes ──────────────────────────

const primaryBlob   = { name: 'getSchoolFacts', summary: 'Fetched 4 fields for Oakham School', role: 'primary', compact: '…oakham data…' };
const neighbourBlob = { name: 'getSchoolFacts', summary: 'Fetched 4 fields for Wellington College', role: 'neighbour', compact: '…wellington data…' };

test('buildUserMessage labels primary and neighbour tool blocks distinctly', () => {
  const msg = buildUserMessage(
    'Will my son be safe boarding at Oakham?',
    { intent: 'safeguarding_or_pastoral' },
    [primaryBlob, neighbourBlob],
    null, null,
  );
  assert.match(msg, /SCHOOL ASKED ABOUT/);
  assert.match(msg, /SHORTLIST NEIGHBOUR \(gap-routing only\)/);
});

test('buildUserMessage: SINGLE_SCHOOL_SHAPE_NOTE fires for the 3 touched intents', () => {
  for (const intent of ['safeguarding_or_pastoral', 'tell_me_about_school', 'fact_lookup']) {
    const msg = buildUserMessage('q', { intent }, [primaryBlob], null, null);
    assert.ok(msg.includes(SINGLE_SCHOOL_SHAPE_NOTE), `${intent} should get the shape note`);
  }
});

test('buildUserMessage: GAP_ROUTING_NOTE only fires when a neighbour block survived', () => {
  const withNeighbour = buildUserMessage('q', { intent: 'safeguarding_or_pastoral' }, [primaryBlob, neighbourBlob], null, null);
  assert.ok(withNeighbour.includes(GAP_ROUTING_NOTE));

  const withoutNeighbour = buildUserMessage('q', { intent: 'safeguarding_or_pastoral' }, [primaryBlob], null, null);
  assert.ok(!withoutNeighbour.includes(GAP_ROUTING_NOTE), 'no neighbour data survived → no gap-routing note (nothing to route to)');
  // Shape note still applies even with no alternative available — falls back to a tour question.
  assert.ok(withoutNeighbour.includes(SINGLE_SCHOOL_SHAPE_NOTE));
});

test('buildUserMessage: comparison-shaped intents never get the single-school notes', () => {
  const msg = buildUserMessage(
    'compare these on fees',
    { intent: 'shortlist_rank_or_compare' },
    [{ name: 'compareSchools', summary: '…', compact: '…' }],
    null, null,
  );
  assert.ok(!msg.includes(SINGLE_SCHOOL_SHAPE_NOTE));
  assert.ok(!msg.includes(GAP_ROUTING_NOTE));
});

test('buildUserMessage: untagged tool blobs (the other 8 intents) get no role suffix', () => {
  const msg = buildUserMessage(
    'compare these on fees',
    { intent: 'shortlist_rank_or_compare' },
    [{ name: 'compareSchools', summary: 'compared 3 schools', compact: '…' }],
    null, null,
  );
  assert.match(msg, /═══ TOOL \[compareSchools\] \(compared 3 schools\) ═══/);
  assert.ok(!msg.includes('SCHOOL ASKED ABOUT'));
  assert.ok(!msg.includes('SHORTLIST NEIGHBOUR'));
});

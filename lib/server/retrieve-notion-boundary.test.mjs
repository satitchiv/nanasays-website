// Codex r2 P2: prove that the raw `parsed` blob from school_notion_backfill
// (including fee fields) is projected at the retrieve.js boundary BEFORE it
// reaches any downstream surface. This guards against the streaming `final`
// payload in runOneQuestionStream shipping `retrieval` wholesale and
// accidentally leaking Notion fees / unknown raw keys.
//
// Run via:
//   cd website
//   node --import ./lib/server/_test-stub-server-only.mjs \
//     --test lib/server/retrieve-notion-boundary.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retrieveChunks } from './retrieve.js';

// Minimal fake supabase that mimics the fluent-builder shape retrieve.js uses.
// Returns hardcoded payloads keyed by table name; ignores filter chains.
function makeFakeSupabase({ structured, notionParsed }) {
  // school_knowledge rows used by retrieve.js — keep it minimal.
  const profileRow = {
    id: 'p1',
    school_slug: 'wellington-college',
    source_url: 'https://nanasays.test/wellington/profile',
    source_type: 'nanasays_internal',
    category: 'profile',
    title: 'Wellington College — NanaSays Profile Data',
    content: 'Profile body. About 100 words of basic info.',
    word_count: 100,
  };

  const tables = {
    school_knowledge: {
      // First .from('school_knowledge') call (profile fetch) returns profile.
      // Second call (candidates after vector failure) returns [].
      _calls: 0,
      respond() {
        this._calls += 1;
        if (this._calls === 1) return { data: [profileRow], error: null };
        return { data: [], count: 0, error: null };
      },
    },
    school_structured_data: {
      respond() { return { data: structured, error: null }; },
    },
    school_notion_backfill: {
      respond() { return { data: { school_slug: 'wellington-college', status: 'clean', parsed: notionParsed }, error: null }; },
    },
  };

  function builder(tableName) {
    const t = tables[tableName] || { respond: () => ({ data: null, error: null }) };
    const b = {
      _table: tableName,
      _isHead: false,
      select(_cols, opts) {
        if (opts && opts.head) b._isHead = true;
        return b;
      },
      eq() { return b; },
      in() { return b; },
      not() { return b; },
      limit() { return b; },
      maybeSingle() {
        const r = t.respond();
        return Promise.resolve(r);
      },
      single() {
        const r = t.respond();
        return Promise.resolve(r);
      },
      // Some calls await the builder directly (count: 'exact', head: true).
      then(resolve, reject) {
        if (b._isHead) {
          // Pretend zero embedded chunks so retrieve.js takes the keyword path.
          return Promise.resolve({ count: 0, error: null }).then(resolve, reject);
        }
        const r = t.respond();
        return Promise.resolve(r).then(resolve, reject);
      },
    };
    return b;
  }

  return {
    from: builder,
    rpc: async () => ({ data: null, error: { message: 'no rpc in fake' } }),
  };
}

test('boundary: retrieve.js projects Notion at the fetch boundary — fees never leak through', async () => {
  const supabase = makeFakeSupabase({
    structured: {
      // No SSD overlap fields — projector should keep Notion total_pupils.
      languages: ['English'],
    },
    notionParsed: {
      total_pupils: 1500,
      boarder_count: 420,
      boarding_fee_term: 14000,
      boarding_fee_year: 42000,
      raw_notion_url: 'https://notion.so/secret/page-id',
      unknown_future_key: 'should be stripped',
    },
  });

  const retrieval = await retrieveChunks(supabase, 'wellington-college', 'how many pupils?');

  assert.ok(retrieval.notion_backfill, 'notion_backfill present');
  assert.equal(retrieval.notion_backfill.total_pupils, 1500, 'whitelisted field present');
  assert.equal(retrieval.notion_backfill.boarder_count, 420, 'whitelisted field present');
  assert.equal(retrieval.notion_backfill.boarding_fee_term, undefined, 'term fee stripped at boundary');
  assert.equal(retrieval.notion_backfill.boarding_fee_year, undefined, 'year fee stripped at boundary');
  assert.equal(retrieval.notion_backfill.raw_notion_url, undefined, 'raw Notion key stripped');
  assert.equal(retrieval.notion_backfill.unknown_future_key, undefined, 'unknown key stripped');
});

test('boundary: retrieve.js applies SSD-wins at the fetch boundary', async () => {
  const supabase = makeFakeSupabase({
    structured: {
      // SSD has total_pupils → projector must suppress Notion's value.
      student_community: { total_pupils: 1200 },
      languages: ['English'],
    },
    notionParsed: {
      total_pupils: 1500,
      class_size: { senior: 14 },
    },
  });

  const retrieval = await retrieveChunks(supabase, 'wellington-college', 'how many pupils?');

  assert.ok(retrieval.notion_backfill, 'notion_backfill present (class_size survived)');
  assert.equal(retrieval.notion_backfill.total_pupils, undefined, 'SSD wins on total_pupils at boundary');
  assert.deepEqual(retrieval.notion_backfill.class_size, { senior: 14 });
});

test('boundary: retrieve.js returns notion_backfill = null when sidecar row absent or empty', async () => {
  const supabase = makeFakeSupabase({
    structured: { languages: ['English'] },
    notionParsed: null,
  });

  const retrieval = await retrieveChunks(supabase, 'wellington-college', 'how many pupils?');
  assert.equal(retrieval.notion_backfill, null);
});

// Codex r3 P1: guard against the accepted-status taxonomy drifting away from
// the sync script. Live data 2026-05-24: 72 `clean` + 3 `partial_with_review`
// + 0 `matched`. Both `clean` and `matched` are pure-write / safe-to-surface;
// `partial_with_review` is intentionally excluded (flagged_review cells need
// manual reconciliation). This test reads the wiring source files and asserts
// the filter taxonomy hasn't drifted into a single-status form again.
test('status-filter taxonomy: all 4 wiring sites accept clean + matched', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const files = [
    'lib/server/retrieve.js',
    'lib/server/research-context-pack.ts',
    'lib/server/tools.js',
    'app/api/school-chat/route.ts',
  ];
  for (const rel of files) {
    const abs = path.resolve(process.cwd(), rel);
    const src = await fs.readFile(abs, 'utf8');
    // Must reference school_notion_backfill (= this file participates in the wiring).
    assert.match(src, /school_notion_backfill/, `${rel} references school_notion_backfill`);
    // Must include both statuses in its filter — protects against future
    // accidental regressions to `.eq('status', 'clean')` only.
    assert.match(src, /\['clean',\s*'matched'\]/, `${rel} accepts both clean + matched`);
    // Must NOT use the strict single-status filter (the bug Codex r3 caught).
    assert.doesNotMatch(src, /\.eq\(\s*'status',\s*'clean'\s*\)/, `${rel} does not single-status-filter`);
  }
});

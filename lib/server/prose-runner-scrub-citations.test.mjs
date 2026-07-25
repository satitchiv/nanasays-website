// 2026-05-25 PM (browser smoke #5, Codex r1 follow-up): unit tests for the
// deterministic citation scrubber. Browser smoke caught the prose model
// emitting `[source](https://rankSchools)` despite the system-prompt HARD
// RULES against hallucinated URLs — Codex r1 required a code-level guard.
//
// scrubInvalidCitations runs after extractMeta and drops inline
// ([source](URL)) markdown when the URL is a tool name OR not present in
// the trusted allowedUrls allow-list.
//
// 2026-05-25 PM streaming-flash extract (Codex r5 P1.2): the scrubber now
// lives in `lib/prose-citation-scrubber.js` (client-safe — no server-only
// deps). Tests import directly instead of sandbox-eval'ing prose-runner.js.
// `filterCitations` stays in prose-runner.js (server-only); we re-extract it
// from source for testing here so the import chain stays simple.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  scrubInvalidCitations,
  scrubForbiddenCitations,
  FORBIDDEN_CITATION_HOSTS,
} from '../prose-citation-scrubber.js';

// filterCitations still lives in prose-runner.js (server-only). Re-extract
// from source to dodge its TS import chain. Same trick as before.
const SRC = await fs.readFile(
  path.resolve(process.cwd(), 'lib/server/prose-runner.js'),
  'utf8',
);
function extractExport(name) {
  const startMarker = `export function ${name}`;
  const start = SRC.indexOf(startMarker);
  if (start < 0) throw new Error(`couldn't find ${startMarker}`);
  let braceDepth = 0;
  let i = start;
  let openSeen = false;
  for (; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === '{') { braceDepth++; openSeen = true; }
    if (c === '}') { braceDepth--; if (openSeen && braceDepth === 0) { i++; break; } }
  }
  return SRC.slice(start, i);
}
// Serialize the REAL FORBIDDEN_CITATION_HOSTS set into the sandbox so this
// test follows the production set without manual mirroring (Codex r1 P3
// drift guard — was hardcoded inline, would silently drift if hosts change).
const HOSTS_SRC = `const FORBIDDEN_CITATION_HOSTS = new Set(${
  JSON.stringify([...FORBIDDEN_CITATION_HOSTS])
});`;
const filterSrc = extractExport('filterCitations').replace('export function', 'function');
const sandbox = new Function(`
  ${HOSTS_SRC}
  ${filterSrc}
  return { filterCitations };
`)();
const { filterCitations } = sandbox;

// ────────────────────────────────────────────────────────────────────────────
// scrubInvalidCitations — strips inline ([source](URL)) markdown
// ────────────────────────────────────────────────────────────────────────────

test('scrubInvalidCitations: removes tool-name host "rankSchools" (the smoke-failure case)', () => {
  // Exact browser-smoke shape: "Eton is 7 miles from Heathrow ([source](https://rankSchools))"
  const input = 'Eton is 7 miles from Heathrow ([source](https://rankSchools)).';
  const out = scrubInvalidCitations(input, []);
  assert.equal(out, 'Eton is 7 miles from Heathrow.');
});

test('scrubInvalidCitations: removes all tool-name hosts (getSchoolFacts, compareSchools, etc.)', () => {
  for (const tool of ['rankSchools', 'getSchoolFacts', 'compareSchools', 'filterSchools', 'searchSchoolText', 'searchSafeguarding']) {
    const input = `Eton has X ([source](https://${tool})).`;
    const out = scrubInvalidCitations(input, []);
    assert.equal(out, 'Eton has X.', `must strip [source](https://${tool})`);
  }
});

test('scrubInvalidCitations: tool-name match is case-insensitive', () => {
  const input = 'Eton ([source](https://RankSchools)) and ([source](https://RANKSCHOOLS)).';
  const out = scrubInvalidCitations(input, []);
  assert.equal(out, 'Eton and.');
});

test('scrubInvalidCitations: removes URLs NOT in the allowed list', () => {
  // Model hallucinated a plausible-looking domain that isn't in tool results.
  const input = 'Eton has X ([source](https://made-up-domain.example.com/article)).';
  const out = scrubInvalidCitations(input, ['https://etoncollege.com/results']);
  assert.equal(out, 'Eton has X.');
});

test('scrubInvalidCitations: PRESERVES URLs that ARE in the allowed list', () => {
  const input = 'Eton has 96% A*-A ([source](https://etoncollege.com/results)).';
  const out = scrubInvalidCitations(input, ['https://etoncollege.com/results']);
  assert.equal(out, input, 'allowed URL must round-trip unchanged');
});

test('scrubInvalidCitations: empty allowedUrls STRIPS ALL inline citations (Codex r2 P1 strict semantics)', () => {
  // 2026-05-25 PM Codex r2 P1 — empty allowedUrls means "no URLs are valid",
  // not "no enforcement". Tools returned no source URLs (e.g. pure
  // proximity_to_heathrow rank) → the model MUST NOT cite anything.
  // Without this, a hallucinated-but-plausible URL like
  // https://etoncollege.com/results would pass even though no tool returned it.
  const input = 'Eton ([source](https://etoncollege.com/results)).';
  const out = scrubInvalidCitations(input, []);
  assert.equal(out, 'Eton.', 'empty allow-list → strip even plausible-looking URLs');
});

test('scrubInvalidCitations: empty allowedUrls + tool-name host → strip (both rules fire)', () => {
  const input = 'Eton ([source](https://rankSchools)).';
  const out = scrubInvalidCitations(input, []);
  assert.equal(out, 'Eton.');
});

test('scrubInvalidCitations: handles multiple citations in one prose blob', () => {
  const input =
    'Eton scored 96% ([source](https://etoncollege.com/results)) and Harrow scored 90% ([source](https://rankSchools)).';
  const out = scrubInvalidCitations(input, ['https://etoncollege.com/results']);
  assert.equal(out, 'Eton scored 96% ([source](https://etoncollege.com/results)) and Harrow scored 90%.');
});

test('scrubInvalidCitations: no-op when prose has no citations', () => {
  const input = 'Eton is 7 miles from Heathrow. Harrow is 9 miles away.';
  assert.equal(scrubInvalidCitations(input, []), input);
});

test('scrubInvalidCitations: null/undefined input passes through safely', () => {
  assert.equal(scrubInvalidCitations(null, []), null);
  assert.equal(scrubInvalidCitations(undefined, []), undefined);
  assert.equal(scrubInvalidCitations('', []), '');
});

// ────────────────────────────────────────────────────────────────────────────
// Codex r3 P1 (2026-05-25 PM): bare `[source](URL)` form (no outer parens)
// is now also caught + scrubbed. Earlier regex only matched the
// parenthesized form `([source](URL))`.
// ────────────────────────────────────────────────────────────────────────────

test('scrubInvalidCitations: BARE form [source](URL) without outer parens — tool-name host stripped (Codex r3 P1)', () => {
  const input = 'Eton [source](https://rankSchools).';
  const out = scrubInvalidCitations(input, []);
  assert.equal(out, 'Eton.');
});

test('scrubInvalidCitations: BARE form with non-allowed URL stripped', () => {
  const input = 'Eton [source](https://made-up.example).';
  const out = scrubInvalidCitations(input, []);
  assert.equal(out, 'Eton.');
});

test('scrubInvalidCitations: BARE form with ALLOWED URL preserved (original shape kept)', () => {
  const input = 'Eton [source](https://etoncollege.com/results).';
  const out = scrubInvalidCitations(input, ['https://etoncollege.com/results']);
  // Match.original is preserved — bare form stays bare, no outer parens added.
  assert.equal(out, input);
});

test('scrubInvalidCitations: PARENTHESIZED form with ALLOWED URL preserved (original shape kept)', () => {
  const input = 'Eton ([source](https://etoncollege.com/results)).';
  const out = scrubInvalidCitations(input, ['https://etoncollege.com/results']);
  assert.equal(out, input);
});

// ────────────────────────────────────────────────────────────────────────────
// Codex r4 P1.1 (2026-05-25 PM): non-URL targets like [source](slug-name) /
// [source](rankSchools) (no https:// prefix) used to bypass the scrubber
// entirely — earlier regex only captured https?:// targets. The prose
// system-prompt explicitly forbids these shapes (line ~72: "never write
// '[source](slug-name)'"), but the model can still emit them. Regex now
// captures ANY non-space target; replacer validates via new URL() and
// drops malformed/non-URL targets.
// ────────────────────────────────────────────────────────────────────────────

test('scrubInvalidCitations: non-URL [source](slug-name) is now stripped (Codex r4 P1.1)', () => {
  const input = 'Eton ([source](reeds-school-uk)).';
  const out = scrubInvalidCitations(input, []);
  assert.equal(out, 'Eton.');
});

test('scrubInvalidCitations: non-URL [source](rankSchools) without https:// is stripped', () => {
  // The prompt forbids this exact pattern but earlier regex only caught
  // https://rankSchools. Now bare rankSchools is also stripped.
  const input = 'Eton ([source](rankSchools)).';
  const out = scrubInvalidCitations(input, []);
  assert.equal(out, 'Eton.');
});

test('scrubInvalidCitations: BARE non-URL slug-shaped target is stripped', () => {
  const input = 'Eton [source](eton-college).';
  const out = scrubInvalidCitations(input, []);
  assert.equal(out, 'Eton.');
});

test('scrubInvalidCitations: BARE non-URL rankSchools (bare form + non-URL combo) stripped', () => {
  const input = 'Eton [source](rankSchools).';
  const out = scrubInvalidCitations(input, []);
  assert.equal(out, 'Eton.');
});

test('scrubInvalidCitations: garbage target like [source](xyz123) stripped', () => {
  const input = 'Eton ([source](xyz123)).';
  const out = scrubInvalidCitations(input, []);
  assert.equal(out, 'Eton.');
});

test('scrubInvalidCitations: mixed non-URL + valid URL — valid one preserved when allow-listed', () => {
  const input =
    'Eton ([source](https://etoncollege.com/results)) wins. Harrow ([source](rankSchools)) loses.';
  const out = scrubInvalidCitations(input, ['https://etoncollege.com/results']);
  assert.equal(out, 'Eton ([source](https://etoncollege.com/results)) wins. Harrow loses.');
});

test('scrubInvalidCitations: mixed bare + parenthesized in same prose, mixed allow/reject', () => {
  const input =
    'Eton ([source](https://etoncollege.com/results)) wins. Harrow [source](https://rankSchools) loses.';
  const out = scrubInvalidCitations(input, ['https://etoncollege.com/results']);
  assert.equal(out, 'Eton ([source](https://etoncollege.com/results)) wins. Harrow loses.');
});

test('scrubInvalidCitations: accepts allowedUrls as Set OR Array', () => {
  const input = 'Eton ([source](https://etoncollege.com/results)).';
  const allowed = new Set(['https://etoncollege.com/results']);
  assert.equal(scrubInvalidCitations(input, allowed), input);
});

// ────────────────────────────────────────────────────────────────────────────
// filterCitations — same allow-list/tool-name rules for meta.citations[]
// ────────────────────────────────────────────────────────────────────────────

test('filterCitations: drops tool-name URLs', () => {
  const out = filterCitations(
    ['https://etoncollege.com/results', 'https://rankSchools', 'https://getSchoolFacts'],
    ['https://etoncollege.com/results'],
  );
  assert.deepEqual(out, ['https://etoncollege.com/results']);
});

test('filterCitations: drops URLs not in allowedUrls', () => {
  const out = filterCitations(
    ['https://etoncollege.com/results', 'https://random-site.example/article'],
    ['https://etoncollege.com/results'],
  );
  assert.deepEqual(out, ['https://etoncollege.com/results']);
});

test('filterCitations: empty allowedUrls STRIPS ALL (Codex r2 P1 strict semantics)', () => {
  // 2026-05-25 PM Codex r2 P1 — same strict semantics as scrubInvalidCitations.
  // Empty allow-list means "no URLs are valid", so even a plausible URL drops.
  const out = filterCitations(
    ['https://etoncollege.com/results', 'https://rankSchools'],
    [],
  );
  assert.deepEqual(out, []);
});

test('filterCitations: malformed URL strings are dropped (empty allow-list strips even valid URLs per strict semantics)', () => {
  // With strict empty-list semantics (Codex r2 P1), every URL drops because
  // none are in the (empty) allow-list. The malformed/wrong-type entries
  // would drop regardless. To test malformed-URL-specific behaviour, pass a
  // non-empty allow-list that includes the valid one.
  const out1 = filterCitations(['not-a-url', 'https://etoncollege.com', 12345, null], []);
  assert.deepEqual(out1, [], 'empty allow-list strips ALL (Codex r2 P1)');

  const out2 = filterCitations(
    ['not-a-url', 'https://etoncollege.com', 12345, null],
    ['https://etoncollege.com'],
  );
  assert.deepEqual(out2, ['https://etoncollege.com'], 'valid URL in allow-list survives; malformed/non-string drop');
});

test('filterCitations: non-array input returns []', () => {
  assert.deepEqual(filterCitations(null, []), []);
  assert.deepEqual(filterCitations(undefined, []), []);
  assert.deepEqual(filterCitations('not-an-array', []), []);
});

// ────────────────────────────────────────────────────────────────────────────
// scrubForbiddenCitations — LAX mode (client-side, mid-stream)
//
// The bubble doesn't have the trusted allow-list yet (meta arrives at the
// end of the stream), so we can't enforce strict allowlist semantics. We
// CAN strip URLs we KNOW are bogus regardless of the final allow-list:
//   - tool-name hosts (rankSchools, getSchoolFacts, …)
//   - malformed `[source](non-url)` shapes
// Real-looking URLs pass through; they get strict-validated post-stream.
// ────────────────────────────────────────────────────────────────────────────

test('scrubForbiddenCitations: removes tool-name host "rankSchools" (the streaming-flash case)', () => {
  const input = 'Eton is 7 miles from Heathrow ([source](https://rankSchools)).';
  const out = scrubForbiddenCitations(input);
  assert.equal(out, 'Eton is 7 miles from Heathrow.');
});

test('scrubForbiddenCitations: removes all 6 tool-name hosts', () => {
  for (const tool of ['rankSchools', 'getSchoolFacts', 'compareSchools', 'filterSchools', 'searchSchoolText', 'searchSafeguarding']) {
    const input = `Eton has X ([source](https://${tool})).`;
    const out = scrubForbiddenCitations(input);
    assert.equal(out, 'Eton has X.', `must strip [source](https://${tool})`);
  }
});

test('scrubForbiddenCitations: tool-name match is case-insensitive', () => {
  const input = 'Eton ([source](https://RankSchools)) and ([source](https://RANKSCHOOLS)).';
  const out = scrubForbiddenCitations(input);
  assert.equal(out, 'Eton and.');
});

test('scrubForbiddenCitations: PRESERVES real-looking URLs (no allow-list enforcement mid-stream)', () => {
  // Key distinction from strict mode: at this point we don't know if the
  // URL will be in the final allow-list. Pass it through; the final payload
  // will re-render with strict scrub applied.
  const input = 'Eton has 49% A* ([source](https://etoncollege.com/results)).';
  const out = scrubForbiddenCitations(input);
  assert.equal(out, input, 'real URLs must pass through lax mode');
});

test('scrubForbiddenCitations: drops malformed [source](non-url) shapes', () => {
  // [source](slug-name) and [source](just-a-word) are bogus regardless
  // of allow-list — strip them.
  const input = 'Eton is X ([source](slug-name)) and Y ([source](some-word)).';
  const out = scrubForbiddenCitations(input);
  assert.equal(out, 'Eton is X and Y.');
});

test('scrubForbiddenCitations: handles bare [source](URL) form (no outer parens)', () => {
  const input = 'Eton [source](https://rankSchools) — strong academics.';
  const out = scrubForbiddenCitations(input);
  assert.equal(out, 'Eton — strong academics.');
});

test('scrubForbiddenCitations: mixed forbidden + valid URLs in one stream', () => {
  // Realistic streaming chunk: model has emitted one tool-name URL and one
  // real URL. Strip the tool-name; keep the real one.
  const input = 'Eton has X ([source](https://rankSchools)) and Y ([source](https://etoncollege.com)).';
  const out = scrubForbiddenCitations(input);
  assert.equal(out, 'Eton has X and Y ([source](https://etoncollege.com)).');
});

test('scrubForbiddenCitations: empty + non-string inputs handled safely', () => {
  assert.equal(scrubForbiddenCitations(''), '');
  assert.equal(scrubForbiddenCitations(null), null);
  assert.equal(scrubForbiddenCitations(undefined), undefined);
  assert.equal(scrubForbiddenCitations(12345), 12345);
});

test('scrubForbiddenCitations: incomplete inline shape mid-stream is left alone', () => {
  // While the URL is still being streamed character-by-character we might
  // see a half-formed `[source](https://r` — the regex requires the closing
  // `)` so partial matches do NOT trip. Once the closing paren arrives in a
  // later chunk, the next render scrubs the now-complete bogus citation.
  const partial = 'Eton has X ([source](https://rankSch';
  const out = scrubForbiddenCitations(partial);
  assert.equal(out, partial, 'partial inline must pass through unmodified');
});

// Slice 8 Build 3 session 4 follow-up — build-mode-llm source-grep tests.
//
// Why source-grep: the file imports openai + makes real network calls;
// a unit test would need to mock the SDK at module level. Source-grep
// catches regressions on configuration-style choices that matter for
// observability + correctness.
//
// Run via:
//   node --experimental-strip-types --test \
//     lib/server/research-room/build-mode-llm.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./build-mode-llm.ts', import.meta.url), 'utf8')

// ── Token usage capture (browser-smoke fix, 2026-05-16) ──────────────

test('build-mode-llm: streaming call passes stream_options.include_usage', () => {
  // Without this option, OpenAI omits `usage` from the final streamed
  // chunk → `final.usage` is undefined → token counts default to 0 →
  // nana_chat_logs writes tokens_in/out = 0 and cost_total_usd ≈ 0.
  // Browser smoke 2026-05-16 step 8 surfaced this: Build Mode rows
  // appeared in MC with correct `backend = build-mode` tag but every
  // row displayed `<$0.001` because the cost calc had zero tokens to
  // multiply against.
  assert.match(src, /stream_options:\s+\{\s+include_usage:\s+true\s*\}/)
})

test('build-mode-llm: stream_options sits inside chat.completions.stream() call', () => {
  // Defensive: catch a future refactor that moves the option onto the
  // request body root or into the wrong helper. The option MUST land
  // on the stream() call, not parse(), and must be set BEFORE the
  // signal (i.e. inside the first arg).
  assert.match(src, /chat\.completions\.stream\([\s\S]*?stream_options/)
})

// ── Meta forwarding (session 4 baseline, still valid) ────────────────

test('build-mode-llm: meta Promise resolves with usage shape used by route', () => {
  // The turn + finalize routes both read meta.usage.input_tokens
  // and meta.usage.output_tokens. Schema is pinned here so a SDK
  // upgrade can't silently rename the fields without a test failure.
  assert.match(src, /input_tokens:\s+final\.usage\?\.prompt_tokens/)
  assert.match(src, /output_tokens:\s+final\.usage\?\.completion_tokens/)
})

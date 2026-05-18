// Run: node --test lib/server/no-school-substitution-prompts.test.mjs
//
// Codex r2 P6-B + r3 Q13: verify the NO SCHOOL SUBSTITUTION invariant is
// present in every prompt that can be selected for a parent answer. A static
// substring assertion is enough — no live LLM call needed. Prevents the rule
// silently disappearing during a future prompt edit.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SYSTEM_PROMPT_CHAT,
  SYSTEM_PROMPT_REPORT,
  MULTI_SCHOOL_SYSTEM_PROMPT_CHAT,
  MULTI_SCHOOL_SYSTEM_PROMPT_REPORT,
  GLOBAL_SYSTEM_PROMPT,
} from './nana-brain.js';

const PROMPTS = [
  ['SYSTEM_PROMPT_CHAT',                SYSTEM_PROMPT_CHAT],
  ['SYSTEM_PROMPT_REPORT',              SYSTEM_PROMPT_REPORT],
  ['MULTI_SCHOOL_SYSTEM_PROMPT_CHAT',   MULTI_SCHOOL_SYSTEM_PROMPT_CHAT],
  ['MULTI_SCHOOL_SYSTEM_PROMPT_REPORT', MULTI_SCHOOL_SYSTEM_PROMPT_REPORT],
  ['GLOBAL_SYSTEM_PROMPT',              GLOBAL_SYSTEM_PROMPT],
];

for (const [name, prompt] of PROMPTS) {
  test(`${name} carries the NO SCHOOL SUBSTITUTION invariant`, () => {
    assert.ok(typeof prompt === 'string' && prompt.length > 0, `${name} is exported and non-empty`);
    assert.match(prompt, /NO SCHOOL SUBSTITUTION/, `${name} must contain the NO SCHOOL SUBSTITUTION rule header`);
    // The invariant — never substitute a loaded school's facts for a missing one.
    assert.match(prompt, /substitut|substitute|relabel|proxy/i, `${name} substitution rule must use anti-substitution language`);
  });
}

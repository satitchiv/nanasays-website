// Tests the Anthropic-API hard-stop guard in nana-brain.js (Step 1 of the
// Chatbot Wiring sprint). Mirrors CLAUDE.md "HARD STOP — Anthropic API usage".
//
// Run: node --test website/lib/server/nana-brain-anthropic-guard.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertAnthropicSdkAllowed, selectDefaultBackend } from './nana-brain.js';

test('throws when only ANTHROPIC_API_KEY is set without opt-in', () => {
  const env = { ANTHROPIC_API_KEY: 'sk-ant-test' };
  assert.throws(() => assertAnthropicSdkAllowed(env), /BLOCKED.*Anthropic API/);
});

test('throws when ANTHROPIC_API_KEY is set with NANA_ALLOW_ANTHROPIC_API set to something other than "true"', () => {
  const env = { ANTHROPIC_API_KEY: 'sk-ant-test', NANA_ALLOW_ANTHROPIC_API: '1' };
  assert.throws(() => assertAnthropicSdkAllowed(env), /BLOCKED.*Anthropic API/);
});

test('allows when ANTHROPIC_API_KEY is set with NANA_ALLOW_ANTHROPIC_API="true"', () => {
  const env = { ANTHROPIC_API_KEY: 'sk-ant-test', NANA_ALLOW_ANTHROPIC_API: 'true' };
  assert.doesNotThrow(() => assertAnthropicSdkAllowed(env));
});

test('allows when only MINIMAX_API_KEY is set (no opt-in required)', () => {
  const env = { MINIMAX_API_KEY: 'mm-test' };
  assert.doesNotThrow(() => assertAnthropicSdkAllowed(env));
});

test('throws when BOTH MINIMAX_API_KEY and ANTHROPIC_API_KEY are set (collision)', () => {
  const env = { MINIMAX_API_KEY: 'mm-test', ANTHROPIC_API_KEY: 'sk-ant-test' };
  assert.throws(() => assertAnthropicSdkAllowed(env), /BLOCKED.*both/);
});

test('throws collision even with NANA_ALLOW_ANTHROPIC_API="true" — opt-in does not resolve ambiguity', () => {
  const env = {
    MINIMAX_API_KEY: 'mm-test',
    ANTHROPIC_API_KEY: 'sk-ant-test',
    NANA_ALLOW_ANTHROPIC_API: 'true',
  };
  assert.throws(() => assertAnthropicSdkAllowed(env), /BLOCKED.*both/);
});

test('allows when neither key is set (downstream "key not set" error will fire separately)', () => {
  const env = {};
  assert.doesNotThrow(() => assertAnthropicSdkAllowed(env));
});

// ── selectDefaultBackend — BACKEND auto-selection respects the opt-in ──

test('selectDefaultBackend: explicit NANA_BRAIN_BACKEND wins (sdk)', () => {
  assert.equal(selectDefaultBackend({ NANA_BRAIN_BACKEND: 'sdk' }), 'sdk');
});

test('selectDefaultBackend: explicit NANA_BRAIN_BACKEND wins (cli) even when MiniMax set', () => {
  assert.equal(selectDefaultBackend({ NANA_BRAIN_BACKEND: 'cli', MINIMAX_API_KEY: 'mm' }), 'cli');
});

test('selectDefaultBackend: MiniMax set → sdk', () => {
  assert.equal(selectDefaultBackend({ MINIMAX_API_KEY: 'mm' }), 'sdk');
});

test('selectDefaultBackend: Anthropic + opt-in → sdk', () => {
  assert.equal(
    selectDefaultBackend({ ANTHROPIC_API_KEY: 'sk-ant', NANA_ALLOW_ANTHROPIC_API: 'true' }),
    'sdk',
  );
});

test('selectDefaultBackend: Anthropic WITHOUT opt-in → cli (accidental leak → safe fallback)', () => {
  assert.equal(selectDefaultBackend({ ANTHROPIC_API_KEY: 'sk-ant' }), 'cli');
});

test('selectDefaultBackend: Anthropic with NANA_ALLOW_ANTHROPIC_API="1" (not "true") → cli', () => {
  assert.equal(
    selectDefaultBackend({ ANTHROPIC_API_KEY: 'sk-ant', NANA_ALLOW_ANTHROPIC_API: '1' }),
    'cli',
  );
});

test('selectDefaultBackend: neither key set → cli', () => {
  assert.equal(selectDefaultBackend({}), 'cli');
});

test('selectDefaultBackend: MINIMAX+ANTHROPIC collision returns "sdk" (so collision guard fires at call time, not silent fallback)', () => {
  // Documents the contract: backend selection does not preempt the collision
  // throw — assertAnthropicSdkAllowed() must be the single decision point.
  assert.equal(
    selectDefaultBackend({ MINIMAX_API_KEY: 'mm', ANTHROPIC_API_KEY: 'sk-ant' }),
    'sdk',
  );
});

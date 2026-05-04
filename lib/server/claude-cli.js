/**
 * claude-cli.js
 *
 * Replaces direct Anthropic SDK calls with the `claude` CLI subprocess.
 * Routes through the user's Claude Max subscription (OAuth/keychain) —
 * NO ANTHROPIC_API_KEY required, NO prepaid credits consumed.
 *
 * Usage:
 *   import { callClaudeCLI } from './lib/claude-cli.js';
 *   const text = callClaudeCLI({ systemPrompt, userMessage, model: 'claude-haiku-4-5-20251001' });
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path'; // os still needed for cwd: os.tmpdir()
import { logUsage as logUsageCentral } from './usage-log.js';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 15_000; // 15s between retries — gives Max subscription time to recover

function logUsage({ model, inputTokens, outputTokens, label }) {
  logUsageCentral({
    provider: 'anthropic-cli',
    model,
    label,
    in:  inputTokens,
    out: outputTokens,
  });
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Call Claude via the CLI subprocess (Max subscription, not API credits).
 *
 * @param {object} opts
 * @param {string} opts.systemPrompt  - Instructions / schema block
 * @param {string} opts.userMessage   - The user turn (task + content)
 * @param {string} [opts.model]       - Full model ID or alias (haiku / sonnet / opus)
 * @param {number} [opts.timeoutMs]   - Subprocess timeout in ms (default 300s)
 * @returns {string} Claude's text response
 */
export function callClaudeCLI({ systemPrompt, userMessage, model = 'claude-haiku-4-5-20251001', timeoutMs = 300_000, label }) {
  // Combine system instructions + user task into a single prompt.
  // Claude understands <instructions> / <task> XML framing natively.
  const fullPrompt = `<instructions>\n${systemPrompt}\n</instructions>\n\n${userMessage}`;

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = spawnSync(
      'claude',
      [
        '-p',
        '--model', model,
        '--no-session-persistence',
        '--output-format', 'text',
      ],
      {
        input: fullPrompt,
        encoding: 'utf8',
        maxBuffer: 100 * 1024 * 1024,
        timeout: timeoutMs,
        // Run from a neutral dir so project CLAUDE.md doesn't interfere
        cwd: os.tmpdir(),
      }
    );

    if (result.error) {
      lastError = new Error(`claude CLI spawn error (attempt ${attempt}/${MAX_RETRIES}): ${result.error.message}`);
      console.error(`  ⚠ ${lastError.message} — retrying in ${RETRY_DELAY_MS / 1000}s`);
      if (attempt < MAX_RETRIES) sleep(RETRY_DELAY_MS);
      continue;
    }

    if (result.status !== 0) {
      const stderr = result.stderr?.slice(0, 500) ?? '';
      lastError = new Error(`claude CLI exited ${result.status} (attempt ${attempt}/${MAX_RETRIES}): ${stderr}`);
      console.error(`  ⚠ ${lastError.message} — retrying in ${RETRY_DELAY_MS / 1000}s`);
      if (attempt < MAX_RETRIES) sleep(RETRY_DELAY_MS);
      continue;
    }

    const output = result.stdout.trim();
    const inputTokens = Math.ceil(fullPrompt.length / 4);
    const outputTokens = Math.ceil(output.length / 4);
    logUsage({ model, inputTokens, outputTokens, label });
    return output;
  }

  throw lastError;
}

/**
 * usage-log.js
 *
 * Central logger for every external API call that costs money (or could,
 * if we hit a free-tier cap). All LLM/embedding/OCR call sites should
 * funnel through here so the dashboard Costs tab has one source of truth.
 *
 * Log file: /tmp/claude-usage-YYYY-MM-DD.log
 * (Name kept for backwards compatibility with the existing dashboard parser.)
 *
 * Format — token-based providers:
 *   ISO_TS | label | provider=X | model=Y | in=N | out=N | total=N
 *
 * Format — char-based providers (Gemini embeddings, Cohere rerank, etc):
 *   ISO_TS | label | provider=X | model=Y | chars=N
 *
 * Old log lines (pre-provider) without `provider=` still parse — they
 * default to provider=anthropic-cli since that was the only writer.
 */

import fs from 'fs';
import path from 'path';

function logFilePath() {
  const date = new Date().toISOString().slice(0, 10);
  return path.join('/tmp', `claude-usage-${date}.log`);
}

/**
 * Log a token-based call (most LLMs).
 *
 * @param {object} o
 * @param {string} o.provider       e.g. 'anthropic-cli', 'anthropic-sdk', 'minimax', 'gemini'
 * @param {string} o.model          e.g. 'claude-haiku-4-5-20251001', 'MiniMax-M2.7', 'gemini-2.5-flash'
 * @param {string} o.label          e.g. 'culture:headington-school-oxford', 'nana-chat:wycombe-abbey'
 * @param {number} o.in             input tokens
 * @param {number} o.out            output tokens
 * @param {number} [o.cacheRead]    optional — cached input tokens (Anthropic SDK)
 * @param {number} [o.cacheWrite]   optional — cache-creation tokens (Anthropic SDK)
 */
export function logUsage({ provider, model, label, in: inTok, out: outTok, cacheRead, cacheWrite }) {
  if (!provider || !model) return; // best-effort: skip if caller didn't tag
  const total = (inTok || 0) + (outTok || 0);
  const parts = [
    new Date().toISOString(),
    label || 'unknown',
    `provider=${provider}`,
    `model=${model}`,
    `in=${inTok || 0}`,
    `out=${outTok || 0}`,
    `total=${total}`,
  ];
  if (cacheRead != null)  parts.push(`cache_read=${cacheRead}`);
  if (cacheWrite != null) parts.push(`cache_write=${cacheWrite}`);
  try {
    fs.appendFileSync(logFilePath(), parts.join(' | ') + '\n');
  } catch { /* don't blow up the call site over telemetry */ }
}

/**
 * Log a char-based call (Gemini embeddings, etc — billed per character).
 */
export function logUsageChars({ provider, model, label, chars }) {
  if (!provider || !model || !chars) return;
  const parts = [
    new Date().toISOString(),
    label || 'unknown',
    `provider=${provider}`,
    `model=${model}`,
    `chars=${chars}`,
  ];
  try {
    fs.appendFileSync(logFilePath(), parts.join(' | ') + '\n');
  } catch { /* swallow */ }
}

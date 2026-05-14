/**
 * llm-adapter.js
 *
 * Provider-agnostic streaming adapter for the Nana chat path. Two adapters
 * ship today:
 *   - geminiStream  (NANA_PROVIDER=gemini)  — Google Gemini 2.5 Flash
 *   - openaiStream  (NANA_PROVIDER=gpt)     — OpenAI GPT-5.4 Mini
 * MiniMax stays the default via the existing callClaudeStreamSDK path.
 *
 * Interface mirrors callClaudeStream so the call sites in agentic-loop.js,
 * prose-runner.js, and nana-brain.js consumers don't need to change:
 *
 *   for await (const chunk of geminiStream(systemPrompt, schoolFacts,
 *                                          userMessage, retryReminder, ctx, signal)) {
 *     // chunk is a string; ctx is mutated with usage/model after stream ends
 *   }
 *
 * `ctx` after the stream completes:
 *   ctx.usage    — { input_tokens, output_tokens, cache_creation_input_tokens,
 *                    cache_read_input_tokens }  (Anthropic-shaped so
 *                    computeCostUSD can handle all providers via key lookup)
 *   ctx.model    — modelVersion returned by the API, e.g. 'gemini-2.5-flash'
 *                  or 'gpt-5.4-mini'
 *   ctx.provider — 'gemini' / 'gpt' / etc. — routed through to the final
 *                  payload's `backend` field for downstream telemetry
 *   ctx.ttft_ms  — time to first text token, ms
 *   ctx.total_ms — total stream wall time, ms
 *
 * Errors are wrapped in ClaudeError so the existing error handling in
 * route.ts / nana-brain.js doesn't need a parallel catch.
 *
 * runWithLlmPolicy adds a TTFT timeout + bounded retry around any stream
 * generator. Retries only fire if the inner generator hasn't yielded a
 * single chunk yet — once we've started streaming we can't replay
 * deterministically and any error past the first token propagates.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { ClaudeError } from './errors.js';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini';

let _geminiClient = null;
function getGeminiClient() {
  if (!_geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ClaudeError('GEMINI_API_KEY not set — cannot route to Gemini');
    }
    _geminiClient = new GoogleGenerativeAI(apiKey);
  }
  return _geminiClient;
}

let _openaiClient = null;
function getOpenAIClient() {
  if (!_openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ClaudeError('OPENAI_API_KEY not set — cannot route to GPT');
    }
    _openaiClient = new OpenAI({ apiKey });
  }
  return _openaiClient;
}

/**
 * Stream from Gemini Flash, yielding text chunks as they arrive.
 * Mirrors the callClaudeStream signature exactly.
 */
export async function* geminiStream(
  systemPrompt,
  schoolFacts,
  userMessage,
  retryReminder = '',
  ctx = {},
  signal = null,
  llmOpts = {},
) {
  const t0 = Date.now();
  let firstTokenAt = null;

  // Explicit temperature pin: providers' SDK defaults can drift between
  // versions, so we lock the value in code. Eval/dev-bypass runs override
  // to 0 for deterministic baselines; production keeps the prior implicit
  // default (1.0) until a separate product decision changes it.
  const temperature = typeof llmOpts.temperature === 'number' ? llmOpts.temperature : 1;

  // schoolFacts is the cacheable per-school block on the Anthropic side.
  // Gemini 2.5 Flash uses implicit caching of the system instruction (the
  // first 1k tokens of identical prefix get reused automatically), so
  // concatenating systemPrompt + schoolFacts here is the right shape — the
  // school facts are still cached as part of the systemInstruction prefix
  // when the question changes.
  const systemInstruction = schoolFacts
    ? `${systemPrompt}\n\n${schoolFacts}`
    : systemPrompt;

  let result;
  try {
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction,
      generationConfig: { maxOutputTokens: 4096, temperature },
    });
    // @google/generative-ai 0.24+ accepts a `signal` requestOption. Note:
    // Google's docs warn this is client-side cancellation only — generation
    // may still complete server-side and bill output tokens. Acceptable for
    // Path A; revisit if cost shows runaway aborts in Phase 3.
    result = await model.generateContentStream(
      {
        contents: [
          { role: 'user', parts: [{ text: userMessage + (retryReminder || '') }] },
        ],
      },
      signal ? { signal } : undefined,
    );
  } catch (e) {
    throw new ClaudeError(`gemini stream failed (init): ${e?.status || ''} ${e?.message || e}`.trim(), e);
  }

  try {
    for await (const chunk of result.stream) {
      if (signal?.aborted) {
        throw new ClaudeError('gemini stream aborted by client');
      }
      const text = typeof chunk.text === 'function' ? chunk.text() : chunk.text;
      if (typeof text === 'string' && text.length > 0) {
        if (firstTokenAt === null) firstTokenAt = Date.now();
        yield text;
      }
    }
  } catch (e) {
    if (e instanceof ClaudeError) throw e;
    throw new ClaudeError(`gemini stream failed (mid-stream): ${e?.message || e}`, e);
  }

  if (ctx) {
    // Codex r1 P3: stamp the decoding settings BEFORE the best-effort
    // usage telemetry. If `result.response` or `usageMetadata` throws, the
    // answer has already streamed successfully — we still want the final
    // payload to carry provider/model/temperature so the eval drift gate
    // doesn't false-positive on a transient metadata failure. The model
    // field falls back to GEMINI_MODEL (the configured constant); the try
    // block below may refine it to finalResp.modelVersion.
    ctx.provider    = 'gemini';
    ctx.model       = GEMINI_MODEL;
    ctx.temperature = temperature;
    try {
      const finalResp = await result.response;
      const meta = finalResp?.usageMetadata || {};
      // Codex P1 #5: Google's promptTokenCount INCLUDES cached content, and
      // Gemini 2.5 bills thoughtsTokenCount as part of output. Without these
      // adjustments, cost is double-counted on the input side and undercounted
      // on the output side.
      const promptTotal = meta.promptTokenCount        ?? 0;
      const cacheRead   = meta.cachedContentTokenCount ?? 0;
      const candidates  = meta.candidatesTokenCount    ?? 0;
      const thoughts    = meta.thoughtsTokenCount      ?? 0;
      ctx.usage = {
        input_tokens:                Math.max(0, promptTotal - cacheRead),
        output_tokens:               candidates + thoughts,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens:     cacheRead,
      };
      if (finalResp?.modelVersion) ctx.model = finalResp.modelVersion;
      ctx.ttft_ms     = firstTokenAt ? firstTokenAt - t0 : null;
      ctx.total_ms    = Date.now() - t0;
    } catch {
      // telemetry failure must never abort the stream from the caller's view
    }
  }
}

/**
 * Stream from OpenAI (default model GPT-5.4 Mini), yielding text chunks.
 * Mirrors callClaudeStream + geminiStream signature exactly.
 *
 * Uses chat.completions.create with stream:true. Usage metadata arrives in
 * the FINAL chunk only when stream_options.include_usage is true. Anthropic-
 * shaped ctx.usage so computeCostUSD works through one code path.
 */
export async function* openaiStream(
  systemPrompt,
  schoolFacts,
  userMessage,
  retryReminder = '',
  ctx = {},
  signal = null,
  llmOpts = {},
) {
  const t0 = Date.now();
  let firstTokenAt = null;

  // See geminiStream for the temperature-pin rationale.
  const temperature = typeof llmOpts.temperature === 'number' ? llmOpts.temperature : 1;

  // OpenAI uses a `messages` array. We concat schoolFacts into the system
  // message so the per-school context is treated as part of the system role
  // (eligible for prompt caching with the longer-prefix rule). Same shape
  // as the Gemini systemInstruction concat.
  const systemContent = schoolFacts ? `${systemPrompt}\n\n${schoolFacts}` : systemPrompt;
  const messages = [
    { role: 'system', content: systemContent },
    { role: 'user',   content: userMessage + (retryReminder || '') },
  ];

  let stream;
  try {
    const client = getOpenAIClient();
    stream = await client.chat.completions.create(
      {
        model: OPENAI_MODEL,
        messages,
        max_completion_tokens: 4096,
        temperature,
        stream: true,
        // Required to get usage in the final chunk; otherwise it's null
        // and we can't compute cost.
        stream_options: { include_usage: true },
      },
      signal ? { signal } : undefined,
    );
  } catch (e) {
    throw new ClaudeError(`openai stream failed (init): ${e?.status || ''} ${e?.message || e}`.trim(), e);
  }

  let usageCaptured = null;
  let modelCaptured = null;

  try {
    for await (const chunk of stream) {
      if (signal?.aborted) {
        throw new ClaudeError('openai stream aborted by client');
      }
      // OpenAI streams usage only on the FINAL chunk (when include_usage),
      // alongside an empty choices array. Capture both shapes defensively.
      if (chunk?.usage) usageCaptured = chunk.usage;
      if (chunk?.model) modelCaptured = chunk.model;

      const delta = chunk?.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta.length > 0) {
        if (firstTokenAt === null) firstTokenAt = Date.now();
        yield delta;
      }
    }
  } catch (e) {
    if (e instanceof ClaudeError) throw e;
    throw new ClaudeError(`openai stream failed (mid-stream): ${e?.message || e}`, e);
  }

  if (ctx) {
    // Codex r1 P3: stamp decoding settings before best-effort usage telemetry.
    // See geminiStream for the rationale — same pattern. `modelCaptured` is
    // populated inside the streaming loop above, so it's already set here if
    // the chunk loop yielded at least once.
    ctx.provider    = 'gpt';
    ctx.model       = modelCaptured || OPENAI_MODEL;
    ctx.temperature = temperature;
    try {
      const u = usageCaptured || {};
      // OpenAI's prompt_tokens INCLUDES cached tokens (they're a sub-line
      // item). Same fix as Gemini: subtract cached from input so we don't
      // double-bill.
      const promptTotal = u.prompt_tokens     ?? u.input_tokens  ?? 0;
      const completion  = u.completion_tokens ?? u.output_tokens ?? 0;
      const cacheRead   = u.prompt_tokens_details?.cached_tokens
                       ?? u.input_tokens_details?.cached_tokens
                       ?? 0;
      // Codex P1: OpenAI's `completion_tokens` ALREADY includes reasoning
      // tokens for billing — `completion_tokens_details.reasoning_tokens`
      // is a breakdown of the same total, not an addition. Adding both
      // double-bills output. (Different from Gemini, where thoughts and
      // candidates are separate counts.)
      ctx.usage = {
        input_tokens:                Math.max(0, promptTotal - cacheRead),
        output_tokens:               completion,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens:     cacheRead,
      };
      ctx.ttft_ms     = firstTokenAt ? firstTokenAt - t0 : null;
      ctx.total_ms    = Date.now() - t0;
    } catch {
      // telemetry failure must never abort the stream from the caller's view
    }
  }
}

/**
 * Wrap a stream generator with a TTFT timeout + bounded retry.
 *
 * Why TTFT-only timeout: a streaming response can legitimately take 30+ s
 * end-to-end. What we want to detect is "the model never started" — that's
 * the dead-stream / overload condition retry actually helps. Once tokens
 * start flowing, the inner generator owns its lifecycle.
 *
 * Why yielded-tracking gates retry: replaying a generator after partial
 * output would either double-stream or lose context. Cheaper to fail
 * forward and let the user re-ask.
 *
 *   for await (const chunk of runWithLlmPolicy(
 *     { timeoutMs: 30_000, maxRetries: 2 },
 *     () => geminiStream(...args),
 *   )) { ... }
 */
export async function* runWithLlmPolicy(opts, generatorFactory) {
  const {
    timeoutMs       = 30_000,
    maxRetries      = 2,
    retryableErrors = ['timeout', '429', '500', '502', '503', '504', 'ECONNRESET', 'ETIMEDOUT', 'fetch failed'],
  } = opts || {};

  let attempt = 0;
  let lastErr = null;

  while (attempt <= maxRetries) {
    let yielded = false;
    let gen = null;
    try {
      gen = generatorFactory();

      // TTFT race — only the FIRST .next() is timeout-bound.
      const firstP   = gen.next();
      let timer;
      const timeoutP = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`llm TTFT timeout after ${timeoutMs}ms`)), timeoutMs);
      });
      let first;
      try {
        first = await Promise.race([firstP, timeoutP]);
      } finally {
        clearTimeout(timer);
      }

      if (first.done) return;
      yielded = true;
      yield first.value;

      // Past the gate — trust the rest of the stream's pacing.
      while (true) {
        const next = await gen.next();
        if (next.done) return;
        yield next.value;
      }
    } catch (e) {
      lastErr = e;
      // Once we've yielded, we can't retry — the consumer has partial output.
      if (yielded) throw e;
      const retryable = isRetryable(e, retryableErrors);
      if (!retryable || attempt === maxRetries) throw e;
      attempt++;
      // Exponential backoff: 250ms, 500ms, 1s
      await new Promise(r => setTimeout(r, 250 * Math.pow(2, attempt - 1)));
    } finally {
      // Codex P2 #3: race the cleanup so a still-pending gen.next() (e.g.
      // the TTFT timeout case) can't queue our gen.return() forever and
      // block subsequent retry attempts.
      if (gen && typeof gen.return === 'function') {
        try {
          await Promise.race([
            gen.return(),
            new Promise(r => setTimeout(r, 500)),
          ]);
        } catch { /* ignored — we tried */ }
      }
    }
  }
  throw lastErr;
}

function isRetryable(err, list) {
  if (!err) return false;
  const msg    = (err.message || '').toLowerCase();
  const status = String(err.status ?? err.code ?? '');
  return list.some(s => {
    const lower = s.toLowerCase();
    return msg.includes(lower) || status.includes(s);
  });
}

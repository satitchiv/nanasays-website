/**
 * prose-runner.js
 *
 * Executes a deterministic IntentMatch from intent-router.js:
 *   1. Run all tools in the plan (parallel where allowed)
 *   2. Build a compact user-message with the tool results
 *   3. Call callClaudeStream with the prose system prompt
 *   4. Stream tokens natively to the consumer
 *   5. Parse the trailing <!-- nana-meta {...} --> comment, strip it from the
 *      visible markdown, and emit a `final` event matching the existing event
 *      shape from runOneQuestionStream / runAgenticQuestionStream
 *
 * Used by runIntentProseStream in nana-brain.js. Not called directly by the
 * route — the brain wrapper exists so prose-runner stays decoupled from
 * Claude transport details.
 *
 * Event shape:
 *   { type: 'answer_format', format: 'prose' }
 *   { type: 'tool_call', name, args, status: 'started' | 'completed', result_summary? }
 *   { type: 'token', text }
 *   { type: 'retrieval', payload }                  (compatibility — citations)
 *   { type: 'final', payload }
 *   { type: 'error', error, code }
 */

import { TOOLS } from './tools.js';
import { injectToolResult } from './tool-result-compact.js';
import { computeCostUSD } from './nana-brain.js';

// Compact prose system prompt. Targets ~2K chars vs the structured chat
// schema's ~17K. Smaller prompt = faster TTFT.
export const PROSE_SYSTEM_PROMPT = `You are Nana, a concise UK independent-schools adviser for parents.

Answer in plain markdown prose using ONLY the tool results provided. Never
invent figures, alumni, fixtures, fees or rankings. If the evidence is thin
or contradictory, say so plainly in one short sentence.

Style:
- Lead with the strongest concrete fact, name the school.
- Keep paragraphs short. Use bullets for top-N lists (numbered when ranked).
- Cite source URLs inline as markdown links: ([source](URL)). HARD RULES
  for citations:
  · A URL MUST start with "https://" or "http://" — anything else is not
    a URL.
  · School slugs like "reeds-school-uk" or "wellington-college" are NOT
    URLs. They appear in [brackets] in tool results as identifiers, not
    citation targets. Never use them as citation URLs.
  · Only use URL strings that appear verbatim in the tool results.
  · If you can't find a real https:// URL for a fact, state the fact
    without a citation. Never fabricate, never write
    "[source](slug-name)" or "[source](https://slug-like-thing)".
- Mention real tradeoffs honestly. If a parent asked a comparative question,
  give a clear judgement, not a list of "both are great."
- No headings, no JSON, no code fences, no schema language ("confidence",
  "watch out", "what we don't know"). Write like a human adviser.

Voice — sound like a trusted advisor, not a generic AI assistant:
- Specifics, never platitudes. "94% A*-A at A-level (2024)" not "strong
  academics". If you can't name a fact, that's a data gap, not a sentence.
- No throat-clearing: skip "I'd be happy to help", "Great question",
  "As an AI assistant", "Let me explain", "It's important to note".
- On uncertainty, name the gap + redirect: "[X] isn't in my dataset,
  but [Y] does show [fact]." Never just "I don't have that information."
- Hedge with reasons: "Pastoral ratings are strong because every house
  has a wellbeing officer" — not "it's worth noting that…".
- British understatement. No "amazing", "incredible", "wonderful",
  "outstanding" (unless quoting an ISI/Ofsted grade like "ISI Outstanding").
  UK indie school parents read effusive language as marketing voice.
- Name the fit when data supports it ("suits ambitious self-directed
  kids who thrive on competition") not just qualities. HARD GUARDRAIL:
  make a fit claim only when you can name the specific data point
  supporting it in the same sentence. Personality claims need pastoral
  or culture data, not just exam scores.

End your answer with EXACTLY ONE hidden metadata line on its own line:
<!-- nana-meta {"schools_mentioned":["slug-1","slug-2"],"citations":["https://..."]} -->

Use slugs and URLs that appeared in the tool results. Output nothing after
the comment line.`;

// ── Helpers ──────────────────────────────────────────────────────────────
// compactToolResult moved to scripts/lib/tool-result-compact.js so the agentic
// loop can share the same projection. The new shared compactor also recurses
// one level into nested objects so sports_profile renders all 5 sports
// instead of chopping after tennis.

function buildUserMessage(question, intentMatch, toolBlobs, parentContext, historyContext) {
  const ctxLines = [];
  if (parentContext)  ctxLines.push(parentContext);
  if (historyContext) ctxLines.push(historyContext);

  const toolBlock = toolBlobs.length
    ? toolBlobs.map(t =>
        `═══ TOOL [${t.name}] (${t.summary || ''}) ═══\n${t.compact}`
      ).join('\n\n')
    : '(no tool results)';

  return [
    ctxLines.length ? ctxLines.join('\n') + '\n' : '',
    `PARENT QUESTION: ${question}\n`,
    `Intent classified as: ${intentMatch.intent}.`,
    `\n${toolBlock}\n`,
    `Write the answer in markdown prose using the data above. Do not invent.`,
    `End with the <!-- nana-meta {...} --> line.`,
  ].join('\n');
}

// Find the LAST <!-- nana-meta {...} --> block. The "g" flag + matchAll lets us
// take the final one if a model accidentally emits more than one (e.g. "Here's
// the meta: <!-- ... -->") so we always extract the final structured tail.
const META_RE = /<!--\s*nana-meta\s+(\{[\s\S]*?\})\s*-->/gi;

export function extractMeta(rawText) {
  if (typeof rawText !== 'string') return { prose: '', meta: null };
  const matches = [...rawText.matchAll(META_RE)];
  if (matches.length === 0) return { prose: rawText.trim(), meta: null };
  // Use the LAST block's payload as the canonical meta — if the model echoed
  // the format earlier in prose, prefer the closing tail.
  const last = matches[matches.length - 1];
  let meta = null;
  try {
    meta = JSON.parse(last[1]);
  } catch (_) {
    // Strict JSON only — keep parser deterministic. Visible answer still renders.
  }
  // Strip ALL nana-meta blocks from the visible prose so earlier echoes don't
  // remain. Also collapse any trailing whitespace.
  const prose = rawText.replace(META_RE, '').replace(/[\s\n]+$/g, '').trim();
  return { prose, meta };
}

// ── The runner ───────────────────────────────────────────────────────────
/**
 * runProseFromIntent({ supabase, question, intentMatch, callClaude, opts })
 *
 * `callClaude` is callClaudeStream from nana-brain.js — passed as a dep so
 * this module stays free of Claude transport imports (mirrors how
 * agentic-loop.js takes callClaude as a dep).
 */
export async function* runProseFromIntent({ supabase, question, intentMatch, callClaude, opts = {} }) {
  const t0 = Date.now();
  const signal         = opts.signal || null;
  const parentContext  = opts.parentContext || null;
  const historyContext = opts.historyContext || null;

  yield { type: 'answer_format', format: 'prose' };

  // ── Run tools (parallel where the plan allows) ──
  const toolDefs = intentMatch?.plan?.tools || [];
  const parallel = intentMatch?.plan?.parallel === true;

  // Emit started events up front so the UI can render progress.
  for (const def of toolDefs) {
    yield { type: 'tool_call', name: def.name, args: def.args, status: 'started' };
  }

  const allCitations = new Set();
  const toolBlobs    = [];

  async function runOne(def) {
    if (!TOOLS[def.name]) {
      throw new Error(`unknown tool: ${def.name}`);
    }
    const r = await TOOLS[def.name](supabase, def.args);
    return { def, r };
  }

  // Use allSettled so a single tool failure (e.g. vector search timeout)
  // doesn't kill the answer when other tools succeeded. Only abort if the
  // ENTIRE batch fails — the model can still write something useful from
  // partial evidence.
  let settled;
  if (parallel) {
    settled = await Promise.allSettled(toolDefs.map(runOne));
  } else {
    settled = [];
    for (const def of toolDefs) {
      try { settled.push({ status: 'fulfilled', value: await runOne(def) }); }
      catch (e) { settled.push({ status: 'rejected', reason: e }); }
    }
  }
  if (signal?.aborted) return;

  let successCount = 0;
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    const def = toolDefs[i];
    if (s.status === 'fulfilled') {
      const { r } = s.value;
      yield {
        type: 'tool_call',
        name: def.name,
        args: def.args,
        status: 'completed',
        result_summary: r.summary,
      };
      // Compatibility flatten: tools.js now returns provenance objects
      // ({url, slug, tool, dimension}). Prose path keeps a flat Set<string>
      // of URLs until PA-0.5b-prose-followup adds the full provenance gate.
      for (const c of r.citations || []) {
        const url = (c && typeof c === 'object') ? c.url : c;
        if (url) allCitations.add(url);
      }
      toolBlobs.push({
        name:    def.name,
        summary: r.summary,
        compact: injectToolResult(def.name, r.result),
      });
      successCount++;
    } else {
      yield {
        type: 'tool_call',
        name: def.name,
        args: def.args,
        status: 'completed',
        result_summary: `(failed: ${s.reason?.message || 'unknown error'})`,
      };
    }
  }

  if (successCount === 0) {
    yield { type: 'error', error: 'prose runner: all tools failed', code: 'tool_error' };
    return;
  }

  // Compatibility retrieval event for downstream consumers (telemetry).
  yield {
    type: 'retrieval',
    payload: { schools: [], agentic: false, prose: true, citations: [...allCitations] },
  };

  // ── One Claude call to write the answer ──
  if (signal?.aborted) return;
  const userMessage = buildUserMessage(question, intentMatch, toolBlobs, parentContext, historyContext);

  const ctx = {};
  let raw = '';
  const claudeStart = Date.now();
  try {
    for await (const chunk of callClaude(PROSE_SYSTEM_PROMPT, null, userMessage, '', ctx, signal)) {
      raw += chunk;
      yield { type: 'token', text: chunk };
    }
  } catch (e) {
    if (signal?.aborted) return;
    yield { type: 'error', error: `prose runner: claude failed — ${e.message}`, code: 'claude_error' };
    return;
  }
  const claudeMs = Date.now() - claudeStart;

  if (signal?.aborted) return;

  // ── Strip the metadata comment, build final payload ──
  const { prose, meta } = extractMeta(raw);
  const schoolsMentioned = Array.isArray(meta?.schools_mentioned) ? meta.schools_mentioned : (intentMatch?.recommendedSchoolSlugs || []);
  const citations        = Array.isArray(meta?.citations)         ? meta.citations         : [...allCitations];

  yield {
    type: 'final',
    payload: {
      // `parsed` is what gets persisted to the DB and read by render code.
      // We pack prose answers as { format: 'prose_v1', prose, ... } so the
      // dual-render branch in DecisionHub can sniff and switch.
      parsed: {
        format:           'prose_v1',
        prose,
        schoolsMentioned,
        citations,
        intent:           intentMatch?.intent || null,
        uiIntentHint:     intentMatch?.uiIntent || 'none',
      },
      raw:               raw,                    // full original (with meta comment) for audit
      parseError:        null,
      validationIssues:  [],
      claudeMs,
      totalMs:           Date.now() - t0,
      attempt:           1,
      isProseRouter:     true,
      // Codex P2 #9a: surface the underlying provider when the route ran on
      // Gemini (or future adapters). 'router' is the orchestration label;
      // ctx.provider tells you which model bilateral did the work.
      backend:           ctx.provider || 'router',
      usage:             ctx.usage || null,
      model:             ctx.model || null,
      // Codex P2 #9b: prose-runner used to drop cost. Compute it from
      // ctx.usage so the most-used path doesn't underreport in dashboards.
      cost:              ctx.usage ? computeCostUSD(ctx.usage, ctx.model) : null,
      retrieval:         { chunkCount: 0, sensitiveCount: 0 },
      proseCitations:    [...allCitations],
      intentMatch:       { intent: intentMatch?.intent, confidence: intentMatch?.confidence },
    },
  };
}

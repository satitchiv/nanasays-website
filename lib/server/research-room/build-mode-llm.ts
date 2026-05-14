// Slice 8 Step 0.1 — OpenAI-only Build Mode helper.
//
// HARD-LOCK: zero Anthropic imports, zero nana-brain.js fallback path.
// This file is deliberately separate from lib/server/llm-adapter.js so
// audit-by-grep on this file's import block is sufficient to prove
// CLAUDE.md's hard-stop rule is honoured. Build Mode (and the deferred
// Build 5 verdict-narrative call) MUST NOT rely on env discipline.
//
// Streaming uses the OpenAI SDK's structured-output stream helper
// (`client.chat.completions.stream()` + `zodResponseFormat()`). The
// SDK delivers a `parsed` snapshot on each `content.delta` event, so
// we forward only the NEW prose characters per tick to the UI.
//
// The extraction schema is provided by the caller (lib level) and uses
// `.nullable()` (NOT `.optional()`) — OpenAI strict structured outputs
// rejects `.optional()` fields. The HTTP route uses a parallel schema
// with `.optional()` for PATCH-style partial writes.

import 'server-only'
import OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
import { z, type ZodTypeAny } from 'zod'

let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (_client) return _client
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set — Build Mode requires OpenAI provider')
  }
  _client = new OpenAI({ apiKey })
  return _client
}

const BUILD_MODE_MODEL  = process.env.BUILD_MODE_MODEL || 'gpt-5.4-mini'
const MAX_COMPLETION_TK = Number(process.env.BUILD_MODE_MAX_TOKENS || 4096)
const PROSE_QUEUE_CAP   = 256  // bounded backpressure; overflow → abort + reject

export type BuildModeMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type BuildModeStreamOptions<TExtract extends ZodTypeAny> = {
  messages: BuildModeMessage[]
  extractionSchema: TExtract
  signal?: AbortSignal
}

export type BuildModeStreamResult<TExtract extends ZodTypeAny> = {
  prose: AsyncIterable<string>
  extraction: Promise<z.infer<TExtract>>
  meta: Promise<{
    model: string
    usage: { input_tokens: number; output_tokens: number }
    ttft_ms: number
    total_ms: number
  }>
}

export function streamBuildModeTurn<TExtract extends ZodTypeAny>(
  opts: BuildModeStreamOptions<TExtract>,
): BuildModeStreamResult<TExtract> {
  const client    = getClient()
  const startedAt = Date.now()
  let ttftMs            = 0
  let firstChunkSeen    = false
  let proseEmitted      = 0
  let queueOverflowed   = false

  const topSchema = z
    .object({
      prose:      z.string(),
      extraction: opts.extractionSchema,
    })
    .strict()

  const stream = client.chat.completions.stream({
    model:                  BUILD_MODE_MODEL,
    messages:               opts.messages,
    response_format:        zodResponseFormat(topSchema, 'build_mode_turn'),
    max_completion_tokens:  MAX_COMPLETION_TK,
  }, { signal: opts.signal })

  const proseQueue: string[] = []
  let proseResolveNext: ((value: IteratorResult<string>) => void) | null = null
  let proseDone           = false
  let proseError: unknown = null

  function pushProse(delta: string) {
    if (proseResolveNext) {
      const resolve = proseResolveNext
      proseResolveNext = null
      resolve({ value: delta, done: false })
      return
    }
    if (proseQueue.length >= PROSE_QUEUE_CAP) {
      queueOverflowed = true
      proseError = new Error(`Build Mode prose queue overflowed at ${PROSE_QUEUE_CAP} chunks — consumer too slow`)
      try { stream.abort() } catch { /* noop */ }
      closeProse()
      return
    }
    proseQueue.push(delta)
  }

  function closeProse() {
    proseDone = true
    if (proseResolveNext) {
      const resolve = proseResolveNext
      proseResolveNext = null
      resolve({ value: undefined as unknown as string, done: true })
    }
  }

  const prose: AsyncIterable<string> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<string>> {
          if (proseQueue.length > 0) {
            return Promise.resolve({ value: proseQueue.shift()!, done: false })
          }
          if (proseDone) {
            return Promise.resolve({ value: undefined as unknown as string, done: true })
          }
          return new Promise(resolve => { proseResolveNext = resolve })
        },
      }
    },
  }

  let extractionResolve!: (v: z.infer<TExtract>) => void
  let extractionReject!:  (e: unknown) => void
  const extractionPromise = new Promise<z.infer<TExtract>>((res, rej) => {
    extractionResolve = res
    extractionReject  = rej
  })

  type MetaShape = {
    model:    string
    usage:    { input_tokens: number; output_tokens: number }
    ttft_ms:  number
    total_ms: number
  }
  let metaResolve!: (v: MetaShape) => void
  let metaReject!:  (e: unknown) => void
  const metaPromise = new Promise<MetaShape>((res, rej) => {
    metaResolve = res
    metaReject  = rej
  })

  // SDK's ContentDeltaEvent shape (ChatCompletionStream.ts:36) declares
  // `parsed: unknown | null` since structured-output schemas are caller-
  // supplied. We narrow to our top-schema shape at access time.
  stream.on('content.delta', evt => {
    if (!firstChunkSeen) {
      ttftMs = Date.now() - startedAt
      firstChunkSeen = true
    }
    const parsed   = evt.parsed as { prose?: string } | null
    const nextProse = parsed?.prose ?? ''
    if (nextProse.length > proseEmitted) {
      const delta   = nextProse.slice(proseEmitted)
      proseEmitted  = nextProse.length
      pushProse(delta)
    }
  })

  stream.finalChatCompletion()
    .then(final => {
      try {
        if (queueOverflowed) {
          extractionReject(proseError)
          metaReject(proseError)
          return
        }
        const parsed = final.choices[0]?.message?.parsed as
          { prose: string; extraction: z.infer<TExtract> } | null
        if (!parsed) throw new Error('Build Mode: no parsed payload on final completion')
        if (parsed.prose.length > proseEmitted) {
          pushProse(parsed.prose.slice(proseEmitted))
          proseEmitted = parsed.prose.length
        }
        extractionResolve(parsed.extraction)
        metaResolve({
          model:    BUILD_MODE_MODEL,
          usage:    {
            input_tokens:  final.usage?.prompt_tokens     ?? 0,
            output_tokens: final.usage?.completion_tokens ?? 0,
          },
          ttft_ms:  ttftMs,
          total_ms: Date.now() - startedAt,
        })
      } catch (e) {
        extractionReject(e)
        metaReject(e)
      } finally {
        closeProse()
      }
    })
    .catch(err => {
      extractionReject(err)
      metaReject(err)
      closeProse()
    })

  return { prose, extraction: extractionPromise, meta: metaPromise }
}

export async function runBuildModeOneShot<TExtract extends ZodTypeAny>(opts: {
  messages: BuildModeMessage[]
  extractionSchema: TExtract
  signal?: AbortSignal
}): Promise<{ prose: string; extraction: z.infer<TExtract> }> {
  const client = getClient()

  const topSchema = z
    .object({
      prose:      z.string(),
      extraction: opts.extractionSchema,
    })
    .strict()

  const response = await client.chat.completions.parse({
    model:                  BUILD_MODE_MODEL,
    messages:               opts.messages,
    response_format:        zodResponseFormat(topSchema, 'build_mode_oneshot'),
    max_completion_tokens:  MAX_COMPLETION_TK,
  }, { signal: opts.signal })

  const parsed = response.choices[0]?.message?.parsed as
    { prose: string; extraction: z.infer<TExtract> } | null
  if (!parsed) {
    throw new Error('Build Mode oneshot: no parsed payload returned')
  }
  return parsed
}

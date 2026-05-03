/**
 * embed.js
 * Google text-embedding-004 wrapper with batch support.
 * Free tier: 1,500 RPM — we batch 100 texts per call, well within limits.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBED_MODEL    = 'gemini-embedding-001';
const OUTPUT_DIMS    = 768; // Matryoshka truncation — keeps schema at vector(768)
const BATCH_SIZE     = 50;
const BATCH_DELAY_MS = 2000; // 2s between batches to avoid rate limits

/**
 * embedBatch(texts, taskType)
 * texts: string[]  (max 100 per call)
 * taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'
 * Returns: number[][] (one 768-dim array per text)
 */
export async function embedBatch(texts, taskType = 'RETRIEVAL_DOCUMENT') {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');
  if (texts.length === 0) return [];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${GEMINI_API_KEY}`;

  const requests = texts.map(text => ({
    model:               `models/${EMBED_MODEL}`,
    content:             { parts: [{ text: text.slice(0, 8000) }] }, // safety truncate
    taskType,
    outputDimensionality: OUTPUT_DIMS,
  }));

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ requests }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding API error ${res.status}: ${err}`);
  }

  const data = await res.json();

  try {
    const { logUsageChars } = await import('./usage-log.js');
    const totalChars = texts.reduce((s, t) => s + Math.min(t.length, 8000), 0);
    logUsageChars({
      provider: 'gemini',
      model:    EMBED_MODEL,
      label:    `embed:${taskType.toLowerCase()}`,
      chars:    totalChars,
    });
  } catch { /* swallow */ }

  return data.embeddings.map(e => e.values);
}

/**
 * embedQuery(text)
 * Embed a single question for retrieval.
 * Returns: number[] (768-dim)
 */
export async function embedQuery(text) {
  const results = await embedBatch([text], 'RETRIEVAL_QUERY');
  return results[0];
}

/**
 * embedAll(texts, taskType, onProgress)
 * Handles any number of texts, batching automatically with rate limiting.
 * onProgress(done, total) called after each batch.
 * Returns: number[][] in same order as input
 */
export async function embedAll(texts, taskType = 'RETRIEVAL_DOCUMENT', onProgress = null) {
  const results = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch     = texts.slice(i, i + BATCH_SIZE);
    const embeddings = await embedBatch(batch, taskType);
    results.push(...embeddings);
    if (onProgress) onProgress(Math.min(i + BATCH_SIZE, texts.length), texts.length);
    if (i + BATCH_SIZE < texts.length) await sleep(BATCH_DELAY_MS);
  }
  return results;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

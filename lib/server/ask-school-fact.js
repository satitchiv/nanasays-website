/**
 * ask-school-fact.js
 * Ask Claude a direct fact question about a school with web search.
 * Returns a string answer, or null if unknown. Supports structured JSON
 * return via the `schema` option.
 */

import { execSync } from 'child_process';

const CLAUDE_BIN = '/opt/homebrew/bin/claude';

export async function askSchoolFact(schoolName, question, options = {}) {
  const { timeoutMs = 90_000, schema = null } = options;
  if (!schoolName || !question) return null;

  const schemaClause = schema
    ? `\n\nReturn your answer as strict JSON matching this schema — no markdown, no code fences, just the JSON:\n${schema}\n\nIf no reliable answer: return ${schema.includes('[') ? '[]' : '{}'}.`
    : `\n\nReturn ONLY the answer on a single line — no explanation, no "The answer is...". If you cannot find a reliable answer, return exactly "unknown".`;

  const prompt = `Search the web to answer this question about ${schoolName}: ${question}${schemaClause}`;

  try {
    const out = execSync(
      `${CLAUDE_BIN} --model claude-haiku-4-5-20251001 --allowedTools WebSearch -p -`,
      {
        input: prompt,
        maxBuffer: 1 * 1024 * 1024,
        timeout: timeoutMs,
        encoding: 'utf8',
        env: { ...process.env, HOME: process.env.HOME || '/Users/moodygarlic' },
      }
    ).trim();
    if (!out || /^unknown$/i.test(out)) return null;
    if (schema) {
      // Strip accidental markdown fences and return parsed JSON
      const clean = out.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
      try { return JSON.parse(clean); } catch { return null; }
    }
    return out;
  } catch (e) {
    console.warn(`  [ask-school-fact] Claude CLI error: ${e.message}`);
    return null;
  }
}

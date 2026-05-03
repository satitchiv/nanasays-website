/**
 * find-sport-url.js
 * Finds a school's sports fixtures page via Claude CLI web search.
 *
 * Replaces the old pattern-probe flow (Strategy A/B/C with singular/plural
 * guessing, subdomain probing, etc.) with a single Claude call that
 * searches the web the same way a parent would.
 *
 * Flow:
 *   1. Ask Claude to search for "{school} sports fixtures" and return a URL
 *   2. Retry with a second prompt if first returns nothing
 *   3. If the URL looks like SOCS, extract host + id
 *   4. Otherwise return the raw URL (non-SOCS fallback for sitemap mining)
 */

import { execSync } from 'child_process';

const CLAUDE_BIN = '/opt/homebrew/bin/claude';

function extractUrl(claudeOutput) {
  if (!claudeOutput) return null;
  const trimmed = claudeOutput.trim();
  if (/^none$/i.test(trimmed)) return null;
  // Grab the first http(s) URL in the response
  const m = trimmed.match(/https?:\/\/[^\s"'<>]+/);
  return m ? m[0] : null;
}

// Is this URL a SOCS-hosted fixtures page?
export function isSocsUrl(url) {
  if (!url) return false;
  return /\.asp(\?|$)/i.test(url) &&
         /fixtures_teams|calendar|competitions|news_reports|opponentmaps|default/i.test(url);
}

// Extract host + id from a SOCS URL. For URLs without ?Id=N, returns
// { host, id: null } — caller should use verifySocsHost to resolve the id.
export function parseSocsUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const idMatch = url.match(/[?&](?:Id|id|ID)=(\d+)/);
    return { host, id: idMatch ? parseInt(idMatch[1], 10) : null };
  } catch {
    return null;
  }
}

async function askClaude(prompt, timeoutMs = 60_000) {
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
    );
    return extractUrl(out);
  } catch (e) {
    console.warn(`  [find-sport-url] Claude CLI error: ${e.message}`);
    return null;
  }
}

/**
 * Find a school's sports fixtures URL via web search. Returns:
 *   { url, host, id, isSocs }   on success
 *   null                         if nothing found
 */
export async function findSportUrl(schoolName) {
  if (!schoolName) return null;

  // Attempt 1 — SOCS-first prompt. Strongly prefer the SOCS URL if any
  // variant exists because it has the richest per-team data. Many UK
  // schools use SOCS but host it on a custom vanity domain.
  const prompt1 =
    `Search the web for "${schoolName} sports fixtures".\n\n` +
    `UK private schools usually host their sports fixtures on a platform called SOCS. SOCS URLs always contain "Fixtures_Teams.asp" and look like:\n` +
    `  - https://{school}sport.co.uk/Fixtures_Teams.asp?Id=N\n` +
    `  - https://{school}sports.co.uk/Fixtures_Teams.asp?Id=N\n` +
    `  - https://sport.{school}.sch.uk/Fixtures_Teams.asp?Id=N\n` +
    `  - https://sports.{school}.com/Fixtures_Teams.asp?Id=N\n\n` +
    `Find the SOCS URL for ${schoolName} if it exists — it is usually a top-3 Google result for the search above. ` +
    `Return ONLY the SOCS URL on a single line (nothing else). ` +
    `If no SOCS URL exists, return the most canonical fixtures page URL you can find on the school's own site. ` +
    `If neither exists, return exactly "none".`;

  let url = await askClaude(prompt1);

  // Attempt 2 — only if Attempt 1 returned a non-SOCS URL, and only if
  // Claude clearly didn't search for SOCS. Ask again more narrowly.
  if (!url || (url && !isSocsUrl(url))) {
    const prompt2 =
      `Search the web for "${schoolName}" AND "Fixtures_Teams.asp" — i.e. the SOCS platform URL signature. ` +
      `Return a URL that contains "Fixtures_Teams.asp" if one exists (the host may be like ${schoolName.toLowerCase().replace(/ /g,'')}sport.co.uk or sports.${schoolName.toLowerCase().replace(/ /g,'')}.com). ` +
      `Return ONLY the URL on one line. If no SOCS URL for ${schoolName} exists anywhere on the web, return "none".`;
    const socsUrl = await askClaude(prompt2);
    if (socsUrl && isSocsUrl(socsUrl)) url = socsUrl;
  }

  if (!url) return null;

  const socs = isSocsUrl(url);
  const parsed = socs ? parseSocsUrl(url) : null;
  return {
    url,
    host: parsed?.host || null,
    id: parsed?.id || null,
    isSocs: socs,
  };
}

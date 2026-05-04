/**
 * build-runs.js — audit-log helpers for scripts/build-school.js.
 *
 * Records every build invocation + per-step outcome to two Supabase tables:
 *   - build_runs       (one row per invocation: when, who, status, duration)
 *   - build_run_steps  (one row per sub-step: name, status, error, model used, cost)
 *
 * Plan: ~/.claude/plans/build-runs.md  (3 Codex review passes, approved)
 *
 * Design contract:
 *   1. Helpers NEVER throw. A Supabase outage must not break the build.
 *      Every Supabase call is wrapped with a 10s timeout so a hung connection
 *      cannot block the build forever.
 *   2. Helpers explicitly inspect `{ error }` returned by supabase-js (errors
 *      often arrive as result.error without throwing).
 *   3. startBuildRun + finishBuildRun retry once with 250ms backoff (covers
 *      BOTH the build_runs row update AND the two schools RPC calls).
 *      markStep does not retry — failure is logged once and the build continues.
 *      Callers DO await markStep — it returns once both internal writes are
 *      done (or have failed). The "fire-and-forget" descriptor refers to
 *      retry-policy, not awaiting.
 *   4. dryRun: true → all helpers no-op (preserves --dry-run "no writes" promise).
 *   5. Status vocabulary: CLI's 'ok' maps to STEP_STATUS.COMPLETED at the
 *      boundary (mapStepStatus). 'success' is run-level only. No synonyms.
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Status constants — single source of truth ──────────────────────────────
export const RUN_STATUS = Object.freeze({
  RUNNING:   'running',
  SUCCESS:   'success',     // reached end, no failed steps
  PARTIAL:   'partial',     // reached end, ≥1 nonfatal failure
  FAILED:    'failed',      // orchestrator fatal before completion
  ABANDONED: 'abandoned',   // signal/sweeper/killed
});

export const STEP_STATUS = Object.freeze({
  COMPLETED: 'completed',
  SKIPPED:   'skipped',
  FAILED:    'failed',
  DRY_RUN:   'dry-run',
});

// ─── Module state ───────────────────────────────────────────────────────────
let supabase = null;
export function setSupabase(client) { supabase = client; }

// ─── Environment metadata helpers ───────────────────────────────────────────
function safeGitSha() {
  try {
    return execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
  } catch { return null; }
}

function safeScriptVersion() {
  try {
    const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
    return pkg.version || null;
  } catch { return null; }
}

// ─── Timeout wrapper — prevents a hung Supabase call from blocking the build ──
// Note: this does NOT cancel the underlying Supabase request; it just
// rejects the promise we await. The setTimeout is cleared in finally{} so
// pending timers don't keep Node.js alive after the last audit write.
const SUPABASE_TIMEOUT_MS = 10_000;

function withTimeout(promise, timeoutMs = SUPABASE_TIMEOUT_MS) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`audit-write timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

// ─── Retry wrapper for start/finish ─────────────────────────────────────────
async function withRetry(fn, label) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    let result;
    try {
      result = await withTimeout(fn());
    } catch (e) {
      console.warn(`[audit] ${label} attempt ${attempt} threw: ${e?.message || e}`);
      if (attempt === 1) await new Promise(r => setTimeout(r, 250));
      continue;
    }
    if (result?.error) {
      console.warn(`[audit] ${label} attempt ${attempt} returned error: ${result.error.message}`);
      if (attempt === 1) await new Promise(r => setTimeout(r, 250));
      continue;
    }
    return result;
  }
  return null;  // both attempts exhausted
}

// ─── startBuildRun ──────────────────────────────────────────────────────────
export async function startBuildRun(slug, opts = {}) {
  const { mode, trigger, triggeredBy, dryRun } = opts;
  if (!supabase || dryRun) return null;  // dry-run skips audit entirely

  const result = await withRetry(
    () => supabase.from('build_runs').insert({
      school_slug:    slug,
      mode:           mode || 'full',
      trigger:        trigger || 'cli',
      triggered_by:   triggeredBy || os.userInfo().username,
      host:           os.hostname(),
      pid:            process.pid,
      git_sha:        safeGitSha(),
      node_version:   process.version,
      script_version: safeScriptVersion(),
    }).select('id').single(),
    'startBuildRun'
  );
  return result?.data?.id ?? null;
}

// ─── markStep (no retry; both writes run in parallel with timeouts) ─────────
export async function markStep(runId, stepName, outcome, extras = {}) {
  if (!supabase || !runId) return;

  const finishedAtIso = new Date().toISOString();
  const startedAt = extras.startedAt || finishedAtIso;
  const durationMs = (typeof extras.durationMs === 'number') ? extras.durationMs : null;

  const heartbeatPromise = withTimeout(
    supabase.from('build_runs')
      .update({ last_heartbeat_at: finishedAtIso })
      .eq('id', runId)
  ).catch(e => ({ error: { message: e?.message || String(e) } }));

  const insertPromise = withTimeout(
    supabase.from('build_run_steps').insert({
      run_id:         runId,
      school_slug:    extras.slug,
      step_name:      stepName,
      step_index:     extras.stepIndex,
      status:         outcome,
      started_at:     startedAt,
      finished_at:    finishedAtIso,
      duration_ms:    durationMs,
      detail:         extras.detail,
      skip_reason:    outcome === STEP_STATUS.SKIPPED ? extras.detail : null,
      error_message:  extras.errorMessage,
      error_code:     extras.errorCode,
      error_json:     extras.errorJson,
      model_provider: extras.modelProvider,
      model_name:     extras.modelName,
      model_config:   extras.modelConfig,
      tokens_input:   extras.tokensInput,
      tokens_output:  extras.tokensOutput,
      cost_usd:       extras.costUsd,
    })
  ).catch(e => ({ error: { message: e?.message || String(e) } }));

  // allSettled — one failing must not affect the other
  const [hb, ins] = await Promise.allSettled([heartbeatPromise, insertPromise]);
  if (hb.value?.error)  console.warn(`[audit] heartbeat(${stepName}): ${hb.value.error.message}`);
  if (ins.value?.error) console.warn(`[audit] markStep(${stepName}): ${ins.value.error.message}`);
}

// ─── finishBuildRun ─────────────────────────────────────────────────────────
export async function finishBuildRun(runId, opts = {}) {
  const { schoolSlug, status, durationMs, errorMessage, errorJson } = opts;
  if (!supabase || !runId) return;

  const finishedAtIso = new Date().toISOString();

  // 1. Update build_runs row (with retry)
  await withRetry(
    () => supabase.from('build_runs').update({
      status,
      finished_at:   finishedAtIso,
      duration_ms:   durationMs,
      error_message: errorMessage,
      error_json:    errorJson,
    }).eq('id', runId),
    'finishBuildRun.updateRow'
  );

  // 2. Conditional updates to schools (race-safe via SQL function WHERE clause)
  // Codex round-3 #3: these denormalizations also retry once, matching the
  // documented contract that finishBuildRun retries.
  if (!schoolSlug) {
    console.warn('[audit] finishBuildRun called without schoolSlug — schools row not denormalized');
    return;
  }

  await withRetry(
    () => supabase.rpc('update_school_last_build_at', {
      p_slug:        schoolSlug,
      p_finished_at: finishedAtIso,
      p_status:      status,
    }),
    'finishBuildRun.updateLastBuildAt'
  );

  if (status === RUN_STATUS.SUCCESS) {
    await withRetry(
      () => supabase.rpc('update_school_last_successful_build_at', {
        p_slug:        schoolSlug,
        p_finished_at: finishedAtIso,
      }),
      'finishBuildRun.updateLastSuccessfulBuildAt'
    );
  }
}

// ─── Status mapping ─────────────────────────────────────────────────────────
// runStep() in build-school.js pushes results with status in
// {'ok','skipped','failed','dry-run'}. Map 'ok' → STEP_STATUS.COMPLETED
// at the boundary. Never store 'ok' in the DB.
export function mapStepStatus(cliStatus) {
  return ({
    ok:        STEP_STATUS.COMPLETED,
    skipped:   STEP_STATUS.SKIPPED,
    failed:    STEP_STATUS.FAILED,
    'dry-run': STEP_STATUS.DRY_RUN,
  })[cliStatus] || STEP_STATUS.COMPLETED;
}

// ─── Run-level status from per-step results ─────────────────────────────────
// Pure function — easy to test without Supabase.
export function deriveRunStatus(results) {
  const anyFailed = results.some(r => r.status === 'failed');
  const allOk     = results.every(r =>
    r.status === 'ok' || r.status === 'skipped' || r.status === 'dry-run'
  );
  if (!anyFailed) return RUN_STATUS.SUCCESS;
  if (allOk)      return RUN_STATUS.SUCCESS;
  return RUN_STATUS.PARTIAL;  // mix of failures and successes; orchestrator reached the end
}

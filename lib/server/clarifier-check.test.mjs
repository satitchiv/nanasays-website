/**
 * clarifier-check.test.mjs (sketch v3)
 *
 * Run:  node --test clarifier-check.test.mjs
 *
 * v3 changes from v2:
 *   - Strip-and-recheck regression tests for "junk + shorthand" mixes
 *   - KEYBOARD_RUN_MIN=4 caught-mash tests (asdf, qwer, zxcv)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  needsClarification,
  buildClarifierFinalPayload,
  _internals,
} from './clarifier-check.js';

const { reasonForJunk, runStage2, CLARIFY_MESSAGE } = _internals;

function withFlag(name, value, fn) {
  return async () => {
    const prev = process.env[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
    try {
      await fn();
    } finally {
      if (prev === undefined) delete process.env[name];
      else process.env[name] = prev;
    }
  };
}

function makeMockClient(responseObj, { throwError = null, delayMs = 0 } = {}) {
  return {
    chat: {
      completions: {
        create: async (_payload, _opts) => {
          if (delayMs) await new Promise(r => setTimeout(r, delayMs));
          if (throwError) throw throwError;
          return {
            choices: [
              { message: { content: typeof responseObj === 'string' ? responseObj : JSON.stringify(responseObj) } },
            ],
          };
        },
      },
    },
  };
}

// ─── Stage 1: hard-junk detection ──────────────────────────────────────────

test('reasonForJunk: empty / whitespace', () => {
  assert.equal(reasonForJunk(''),       'too_short');
  assert.equal(reasonForJunk('   '),    'too_short');
  assert.equal(reasonForJunk(null),     'too_short');
  assert.equal(reasonForJunk(undefined),'too_short');
});

test('reasonForJunk: punctuation-only / no letters', () => {
  assert.equal(reasonForJunk('???'),     'no_letters');
  assert.equal(reasonForJunk('!!!'),     'no_letters');
  assert.equal(reasonForJunk('...'),     'no_letters');
  assert.equal(reasonForJunk('123 456'), 'no_letters');
});

test('reasonForJunk: low-alpha-ratio (mostly digits/symbols)', () => {
  assert.equal(reasonForJunk('1234567a'), 'low_alpha_ratio');
  assert.equal(reasonForJunk('@@@b@@@@'), 'low_alpha_ratio');
});

test('reasonForJunk: repeated single character', () => {
  assert.equal(reasonForJunk('aaaaaaaa'), 'repeated_chars');
  assert.equal(reasonForJunk('xxxxx ?'), 'repeated_chars');
  assert.equal(reasonForJunk('zzzz'),     'repeated_chars');
});

test('reasonForJunk: keyboard mash (v3: KEYBOARD_RUN_MIN=4 catches asdf/qwer)', () => {
  assert.equal(reasonForJunk('asdfghjkl'),     'keyboard_mash');
  assert.equal(reasonForJunk('asdfghjkl ???'), 'keyboard_mash');
  assert.equal(reasonForJunk('qwerty stuff'),  'keyboard_mash');
  assert.equal(reasonForJunk('zxcvbn'),        'keyboard_mash');
  assert.equal(reasonForJunk('lkjhgf'),        'keyboard_mash');
  assert.equal(reasonForJunk('ASDFGH'),        'keyboard_mash');
  // v3 — 4-char mashes now caught
  assert.equal(reasonForJunk('asdf'),          'keyboard_mash');
  assert.equal(reasonForJunk('qwer'),          'keyboard_mash');
  assert.equal(reasonForJunk('zxcv'),          'keyboard_mash');
});

test('reasonForJunk: real short questions ALLOWED', () => {
  assert.equal(reasonForJunk('fees?'),                    null);
  assert.equal(reasonForJunk('boarding?'),                null);
  assert.equal(reasonForJunk('IB?'),                      null);
  assert.equal(reasonForJunk('pastoral?'),                null);
  assert.equal(reasonForJunk('Eton fees?'),               null);
  assert.equal(reasonForJunk('Best CofE schools?'),       null);
  assert.equal(reasonForJunk('What are the boarding fees at Reed\'s?'), null);
  assert.equal(reasonForJunk('Is Harrow good for shy boys?'),          null);
  assert.equal(reasonForJunk('Compare Eton and Harrow on academics'),  null);
  assert.equal(reasonForJunk('Quelles sont les frais d\'Eton?'),       null);
});

test('reasonForJunk: legit short stubs still ALLOW at Stage 1', () => {
  assert.equal(reasonForJunk('schools'),         null);
  assert.equal(reasonForJunk('hello there'),     null);
  assert.equal(reasonForJunk('how about you?'),  null);
});

test('reasonForJunk: borderline real questions ALLOWED', () => {
  assert.equal(reasonForJunk('What is GCSE?'),    null);
  assert.equal(reasonForJunk('Sixth form?'),      null);
  assert.equal(reasonForJunk('11+ entry?'),       null);
});

// ─── UK SHORTHAND ALLOWLIST (v2 — Codex r1 P2 A2) ────────────────────────

test('reasonForJunk: UK entry-age shorthand ALLOWED (11+, 13+, 16+)', () => {
  assert.equal(reasonForJunk('11+?'),    null);
  assert.equal(reasonForJunk('13+'),     null);
  assert.equal(reasonForJunk('16+ ?'),   null);
  assert.equal(reasonForJunk('11 plus'), null);
  assert.equal(reasonForJunk('13 plus?'),null);
});

test('reasonForJunk: UK fee shorthand ALLOWED (£42k pa?)', () => {
  assert.equal(reasonForJunk('£42k pa?'),    null);
  assert.equal(reasonForJunk('£42k?'),       null);
  assert.equal(reasonForJunk('£14,200/term'),null);
  assert.equal(reasonForJunk('£20k pa'),     null);
});

test('reasonForJunk: UK common acronyms ALLOWED (GCSE A*, BTEC, IB)', () => {
  assert.equal(reasonForJunk('GCSE A*?'),       null);
  assert.equal(reasonForJunk('BTEC vs A-level'),null);
  assert.equal(reasonForJunk('What\'s IB?'),    null);
  assert.equal(reasonForJunk('Reed\'s?'),       null);
  assert.equal(reasonForJunk('Maths?'),         null);
});

// ─── STRIP-AND-RECHECK (v3 — Codex r2 P2) ───────────────────────────────

test('reasonForJunk v3: junk + shorthand mixes still CLARIFY', () => {
  // The v2 allowlist short-circuited on any allowlist match, masking junk.
  // v3 strips the allowlist tokens then re-runs heuristics on the residual.
  assert.equal(reasonForJunk('asdf 11+'),    'keyboard_mash', 'asdf is QWERTY mash even with 11+ tail');
  assert.equal(reasonForJunk('@@@@ GCSE'),   'no_letters',    'after stripping GCSE, only @@@@ remains');
  assert.equal(reasonForJunk('zzzz £42k'),   'repeated_chars','zzzz is repeated even with £42k tail');
  assert.equal(reasonForJunk('qwer £42k'),   'keyboard_mash', 'qwer is QWERTY mash even with £42k tail');
});

test('reasonForJunk v3: shorthand-only questions still ALLOW (residual empty)', () => {
  assert.equal(reasonForJunk('11+?'),     null);
  assert.equal(reasonForJunk('£42k pa?'), null);
  assert.equal(reasonForJunk('GCSE'),     null);
});

test('reasonForJunk v3: real questions with shorthand still ALLOW', () => {
  assert.equal(reasonForJunk('Eton 11+?'),                  null);
  assert.equal(reasonForJunk('What are Reed\'s 13+ fees?'), null);
  assert.equal(reasonForJunk('GCSE A*A pass rate?'),        null);
  assert.equal(reasonForJunk('£42k pa for boarding?'),      null);
});

// ─── Public API: master flag gating ────────────────────────────────────────

test('needsClarification: flag OFF → always allow', withFlag('NANA_CLARIFIER', undefined, async () => {
  const r1 = await needsClarification('asdfghjkl ???');
  assert.equal(r1.needsClarification, false);
  assert.equal(r1.stage, 'flag-off');
  assert.equal(r1.message, null);

  const r2 = await needsClarification('???');
  assert.equal(r2.needsClarification, false);
  assert.equal(r2.stage, 'flag-off');
}));

test('needsClarification: flag ON, Stage 1 catches keyboard mash', withFlag('NANA_CLARIFIER', 'on', async () => {
  const r = await needsClarification('asdfghjkl ???');
  assert.equal(r.needsClarification, true);
  assert.equal(r.stage, 'stage1');
  assert.equal(r.reason, 'keyboard_mash');
  assert.equal(r.message, CLARIFY_MESSAGE);
}));

test('needsClarification: flag ON, Stage 1 catches "asdf 11+" v3 strip-and-recheck', withFlag('NANA_CLARIFIER', 'on', async () => {
  const r = await needsClarification('asdf 11+');
  assert.equal(r.needsClarification, true);
  assert.equal(r.stage, 'stage1');
  assert.equal(r.reason, 'keyboard_mash');
}));

test('needsClarification: flag ON, Stage 1 catches punctuation-only', withFlag('NANA_CLARIFIER', 'on', async () => {
  const r = await needsClarification('???');
  assert.equal(r.needsClarification, true);
  assert.equal(r.stage, 'stage1');
  assert.equal(r.reason, 'no_letters');
}));

test('needsClarification: flag ON, real short question ALLOWED', withFlag('NANA_CLARIFIER', 'on', async () => {
  const r = await needsClarification('fees?');
  assert.equal(r.needsClarification, false);
  assert.equal(r.stage, 'allow');
}));

test('needsClarification: flag ON, UK entry-age shorthand ALLOWED', withFlag('NANA_CLARIFIER', 'on', async () => {
  const r = await needsClarification('11+?');
  assert.equal(r.needsClarification, false);
  assert.equal(r.stage, 'allow');
}));

test('needsClarification: flag ON, real long question ALLOWED', withFlag('NANA_CLARIFIER', 'on', async () => {
  const r = await needsClarification('What are the boarding fees at Reed\'s?');
  assert.equal(r.needsClarification, false);
  assert.equal(r.stage, 'allow');
}));

test('needsClarification: Stage 2 OFF by default even when master ON', withFlag('NANA_CLARIFIER', 'on', async () => {
  const prev = process.env.NANA_CLARIFIER_LLM;
  delete process.env.NANA_CLARIFIER_LLM;
  try {
    const r = await needsClarification('schools');
    assert.equal(r.needsClarification, false);
    assert.equal(r.stage, 'allow');
  } finally {
    if (prev === undefined) delete process.env.NANA_CLARIFIER_LLM;
    else process.env.NANA_CLARIFIER_LLM = prev;
  }
}));

// ─── History-aware continuation skip ─────────────────────────────────────

test('needsClarification: continuation stub WITH history → allow, skip Stage 2',
  withFlag('NANA_CLARIFIER', 'on', async () => {
    process.env.NANA_CLARIFIER_LLM = 'on';
    const explodingClient = {
      chat: { completions: { create: async () => { throw new Error('Stage 2 must not be called for continuation stubs with history'); } } },
    };
    try {
      for (const q of ['more?', 'details', 'tell me more', 'go on', 'why?', 'and?']) {
        const r = await needsClarification(q, {
          hasUsableHistory: true,
          _stage2ClientOverride: explodingClient,
        });
        assert.equal(r.needsClarification, false, `"${q}" should ALLOW with history`);
        assert.equal(r.reason, 'continuation_with_history');
        assert.equal(r.stage, 'allow');
      }
    } finally {
      delete process.env.NANA_CLARIFIER_LLM;
    }
  }));

test('needsClarification: continuation stub WITHOUT history → falls to Stage 2',
  withFlag('NANA_CLARIFIER', 'on', async () => {
    process.env.NANA_CLARIFIER_LLM = 'on';
    const client = makeMockClient({ answerable: false });
    try {
      const r = await needsClarification('more?', {
        hasUsableHistory: false,
        _stage2ClientOverride: client,
      });
      assert.equal(r.needsClarification, true);
      assert.equal(r.stage, 'stage2');
      assert.equal(r.reason, 'stage2_llm_unanswerable');
    } finally {
      delete process.env.NANA_CLARIFIER_LLM;
    }
  }));

// ─── Stage 2: mocked LLM ──────────────────────────────────────────────────

test('runStage2: returns needsClarification=true on {answerable:false}', async () => {
  const client = makeMockClient({ answerable: false });
  const r = await runStage2('schools', null, client);
  assert.equal(r.needsClarification, true);
  assert.equal(r.reason, 'stage2_llm_unanswerable');
});

test('runStage2: returns needsClarification=false on {answerable:true}', async () => {
  const client = makeMockClient({ answerable: true });
  const r = await runStage2('fees?', null, client);
  assert.equal(r.needsClarification, false);
  assert.equal(r.reason, null);
});

test('runStage2: malformed JSON fails OPEN', async () => {
  const client = makeMockClient('not json at all');
  const r = await runStage2('schools', null, client);
  assert.equal(r.needsClarification, false);
  assert.equal(r.reason, 'stage2_parse_error');
});

test('runStage2: missing answerable field fails OPEN', async () => {
  const client = makeMockClient({ verdict: 'unsure' });
  const r = await runStage2('schools', null, client);
  assert.equal(r.needsClarification, false);
  assert.equal(r.reason, 'stage2_no_field');
});

test('runStage2: thrown error fails OPEN', async () => {
  const err = new Error('OpenAI 5xx');
  err.code = 'ECONNRESET';
  const client = makeMockClient(null, { throwError: err });
  const r = await runStage2('schools', null, client);
  assert.equal(r.needsClarification, false);
  assert.match(r.reason, /^stage2_error:ECONNRESET$/);
});

test('runStage2: no client configured fails OPEN with stage2_no_client', async () => {
  const prev = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const r = await runStage2('schools', null, null);
    assert.equal(r.needsClarification, false);
  } finally {
    if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
  }
});

test('runStage2: respects external abort signal', async () => {
  const ac = new AbortController();
  ac.abort();
  const client = {
    chat: {
      completions: {
        create: async (_p, opts) => {
          if (opts?.signal?.aborted) {
            const err = new Error('aborted');
            err.name = 'AbortError';
            throw err;
          }
          return { choices: [{ message: { content: '{"answerable":true}' } }] };
        },
      },
    },
  };
  const r = await runStage2('schools', ac.signal, client);
  assert.equal(r.needsClarification, false);
  assert.match(r.reason, /^stage2_error:/);
});

// ─── Final payload shape ──────────────────────────────────────────────────

test('buildClarifierFinalPayload: schema matches chat-mode final event', () => {
  const p = buildClarifierFinalPayload();
  assert.equal(p.backend, 'clarifier');
  assert.equal(p.parsed.confidence, 'none');
  assert.equal(p.parsed.sections.short_answer, CLARIFY_MESSAGE);
  assert.deepEqual(p.parsed.sources_used, []);
  assert.equal(p.parsed.recommended_schools, null);
  assert.equal(p.cost.total_usd, 0);
  assert.equal(p.usage.input_tokens, 0);
  assert.equal(p.model, null);
});

test('buildClarifierFinalPayload: custom message override', () => {
  const p = buildClarifierFinalPayload('Custom clarifier text.');
  assert.equal(p.parsed.sections.short_answer, 'Custom clarifier text.');
  assert.equal(p.raw, 'Custom clarifier text.');
});

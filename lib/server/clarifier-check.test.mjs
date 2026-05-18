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

const {
  reasonForJunk,
  runStage2,
  CLARIFY_MESSAGE,
  VALUE_CLARIFY_MESSAGE,
  hasValueAxis,
  isValueAxisAnswer,
  reasonForValueJudgementClarifier,
} = _internals;

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

// ─── P4 value-judgement clarifier ─────────────────────────────────────────

test('reasonForValueJudgementClarifier: bare judgement questions need an axis', () => {
  assert.equal(reasonForValueJudgementClarifier('Is Eton good?'), 'value_judgement_no_axis');
  assert.equal(reasonForValueJudgementClarifier('Worth it?'), 'value_judgement_no_axis');
  assert.equal(reasonForValueJudgementClarifier('Which is better?'), 'value_judgement_no_axis');
  assert.equal(reasonForValueJudgementClarifier('Is this school right for us?'), 'value_judgement_no_axis');
});

test('reasonForValueJudgementClarifier: specific value and fit prompts are allowed', () => {
  assert.equal(reasonForValueJudgementClarifier('Is Eton worth GBP63k?'), null);
  assert.equal(reasonForValueJudgementClarifier('Is Eton worth £63k?'), null);
  assert.equal(reasonForValueJudgementClarifier('Is Eton worth the fees for an academic boy?'), null);
  assert.equal(reasonForValueJudgementClarifier('Is Wellington good value compared with Marlborough?'), null);
  assert.equal(reasonForValueJudgementClarifier('Is Harrow right for a shy full-boarder?'), null);
  assert.equal(reasonForValueJudgementClarifier('Is Rugby safe for my anxious daughter?'), null);
  assert.equal(reasonForValueJudgementClarifier('What is Eton good at?'), null);
  assert.equal(reasonForValueJudgementClarifier('Is it better to apply at 11+ or 13+?'), null);
});

test('value axis helpers mirror parent decision categories', () => {
  for (const q of ['academics', 'boarding life', 'pastoral fit', 'sport', 'value for money', 'admissions', '11+']) {
    assert.equal(isValueAxisAnswer(q), true, `"${q}" should be accepted as a second-turn axis`);
    assert.equal(hasValueAxis(q), true, `"${q}" should match a decision axis`);
  }
});

// Codex r2 P2-5: tightened `worth` pattern must not over-trigger on non-value
// uses of the word "worth".
test('reasonForValueJudgementClarifier: bare worth in non-value context is allowed', () => {
  assert.equal(reasonForValueJudgementClarifier('Is the headmaster worth talking to?'), null);
  assert.equal(reasonForValueJudgementClarifier('Was the visit worth doing?'), null);
  assert.equal(reasonForValueJudgementClarifier('Is it worth touring the boarding houses?'), null);
});

// Codex r2 P2-6/7/8: axis taxonomy must cover gender, alumni/network, and
// religion terms beyond cofe/faith.
test('hasValueAxis: gender/co-ed terms recognised', () => {
  assert.equal(hasValueAxis('co-ed'),         true);
  assert.equal(hasValueAxis('single-sex'),    true);
  assert.equal(hasValueAxis('boys-only'),     true);
  assert.equal(hasValueAxis('mixed school?'), true);
});

test('hasValueAxis: alumni/network terms recognised', () => {
  assert.equal(hasValueAxis('alumni'),                true);
  assert.equal(hasValueAxis('the network'),           true);
  assert.equal(hasValueAxis('old boys connections'),  true);
});

test('hasValueAxis: religion terms beyond cofe recognised', () => {
  assert.equal(hasValueAxis('catholic'),  true);
  assert.equal(hasValueAxis('jewish'),    true);
  assert.equal(hasValueAxis('quaker'),    true);
  assert.equal(hasValueAxis('methodist'), true);
  assert.equal(hasValueAxis('religion'),  true);
});

test('isValueAxisAnswer: second-turn answers for new axes pass through', () => {
  for (const q of ['co-ed', 'coed', 'single-sex', 'mixed', 'boys', 'girls', 'alumni', 'network', 'catholic', 'jewish', 'quaker', 'religion', 'faith']) {
    assert.equal(isValueAxisAnswer(q), true, `"${q}" should be accepted as a second-turn axis`);
  }
});

// Codex r3 P4-1: money figures in $/€/digit form must satisfy the fee axis so
// "Is Eton worth $63000?" / "worth €63000" / "worth 63000" ALLOW instead of
// clarifying — the parent already supplied the value axis.
test('hasValueAxis: money figures in $/€/digit/k-shorthand all satisfy fee axis', () => {
  assert.equal(hasValueAxis('worth $63000?'),    true);
  assert.equal(hasValueAxis('worth €63000?'),    true);
  assert.equal(hasValueAxis('worth 63000?'),     true);
  assert.equal(hasValueAxis('worth £42,000?'),   true);
  assert.equal(hasValueAxis('worth £50k pa?'),   true);
  assert.equal(hasValueAxis('worth USD 63000?'), true);
});

test('reasonForValueJudgementClarifier: $/€/digit-shape value questions ALLOW end-to-end', () => {
  assert.equal(reasonForValueJudgementClarifier('Is Eton worth $63000?'),  null);
  assert.equal(reasonForValueJudgementClarifier('Is Eton worth €63000?'),  null);
  assert.equal(reasonForValueJudgementClarifier('Is Eton worth 63000?'),   null);
  assert.equal(reasonForValueJudgementClarifier('Is Eton worth £42,000?'), null);
});

// Codex r3 P4-2: bare verb "send" must NOT satisfy the SEN axis — it's a
// verb collision, not a special-needs reference. SEN-domain context required.
test('hasValueAxis: bare verb "send" does NOT satisfy SEN axis', () => {
  // Verb usage with no other axis present — must NOT match.
  assert.equal(hasValueAxis('should we send her to Eton'),  false);
  assert.equal(hasValueAxis('send him there'),              false);
  assert.equal(hasValueAxis('considering whether to send'), false);
});

test('hasValueAxis: SEN with domain context still satisfies axis', () => {
  assert.equal(hasValueAxis('SEND support'),     true);
  assert.equal(hasValueAxis('SEND provision'),   true);
  assert.equal(hasValueAxis('SEN'),              true);
  assert.equal(hasValueAxis('send pupils'),      true);
  assert.equal(hasValueAxis('dyslexia support'), true);
});

test('reasonForValueJudgementClarifier: "Should we send her to Eton?" CLARIFIES (no real axis)', () => {
  // Triggers VALUE_JUDGEMENT_RE via "should we send" but no axis present →
  // must clarify (used to allow when SEND axis caught the verb "send").
  assert.equal(reasonForValueJudgementClarifier('Should we send her to Eton?'), 'value_judgement_no_axis');
});

// Codex r3 Q12: religion list extended with non-denominational
test('hasValueAxis: non-denominational recognised', () => {
  assert.equal(hasValueAxis('non-denominational'), true);
  assert.equal(hasValueAxis('non denominational'), true);
});

test('isValueAxisAnswer: non-denominational as a second-turn answer passes', () => {
  assert.equal(isValueAxisAnswer('non-denominational'), true);
});

// Codex r3 NIT: apostrophe-tolerant "old boys' network"
test('hasValueAxis: apostrophe-tolerant alumni phrasing', () => {
  assert.equal(hasValueAxis("old boys' network"),       true);
  assert.equal(hasValueAxis('old boys network'),        true);
  assert.equal(hasValueAxis("old girls' association"),  true);
});

// Codex r4 P4-1: bare digits must NOT count as fee axis — years like 2026
// were matching `\d{4,}` and bypassing the clarifier on questions like
// "Is Eton good in 2026?".
test('hasValueAxis: bare year-shaped digits do NOT satisfy fee axis', () => {
  assert.equal(hasValueAxis('is Eton good in 2026'), false);
  assert.equal(hasValueAxis('1066 was the year'),    false);
  assert.equal(hasValueAxis('the 2024 cohort'),      false);
});

test('hasValueAxis: digit money still allowed when context-qualified', () => {
  // Currency symbols, money words, or year/per suffixes anchor the digit.
  assert.equal(hasValueAxis('worth 63000'),     true);  // money word + digit
  assert.equal(hasValueAxis('cost 14,200'),     true);  // money word + comma-separated
  assert.equal(hasValueAxis('£50k pa'),         true);  // currency + k + per-year
  assert.equal(hasValueAxis('63000 per year'),  true);  // digit + per-year suffix
});

test('reasonForValueJudgementClarifier: "Is Eton good in 2026?" CLARIFIES (year, not money)', () => {
  assert.equal(reasonForValueJudgementClarifier('Is Eton good in 2026?'), 'value_judgement_no_axis');
});

// Codex r4 P4-2: bare `send` as a second-turn axis answer must NOT bypass
// the clarifier — verb-collision risk identical to the SEN axis.
test('isValueAxisAnswer: bare "send" is NOT a valid second-turn axis answer', () => {
  assert.equal(isValueAxisAnswer('send'),    false);
  // `sen` (the acronym) is still accepted as unambiguous
  assert.equal(isValueAxisAnswer('sen'),     true);
  assert.equal(isValueAxisAnswer('SEN'),     true);
});

// Codex r5 P4-1: UK money vocabulary gaps — Codex reproduced false clarifiers
// for tuition, deposit, payment plans, per-annum. These are natural parent
// phrasings and must satisfy the fee axis.
test('hasValueAxis: tuition / deposit / payment plan / per annum satisfy fee axis', () => {
  assert.equal(hasValueAxis('tuition'),                  true);
  assert.equal(hasValueAxis('tuition fees'),             true);
  assert.equal(hasValueAxis('deposit'),                  true);
  assert.equal(hasValueAxis('deposits'),                 true);
  assert.equal(hasValueAxis('payment plan'),             true);
  assert.equal(hasValueAxis('payment plans'),            true);
  assert.equal(hasValueAxis('63000 per annum'),          true);
  assert.equal(hasValueAxis('£42000/year'),              true);
});

test('reasonForValueJudgementClarifier: UK money vocab questions ALLOW', () => {
  assert.equal(reasonForValueJudgementClarifier('Which is better for payment plans?'), null);
  assert.equal(reasonForValueJudgementClarifier('Which is better for deposits?'),      null);
  assert.equal(reasonForValueJudgementClarifier('Is Eton good for tuition?'),          null);
});

// Codex r5 P4-2: SEN/SEND-context phrases as second-turn answers must work.
// `hasValueAxis('SEND support')` already returned true; the answer mirror
// previously did not. Bare `send` still rejected.
test('isValueAxisAnswer: SEN/SEND-context phrases accepted, bare send rejected', () => {
  assert.equal(isValueAxisAnswer('SEND support'),    true);
  assert.equal(isValueAxisAnswer('SEND provision'),  true);
  assert.equal(isValueAxisAnswer('SEND needs'),      true);
  assert.equal(isValueAxisAnswer('SEN support'),     true);
  assert.equal(isValueAxisAnswer('SEN provision'),   true);
  assert.equal(isValueAxisAnswer('dyslexia'),        true);
  assert.equal(isValueAxisAnswer('dyslexia support'),true);
  assert.equal(isValueAxisAnswer('EAL'),             true);
  // bare verb still rejected
  assert.equal(isValueAxisAnswer('send'),            false);
});

// Codex r6 P4-1: more UK money vocabulary that parents naturally type.
test('hasValueAxis: r6 UK money vocab — instalments, termly payments, financial aid, fee remission', () => {
  assert.equal(hasValueAxis('instalments'),       true);
  assert.equal(hasValueAxis('instalment'),        true);
  assert.equal(hasValueAxis('installments'),      true);  // US spelling
  assert.equal(hasValueAxis('termly payments'),   true);
  assert.equal(hasValueAxis('payment terms'),     true);
  assert.equal(hasValueAxis('payment options'),   true);
  assert.equal(hasValueAxis('advance payment'),   true);
  assert.equal(hasValueAxis('financial aid'),     true);
  assert.equal(hasValueAxis('fee remission'),     true);
});

// Codex r6 P4-2: second-turn answers must mirror fee-axis terms so parents
// can reply with brief axis words after Nana asks. r5 missed: bursaries,
// scholarships, means-tested, budget, affordability, financial aid,
// instalments, payment terms/options.
test('isValueAxisAnswer: r6 fee-axis terms as second-turn answers', () => {
  assert.equal(isValueAxisAnswer('payment plans'),    true);
  assert.equal(isValueAxisAnswer('payment terms'),    true);
  assert.equal(isValueAxisAnswer('payment options'),  true);
  assert.equal(isValueAxisAnswer('bursaries'),        true);
  assert.equal(isValueAxisAnswer('bursary'),          true);
  assert.equal(isValueAxisAnswer('scholarships'),     true);
  assert.equal(isValueAxisAnswer('scholarship'),      true);
  assert.equal(isValueAxisAnswer('means-tested'),     true);
  assert.equal(isValueAxisAnswer('budget'),           true);
  assert.equal(isValueAxisAnswer('affordability'),    true);
  assert.equal(isValueAxisAnswer('financial aid'),    true);
  assert.equal(isValueAxisAnswer('instalments'),      true);
});

test('needsClarification: value clarifier runs after junk and before Stage 2',
  withFlag('NANA_CLARIFIER', 'on', async () => {
    process.env.NANA_CLARIFIER_LLM = 'on';
    const explodingClient = {
      chat: { completions: { create: async () => { throw new Error('Stage 2 must not run for value clarifier turns'); } } },
    };
    try {
      const r = await needsClarification('Is Eton good?', {
        hasUsableHistory: false,
        _stage2ClientOverride: explodingClient,
      });
      assert.equal(r.needsClarification, true);
      assert.equal(r.stage, 'stage1_value');
      assert.equal(r.reason, 'value_judgement_no_axis');
      assert.equal(r.message, VALUE_CLARIFY_MESSAGE);

      const junkFirst = await needsClarification('asdf worth it?', {
        _stage2ClientOverride: explodingClient,
      });
      assert.equal(junkFirst.needsClarification, true);
      assert.equal(junkFirst.stage, 'stage1');
      assert.equal(junkFirst.reason, 'keyboard_mash');
      assert.equal(junkFirst.message, CLARIFY_MESSAGE);
    } finally {
      delete process.env.NANA_CLARIFIER_LLM;
    }
  }));

test('needsClarification: value clarifier allows parent axis answer on second turn',
  withFlag('NANA_CLARIFIER', 'on', async () => {
    process.env.NANA_CLARIFIER_LLM = 'on';
    const explodingClient = {
      chat: { completions: { create: async () => { throw new Error('Stage 2 must not run for second-turn axis answers'); } } },
    };
    try {
      const r = await needsClarification('academics', {
        hasUsableHistory: true,
        _stage2ClientOverride: explodingClient,
      });
      assert.equal(r.needsClarification, false);
      assert.equal(r.reason, 'value_axis_with_history');
      assert.equal(r.stage, 'allow');
    } finally {
      delete process.env.NANA_CLARIFIER_LLM;
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

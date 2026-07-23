import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  applyDeterministicGbpThbConversion,
  applyExactDocumentLink,
  buildHybridInstructions,
  buildHybridInput,
  buildSourceQualityIssues,
  canonicalPublicUrl,
  computeHybridCost,
  determineHybridConfidence,
  drainProvisionalHybridText,
  extractDocumentLinksFromHtml,
  extractAnnualGbpAmount,
  extractMarkdownLinks,
  extractResponseEvidence,
  filterCitationsToRenderedLinks,
  isExactDocumentRequested,
  isNonPublicIpAddress,
  parseBankOfThailandGbpRatePayload,
  questionRequestsGbpThbConversion,
  removeBrokenMarkdownLinks,
  removeModelCurrencyEvidence,
  renderCitationsAsMarkdown,
  resolveExactDocumentLink,
  runHybridWebResearchStream,
  safePublicHttpUrl,
  sanitizeProvisionalHybridSegment,
  scopeHybridSchoolSlugs,
  selectDocumentCandidates,
  selectHybridModelRoute,
  shouldUseWebSearch,
  validatePrimarySourceLinks,
} from './hybrid-web-research.js'
import { expandFamousShortNames } from './famous-names.js'

const publicDnsLookup = async () => [{ address: '93.184.216.34', family: 4 }]

test('hybrid prompt locks direct-source evidence, honest dates, GBP/THB, and sensitive boundaries', () => {
  const prompt = buildHybridInstructions()
  assert.match(prompt, /school's own website/i)
  assert.match(prompt, /publication\/version date/i)
  assert.match(prompt, /published GBP amount first/i)
  assert.match(prompt, /validated Bank of Thailand conversion/i)
  assert.match(prompt, /internal notes, sensitive records/i)
  assert.match(prompt, /Never transfer a fact, document, campus/i)
  assert.match(prompt, /Do not introduce fee or budget analysis unless/i)
})

test('GBP/THB conversion intent requires both currencies', () => {
  assert.equal(
    questionRequestsGbpThbConversion(
      'Show the annual GBP total and approximate THB conversion.',
    ),
    true,
  )
  assert.equal(questionRequestsGbpThbConversion('What are the GBP fees?'), false)
  assert.equal(questionRequestsGbpThbConversion('What is the THB budget?'), false)
  assert.equal(
    questionRequestsGbpThbConversion(
      'How much is that in baht?',
      'Millfield costs £60,615 per year.',
    ),
    true,
  )
})

test('Bank of Thailand parser selects the GBP selling row, never a similarly shaped AUD value', () => {
  const payload = {
    responseContent: [
      {
        period: '2026-07-03',
        currency_id: 'GBP',
        buying_sight: '43.8279',
        buying_transfer: '43.9312',
        selling: '44.6917',
      },
      {
        period: '2026-07-03',
        currency_id: 'AUD',
        buying_sight: '22.5225',
        buying_transfer: '22.5865',
        selling: '23.3174',
      },
    ],
  }
  const rate = parseBankOfThailandGbpRatePayload(payload, {
    now: new Date('2026-07-03T12:00:00Z'),
  })
  assert.equal(rate.currency, 'GBP')
  assert.equal(rate.thb_per_gbp, 44.6917)
  assert.equal(rate.rate_type, 'average_selling')
  assert.equal(rate.display_date, '3 July 2026')

  assert.equal(
    parseBankOfThailandGbpRatePayload({
      responseContent: [{
        period: '2026-07-03',
        currency_id: 'GBP',
        selling: '23.3174',
      }],
    }, { now: new Date('2026-07-03T12:00:00Z') }),
    null,
  )
  assert.equal(
    parseBankOfThailandGbpRatePayload({
      responseContent: [{
        period: '2026-02-31',
        currency_id: 'GBP',
        selling: '44.5000',
      }],
    }, { now: new Date('2026-03-03T12:00:00Z') }),
    null,
  )
  assert.equal(
    parseBankOfThailandGbpRatePayload(payload, {
      now: new Date('2026-07-20T12:00:00Z'),
    }),
    null,
  )
})

test('deterministic conversion replaces the wrong model rate and recalculates from annual GBP', async () => {
  const rateEndpoint =
    'https://www.bot.or.th/content/bot/en/statistics/exchange-rate/rates.json'
  const fetchImpl = async url => {
    const body = url === 'https://www.bot.or.th/en/statistics/exchange-rate.html'
      ? `<bot-statistics level1EndPoint="${rateEndpoint}"></bot-statistics>`
      : JSON.stringify({
          responseContent: [
            {
              period: '2026-07-03',
              currency_id: 'AUD',
              selling: '23.3174',
            },
            {
              period: '2026-07-03',
              currency_id: 'GBP',
              selling: '44.6917',
            },
          ],
        })
    return {
      status: 200,
      headers: {
        get(name) {
          if (name === 'content-type') {
            return url === rateEndpoint ? 'application/json' : 'text/html'
          }
          return name === 'content-length' ? String(body.length) : null
        },
      },
      async text() { return body },
    }
  }
  const prose =
    'Millfield charges **£20,205 per term**; over three terms that is **£60,615 per year**. ' +
    '[Official fees](https://www.millfieldschool.com/admissions/fees)\n\n' +
    'Using the Bank of Thailand GBP mid rate of 23.3174 THB per GBP, that is THB 1,413,384. ' +
    '[Daily Foreign Exchange Rates](https://www.bot.or.th/en/statistics/exchange-rate.html)'

  assert.equal(extractAnnualGbpAmount(prose), 60615)
  const result = await applyDeterministicGbpThbConversion(
    prose,
    'Show the annual GBP total and approximate THB conversion.',
    {
      fetchImpl,
      dnsLookup: publicDnsLookup,
      now: new Date('2026-07-03T12:00:00Z'),
      anchors: [{
        official_website: 'https://www.millfieldschool.com/',
      }],
    },
  )

  assert.equal(result.status, 'validated')
  assert.doesNotMatch(result.prose, /23\.3174|1,413,384/)
  assert.match(result.prose, /44\.6917 THB per GBP/)
  assert.match(result.prose, /THB 2,708,987/)
  assert.match(result.prose, /3 July 2026/)
  assert.equal(result.rate.annual_gbp, 60615)
  assert.equal(result.rate.approximate_thb, 2708987)
})

test('deterministic conversion fails closed when the official GBP row is absent or implausible', async () => {
  const rateEndpoint =
    'https://www.bot.or.th/content/bot/en/statistics/exchange-rate/rates.json'
  const fetchImpl = async url => {
    const body = url === 'https://www.bot.or.th/en/statistics/exchange-rate.html'
      ? `<bot-statistics level1EndPoint="${rateEndpoint}"></bot-statistics>`
      : JSON.stringify({
          responseContent: [{
            period: '2026-07-03',
            currency_id: 'GBP',
            selling: '23.3174',
          }],
        })
    return {
      status: 200,
      headers: {
        get(name) {
          if (name === 'content-type') {
            return url === rateEndpoint ? 'application/json' : 'text/html'
          }
          return name === 'content-length' ? String(body.length) : null
        },
      },
      async text() { return body },
    }
  }
  const result = await applyDeterministicGbpThbConversion(
    'The annual fee is **£60,615 per year**. [Official fees](https://www.millfieldschool.com/admissions/fees)\n\n' +
      'Using 23.3174 THB per GBP, that is THB 1,413,384.',
    'Show the annual GBP total and approximate THB conversion.',
    {
      fetchImpl,
      dnsLookup: publicDnsLookup,
      now: new Date('2026-07-03T12:00:00Z'),
      anchors: [{
        official_website: 'https://www.millfieldschool.com/',
      }],
    },
  )
  assert.equal(result.status, 'rate_unavailable')
  assert.doesNotMatch(result.prose, /23\.3174|1,413,384/)
  assert.match(result.prose, /could not verify a current official GBP\/THB rate/i)
})

test('annual GBP extraction rejects term wording, multiple totals, and unsourced totals', async () => {
  assert.equal(
    extractAnnualGbpAmount('The fee is £20,205 per term, charged three times annually.'),
    null,
  )
  assert.equal(
    extractAnnualGbpAmount(
      'School A is £60,615 per year.\n\nSchool B is £52,000 per year.',
    ),
    null,
  )
  assert.equal(
    extractAnnualGbpAmount(
      'The annual fee is £60,615. [Third party](https://example.com/fees)',
      { officialHosts: ['millfieldschool.com'] },
    ),
    null,
  )
  const noAnchor = await applyDeterministicGbpThbConversion(
    'The annual fee is £60,615 per year. [Fees](https://example.com/fees)',
    'Show the annual GBP total and approximate THB conversion.',
  )
  assert.equal(noAnchor.status, 'annual_gbp_school_source_missing')
})

test('annual GBP is derived from the sourced term fee and explicit term count', () => {
  const officialHosts = ['millfieldschool.com']
  assert.equal(
    extractAnnualGbpAmount(
      'The fee is £20,205 per term. [Official fees](https://www.millfieldschool.com/admissions/fees)\n\n' +
        'Across 3 terms, the annual total is £60,615.',
      { officialHosts },
    ),
    60_615,
  )
  assert.equal(
    extractAnnualGbpAmount(
      'The fee is £20,205 per term. [Official fees](https://www.millfieldschool.com/admissions/fees)\n\n' +
        'Across 3 terms, the annual total is £99,999.',
      { officialHosts },
    ),
    null,
  )
})

test('wrong annual arithmetic fails closed instead of converting a model claim', async () => {
  const result = await applyDeterministicGbpThbConversion(
    'The fee is £20,205 per term. [Official fees](https://www.millfieldschool.com/admissions/fees)\n\n' +
      'Across 3 terms, the annual total is £99,999.',
    'Show the annual GBP total and approximate THB conversion.',
    {
      anchors: [{ official_website: 'https://www.millfieldschool.com/' }],
    },
  )
  assert.equal(result.status, 'annual_gbp_arithmetic_mismatch')
  assert.doesNotMatch(result.prose, /THB \d/)
  assert.doesNotMatch(result.prose, /£99,999/)
})

test('mixed third-party FX filtering cannot erase term evidence and bypass annual arithmetic validation', async () => {
  const officialUrl = 'https://www.millfieldschool.com/admissions/fees'
  const ecbUrl =
    'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/'
  const originalEvidence =
    `Millfield charges £20,205 per term across 3 terms. [Official fees](${officialUrl}) ` +
    `ECB lists 44.0000 for sterling. [ECB](${ecbUrl})\n\n` +
    `The annual total is £99,999. [Official fees](${officialUrl})`
  const filtered = removeModelCurrencyEvidence(
    originalEvidence,
    [
      { title: 'Official fees', url: officialUrl },
      { title: 'ECB', url: ecbUrl },
    ],
    [{ official_website: 'https://www.millfieldschool.com/' }],
  )
  assert.doesNotMatch(filtered.prose, /20,205|ECB|44\.0000/)

  const result = await applyDeterministicGbpThbConversion(
    filtered.prose,
    'Show the annual GBP total and approximate THB conversion.',
    {
      anchors: [{ official_website: 'https://www.millfieldschool.com/' }],
      evidenceProse: originalEvidence,
    },
  )
  assert.equal(result.status, 'annual_gbp_arithmetic_mismatch')
  assert.doesNotMatch(result.prose, /THB \d/)
  assert.doesNotMatch(result.prose, /£99,999/)
})

test('common annual wording variants cannot survive rejected arithmetic', async () => {
  const officialUrl = 'https://www.millfieldschool.com/admissions/fees'
  const variants = [
    'The total for the year is £99,999.',
    'Boarding costs £99,999 a year.',
    'The fee is £99,999 for the academic year.',
    'The yearly fee is £99,999.',
    'The fee is £99,999 p.a.',
    'The 2026–27 boarding fee is £99,999.',
    'The fee comes to £99,999 over the year.',
  ]
  for (const variant of variants) {
    const result = await applyDeterministicGbpThbConversion(
      `The fee is £20,205 per term across 3 terms. [Official fees](${officialUrl})\n\n` +
        `${variant} [Official fees](${officialUrl})`,
      'Show the annual GBP total and approximate THB conversion.',
      {
        anchors: [{ official_website: 'https://www.millfieldschool.com/' }],
      },
    )
    assert.equal(result.status, 'annual_gbp_arithmetic_mismatch', variant)
    assert.doesNotMatch(result.prose, /£99,999/, variant)
    assert.doesNotMatch(result.prose, /THB \d/, variant)
  }
})

test('markdown and slash term-fee formatting cannot bypass arithmetic validation', async () => {
  const officialUrl = 'https://www.millfieldschool.com/admissions/fees'
  const termVariants = [
    '**£20,205** per term across 3 terms',
    '£20,205 / term across 3 terms',
    '£20,205 a term across 3 terms',
    '£20,205 termly across 3 terms',
    '£20,205 per academic term across three terms',
    '£20,205 each school term in a three-term year',
    '£20,205 (per term) across 3 terms',
    'The term fee is £20,205 across three terms',
    '| £20,205 | per term | across 3 terms |',
    '£20,205 for each term across 3 terms',
    'Fees per term are £20,205 across three terms',
    'Tuition per term is £20,205 across three terms',
    'The termly charge is £20,205 across three terms',
    '£20,205, payable each term across three terms',
    'Fees per term are GBP 20,205 across three terms',
    'Fees per term are 20,205 GBP across three terms',
  ]
  for (const termVariant of termVariants) {
    const result = await applyDeterministicGbpThbConversion(
      `The fee is ${termVariant}. [Official fees](${officialUrl})\n\n` +
        `The annual total is £99,999. [Official fees](${officialUrl})`,
      'Show the annual GBP total and approximate THB conversion.',
      {
        anchors: [{ official_website: 'https://www.millfieldschool.com/' }],
      },
    )
    assert.equal(result.status, 'annual_gbp_arithmetic_mismatch', termVariant)
    assert.doesNotMatch(result.prose, /£99,999/, termVariant)
    assert.doesNotMatch(result.prose, /THB \d/, termVariant)
  }
})

test('unsupported annual claims without an official citation are removed on failure', async () => {
  const variants = [
    'The total for the year is £99,999.',
    'Boarding costs £99,999 a year.',
    'The fee is £99,999 for the academic year.',
  ]
  for (const variant of variants) {
    const result = await applyDeterministicGbpThbConversion(
      variant,
      'Show the annual GBP total and approximate THB conversion.',
      {
        anchors: [{ official_website: 'https://www.millfieldschool.com/' }],
      },
    )
    assert.equal(result.status, 'annual_gbp_missing', variant)
    assert.doesNotMatch(result.prose, /£99,999/, variant)
  }
})

test('validated conversion removes any other GBP figure even when its wording is unfamiliar', async () => {
  const officialUrl = 'https://www.millfieldschool.com/admissions/fees'
  const conflicts = [
    'The 2026–27 boarding price comes to £99,999.',
    'The 2026–27 boarding price comes to £ **99,999**.',
    'The 2026–27 boarding price comes to 99,999 pounds.',
    'The 2026–27 boarding price comes to 99,999 British pounds.',
    'The alternative boarding price is British pounds: 99,999.',
    'The alternative boarding price is pounds: 99,999.',
    'The alternative boarding price is GBP: 99,999.',
    'The alternative boarding price is £: 99,999.',
    'The alternative boarding price is £=99,999.',
    'The alternative boarding price is £-99,999.',
    'The alternative boarding price is £–99,999.',
    'The alternative boarding price is £—99,999.',
    'The alternative boarding price is £(99,999).',
    'The alternative boarding price is 99,999 (GBP).',
    'The alternative boarding price is 99,999 (pounds).',
    'The alternative boarding price is 99,999 (British pounds).',
    'The alternative boarding price is 99,999 in GBP.',
    'The alternative boarding price is 99,999 in pounds.',
    'The alternative boarding price is 99,999 in British pounds.',
    'The alternative boarding price is 99k GBP.',
    'The alternative boarding price is 99k pounds.',
    'The alternative boarding price is 99k British pounds.',
    'The alternative boarding price is 99 thousand pounds.',
    'The alternative boarding price is 99,999 sterling.',
    'The alternative boarding price is £<strong>99,999</strong>.',
    'The alternative boarding price is £&nbsp;99,999.',
    'The alternative boarding price is GBP99,999.',
  ]
  for (const conflict of conflicts) {
    const result = await applyDeterministicGbpThbConversion(
      `The fee is £20,205 per term across three terms. [Official fees](${officialUrl})\n\n` +
        `The annual total is £60,615. [Official fees](${officialUrl})\n\n` +
        conflict,
      'Show the annual GBP total and approximate THB conversion.',
      {
        anchors: [{ official_website: 'https://www.millfieldschool.com/' }],
        fetchImpl: async url => {
          const endpoint = 'https://www.bot.or.th/rates.json'
          const body = url === 'https://www.bot.or.th/en/statistics/exchange-rate.html'
            ? `<bot-statistics level1EndPoint="${endpoint}"></bot-statistics>`
            : JSON.stringify({
                responseContent: [{
                  period: '2026-07-03',
                  currency_id: 'GBP',
                  selling: '44.6917',
                }],
              })
          return {
            status: 200,
            headers: {
              get(name) {
                if (name === 'content-type') {
                  return url === endpoint ? 'application/json' : 'text/html'
                }
                return name === 'content-length' ? String(body.length) : null
              },
            },
            async text() { return body },
          }
        },
        dnsLookup: publicDnsLookup,
        now: new Date('2026-07-03T12:00:00Z'),
      },
    )
    assert.equal(result.status, 'validated', conflict)
    assert.doesNotMatch(result.prose, /99,999/, conflict)
    assert.match(result.prose, /£20,205/, conflict)
    assert.match(result.prose, /£60,615/, conflict)
    assert.match(result.prose, /THB 2,708,987/, conflict)
  }
})

test('context-backed baht follow-up still uses the deterministic guard', async () => {
  const result = await applyDeterministicGbpThbConversion(
    'The annual fee is £60,615 per year. [Official fees](https://www.millfieldschool.com/admissions/fees)',
    'How much is that in baht?',
    {
      parentContext: 'Millfield costs £60,615 per year.',
      anchors: [{ official_website: 'https://www.millfieldschool.com/' }],
      fetchImpl: async url => {
        const endpoint = 'https://www.bot.or.th/rates.json'
        const body = url === 'https://www.bot.or.th/en/statistics/exchange-rate.html'
          ? `<bot-statistics level1EndPoint="${endpoint}"></bot-statistics>`
          : JSON.stringify({
              responseContent: [{
                period: '2026-07-03',
                currency_id: 'GBP',
                selling: '44.6917',
              }],
            })
        return {
          status: 200,
          headers: {
            get(name) {
              if (name === 'content-type') {
                return url === endpoint ? 'application/json' : 'text/html'
              }
              return name === 'content-length' ? String(body.length) : null
            },
          },
          async text() { return body },
        }
      },
      dnsLookup: publicDnsLookup,
      now: new Date('2026-07-03T12:00:00Z'),
    },
  )
  assert.equal(result.status, 'validated')
  assert.match(result.prose, /THB 2,708,987/)
})

test('inline wrong conversion keeps the official fee source after the sentence is replaced', async () => {
  const endpoint = 'https://www.bot.or.th/rates.json'
  const result = await applyDeterministicGbpThbConversion(
    'Millfield’s annual fee is £60,615 per year, approximately THB 1,413,384 using 23.3174 THB per GBP. ' +
      '[Official fees](https://www.millfieldschool.com/admissions/fees)',
    'Show the annual GBP total and approximate THB conversion.',
    {
      anchors: [{ official_website: 'https://www.millfieldschool.com/' }],
      fetchImpl: async url => {
        const body = url === 'https://www.bot.or.th/en/statistics/exchange-rate.html'
          ? `<bot-statistics level1EndPoint="${endpoint}"></bot-statistics>`
          : JSON.stringify({
              responseContent: [{
                period: '2026-07-03',
                currency_id: 'GBP',
                selling: '44.6917',
              }],
            })
        return {
          status: 200,
          headers: {
            get(name) {
              if (name === 'content-type') {
                return url === endpoint ? 'application/json' : 'text/html'
              }
              return name === 'content-length' ? String(body.length) : null
            },
          },
          async text() { return body },
        }
      },
      dnsLookup: publicDnsLookup,
      now: new Date('2026-07-03T12:00:00Z'),
    },
  )
  assert.equal(result.status, 'validated')
  assert.doesNotMatch(result.prose, /1,413,384|23\.3174/)
  assert.match(
    result.prose,
    /\[official school fee source\]\(https:\/\/www\.millfieldschool\.com\/admissions\/fees\)/,
  )
  assert.equal(
    result.rate.fee_source_url,
    'https://www.millfieldschool.com/admissions/fees',
  )
})

test('standalone baht-symbol conversion is removed before deterministic FX is appended', async () => {
  const endpoint = 'https://www.bot.or.th/rates.json'
  const result = await applyDeterministicGbpThbConversion(
    'Millfield’s annual fee is £60,615 per year. ' +
      '[Official fees](https://www.millfieldschool.com/admissions/fees)\n\n' +
      'That converts to approximately ฿1,413,384.',
    'Show the annual GBP total and approximate THB conversion.',
    {
      anchors: [{ official_website: 'https://www.millfieldschool.com/' }],
      fetchImpl: async url => {
        const body = url === 'https://www.bot.or.th/en/statistics/exchange-rate.html'
          ? `<bot-statistics level1EndPoint="${endpoint}"></bot-statistics>`
          : JSON.stringify({
              responseContent: [{
                period: '2026-07-03',
                currency_id: 'GBP',
                selling: '44.6917',
              }],
            })
        return {
          status: 200,
          headers: {
            get(name) {
              if (name === 'content-type') {
                return url === endpoint ? 'application/json' : 'text/html'
              }
              return name === 'content-length' ? String(body.length) : null
            },
          },
          async text() { return body },
        }
      },
      dnsLookup: publicDnsLookup,
      now: new Date('2026-07-03T12:00:00Z'),
    },
  )
  assert.equal(result.status, 'validated')
  assert.doesNotMatch(result.prose, /฿|1,413,384|converts to approximately/i)
  assert.match(result.prose, /THB 2,708,987/)
})

test('indirect FX claims are removed while approximate school facts survive', async () => {
  const endpoint = 'https://www.bot.or.th/rates.json'
  const result = await applyDeterministicGbpThbConversion(
    'The school has approximately 1,300 pupils. Boarding is about 70% of pupils.\n\n' +
      'Millfield’s annual fee is £60,615 per year. ' +
      '[Official fees](https://www.millfieldschool.com/admissions/fees)\n\n' +
      'At 44.6917 to the pound, that gives 2,708,000.\n\n' +
      'That works out to 2,708,000.',
    'Show the annual GBP total and approximate THB conversion.',
    {
      anchors: [{ official_website: 'https://www.millfieldschool.com/' }],
      fetchImpl: async url => {
        const body = url === 'https://www.bot.or.th/en/statistics/exchange-rate.html'
          ? `<bot-statistics level1EndPoint="${endpoint}"></bot-statistics>`
          : JSON.stringify({
              responseContent: [{
                period: '2026-07-03',
                currency_id: 'GBP',
                selling: '44.6917',
              }],
            })
        return {
          status: 200,
          headers: {
            get(name) {
              if (name === 'content-type') {
                return url === endpoint ? 'application/json' : 'text/html'
              }
              return name === 'content-length' ? String(body.length) : null
            },
          },
          async text() { return body },
        }
      },
      dnsLookup: publicDnsLookup,
      now: new Date('2026-07-03T12:00:00Z'),
    },
  )
  assert.equal(result.status, 'validated')
  assert.match(result.prose, /approximately 1,300 pupils/)
  assert.match(result.prose, /about 70% of pupils/)
  assert.doesNotMatch(result.prose, /44\.6917 to the pound|2,708,000|works out/i)
  assert.match(result.prose, /THB 2,708,987/)
})

test('source chips retain only links that are rendered in the answer', () => {
  const fee = 'https://www.millfieldschool.com/admissions/fees'
  const bot = 'https://www.bot.or.th/en/statistics/exchange-rate.html'
  const unrelated = 'https://www.millfieldschool.com/admissions/open-days'
  const citations = filterCitationsToRenderedLinks(
    [
      { title: 'Fees', url: fee },
      { title: 'Rates', url: bot },
      { title: 'Open days', url: unrelated },
    ],
    `[Fees](${fee}) and [rates](${bot})`,
  )
  assert.deepEqual(citations.map(citation => citation.url), [fee, bot])
})

test('currency evidence filter drops mixed third-party FX blocks but preserves official fee titles', () => {
  const officialUrl = 'https://www.millfieldschool.com/admissions/fees'
  const ecbUrl =
    'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/'
  const mixed = removeModelCurrencyEvidence(
    `Millfield charges £20,205 per term. [Fees and currency information](${officialUrl}) ` +
      `ECB lists 44.0000 for sterling. [ECB](${ecbUrl})\n\n` +
      `The annual total is £60,615. [Fees and currency information](${officialUrl})`,
    [
      { title: 'Fees and currency information', url: officialUrl },
      { title: 'ECB', url: ecbUrl },
    ],
    [{ official_website: 'https://www.millfieldschool.com/' }],
  )
  assert.equal(
    mixed.prose,
    `The annual total is £60,615. [Fees and currency information](${officialUrl})`,
  )
  assert.deepEqual(mixed.citations, [{
    title: 'Fees and currency information',
    url: officialUrl,
  }])
  assert.doesNotMatch(mixed.prose, /44\.0000|ECB|sterling/)
})

test('a server-generated Bank of Thailand link is trusted and health-checked', async () => {
  const bot = 'https://www.bot.or.th/en/statistics/exchange-rate.html'
  const health = await validatePrimarySourceLinks({
    question: 'Show the fees and THB conversion',
    citations: [{ title: 'Rates', url: bot }],
    anchors: [],
    exactDocument: null,
    trustedEvidenceUrls: [bot],
    prose: `[Bank of Thailand rates](${bot})`,
    fetchImpl: async () => ({
      status: 200,
      headers: {
        get(name) {
          if (name === 'content-type') return 'text/html'
          if (name === 'content-length') return '13'
          return null
        },
      },
      async text() { return '<html></html>' },
    }),
    dnsLookup: publicDnsLookup,
  })
  assert.equal(health.length, 1)
  assert.equal(health[0].state, 'verified')
})

test('provisional streaming removes unchecked links and withholds model-written FX', () => {
  assert.equal(
    sanitizeProvisionalHybridSegment(
      'See [official fees](https://www.millfieldschool.com/admissions/fees).',
    ),
    'See official fees.',
  )
  const preview = drainProvisionalHybridText(
    'The annual fee is £60,615. Using 23.3174 THB per GBP. It includes VAT.',
    { currencySensitive: true, flush: true },
  )
  assert.equal(preview.pending, '')
  assert.equal(
    preview.segments.join(''),
    'The annual fee is £60,615. It includes VAT.',
  )
  assert.doesNotMatch(preview.segments.join(''), /23\.3174|THB/)

  const symbolPreview = drainProvisionalHybridText(
    'The annual fee is £60,615. That converts to approximately ฿1,413,384. It includes VAT.',
    { currencySensitive: true, flush: true },
  )
  assert.equal(symbolPreview.pending, '')
  assert.equal(
    symbolPreview.segments.join(''),
    'The annual fee is £60,615. It includes VAT.',
  )
  assert.doesNotMatch(
    symbolPreview.segments.join(''),
    /฿|1,413,384|converts/i,
  )

  const indirectPreview = drainProvisionalHybridText(
    'The school has approximately 1,300 pupils. Boarding is about 70% of pupils. ' +
      'At 44.6917 to the pound, that gives 2,708,000. ' +
      'That works out to 2,708,000. It includes VAT.',
    { currencySensitive: true, flush: true },
  )
  assert.equal(indirectPreview.pending, '')
  assert.equal(
    indirectPreview.segments.join(''),
    'The school has approximately 1,300 pupils. Boarding is about 70% of pupils. It includes VAT.',
  )
  assert.doesNotMatch(
    indirectPreview.segments.join(''),
    /44\.6917 to the pound|2,708,000|works out/i,
  )

  const offerPreview = drainProvisionalHybridText(
    'The annual fee is £60,615. If you want, send me the FX rate and I will convert it. It includes VAT.',
    { currencySensitive: true, flush: true },
  )
  assert.equal(
    offerPreview.segments.join(''),
    'The annual fee is £60,615. It includes VAT.',
  )
  assert.equal(
    drainProvisionalHybridText(
      'The annual fee is £60,615. If you want, I can estimate this using the BOT selling rate instead.',
      { currencySensitive: true, flush: true },
    ).segments.join(''),
    'The annual fee is £60,615.',
  )
  assert.equal(
    drainProvisionalHybridText(
      'The annual fee is £60,615.\n\nIf you want, I can compare it with your £40k–£50k budget.',
      { currencySensitive: true, flush: true },
    ).segments.join(''),
    'The annual fee is £60,615.\n\n',
  )
  assert.equal(
    sanitizeProvisionalHybridSegment(
      'The annual fee is £60,615. (millfieldschool.com)',
    ),
    'The annual fee is £60,615.',
  )
  assert.equal(
    drainProvisionalHybridText(
      'First paragraph.\n\nSecond paragraph.',
      { flush: true },
    ).segments.join(''),
    'First paragraph.\n\nSecond paragraph.',
  )
})

test('short follow-up lookup searches while social-only messages do not', () => {
  assert.equal(shouldUseWebSearch('yes please look it up'), true)
  assert.equal(shouldUseWebSearch('Send me the latest Millfield prospectus'), true)
  assert.equal(
    shouldUseWebSearch('Put that in a table', {
      parentContext: 'Recent conversation:\nQ: Compare Millfield and Oundle / A: ...',
    }),
    false,
  )
  assert.equal(shouldUseWebSearch('thanks!'), false)
})

test('router sends focused lookup, synthesis, and comparison questions to the intended lanes', () => {
  const common = { routerEnabled: true, env: {} }

  assert.deepEqual(
    selectHybridModelRoute('What are Millfield fees for 2026?', {
      ...common,
      mentionedSlugs: ['millfield-school'],
    }),
    {
      tier: 'mini',
      model: 'gpt-5.4-mini',
      reason: 'single_focus_lookup',
      router_enabled: true,
      settings: {
        max_output_tokens: 1800,
        max_tool_calls: 3,
        reasoning_effort: 'low',
        verbosity: 'low',
        search_context_size: 'low',
      },
    },
  )
  assert.equal(
    selectHybridModelRoute('What are Millfield’s 2026–27 boarding fees?', {
      ...common,
      mentionedSlugs: ['millfield-school'],
    }).tier,
    'mini',
  )

  assert.equal(
    selectHybridModelRoute(
      'Send me the latest Millfield prospectus and explain boarding options.',
      { ...common, mentionedSlugs: ['millfield-school'] },
    ).tier,
    'luna',
  )
  assert.equal(
    selectHybridModelRoute('Is this school good for golf and academics?', common).tier,
    'luna',
  )
  assert.equal(
    selectHybridModelRoute(
      'Compare Millfield, Oundle and Uppingham in a table and recommend one.',
      {
        ...common,
        mentionedSlugs: ['millfield-school', 'oundle-school', 'uppingham-school'],
      },
    ).tier,
    'terra',
  )
  assert.equal(
    selectHybridModelRoute(
      'Which UK boarding schools suit a Year 9 student near Heathrow?',
      common,
    ).tier,
    'terra',
  )
})

test('router preserves fixed-model baselines and supports forced test lanes', () => {
  const fixed = selectHybridModelRoute('Compare these schools', {
    routerEnabled: true,
    fixedModel: 'gpt-5.6-luna',
    env: {},
  })
  assert.equal(fixed.tier, 'fixed')
  assert.equal(fixed.model, 'gpt-5.6-luna')
  assert.equal(fixed.reason, 'fixed_model_override')

  const forced = selectHybridModelRoute('Compare these schools', {
    routerEnabled: true,
    forcedTier: 'mini',
    env: {},
  })
  assert.equal(forced.tier, 'mini')
  assert.equal(forced.model, 'gpt-5.4-mini')
  assert.equal(forced.reason, 'forced_tier')

  const disabled = selectHybridModelRoute('What are the fees?', {
    routerEnabled: false,
    env: {},
  })
  assert.equal(disabled.model, 'gpt-5.6-terra')
  assert.equal(disabled.reason, 'router_disabled')
})

test('explicit schools exclude an unrelated shortlist unless the user names the shortlist', () => {
  const opts = {
    mentionedSlugs: ['millfield-school'],
    shortlistSlugs: ['benenden-school', 'roedean-school'],
  }
  assert.deepEqual(
    scopeHybridSchoolSlugs('Send the Millfield prospectus', opts),
    ['millfield-school'],
  )
  assert.deepEqual(
    scopeHybridSchoolSlugs('Compare Millfield with my shortlist', opts),
    ['millfield-school', 'benenden-school', 'roedean-school'],
  )
  assert.deepEqual(
    scopeHybridSchoolSlugs('Compare Millfield, Oundle and Uppingham', {
      mentionedSlugs: ['millfield-school', 'oundle-school', 'uppingham-school'],
      shortlistSlugs: ['benenden-school', 'roedean-school'],
    }),
    ['millfield-school', 'oundle-school', 'uppingham-school'],
  )
  assert.deepEqual(
    scopeHybridSchoolSlugs('Which schools suit a Year 9 boarder?', {
      mentionedSlugs: [],
      shortlistSlugs: ['benenden-school', 'roedean-school'],
    }),
    [],
  )
})

test('runner-level identity scope recovers a bare Millfield name when the route supplies no slug', () => {
  assert.deepEqual(
    scopeHybridSchoolSlugs('What are Millfield boarding fees?', {
      mentionedSlugs: expandFamousShortNames('What are Millfield boarding fees?', []),
      shortlistSlugs: [],
    }),
    ['millfield-school'],
  )
})

test('bare-name detection resolves Millfield and Oundle identity anchors', () => {
  assert.deepEqual(
    expandFamousShortNames('Send me the latest Millfield prospectus'),
    ['millfield-school'],
  )
  assert.deepEqual(
    expandFamousShortNames('What are Millfield’s 2026–27 boarding fees?'),
    ['millfield-school'],
  )
  assert.deepEqual(
    expandFamousShortNames("What are Millfield's 2026–27 boarding fees?"),
    ['millfield-school'],
  )
  assert.deepEqual(
    expandFamousShortNames('Compare Millfield, Oundle and Uppingham'),
    ['millfield-school', 'oundle-school', 'uppingham-school'],
  )
  assert.deepEqual(
    expandFamousShortNames('Compare Oundle’s fees with Harrow’s fees'),
    ['oundle-school', 'harrow-school'],
  )
  assert.deepEqual(
    expandFamousShortNames("Compare Reed's fees with Reeds fees"),
    ['reeds-school-uk'],
  )
})

test('hybrid cost separates uncached, cache-read, and cache-write token charges', () => {
  const cost = computeHybridCost({
    input_tokens: 850,
    cache_read_input_tokens: 100,
    cache_creation_input_tokens: 50,
    output_tokens: 120,
  }, 'gpt-5.4-mini', 1)

  assert.ok(Math.abs(cost.cost_cache_create - 0.0000375) < 1e-12)
  assert.ok(Math.abs(cost.cost_cache_read - 0.0000075) < 1e-12)
  assert.equal(cost.cost_search, 0.01)
  assert.ok(cost.total_usd > cost.cost_search)
})

test('safePublicHttpUrl rejects private, credentialed, and non-http URLs', () => {
  assert.equal(safePublicHttpUrl('https://www.millfieldschool.com/admissions'), 'https://www.millfieldschool.com/admissions')
  assert.equal(safePublicHttpUrl('http://192.168.1.143/private.pdf'), null)
  assert.equal(safePublicHttpUrl('http://[::1]/private.pdf'), null)
  assert.equal(safePublicHttpUrl('http://[fd00::1]/private.pdf'), null)
  assert.equal(safePublicHttpUrl('http://[::ffff:c0a8:102]/private.pdf'), null)
  assert.equal(safePublicHttpUrl('https://user:pass@example.com/x'), null)
  assert.equal(safePublicHttpUrl('file:///tmp/a.pdf'), null)
  assert.equal(isNonPublicIpAddress('fe80::1'), true)
  assert.equal(isNonPublicIpAddress('2606:4700:4700::1111'), false)
})

test('canonicalPublicUrl removes tracking parameters without removing useful query values', () => {
  assert.equal(
    canonicalPublicUrl('https://school.example/fees?year=2026&utm_source=openai&fbclid=x#fees'),
    'https://school.example/fees?year=2026',
  )
})

test('official page HTML resolves the exact Year 9 interactive prospectus', () => {
  const links = extractDocumentLinksFromHtml(
    `
      <a href="/admissions/prospectuses">Prospectuses</a>
      <a href="https://view.digital-hub.global/9-at-millfield-brochure/p/1">
        Interactive Nine at Millfield
      </a>
      <a href="https://view.digital-hub.global/year-10/p/1">Year 10 at Millfield</a>
    `,
    'https://www.millfieldschool.com/admissions/frequently-asked-questions',
    'Send the latest prospectus. Parent context: child entering Year 9.',
  )
  assert.equal(links[0].url, 'https://view.digital-hub.global/9-at-millfield-brochure/p/1')
})

test('exact-document resolver follows an official page to a verified final brochure', async () => {
  const faq = 'https://www.millfieldschool.com/admissions/frequently-asked-questions'
  const brochure = 'https://view.digital-hub.global/9-at-millfield-brochure/p/1'
  const fetchImpl = async url => {
    const body = url === faq
      ? `<a href="${brochure}">Interactive Nine at Millfield</a>`
      : '<html><title>Nine at Millfield</title></html>'
    return {
      status: 200,
      headers: {
        get(name) {
          if (name === 'content-type') return 'text/html'
          if (name === 'content-length') return String(body.length)
          return null
        },
      },
      async text() { return body },
    }
  }

  const result = await resolveExactDocumentLink({
    question: 'Send me the latest Millfield prospectus',
    parentContext: 'Parent context: child entering Year 9.',
    citations: [{ title: 'Frequently Asked Questions', url: faq }],
    anchors: [{
      slug: 'millfield-school',
      official_website: 'https://www.millfieldschool.com/',
      prospectus_url: null,
    }],
    documentCandidates: [],
    fetchImpl,
    dnsLookup: publicDnsLookup,
  })

  assert.equal(result.url, brochure)
  assert.equal(result.verified, true)
  assert.equal(result.kind, 'exact_document')
  assert.equal(
    applyExactDocumentLink(
      `Here is the prospectus:\n\n**Interactive Nine at Millfield prospectus** [Frequently Asked Questions](${faq})`,
      result,
    ),
    `Here is the prospectus:\n\n**[Interactive Nine at Millfield prospectus](${brochure})**`,
  )
})

test('exact-document resolver accepts a directly stored official PDF', async () => {
  const pdf = 'https://www.millfieldschool.com/documents/year-9-prospectus.pdf'
  const result = await resolveExactDocumentLink({
    question: 'Send me the Year 9 Millfield prospectus',
    parentContext: '',
    citations: [],
    anchors: [{
      slug: 'millfield-school',
      name: 'Millfield School',
      official_website: 'https://www.millfieldschool.com/',
      prospectus_url: pdf,
    }],
    documentCandidates: [],
    fetchImpl: async () => ({
      status: 200,
      headers: { get(name) { return name === 'content-type' ? 'application/pdf' : null } },
      body: { async cancel() {} },
    }),
    dnsLookup: publicDnsLookup,
  })
  assert.equal(result.url, pdf)
  assert.equal(result.kind, 'exact_document')
})

test('an outsourced stored candidate is not exact without an official-page chain', async () => {
  const result = await resolveExactDocumentLink({
    question: 'Send me the Millfield prospectus',
    parentContext: '',
    citations: [],
    anchors: [{
      slug: 'millfield-school',
      name: 'Millfield School',
      official_website: 'https://www.millfieldschool.com/',
      prospectus_url: null,
    }],
    documentCandidates: [{
      school_slug: 'millfield-school',
      title: 'Millfield Prospectus.pdf',
      url: 'https://files.unrelated.example/millfield-prospectus.pdf',
    }],
    fetchImpl: async () => ({
      status: 200,
      headers: { get(name) { return name === 'content-type' ? 'application/pdf' : null } },
      body: { async cancel() {} },
    }),
    dnsLookup: publicDnsLookup,
  })
  assert.equal(result, null)
})

test('an unrelated stored HTML page cannot manufacture an official document chain', async () => {
  const landing = 'https://files.unrelated.example/millfield-prospectus'
  const pdf = 'https://files.unrelated.example/millfield-prospectus.pdf'
  const result = await resolveExactDocumentLink({
    question: 'Send me the Millfield prospectus',
    parentContext: '',
    citations: [],
    anchors: [{
      slug: 'millfield-school',
      name: 'Millfield School',
      official_website: 'https://www.millfieldschool.com/',
      prospectus_url: null,
    }],
    documentCandidates: [{
      school_slug: 'millfield-school',
      title: 'Millfield Prospectus',
      url: landing,
    }],
    fetchImpl: async url => {
      const body = url === landing
        ? `<a href="${pdf}">Millfield Prospectus PDF</a>`
        : ''
      return {
        status: 200,
        headers: {
          get(name) {
            if (name === 'content-type') return url === pdf ? 'application/pdf' : 'text/html'
            if (name === 'content-length') return String(body.length)
            return null
          },
        },
        async text() { return body },
        body: { async cancel() {} },
      }
    },
    dnsLookup: publicDnsLookup,
  })
  assert.equal(result, null)
})

test('a generic prospectus listing is not mislabeled as the exact document', async () => {
  const hub = 'https://school.example/admissions/prospectuses'
  const pdf = 'https://school.example/files/senior-prospectus.pdf'
  const fetchImpl = async url => {
    const body = url === hub
      ? `<a href="${pdf}">Senior School Prospectus</a>`
      : ''
    return {
      status: 200,
      headers: {
        get(name) {
          if (name === 'content-type') return url === pdf ? 'application/pdf' : 'text/html'
          if (name === 'content-length') return String(body.length)
          return null
        },
      },
      async text() { return body },
      body: { async cancel() {} },
    }
  }
  const result = await resolveExactDocumentLink({
    question: 'Send the school prospectus',
    parentContext: '',
    citations: [{ title: 'Prospectuses', url: hub }],
    anchors: [{
      slug: 'example-school',
      name: 'Example School',
      official_website: 'https://school.example/',
      prospectus_url: hub,
    }],
    documentCandidates: [],
    fetchImpl,
    dnsLookup: publicDnsLookup,
  })
  assert.equal(result.url, pdf)
  assert.equal(result.kind, 'exact_document')
})

test('a singular official prospectus landing page is followed to the final PDF', async () => {
  const landing = 'https://school.example/admissions/prospectus'
  const pdf = 'https://school.example/files/senior-prospectus-2026.pdf'
  const fetchImpl = async url => {
    const body = url === landing
      ? `<a href="${pdf}">Senior Prospectus 2026 PDF</a>`
      : ''
    return {
      status: 200,
      headers: {
        get(name) {
          if (name === 'content-type') return url === pdf ? 'application/pdf' : 'text/html'
          if (name === 'content-length') return String(body.length)
          return null
        },
      },
      async text() { return body },
      body: { async cancel() {} },
    }
  }
  const result = await resolveExactDocumentLink({
    question: 'Send the latest school prospectus',
    parentContext: '',
    citations: [{ title: 'School prospectus', url: landing }],
    anchors: [{
      slug: 'example-school',
      name: 'Example School',
      official_website: 'https://school.example/',
      prospectus_url: landing,
    }],
    documentCandidates: [],
    fetchImpl,
    dnsLookup: publicDnsLookup,
  })
  assert.equal(result.url, pdf)
  assert.equal(result.kind, 'exact_document')
})

test('latest prefers the newer official citation over a stale stored PDF', async () => {
  const stale = 'https://school.example/files/prospectus-2024.pdf'
  const current = 'https://school.example/files/prospectus-2026.pdf'
  const result = await resolveExactDocumentLink({
    question: 'Send the latest school prospectus',
    parentContext: '',
    citations: [{ title: 'School Prospectus 2026', url: current }],
    anchors: [{
      slug: 'example-school',
      name: 'Example School',
      official_website: 'https://school.example/',
      prospectus_url: null,
    }],
    documentCandidates: [{
      school_slug: 'example-school',
      title: 'School Prospectus 2024',
      url: stale,
    }],
    fetchImpl: async () => ({
      status: 200,
      headers: { get(name) { return name === 'content-type' ? 'application/pdf' : null } },
      body: { async cancel() {} },
    }),
    dnsLookup: publicDnsLookup,
  })
  assert.equal(result.url, current)
})

test('primary link checks distinguish confirmed broken links and remove only their hrefs', async () => {
  const broken = 'https://school.example/admissions/fees'
  const health = await validatePrimarySourceLinks({
    question: 'What are the fees?',
    citations: [{ title: 'Fees', url: broken }],
    anchors: [{ official_website: 'https://school.example/' }],
    exactDocument: null,
    fetchImpl: async () => ({
      status: 404,
      headers: { get() { return 'text/html' } },
    }),
    dnsLookup: publicDnsLookup,
  })
  assert.equal(health[0].state, 'broken')
  assert.equal(
    removeBrokenMarkdownLinks(`See [Fees](${broken})`, [broken]),
    'See Fees',
  )
  assert.equal(
    removeBrokenMarkdownLinks(`Answer text.\n\n[Broken source](${broken})`, [broken]),
    'Answer text.',
  )
})

test('primary link checks block private DNS, soft 404s, and untrusted model links', async () => {
  const official = 'https://school.example/tuition'
  const privateDns = await validatePrimarySourceLinks({
    question: 'What is the tuition cost?',
    citations: [{ title: 'Tuition', url: official }],
    anchors: [{ official_website: 'https://school.example/' }],
    exactDocument: null,
    prose: `See [Tuition](${official})`,
    fetchImpl: async () => { throw new Error('must not fetch private DNS') },
    dnsLookup: async () => [{ address: '127.0.0.1', family: 4 }],
  })
  assert.equal(privateDns[0].state, 'blocked')

  const soft404 = await validatePrimarySourceLinks({
    question: 'What is the tuition cost?',
    citations: [{ title: 'Tuition', url: official }],
    anchors: [{ official_website: 'https://school.example/' }],
    exactDocument: null,
    prose: `See [Tuition](${official})`,
    fetchImpl: async () => ({
      status: 200,
      headers: { get(name) { return name === 'content-type' ? 'text/html' : null } },
      async text() { return '<title>404 Page Not Found</title>' },
    }),
    dnsLookup: publicDnsLookup,
  })
  assert.equal(soft404[0].state, 'broken')

  const untrusted = await validatePrimarySourceLinks({
    question: 'Send the prospectus',
    citations: [],
    anchors: [{ official_website: 'https://school.example/' }],
    exactDocument: null,
    prose: 'See [Prospectus](https://files.other.example/prospectus.pdf)',
    dnsLookup: publicDnsLookup,
  })
  assert.equal(untrusted[0].state, 'untrusted')
  assert.deepEqual(extractMarkdownLinks('See [Fees](https://school.example/fees?utm_source=x)'), [{
    label: 'Fees',
    url: 'https://school.example/fees',
  }])
})

test('an explicit lookup follow-up inherits the prior document request', () => {
  assert.equal(
    isExactDocumentRequested(
      'yes please look it up',
      'Q: Send the latest Millfield prospectus / A: I could not verify it',
    ),
    true,
  )
  assert.equal(isExactDocumentRequested('thanks', 'Send the prospectus'), false)
})

test('confidence cannot remain high with identity gaps, broken primary links, or an indirect document', () => {
  const base = {
    citationCount: 3,
    officialCitationCount: 2,
    identityGapCount: 0,
    brokenPrimaryCount: 0,
    exactDocumentRequested: false,
    exactDocumentFound: false,
  }
  assert.equal(determineHybridConfidence(base), 'high')
  assert.equal(determineHybridConfidence({ ...base, identityGapCount: 1 }), 'low')
  assert.equal(determineHybridConfidence({ ...base, brokenPrimaryCount: 1 }), 'low')
  assert.equal(determineHybridConfidence({
    ...base,
    criticalValidationFailed: true,
  }), 'low')
  assert.equal(determineHybridConfidence({
    ...base,
    exactDocumentRequested: true,
    exactDocumentFound: false,
  }), 'medium')
})

test('document candidates require the requested type and exclude policy noise', () => {
  const rows = [
    { school_slug: 'millfield-school', filename: 'Senior Prospectus 2026.pdf', url: 'https://millfieldschool.com/prospectus.pdf', status: 'ingested' },
    { school_slug: 'millfield-school', filename: 'Admissions Policy 2026.pdf', url: 'https://millfieldschool.com/admissions-policy.pdf', status: 'ingested' },
    { school_slug: 'millfield-school', filename: 'Fees 2026.pdf', url: 'https://millfieldschool.com/fees.pdf', status: 'ingested' },
  ]
  const result = selectDocumentCandidates(rows, 'Send the latest prospectus')
  assert.deepEqual(result.map(item => item.title), ['Senior Prospectus 2026.pdf'])
})

test('native URL citation marker becomes a clickable markdown source', () => {
  const raw = 'Millfield publishes several prospectuses. citeturn0search0'
  const marker = 'citeturn0search0'
  const start = raw.indexOf(marker)
  const rendered = renderCitationsAsMarkdown(raw, [{
    start_index: start,
    end_index: start + marker.length,
    title: 'Millfield admissions',
    url: 'https://www.millfieldschool.com/admissions',
  }])
  assert.equal(
    rendered,
    'Millfield publishes several prospectuses. [Millfield admissions](https://www.millfieldschool.com/admissions)',
  )
})

test('native citation links an existing model-written label without duplicating it', () => {
  const label = '[Millfield Prep interactive prospectus] '
  const marker = 'citeturn0search0'
  const raw = `${label}${marker}`
  const rendered = renderCitationsAsMarkdown(raw, [{
    start_index: label.length,
    end_index: raw.length,
    title: 'Millfield Prep - Interactive Prospectus',
    url: 'https://www.millfieldschool.com/prospectus',
  }])

  assert.equal(
    rendered,
    '[Millfield Prep interactive prospectus](https://www.millfieldschool.com/prospectus)',
  )
})

test('Research Room route keeps the hybrid proof of concept environment-gated', async () => {
  const route = await readFile(
    new URL('../../app/api/nana-research/route.ts', import.meta.url),
    'utf8',
  )

  assert.match(route, /process\.env\.NANA_HYBRID_POC === ['"]on['"]/)
  assert.match(route, /runHybridWebResearchStream/)
  assert.match(route, /!useHybridPoc/)
})

test('response evidence deduplicates citations and counts only actual searches', () => {
  const response = {
    output: [
      {
        type: 'web_search_call',
        action: {
          type: 'search',
          query: 'Millfield prospectus',
          sources: [
            { type: 'url', url: 'https://www.millfieldschool.com/admissions' },
          ],
        },
      },
      {
        type: 'web_search_call',
        action: { type: 'open_page', url: 'https://www.millfieldschool.com/admissions' },
      },
      {
        type: 'message',
        content: [{
          type: 'output_text',
          text: 'Answer',
          annotations: [
            { type: 'url_citation', start_index: 0, end_index: 6, title: 'Admissions', url: 'https://www.millfieldschool.com/admissions' },
            { type: 'url_citation', start_index: 0, end_index: 6, title: 'Admissions', url: 'https://www.millfieldschool.com/admissions' },
          ],
        }],
      },
    ],
  }
  const evidence = extractResponseEvidence(response)
  assert.equal(evidence.searchCallCount, 1)
  assert.equal(evidence.citations.length, 1)
  assert.equal(evidence.consultedUrls.length, 1)
})

test('response evidence preserves repeated inline uses of the same source at different positions', () => {
  const response = {
    output: [{
      type: 'message',
      content: [{
        type: 'output_text',
        text: 'First source, then the same source again.',
        annotations: [
          { type: 'url_citation', start_index: 6, end_index: 12, title: 'School', url: 'https://school.example/a' },
          { type: 'url_citation', start_index: 28, end_index: 34, title: 'School', url: 'https://school.example/a' },
        ],
      }],
    }],
  }
  assert.equal(extractResponseEvidence(response).citations.length, 2)
})

test('source quality flags missing visible and official-school citations', () => {
  assert.deepEqual(
    buildSourceQualityIssues({
      searched: true,
      citations: [],
      anchors: [{
        slug: 'millfield-school',
        official_website: 'https://www.millfieldschool.com/',
      }],
    }),
    ['no_visible_web_citations', 'official_school_source_missing:millfield-school'],
  )
})

test('hybrid input labels prior conversation and database URLs as untrusted hints', () => {
  const input = buildHybridInput({
    question: 'yes, look it up',
    parentContext: 'Q: Millfield prospectus / A: I could not find it',
    anchors: [{
      slug: 'millfield-school',
      name: 'Millfield School',
      country: 'United Kingdom',
      official_website: 'https://www.millfieldschool.com/',
      prospectus_url: null,
    }],
    documentCandidates: [],
  })
  assert.match(input, /Untrusted conversation and family context/)
  assert.match(input, /identity anchors \(verify live before relying on them\)/)
  assert.match(input, /official_site=https:\/\/www\.millfieldschool\.com\//)
})

test('POC source never queries the sensitive-record table', async () => {
  const source = await import('node:fs/promises')
    .then(fs => fs.readFile(new URL('./hybrid-web-research.js', import.meta.url), 'utf8'))
  assert.doesNotMatch(source, /\.from\(['"]school_sensitive['"]\)/)
})

test('production link transport pins the validated DNS address into the socket lookup', async () => {
  const source = await import('node:fs/promises')
    .then(fs => fs.readFile(new URL('./hybrid-web-research.js', import.meta.url), 'utf8'))
  assert.match(source, /function requestPinnedPublicUrl/)
  assert.match(source, /\[\{ address: address\.address, family: address\.family \}\]/)
  assert.doesNotMatch(source, /fetchImpl = globalThis\.fetch/)
})

test('runner applies router settings, streams safe provisional prose, and returns cited evidence', async () => {
  const schoolRows = [{
    slug: 'millfield-school',
    name: 'Millfield School',
    country: 'United Kingdom',
    official_website: 'https://www.millfieldschool.com/',
    prospectus_url: null,
  }]
  const supabase = {
    from(table) {
      if (table === 'school_pdfs') {
        const query = {
          in() { return query },
          or() { return query },
          order() { return query },
          async limit() { return { data: [], error: null } },
        }
        return {
          select() { return query },
        }
      }
      assert.equal(table, 'schools')
      return {
        select() {
          return {
            async in() {
              return { data: schoolRows, error: null }
            },
          }
        },
      }
    },
  }

  const marker = 'citeturn0search0'
  const finalText = `Millfield confirms full boarding. ${marker}`
  const start = finalText.indexOf(marker)
  const finalResponse = {
    model: 'gpt-5.4-mini',
    output_text: finalText,
    usage: {
      input_tokens: 1000,
      input_tokens_details: { cached_tokens: 100, cache_write_tokens: 50 },
      output_tokens: 120,
      output_tokens_details: { reasoning_tokens: 20 },
      total_tokens: 1120,
    },
    output: [
      {
        type: 'web_search_call',
        action: {
          type: 'search',
          query: 'Millfield full boarding',
          sources: [{ type: 'url', url: 'https://www.millfieldschool.com/boarding' }],
        },
      },
      {
        type: 'message',
        content: [{
          type: 'output_text',
          text: finalText,
          annotations: [{
            type: 'url_citation',
            start_index: start,
            end_index: start + marker.length,
            title: 'Boarding at Millfield',
            url: 'https://www.millfieldschool.com/boarding',
          }],
        }],
      },
    ],
  }
  let capturedRequest = null
  const openaiClient = {
    responses: {
      stream(request) {
        capturedRequest = request
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: 'response.web_search_call.searching', item_id: 'ws_1' }
            yield { type: 'response.web_search_call.completed', item_id: 'ws_1' }
            yield { type: 'response.output_text.delta', delta: finalText }
          },
          async finalResponse() {
            return finalResponse
          },
        }
      },
    },
  }

  const events = []
  for await (const event of runHybridWebResearchStream(
    supabase,
    'Is Millfield full boarding?',
    {
      // Simulate a route caller that failed to supply the bare-name alias.
      // The POC must still recover Millfield before loading identity anchors.
      mentionedSlugs: [],
      shortlistSlugs: [],
      parentContext: null,
      userId: 'person@example.com',
      openaiClient,
      routerEnabled: true,
      env: {},
    },
  )) {
    events.push(event)
  }

  assert.equal(capturedRequest.model, 'gpt-5.4-mini')
  assert.equal(capturedRequest.max_output_tokens, 1800)
  assert.equal(capturedRequest.max_tool_calls, 3)
  assert.equal(capturedRequest.tools[0].search_context_size, 'low')
  assert.equal(capturedRequest.store, false)
  assert.equal(capturedRequest.tool_choice, 'required')
  assert.equal(capturedRequest.tools[0].type, 'web_search')
  assert.notEqual(capturedRequest.safety_identifier, 'person@example.com')
  assert.equal(events[0].type, 'answer_format')
  assert.ok(events.some(event => event.type === 'tool_call' && event.status === 'completed'))
  const streamedText = events
    .filter(event => event.type === 'token')
    .map(event => event.text)
    .join('')
  assert.equal(streamedText, 'Millfield confirms full boarding.')
  assert.doesNotMatch(streamedText, /cite|https?:\/\//)
  const final = events.at(-1)
  assert.equal(final.type, 'final')
  assert.match(final.payload.parsed.prose, /\[Boarding at Millfield\]\(https:\/\/www\.millfieldschool\.com\/boarding\)/)
  assert.equal(final.payload.parsed.hybrid_poc.search_calls, 1)
  assert.equal(final.payload.parsed.hybrid_poc.official_school_citation_count, 1)
  assert.equal(final.payload.parsed.hybrid_poc.model_tier, 'mini')
  assert.equal(final.payload.parsed.hybrid_poc.route_reason, 'single_focus_lookup')
  assert.equal(final.payload.usage.input_tokens, 850)
  assert.equal(final.payload.usage.cache_creation_input_tokens, 50)
  assert.equal(final.payload.cost.cost_search, 0.01)
  assert.ok(Math.abs(final.payload.cost.cost_cache_create - 0.0000375) < 1e-12)
})

test('exact Millfield possessive fee prompt resolves identity and returns validated BOT conversion', async () => {
  const question =
    'What are Millfield’s 2026–27 boarding fees? Show the annual GBP total and approximate THB conversion, including the exchange rate and date used.'
  const schoolRows = [{
    slug: 'millfield-school',
    name: 'Millfield School',
    country: 'United Kingdom',
    official_website: 'https://www.millfieldschool.com/',
    prospectus_url: null,
  }]
  const supabase = {
    from(table) {
      if (table === 'school_pdfs') {
        const query = {
          in() { return query },
          or() { return query },
          order() { return query },
          async limit() { return { data: [], error: null } },
        }
        return {
          select() { return query },
        }
      }
      assert.equal(table, 'schools')
      return {
        select() {
          return {
            async in(column, slugs) {
              assert.equal(column, 'slug')
              assert.deepEqual(slugs, ['millfield-school'])
              return { data: schoolRows, error: null }
            },
          }
        },
      }
    },
  }

  const marker = 'citeturn0search0'
  const ecbMarker = 'citeturn0search1'
  const finalText =
    `Millfield’s published 2026–27 boarding fee is £20,205 per term. ${marker}\n\n` +
    `Across 3 terms, the annual total is £60,615. ${marker}\n\n` +
    `Euro foreign exchange reference rates ${ecbMarker}\n\n` +
    'If you want, send me the FX rate you would like used and I will convert it.'
  const markerStarts = []
  for (let index = finalText.indexOf(marker); index >= 0; index = finalText.indexOf(marker, index + marker.length)) {
    markerStarts.push(index)
  }
  const annotations = markerStarts.map(start => ({
    type: 'url_citation',
    start_index: start,
    end_index: start + marker.length,
    title: 'Fees and currency information',
    url: 'https://www.millfieldschool.com/admissions/fees',
  }))
  annotations.push({
    type: 'url_citation',
    start_index: finalText.indexOf(ecbMarker),
    end_index: finalText.indexOf(ecbMarker) + ecbMarker.length,
    title: 'ECB',
    url: 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/',
  })
  const finalResponse = {
    model: 'gpt-5.4-mini',
    output_text: finalText,
    usage: {
      input_tokens: 1000,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens: 100,
    },
    output: [
      {
        type: 'web_search_call',
        action: {
          type: 'search',
          query: 'Millfield 2026-27 boarding fees',
          sources: [{
            type: 'url',
            url: 'https://www.millfieldschool.com/admissions/fees',
          }, {
            type: 'url',
            url: 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/',
          }],
        },
      },
      {
        type: 'message',
        content: [{
          type: 'output_text',
          text: finalText,
          annotations,
        }],
      },
    ],
  }
  const openaiClient = {
    responses: {
      stream() {
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: 'response.output_text.delta', delta: finalText }
          },
          async finalResponse() {
            return finalResponse
          },
        }
      },
    },
  }
  const botEndpoint = 'https://www.bot.or.th/rates.json'
  const fetchOrder = []
  const fetchImpl = async url => {
    fetchOrder.push(url)
    let body = '<html><title>Official source</title></html>'
    let contentType = 'text/html'
    if (url === 'https://www.bot.or.th/en/statistics/exchange-rate.html') {
      body = `<bot-statistics level1EndPoint="${botEndpoint}"></bot-statistics>`
    } else if (url === botEndpoint) {
      contentType = 'application/json'
      body = JSON.stringify({
        responseContent: [{
          period: '2026-07-23',
          currency_id: 'GBP',
          selling: '45.6153',
        }],
      })
    }
    return {
      status: 200,
      headers: {
        get(name) {
          if (name === 'content-type') return contentType
          if (name === 'content-length') return String(body.length)
          return null
        },
      },
      async text() { return body },
      body: { async cancel() {} },
    }
  }

  const events = []
  for await (const event of runHybridWebResearchStream(
    supabase,
    question,
    {
      mentionedSlugs: [],
      shortlistSlugs: [],
      parentContext: null,
      userId: 'person@example.com',
      openaiClient,
      routerEnabled: true,
      env: {},
      fetchImpl,
      dnsLookup: publicDnsLookup,
    },
  )) {
    events.push(event)
  }

  const streamedText = events
    .filter(event => event.type === 'token')
    .map(event => event.text)
    .join('')
  assert.doesNotMatch(streamedText, /FX rate|THB \d|https?:\/\//i)

  const final = events.at(-1)
  assert.equal(final.type, 'final')
  assert.deepEqual(final.payload.parsed.schoolsMentioned, ['millfield-school'])
  assert.equal(final.payload.parsed.hybrid_poc.currency_conversion, 'validated')
  assert.equal(final.payload.parsed.hybrid_poc.currency_rate.annual_gbp, 60_615)
  assert.equal(final.payload.parsed.hybrid_poc.currency_rate.approximate_thb, 2_764_971)
  assert.match(final.payload.parsed.prose, /THB 2,764,971/)
  assert.match(final.payload.parsed.prose, /45\.6153 THB per GBP/)
  assert.match(final.payload.parsed.prose, /23 July 2026/)
  assert.doesNotMatch(
    final.payload.parsed.prose,
    /FX rate|could not reliably identify|Euro foreign exchange|ecb\.europa/i,
  )
  assert.deepEqual(final.payload.parsed.validationIssues, [])
  assert.equal(final.payload.parsed.confidence, 'high')
  assert.equal(final.payload.parsed.hybrid_poc.official_school_citation_count, 1)
  assert.equal(
    final.payload.parsed.source_metadata[0].title,
    'Fees and currency information',
  )
  assert.ok(
    fetchOrder.indexOf('https://www.millfieldschool.com/admissions/fees') <
      fetchOrder.indexOf('https://www.bot.or.th/en/statistics/exchange-rate.html'),
  )
})

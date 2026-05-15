// Direct tests for validateAnswer's citationProvenance enforcement (Codex r3 P2).
// Builds tiny synthetic retrievals + provenance Maps to exercise:
//   1. claim-slug + URL-provenance mismatch fires
//   2. missing claim-slug + single-slug provenance fires by default
//   3. missing claim-slug + single-slug provenance + umbrellaComparisonChat
//      relaxation: fires when ANY source has a slug; fail-open when none do
//   4. multi-slug provenance (shared URL) fail-opens regardless
//   5. exact-or-prefix provenance lookup (Codex r3 P2)
//
// Run: node --test lib/server/nana-brain-validator.test.mjs
//
// This file deliberately avoids importing nana-brain.js (which pulls the
// LLM stack) by re-implementing the slice of validateAnswer logic under
// test. The implementation copy must stay byte-identical to the production
// branch in nana-brain.js (line 1499+); when one moves, both move.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// ── Production-equivalent slice of validateAnswer, copied verbatim ──
// from nana-brain.js. If you edit the production code, mirror it here.
function validateAnswerCitationsSlice(parsed, retrieval, opts = {}) {
  const issues = []
  if (Array.isArray(parsed.sources_used) && parsed.sources_used.length > 0) {
    const allowedUrls = new Set()
    const allowedPathsByHost = new Map()
    const addUrl = (url) => {
      if (!url) return
      allowedUrls.add(url)
      try {
        const u = new URL(url)
        if (!allowedPathsByHost.has(u.hostname)) allowedPathsByHost.set(u.hostname, new Set())
        allowedPathsByHost.get(u.hostname).add(u.pathname)
      } catch { /* ignore */ }
    }
    for (const c of (retrieval.chunks || []))            addUrl(c.source_url)
    for (const s of (retrieval.sensitive || []))         addUrl(s.source_url)
    for (const u of (retrieval.umbrella_sources || []))  addUrl(u.source_url)

    const normPath = (p) => (p === '/' ? '/' : p.replace(/\/+$/, ''))
    const isSameOrSub = (path, prefix) => {
      const b = normPath(prefix), p = normPath(path)
      return b === '/' || p === b || p.startsWith(b + '/')
    }

    if (opts.citationProvenance instanceof Map && opts.citationProvenance.size > 0) {
      const umbrellaComparisonChat = opts.umbrellaComparisonChat === true
      const anySlugPopulated = parsed.sources_used.some(
        (s) => typeof s.school_slug === 'string' && s.school_slug.length > 0,
      )
      for (const s of parsed.sources_used) {
        if (!s.source_url) continue
        const claimedSlug = typeof s.school_slug === 'string' ? s.school_slug : null

        let prov = opts.citationProvenance.get(s.source_url)
        if (!prov) {
          try {
            const citedUrl = new URL(s.source_url)
            for (const [provUrl, entry] of opts.citationProvenance.entries()) {
              try {
                const pUrl = new URL(provUrl)
                if (pUrl.hostname !== citedUrl.hostname) continue
                if (isSameOrSub(citedUrl.pathname, pUrl.pathname)) { prov = entry; break }
              } catch { /* skip */ }
            }
          } catch { /* skip */ }
        }
        if (!prov || !prov.slugs || prov.slugs.size === 0) continue

        if (claimedSlug && !prov.slugs.has(claimedSlug)) {
          issues.push(`sources_used cites slug "${claimedSlug}" but URL provenance is [${[...prov.slugs].join(', ')}]: ${s.source_url}`)
        } else if (!claimedSlug && prov.slugs.size === 1) {
          if (umbrellaComparisonChat && !anySlugPopulated) continue
          const owner = [...prov.slugs][0]
          issues.push(`sources_used omits school_slug for a school-specific URL (provenance: "${owner}"): ${s.source_url}`)
        }
      }
    }
  }
  return issues
}

// Allowlist URLs so the earlier guard doesn't fire and add unrelated noise.
const retrievalWithUmbrella = (urls) => ({
  chunks: [],
  sensitive: [],
  umbrella_sources: urls.map(u => ({ source_url: u })),
})

describe('validateAnswer citationProvenance — mismatch fires', () => {
  it('claim slug mismatches single-slug provenance → fires', () => {
    const url = 'https://www.etoncollege.com/fees'
    const prov = new Map([[url, { slugs: new Set(['eton-college']) }]])
    const parsed = { sources_used: [{ source_url: url, school_slug: 'harrow-school' }] }
    const issues = validateAnswerCitationsSlice(parsed, retrievalWithUmbrella([url]), {
      citationProvenance: prov, umbrellaComparisonChat: true,
    })
    assert.ok(issues.some(i => i.includes('cites slug "harrow-school"')))
  })

  it('claim slug matches one of multi-slug provenance → fails open', () => {
    const url = 'https://shared.example.com/x'
    const prov = new Map([[url, { slugs: new Set(['eton-college', 'harrow-school']) }]])
    const parsed = { sources_used: [{ source_url: url, school_slug: 'harrow-school' }] }
    const issues = validateAnswerCitationsSlice(parsed, retrievalWithUmbrella([url]), {
      citationProvenance: prov, umbrellaComparisonChat: true,
    })
    assert.deepEqual(issues, [])
  })
})

describe('validateAnswer citationProvenance — missing slug', () => {
  const url = 'https://www.etoncollege.com/fees'
  const prov = () => new Map([[url, { slugs: new Set(['eton-college']) }]])

  it('default (no umbrellaComparisonChat): missing slug + single-slug → fires (strict)', () => {
    const parsed = { sources_used: [{ source_url: url /* no school_slug */ }] }
    const issues = validateAnswerCitationsSlice(parsed, retrievalWithUmbrella([url]), {
      citationProvenance: prov(),
    })
    assert.ok(issues.some(i => i.includes('omits school_slug')))
  })

  it('umbrellaComparisonChat + no sibling source has slug → fails OPEN (LLM did not attempt contract)', () => {
    const parsed = { sources_used: [{ source_url: url /* no slug */ }] }
    const issues = validateAnswerCitationsSlice(parsed, retrievalWithUmbrella([url]), {
      citationProvenance: prov(), umbrellaComparisonChat: true,
    })
    assert.deepEqual(issues, [])
  })

  it('umbrellaComparisonChat + sibling source HAS slug → fires (partial population caught)', () => {
    const url2 = 'https://www.harrowschool.org.uk/x'
    const prov2 = new Map([
      [url,  { slugs: new Set(['eton-college']) }],
      [url2, { slugs: new Set(['harrow-school']) }],
    ])
    const parsed = {
      sources_used: [
        { source_url: url2, school_slug: 'harrow-school' },  // populated
        { source_url: url  /* missing */ },
      ],
    }
    const issues = validateAnswerCitationsSlice(parsed, retrievalWithUmbrella([url, url2]), {
      citationProvenance: prov2, umbrellaComparisonChat: true,
    })
    assert.ok(issues.some(i => i.includes('omits school_slug')))
  })
})

describe('validateAnswer citationProvenance — multi-slug fail-open', () => {
  it('shared URL with both host + target in provenance — no claim slug → fails open', () => {
    const url = 'https://shared.example.com/x'
    const prov = new Map([[url, { slugs: new Set(['harrow-school', 'eton-college']) }]])
    const parsed = { sources_used: [{ source_url: url /* no slug */ }] }
    const issues = validateAnswerCitationsSlice(parsed, retrievalWithUmbrella([url]), {
      citationProvenance: prov, umbrellaComparisonChat: true,
    })
    assert.deepEqual(issues, [])
  })
})

describe('validateAnswer citationProvenance — exact-or-prefix lookup (Codex r3 P2)', () => {
  it('cited subpath of a provenance URL is matched via path-prefix → mismatch still fires', () => {
    const provUrl = 'https://www.etoncollege.com/admissions'
    const citedUrl = 'https://www.etoncollege.com/admissions/fees'
    const prov = new Map([[provUrl, { slugs: new Set(['eton-college']) }]])
    const parsed = { sources_used: [{ source_url: citedUrl, school_slug: 'harrow-school' }] }
    // Allowlist the provUrl so the earlier URL guard accepts the subpath via
    // same-host path-prefix (existing behaviour at validateAnswer L1524).
    const issues = validateAnswerCitationsSlice(parsed, retrievalWithUmbrella([provUrl]), {
      citationProvenance: prov, umbrellaComparisonChat: true,
    })
    assert.ok(
      issues.some(i => i.includes('cites slug "harrow-school"')),
      'subpath citation should still be subject to provenance check',
    )
  })

  it('different-host citation with no provenance match → fail-open (no provenance fires)', () => {
    const provUrl = 'https://www.etoncollege.com/fees'
    const citedUrl = 'https://www.harrowschool.org.uk/different/path'
    const prov = new Map([[provUrl, { slugs: new Set(['eton-college']) }]])
    const parsed = { sources_used: [{ source_url: citedUrl, school_slug: 'harrow-school' }] }
    const issues = validateAnswerCitationsSlice(parsed, retrievalWithUmbrella([provUrl, citedUrl]), {
      citationProvenance: prov, umbrellaComparisonChat: true,
    })
    // Cited URL has no entry in provenance (different host). No fire.
    assert.deepEqual(issues, [])
  })
})

describe('validateAnswer citationProvenance — null Map (single-school chat)', () => {
  it('citationProvenance=null → check skipped entirely, no false positives', () => {
    const url = 'https://www.wellingtoncollege.org.uk/fees'
    const parsed = { sources_used: [{ source_url: url /* no slug */ }] }
    const issues = validateAnswerCitationsSlice(parsed, retrievalWithUmbrella([url]), {
      citationProvenance: null,
    })
    assert.deepEqual(issues, [])
  })

  it('citationProvenance=empty Map → check skipped (size > 0 guard)', () => {
    const url = 'https://www.wellingtoncollege.org.uk/fees'
    const parsed = { sources_used: [{ source_url: url }] }
    const issues = validateAnswerCitationsSlice(parsed, retrievalWithUmbrella([url]), {
      citationProvenance: new Map(),
    })
    assert.deepEqual(issues, [])
  })
})

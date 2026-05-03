/**
 * no-guess.js — provenance-first fact enforcement for the NanaSays pipeline.
 *
 * Core principle (from Codex design review 2026-04-24):
 *   LLM output is a proposal. Validation promotes it into data.
 *
 * Every numerical/factual leaf should carry its own structured evidence:
 *
 *   {
 *     "value":    <whatever>,
 *     "evidence": {
 *       "url":             "<cited source URL or null>",
 *       "quote":           "<verbatim supporting snippet or null>",
 *       "method":          "deterministic_counter" | "llm_extraction" | "pdf_extraction" | "manual",
 *       "count_rule":      "<for deterministic — e.g. 'unique TID anchors'>",
 *       "knowledge_id":    "<uuid of school_knowledge row, if applicable>",
 *       "retrieved_at":    "<ISO timestamp>"
 *     },
 *     "validation": {
 *       "status":            "pending" | "accepted" | "not_found" | "quote_mismatch" | "no_evidence" | "rejected",
 *       "quote_found":       true | false | null,
 *       "extractor_version": "<script-name>@<semver>"
 *     }
 *   }
 *
 * A null value is a first-class outcome (distinct from the field being
 * absent). `value: null` with `validation.status: 'not_found'` means
 * "we looked and didn't find one" — do NOT treat as "verified zero".
 *
 * Backwards compat: `readValue()` handles both the structured object and
 * legacy scalar values, so downstream code can migrate at its own pace.
 */

const EVIDENCE_METHODS = new Set(['deterministic_counter', 'llm_extraction', 'pdf_extraction', 'manual']);
const VALIDATION_STATUSES = new Set(['accepted', 'pending', 'not_found', 'quote_mismatch', 'no_evidence', 'rejected']);
const MIN_QUOTE_CHARS = 40;
const MIN_QUOTE_WORDS = 5;

// ── Normalization — shared by quote matching ────────────────────────────────

/**
 * Normalize text for quote-in-content comparison. Handles common sources of
 * false-mismatch: whitespace, case, smart quotes, currency formatting,
 * non-breaking spaces, HTML entities.
 */
export function normalizeText(s) {
  if (s == null) return '';
  return String(s)
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')        // zero-width chars
    .replace(/\u00ad/g, '')                       // soft hyphen
    .replace(/ /g, ' ')                    // nbsp → space
    .replace(/[‘’‚‛]/g, "'") // smart single quotes
    .replace(/[“”„‟]/g, '"') // smart double quotes
    .replace(/[–—−]/g, '-')             // en/em/minus dash → hyphen
    .replace(/[‐‑‒]/g, '-')             // hyphen variants → hyphen
    .replace(/&(?:nbsp|#160|#xa0);/gi, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&pound;/gi, '£')
    .replace(/&euro;/gi, '€')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/[–—−‐‑‒]/g, '-')                  // decoded dash variants
    .replace(/<[^>]+>/g, ' ')                    // strip any residual HTML
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Approximate substring match: does the normalized quote appear in the
 * normalized page content? Rejects short fragments to avoid common-text false
 * positives; callers should provide a substantive clause or sentence.
 */
export function quoteAppearsInContent(quote, content) {
  const q = normalizeText(quote);
  const c = normalizeText(content);
  const words = q.split(/\s+/).filter(Boolean);
  if (q.length < MIN_QUOTE_CHARS || words.length < MIN_QUOTE_WORDS) return false;
  return c.includes(q);
}

export function isProvenancedFact(v) {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return false;
  if (!Object.prototype.hasOwnProperty.call(v, 'value')) return false;
  if (!Object.prototype.hasOwnProperty.call(v, 'evidence')) return false;
  if (!v.validation || typeof v.validation !== 'object' || Array.isArray(v.validation)) return false;
  if (!VALIDATION_STATUSES.has(v.validation.status)) return false;
  if (v.evidence == null) return v.validation.status === 'not_found';
  if (typeof v.evidence !== 'object' || Array.isArray(v.evidence)) return false;
  return EVIDENCE_METHODS.has(v.evidence.method);
}

function requireNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} is required`);
  }
}

function rejectedProposal(proposal, status, reason) {
  return {
    value: null,
    evidence: proposal?.evidence && typeof proposal.evidence === 'object' && !Array.isArray(proposal.evidence)
      ? { ...proposal.evidence }
      : null,
    validation: {
      ...(proposal?.validation && typeof proposal.validation === 'object' && !Array.isArray(proposal.validation) ? proposal.validation : {}),
      status,
      quote_found: false,
      reason,
    },
  };
}

// ── Proposals — construct the structured evidence object ────────────────────

/**
 * Construct a proposal from a deterministic counter (no LLM involvement).
 * The URL and the count rule jointly prove the number is reproducible.
 */
export function proposeDeterministic(input = {}) {
  const { value, url, countRule, extractorVersion, method } = input;
  if (method && method !== 'deterministic_counter') {
    throw new TypeError(`proposeDeterministic cannot create method=${method}`);
  }
  if (value == null) throw new TypeError('value is required for deterministic proposals');
  requireNonEmptyString(url, 'url');
  requireNonEmptyString(countRule, 'countRule');
  requireNonEmptyString(extractorVersion, 'extractorVersion');
  return {
    value,
    evidence: {
      url,
      quote: null,
      method: 'deterministic_counter',
      count_rule: countRule,
      knowledge_id: null,
      retrieved_at: new Date().toISOString(),
    },
    validation: {
      status: 'accepted',
      quote_found: null,           // N/A for deterministic
      extractor_version: extractorVersion,
    },
  };
}

/**
 * Construct a proposal from an LLM extraction. Requires a verbatim `quote`
 * from the source page that supports the value. The quote is validated
 * against page content by `validateLlmProposal()` before this becomes data.
 */
export function proposeLlm({ value, url, quote, knowledgeId, extractorVersion }) {
  requireNonEmptyString(url, 'url');
  requireNonEmptyString(extractorVersion, 'extractorVersion');
  return {
    value,
    evidence: {
      url,
      quote,
      method: 'llm_extraction',
      count_rule: null,
      knowledge_id: knowledgeId || null,
      retrieved_at: new Date().toISOString(),
    },
    validation: {
      status: 'pending',           // must be promoted via validateLlmProposal
      quote_found: null,
      extractor_version: extractorVersion,
    },
  };
}

/**
 * A "nothing found" proposal. Distinguished from absent/unsearched: the
 * extractor looked, didn't find evidence, so the field is explicitly null.
 * Downstream consumers should treat this as "unknown", NOT "verified zero".
 */
export function proposeNotFound({ extractorVersion, reason = 'no evidence in crawled content' }) {
  requireNonEmptyString(extractorVersion, 'extractorVersion');
  return {
    value: null,
    evidence: null,
    validation: {
      status: 'not_found',
      quote_found: null,
      extractor_version: extractorVersion,
      reason,
    },
  };
}

// ── Validation — promote a proposal to accepted (or reject it) ──────────────

/**
 * Validate an LLM proposal against the page content we actually crawled.
 * Returns a new proposal object with updated validation fields. Does NOT
 * mutate the input.
 *
 * If the quote can't be verified, returns a rejected proposal with
 * `value: null` so downstream can't accidentally use the unsupported value.
 */
export function validateLlmProposal(proposal, pageContent) {
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) {
    return rejectedProposal(proposal, 'rejected', 'malformed proposal');
  }
  if (proposal.evidence?.method !== 'llm_extraction') {
    return proposal; // only LLM proposals need quote validation
  }
  if (!isProvenancedFact(proposal) || proposal.validation.status !== 'pending') {
    return rejectedProposal(proposal, 'rejected', 'malformed llm proposal');
  }
  const quote = proposal.evidence?.quote;
  if (!quote) {
    return {
      ...proposal,
      value: null,
      validation: { ...proposal.validation, status: 'no_evidence', quote_found: false },
    };
  }
  const found = quoteAppearsInContent(quote, pageContent);
  if (!found) {
    return {
      ...proposal,
      value: null,
      validation: { ...proposal.validation, status: 'quote_mismatch', quote_found: false },
    };
  }
  return {
    ...proposal,
    validation: { ...proposal.validation, status: 'accepted', quote_found: true },
  };
}

// ── Readers — backwards-compat helpers for consuming stored values ──────────

/**
 * Read the scalar value from either the new structured shape or a legacy
 * scalar. Lets UI + downstream code handle both during migration.
 *
 *   readValue(42)                                            → 42
 *   readValue({ value: 42, evidence: ... })                  → 42
 *   readValue({ value: null, validation: ... })              → null
 *   readValue(null)                                          → null
 *   readValue(undefined)                                     → null
 */
export function readValue(v) {
  if (v == null) return null;
  if (isProvenancedFact(v)) return v.value;
  return v;
}

/**
 * Read the evidence block from the structured shape; returns null for legacy
 * scalars (so callers can gracefully degrade to "no provenance available").
 */
export function readEvidence(v) {
  if (!isProvenancedFact(v)) return null;
  return v.evidence ?? null;
}

/**
 * Read the validation block; same degradation contract as readEvidence.
 */
export function readValidation(v) {
  if (!isProvenancedFact(v)) return null;
  return v.validation ?? null;
}

/**
 * True if the value is legacy scalar (no provenance attached).
 */
export function isLegacyScalar(v) {
  if (v == null) return false;
  if (isProvenancedFact(v)) return false;
  return typeof v !== 'object' || Array.isArray(v);
}

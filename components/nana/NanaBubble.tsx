'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { ResearchMessage, StreamFormat, ProposedAction } from '@/lib/nana/types'
// The bubble's classNames (dh-msg-nana, dh-msg-nana-prose, etc.) live in
// nana-bubble.css. Importing it here means anywhere NanaBubble is mounted
// gets the styles automatically — Research Room's right rail can embed
// the bubble without having to also import nana-bubble.css separately.
import './nana-bubble.css'

// Slice 3d phase 2: chat bubble + streaming helpers extracted from
// DecisionHub.tsx. Behaviour-preserving — same className contract
// (dh-msg-nana, dh-msg-nana-prose, etc. styled by nana-bubble.css), same
// section-by-section progressive extraction, same prose vs structured
// branching. DecisionHub imports NanaMsgBubble + helpers from here; the
// Research Room right rail (slice 3d phase 4) embeds NanaMsgBubble in a
// read-only configuration (no shareToken Link, no tour question affordance
// — controlled via props).

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Map internal tool names to parent-friendly labels for the progress log.
 * Used by both DecisionHub's tool-progress strip and (in phase 4) the
 * Research Room chat panel — exported here so both share one source.
 */
export function prettyToolName(name: string): string {
  switch (name) {
    case 'rankSchools':        return 'Ranking schools'
    case 'filterSchools':      return 'Filtering schools'
    case 'searchSchoolText':   return 'Searching school sites'
    case 'compareSchools':     return 'Comparing schools'
    case 'getSchoolFacts':     return 'Looking up school details'
    case 'searchSafeguarding': return 'Checking safeguarding records'
    default:                   return name
  }
}

/**
 * Pull a string field out of a partial JSON buffer as it streams.
 * Tolerates whitespace around the colon, decodes JSON escapes correctly,
 * and handles partial \uXXXX or trailing-backslash chunk boundaries.
 * Mirrors the implementation in NanaPanel.tsx — keep them in sync.
 */
export function extractStreamingField(buf: string, key: string): string {
  if (!buf) return ''
  const re = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`, 's')
  const m = buf.match(re)
  if (!m) return ''
  return decodeJsonString(m[1])
}

export function decodeJsonString(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c !== '\\') { out += c; continue }
    const n = s[i + 1]
    if (n === undefined) break
    if (n === 'u') {
      const hex = s.slice(i + 2, i + 6)
      if (hex.length < 4) break
      out += String.fromCharCode(parseInt(hex, 16))
      i += 5
      continue
    }
    switch (n) {
      case 'n':  out += '\n'; break
      case 't':  out += '\t'; break
      case 'r':  out += '\r'; break
      case 'b':  out += '\b'; break
      case 'f':  out += '\f'; break
      case '"':  out += '"';  break
      case '\\': out += '\\'; break
      case '/':  out += '/';  break
      default:   out += n;     break
    }
    i += 1
  }
  return out
}

/** Very simple inline markdown: bold, line breaks */
export function renderMd(text: unknown): React.ReactNode[] {
  let str: string
  if (typeof text === 'string') {
    str = text
  } else if (Array.isArray(text)) {
    str = text.map(item => `• ${typeof item === 'string' ? item : JSON.stringify(item)}`).join('\n')
  } else if (text != null) {
    str = JSON.stringify(text)
  } else {
    str = ''
  }
  if (!str) return []
  return str.split('\n').map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g)
    return (
      <span key={i}>
        {parts.map((p, j) =>
          p.startsWith('**') && p.endsWith('**')
            ? <strong key={j}>{p.slice(2, -2)}</strong>
            : <span key={j}>{p}</span>
        )}
        {i < str.split('\n').length - 1 && <br />}
      </span>
    )
  })
}

export function isSafeUrl(url: string): boolean {
  try { const u = new URL(url); return u.protocol === 'https:' || u.protocol === 'http:' }
  catch { return false }
}

// ── Confidence badge ─────────────────────────────────────────────────────

export function ConfidenceBadge({ level }: { level: string }) {
  const map: Record<string, [string, string]> = {
    high:   ['dh-conf--high',   'High confidence'],
    medium: ['dh-conf--medium', 'Medium confidence'],
    low:    ['dh-conf--low',    'Low confidence'],
    none:   ['dh-conf--none',   'No data'],
  }
  const [cls, label] = map[level] ?? ['', level]
  return <span className={`dh-conf-badge ${cls}`}>{label}</span>
}

// ── Bubble ───────────────────────────────────────────────────────────────

export interface NanaMsgBubbleProps {
  msg?:           ResearchMessage
  isStreaming?:   boolean
  streamBuf?:     string
  streamFormat?:  StreamFormat
  // Slice 5: when set, render the "+ Add as row" affordance for each
  // entry in parsed.proposed_actions and call this handler on click.
  // Returns { ok, code? } so the button can switch between pending /
  // added / error states without optimistic-flickering. Research Room
  // mounts this; Decision Hub leaves it undefined to keep the existing
  // surface unchanged.
  onConfirmAddRow?: (messageId: string, proposalId: string) => Promise<{ ok: boolean; code?: string }>
  // Slice 6: when set, render the "↻ Re-rank by …" pill for each
  // propose_re_rank entry. Click is purely client-side — no DB write,
  // no fetch — the consumer applies the view_spec as a sort/filter
  // overlay on the comparison table. Save-as-lens UX is commit 8.
  onApplyReRank?: (messageId: string, proposalId: string, viewSpec: import('@/lib/nana/types').ProposeViewSpec, label: string) => void
  // Slice 7: render "Add to partner brief" affordances for
  // propose_add_to_letter entries. Like add-row, confirmation is
  // pointer-only; the server re-reads the proposal from the message.
  onAddToLetter?: (messageId: string, proposalId: string) => Promise<{ ok: boolean; code?: string }>
}

export function NanaMsgBubble({
  msg,
  isStreaming,
  streamBuf,
  streamFormat,
  onConfirmAddRow,
  onApplyReRank,
  onAddToLetter,
}: NanaMsgBubbleProps) {
  const parsed = msg?.parsed as any
  const s = parsed?.sections ?? {}

  // ── Phase A: prose-mode render ──
  // Triggered by either: live stream marked as prose (intent router path), or
  // a finalised message persisted in prose_v1 format. Renders plain markdown
  // and the citation chips; skips the structured "Watch Out / What we don't
  // know" callouts entirely.
  const isProseMode =
    (isStreaming && streamFormat === 'prose') ||
    parsed?.format === 'prose_v1'

  if (isProseMode) {
    // During streaming streamBuf is the partial markdown. Strip any trailing
    // <!-- nana-meta ... start because renderMd treats text as plain spans
    // (not HTML), so the comment opener would otherwise be visible mid-stream
    // until the closing --> arrives. After final, parsed.prose is the
    // already-cleaned text from the runner.
    const rawProse = isStreaming
      ? (streamBuf || '')
      : (parsed?.prose || msg?.rawText || '')
    const proseText = isStreaming
      ? rawProse.replace(/<!--\s*nana-meta[\s\S]*$/i, '').trimEnd()
      : rawProse
    const citations: string[] = Array.isArray(parsed?.citations) ? parsed.citations : []

    return (
      <div className="dh-msg-nana">
        {proseText
          ? <div className="dh-msg-nana-prose">{renderMd(proseText)}</div>
          : (
            <div className="dh-skeleton">
              <div className="dh-skeleton-line dh-skeleton-line--80" />
              <div className="dh-skeleton-line dh-skeleton-line--60" />
            </div>
          )
        }
        {!isStreaming && citations.length > 0 && (
          <div className="dh-sources">
            {citations
              .filter(url => typeof url === 'string' && isSafeUrl(url))
              .slice(0, 6)
              .map((url, i) => {
                let label = 'source'
                try { label = new URL(url).hostname.replace(/^www\./, '') } catch {}
                return (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="dh-source-pill dh-source-pill--chat">
                    {label.slice(0, 40)} ↗
                  </a>
                )
              })}
          </div>
        )}
        {!isStreaming && msg?.id && (onConfirmAddRow || onApplyReRank || onAddToLetter) && parsed?.proposed_actions && (
          <ProposedActionsList
            messageId={msg.id}
            actions={parsed.proposed_actions}
            activeProposalIds={msg.activeProposalIds}
            activeLetterProposalIds={msg.activeLetterProposalIds}
            onConfirm={onConfirmAddRow}
            onApplyReRank={onApplyReRank}
            onAddToLetter={onAddToLetter}
          />
        )}
        {!isStreaming && msg?.shareToken && (
          <Link href={`/nana/answer/${msg.shareToken}`} className="dh-msg-share" target="_blank">
            Share ↗
          </Link>
        )}
      </div>
    )
  }

  // ── Structured render (legacy + agentic fallback) ──

  // Progressive extraction during streaming — pull each section out of the partial JSON
  // as it arrives, so the bubble fills in section-by-section instead of popping at the end.
  const live = isStreaming && streamBuf
    ? {
        short_answer:      extractStreamingField(streamBuf, 'short_answer'),
        confirmed_facts:   extractStreamingField(streamBuf, 'confirmed_facts'),
        what_this_means:   extractStreamingField(streamBuf, 'what_this_means'),
        tradeoff:          extractStreamingField(streamBuf, 'tradeoff'),
        what_we_dont_know: extractStreamingField(streamBuf, 'what_we_dont_know'),
      }
    : null

  // Resolve "best available" value for each section: live partial wins while streaming,
  // committed parsed value wins after final.
  const shortAnswer    = live?.short_answer      || s.short_answer       || ''
  const confirmedFacts = live?.confirmed_facts   || s.confirmed_facts    || ''
  const whatThisMeans  = live?.what_this_means   || s.what_this_means    || ''
  const tradeoff       = live?.tradeoff          || s.tradeoff           || ''
  const whatWeDontKnow = live?.what_we_dont_know || s.what_we_dont_know  || ''

  // Skeleton only while streaming AND we haven't even started receiving short_answer yet.
  const showSkeleton = isStreaming && !shortAnswer

  // Fallback: if parsing failed entirely, or sections are empty, render raw text so the
  // user always sees Nana's actual answer instead of a blank bubble.
  const renderedAnySection = !!(shortAnswer || confirmedFacts || whatThisMeans || tradeoff || whatWeDontKnow)
  const fallbackText = !isStreaming && !renderedAnySection
    ? (parsed?.answer_markdown || msg?.rawText || '')
    : ''

  return (
    <div className="dh-msg-nana">
      {shortAnswer && (
        <>
          <p className="dh-msg-nana-eyebrow">Short answer</p>
          <p className="dh-msg-nana-lead">{renderMd(shortAnswer)}</p>
        </>
      )}

      {!isStreaming && parsed?.confidence && <ConfidenceBadge level={parsed.confidence} />}

      {showSkeleton && (
        <div className="dh-skeleton">
          <div className="dh-skeleton-line dh-skeleton-line--80" />
          <div className="dh-skeleton-line dh-skeleton-line--60" />
          <div className="dh-skeleton-line dh-skeleton-line--90" />
        </div>
      )}

      {confirmedFacts && confirmedFacts !== 'Nothing to flag here.' && (
        <p className="dh-msg-nana-prose">{renderMd(confirmedFacts)}</p>
      )}

      {whatThisMeans && whatThisMeans !== 'Nothing to flag here.' && (
        <div className="dh-ans-section">
          <p className="dh-msg-nana-eyebrow">What this means</p>
          <p className="dh-msg-nana-prose">{renderMd(whatThisMeans)}</p>
        </div>
      )}

      {tradeoff && tradeoff !== 'Nothing to flag here.' && (
        <div className="dh-msg-nana-tradeoff">
          <p className="dh-msg-nana-tradeoff-label">⚠ Watch out</p>
          {renderMd(tradeoff)}
        </div>
      )}

      {whatWeDontKnow && whatWeDontKnow !== 'Nothing to flag here.' && (
        <div className="dh-ans-section dh-ans-section--dim">
          <p className="dh-msg-nana-eyebrow">What we don&apos;t know</p>
          <p className="dh-msg-nana-prose">{renderMd(whatWeDontKnow)}</p>
        </div>
      )}

      {fallbackText && (
        <div className="dh-ans-section">
          <p className="dh-msg-nana-prose">{renderMd(fallbackText)}</p>
        </div>
      )}

      {!isStreaming && msg?.parseError && (
        <div className="dh-msg-nana-tradeoff">
          <p className="dh-msg-nana-tradeoff-label">Heads up</p>
          <p className="dh-msg-nana-prose">
            Nana&apos;s answer didn&apos;t come back in the expected shape, so the structured callouts (sources, tour question) may be missing.
          </p>
        </div>
      )}

      {!isStreaming && parsed?.tour_question && (
        <div className="dh-msg-nana-tour">
          <p className="dh-msg-nana-tour-label">Tour question</p>
          <p className="dh-msg-nana-tour-q">&ldquo;{parsed.tour_question}&rdquo;</p>
        </div>
      )}

      {!isStreaming && parsed?.sources_used && parsed.sources_used.length > 0 && (
        <div className="dh-sources">
          {parsed.sources_used
            .filter((s: any) => s.source_url && s.section_label && isSafeUrl(s.source_url))
            .slice(0, 6)
            .map((s: any, i: number) => (
              <a key={i} href={s.source_url} target="_blank" rel="noopener noreferrer" className="dh-source-pill dh-source-pill--chat">
                {s.section_label.slice(0, 40)} ↗
              </a>
            ))}
        </div>
      )}

      {!isStreaming && msg?.id && (onConfirmAddRow || onApplyReRank || onAddToLetter) && parsed?.proposed_actions && (
        <ProposedActionsList
          messageId={msg.id}
          actions={parsed.proposed_actions}
          activeProposalIds={msg.activeProposalIds}
          activeLetterProposalIds={msg.activeLetterProposalIds}
          onConfirm={onConfirmAddRow}
          onApplyReRank={onApplyReRank}
          onAddToLetter={onAddToLetter}
        />
      )}
      {!isStreaming && msg?.shareToken && (
        <Link href={`/nana/answer/${msg.shareToken}`} className="dh-msg-share" target="_blank">
          Share ↗
        </Link>
      )}
    </div>
  )
}

// ── Proposed actions ────────────────────────────────────────────────────
// Slice 5: render one "+ Add as row" affordance per proposal Nana emits.
// Slice 5-FU2: button "Added" state is now derived from server truth
// (msg.activeProposalIds) instead of local click history. So × removing a
// row in the comparison table flips this button back to "+ Add" after
// router.refresh(), and re-clicking auto-restores via confirm_add_row's
// idempotency match. Local override only spans the in-flight request.

function ProposedActionsList({
  messageId,
  actions,
  activeProposalIds,
  activeLetterProposalIds,
  onConfirm,
  onApplyReRank,
  onAddToLetter,
}: {
  messageId:          string
  actions:            Record<string, ProposedAction>
  activeProposalIds?: string[]
  activeLetterProposalIds?: string[]
  onConfirm?:         (messageId: string, proposalId: string) => Promise<{ ok: boolean; code?: string }>
  onApplyReRank?:     (messageId: string, proposalId: string, viewSpec: import('@/lib/nana/types').ProposeViewSpec, label: string) => void
  onAddToLetter?:     (messageId: string, proposalId: string) => Promise<{ ok: boolean; code?: string }>
}) {
  // Slice 6: kind-aware dispatch. add_row keeps the existing pill/flow;
  // re_rank gets a new ↻ pill that triggers a pure client-state apply.
  // create_lens proposals are filtered out for now — UI lands in commit 8.
  const allEntries = Object.entries(actions ?? {})
  const addRowEntries = onConfirm
    ? allEntries.filter(
        (e): e is [string, ProposedAction & { kind: 'propose_add_row' }] =>
          e[1] && e[1].kind === 'propose_add_row',
      )
    : []
  const reRankEntries = onApplyReRank
    ? allEntries.filter(
        (e): e is [string, ProposedAction & { kind: 'propose_re_rank' }] =>
          e[1] && e[1].kind === 'propose_re_rank',
      )
    : []
  const addToLetterEntries = onAddToLetter
    ? allEntries.filter(
        (e): e is [string, ProposedAction & { kind: 'propose_add_to_letter' }] =>
          e[1] && e[1].kind === 'propose_add_to_letter',
      )
    : []
  if (addRowEntries.length === 0 && reRankEntries.length === 0 && addToLetterEntries.length === 0) return null

  const activeSet       = new Set(activeProposalIds ?? [])
  const activeLetterSet = new Set(activeLetterProposalIds ?? [])
  const kindsShown =
    (addRowEntries.length > 0 ? 1 : 0) +
    (reRankEntries.length > 0 ? 1 : 0) +
    (addToLetterEntries.length > 0 ? 1 : 0)
  const eyebrow = kindsShown > 1
    ? 'Try one of these?'
    : addRowEntries.length > 0
      ? 'Add to your comparison?'
      : reRankEntries.length > 0
        ? 'Try a different ranking?'
        : 'Add to your partner brief?'

  return (
    <div className="rr-proposed-actions">
      <p className="rr-proposed-eyebrow">{eyebrow}</p>
      <div className="rr-proposed-list">
        {addRowEntries.map(([proposalId, action]) => (
          <ProposedActionButton
            key={proposalId}
            label={action.row_name}
            group={action.group_name}
            isActiveInTable={activeSet.has(proposalId)}
            onClick={() => onConfirm!(messageId, proposalId)}
          />
        ))}
        {reRankEntries.map(([proposalId, action]) => (
          <ReRankButton
            key={proposalId}
            label={action.label}
            rationale={action.rationale}
            onClick={() => onApplyReRank!(messageId, proposalId, action.view_spec, action.label)}
          />
        ))}
        {addToLetterEntries.map(([proposalId, action]) => (
          <AddToLetterButton
            key={proposalId}
            label={action.label}
            section={action.section}
            isActiveInBrief={activeLetterSet.has(proposalId)}
            onClick={() => onAddToLetter!(messageId, proposalId)}
          />
        ))}
      </div>
    </div>
  )
}

// Slice 6 — re-rank pill. No async, no fetch, no state — clicks fire
// the parent's apply-overlay callback synchronously. The parent owns
// the ephemeral view state so two clicks on different re-rank pills in
// different chat answers replace each other (last-click-wins). Save-as-
// lens affordance lives in the comparison header (commit 8), not here.
function ReRankButton({
  label,
  rationale,
  onClick,
}: {
  label:     string
  rationale?: string
  onClick:    () => void
}) {
  return (
    <button
      type="button"
      className="rr-proposed-btn rr-proposed-btn--rerank"
      onClick={onClick}
      title={rationale ? `${label} — ${rationale}` : label}
    >
      <span className="rr-proposed-btn-icon" aria-hidden="true">↻</span>
      <span className="rr-proposed-btn-label">{label}</span>
    </button>
  )
}

function letterSectionLabel(section: string): string {
  switch (section) {
    case 'opening':        return 'Opening'
    case 'why_it_matters': return 'Why it matters'
    case 'tradeoffs':      return 'Tradeoffs'
    case 'questions':      return 'Questions'
    case 'next_step':      return 'Next step'
    default:               return 'Partner brief'
  }
}

type LocalOverride = 'pending' | 'optimistic-added' | 'error' | null

function AddToLetterButton({
  label,
  section,
  isActiveInBrief,
  onClick,
}: {
  label:           string
  section:         string
  isActiveInBrief: boolean
  onClick:         () => Promise<{ ok: boolean; code?: string }>
}) {
  const [override, setOverride] = useState<LocalOverride>(null)

  async function handle() {
    if (override === 'pending') return
    if (override === 'optimistic-added' || isActiveInBrief) return
    setOverride('pending')
    const result = await onClick()
    setOverride(result.ok ? 'optimistic-added' : 'error')
  }

  useEffect(() => {
    if (override === 'optimistic-added' && isActiveInBrief) {
      setOverride(null)
    }
  }, [override, isActiveInBrief])

  const isPending = override === 'pending'
  const isError   = override === 'error'
  const isAdded   = !isPending && !isError && (override === 'optimistic-added' || isActiveInBrief)
  const group     = letterSectionLabel(section)

  return (
    <button
      type="button"
      className={`rr-proposed-btn rr-proposed-btn--letter${isAdded ? ' is-added' : ''}${isError ? ' is-error' : ''}${isPending ? ' is-pending' : ''}`}
      onClick={handle}
      disabled={isPending || isAdded}
      title={isAdded ? `${group} — already in your partner brief` : `${group} · ${label}`}
    >
      <span className="rr-proposed-btn-icon" aria-hidden="true">
        {isAdded ? '✓' : isPending ? '…' : isError ? '!' : '+'}
      </span>
      <span className="rr-proposed-btn-label">
        {isAdded ? 'Added to brief' : isPending ? 'Adding…' : isError ? 'Try again' : label}
      </span>
      <span className="rr-proposed-btn-group">{group}</span>
    </button>
  )
}

function ProposedActionButton({
  label,
  group,
  isActiveInTable,
  onClick,
}: {
  label:           string
  group:           string
  isActiveInTable: boolean
  onClick:         () => Promise<{ ok: boolean; code?: string }>
}) {
  // The base "is this row in the table right now?" state is server-driven
  // (isActiveInTable). The local override covers the in-flight click AND
  // the brief gap between fetch resolving and router.refresh() landing —
  // without 'optimistic-added' the button briefly flashes back to grey "+"
  // before the new server prop arrives.
  const [override, setOverride] = useState<LocalOverride>(null)

  async function handle() {
    if (override === 'pending') return
    // Codex investigation finding (post round-5): a green ✓ Added button
    // can come from EITHER (a) the proposal's own chat row being active
    // via idempotency_key match, OR (b) any active row of the session
    // having the same row_name (name-match polish). In case (b),
    // re-clicking would hit the route's F1 cross-lens block → 409 →
    // button flips green→red "Try again". Users perceive that visual
    // jolt as "the row was removed" even though nothing was deleted.
    //
    // Fix: make ✓ Added inert. The auto-restore-via-re-click path that
    // motivated the original clickable-when-added behaviour fires from
    // the grey + Add state (after × removes the row, isActiveInTable
    // flips false → button greys → click works → confirm_add_row
    // auto-restores). So nothing of value is lost by this guard.
    if (override === 'optimistic-added' || isActiveInTable) return
    setOverride('pending')
    const result = await onClick()
    setOverride(result.ok ? 'optimistic-added' : 'error')
  }

  // Once the prop reflects the row is active, drop the optimistic marker.
  // Server is now the single source of truth — no need for the override.
  useEffect(() => {
    if (override === 'optimistic-added' && isActiveInTable) {
      setOverride(null)
    }
  }, [override, isActiveInTable])

  const isPending = override === 'pending'
  const isError   = override === 'error'
  const isAdded   = !isPending && !isError && (override === 'optimistic-added' || isActiveInTable)

  return (
    <button
      type="button"
      className={`rr-proposed-btn${isAdded ? ' is-added' : ''}${isError ? ' is-error' : ''}${isPending ? ' is-pending' : ''}`}
      onClick={handle}
      // Disable while pending OR added — added is now inert (see handle()).
      // The grey + Add state stays clickable as the only path that can
      // create or auto-restore a chat row.
      disabled={isPending || isAdded}
      title={isAdded ? `${group} · ${label} — already in your comparison` : `${group} · ${label}`}
    >
      <span className="rr-proposed-btn-icon" aria-hidden="true">
        {isAdded ? '✓' : isPending ? '…' : isError ? '!' : '+'}
      </span>
      <span className="rr-proposed-btn-label">
        {isAdded ? 'Added' : isPending ? 'Adding…' : isError ? 'Try again' : label}
      </span>
      <span className="rr-proposed-btn-group">{group}</span>
    </button>
  )
}

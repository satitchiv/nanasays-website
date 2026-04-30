'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import './decision-hub.css'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParsedSections {
  short_answer?: string
  confirmed_facts?: string
  what_this_means?: string
  tradeoff?: string
  what_we_dont_know?: string
  sources?: string
  you_might_also_ask?: string
}

interface SourceUsed {
  section_id: string
  section_label: string
  source_url: string
  source_type: string
}

interface ParsedAnswer {
  sections: ParsedSections
  confidence: 'high' | 'medium' | 'low' | 'none'
  follow_ups?: string[]
  tour_question?: string | null
  tour_target?: string | null
  sources_used?: SourceUsed[]
  recommended_schools?: RecommendedSchool[]
}

interface RecommendedSchool {
  slug: string
  name: string
  why: string
  concern?: string
}

interface ResearchMessage {
  id: string
  question: string
  parsed: ParsedAnswer | null
  shareToken?: string
  createdAt: string
}

interface DecisionSummary {
  what_we_know: string[]
  outstanding_questions: string[]
  signals: 'positive' | 'mixed' | 'negative' | 'insufficient'
  one_liner: string
}

interface Session {
  id: string
  title: string | null
  summary: DecisionSummary | null
  created_at: string
  last_active_at: string
}

interface ShortlistedSchool {
  school_slug: string
  school_name: string
  fees_min?: number | null
  fees_max?: number | null
  fees_currency?: string | null
}

interface ExamResults {
  a_level?: { pct_a_star?: number | null; pct_a_star_a?: number | null; notes?: string | null } | null
  gcse?: { pct_7_to_9?: number | null; pct_9?: number | null; notes?: string | null } | null
}

interface FeeRow {
  phase: string
  per_year?: number | null
  per_term?: number | null
}

interface VerdictLight {
  label: string
  value: string
  status: 'green' | 'amber' | 'red'
}

interface ReportVerdict {
  lights?: VerdictLight[]
  headline?: string
  best_fit_for?: string
  harder_fit_for?: string
}

interface SchoolStructuredData {
  school_slug: string
  exam_results?: ExamResults | null
  fees_by_grade?: { rows?: FeeRow[]; currency?: string } | null
  fees_min?: number | null
  fees_max?: number | null
  fees_currency?: string | null
  sports_profile?: Record<string, unknown> | null
  report_verdict?: ReportVerdict | null
  university_destinations?: Record<string, unknown> | null
}

interface ParentProfile {
  child_year?: string | null
  boarding_pref?: string | null
  budget_range?: string | null
  top_priority?: string | null
  home_region?: string | null
  onboarding_complete?: boolean
}

interface Props {
  profile: ParentProfile | null
  shortlist: ShortlistedSchool[]
  structuredData: SchoolStructuredData[]
  initialSession: Session | null
  initialMessages: any[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Pull a string field out of a partial JSON buffer as it streams */
function extractStreamingField(buf: string, key: string): string {
  const marker = `"${key}":`
  const idx = buf.indexOf(marker)
  if (idx === -1) return ''
  const after = buf.slice(idx + marker.length).trimStart()
  if (!after.startsWith('"')) return ''
  let result = ''
  let i = 1
  while (i < after.length) {
    const ch = after[i]
    if (ch === '\\' && i + 1 < after.length) { result += after[i + 1]; i += 2; continue }
    if (ch === '"') break
    result += ch; i++
  }
  return result
}

/** Very simple inline markdown: bold, line breaks */
function renderMd(text: unknown): React.ReactNode[] {
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

// ── Check card data ───────────────────────────────────────────────────────────

interface CheckCard {
  id: string
  color: 'green' | 'amber' | 'grey'
  icon: '✓' | '!' | '—'
  title: string
  evidence: string
  whatWeKnow?: string[]
  whatThisMeans?: string
  tradeoff?: string
  whatWeDontKnow?: string
  tourQuestion?: string
  tourTarget?: string
  source?: string
}

function lightToColor(status: string): CheckCard['color'] {
  if (status === 'green') return 'green'
  if (status === 'amber') return 'amber'
  return 'grey'
}
function lightToIcon(status: string): CheckCard['icon'] {
  if (status === 'green') return '✓'
  if (status === 'amber') return '!'
  return '—'
}

function getRealChecks(
  school: ShortlistedSchool,
  sData: SchoolStructuredData | undefined,
): CheckCard[] {
  const cards: CheckCard[] = []

  // ── Fees card ──────────────────────────────────────────────────────────────
  const feeRows = sData?.fees_by_grade?.rows ?? []
  const boardingRow = feeRows.find(r => r.phase?.toLowerCase().includes('boarding'))
  const cur = sData?.fees_currency ?? school.fees_currency ?? 'GBP'
  const sym = cur === 'GBP' ? '£' : cur + ' '
  const feeEvidence = boardingRow?.per_year
    ? `Full boarding: ${sym}${boardingRow.per_year.toLocaleString()}/yr`
    : school.fees_min
    ? `From ${sym}${school.fees_min.toLocaleString()}/yr`
    : 'Fees not published'
  const feeKnow = feeRows.length > 0
    ? feeRows.map(r => `${r.phase}: ${sym}${(r.per_year ?? 0).toLocaleString()}/yr`)
    : school.fees_min
    ? [`From ${sym}${school.fees_min.toLocaleString()}/yr`]
    : []

  cards.push({
    id: 'fees',
    color: school.fees_min ? 'green' : 'grey',
    icon: school.fees_min ? '✓' : '—',
    title: 'Fees within range',
    evidence: feeEvidence,
    whatWeKnow: feeKnow,
    tradeoff: 'Extras — trips, music, laundry — commonly add 8–12% on top of published fees. Ask for a cost-of-attendance estimate.',
    tourQuestion: "Can you give a full cost-of-attendance estimate including typical extras, and your policy on fee increases during a child's time at the school?",
    tourTarget: 'Ask: Bursar or admissions',
  })

  // ── Lights from report_verdict ─────────────────────────────────────────────
  const lights = sData?.report_verdict?.lights ?? []
  for (const light of lights) {
    const id = light.label.toLowerCase().replace(/\s+/g, '-')
    const card: CheckCard = {
      id,
      color: lightToColor(light.status),
      icon: lightToIcon(light.status),
      title: light.label,
      evidence: light.value,
    }
    // Enrich academic strength with real exam data
    if (id === 'academic-strength') {
      const al = sData?.exam_results?.a_level
      const gc = sData?.exam_results?.gcse
      const know: string[] = []
      if (al?.pct_a_star_a != null) know.push(`A*–A at A-level: ${al.pct_a_star_a}%`)
      if (al?.pct_a_star != null)   know.push(`A* at A-level: ${al.pct_a_star}%`)
      if (al?.notes)                know.push(al.notes.slice(0, 120))
      if (gc?.pct_7_to_9 != null)   know.push(`Grades 7–9 at GCSE: ${gc.pct_7_to_9}%`)
      if (gc?.notes)                know.push(gc.notes.slice(0, 120))
      if (know.length) card.whatWeKnow = know
      card.tourQuestion = 'What were your Oxbridge and Russell Group outcomes by subject last year, and what structured support exists for competitive applications?'
      card.tourTarget = 'Ask: Head of sixth form'
    }
    if (id === 'financial-health') {
      card.tourQuestion = 'Has the school taken on any new debt or capital commitments in the past two years?'
      card.tourTarget = 'Ask: Bursar'
    }
    if (id === 'safeguarding') {
      card.tourQuestion = 'How is safeguarding reported to parents, and what is the process if a concern is raised?'
      card.tourTarget = 'Ask: Head of boarding or DSL'
    }
    cards.push(card)
  }

  // ── Fallback if no lights ──────────────────────────────────────────────────
  if (lights.length === 0) {
    cards.push({
      id: 'data',
      color: 'grey',
      icon: '—',
      title: 'Detailed checks',
      evidence: 'Full report data not yet generated for this school',
    })
  }

  return cards
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CheckCardRow({
  card,
  expanded,
  onToggle,
}: {
  card: CheckCard
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div
      className={`dh-check-card dh-check-card--${card.color}${expanded ? ' dh-check-card--expanded' : ''}`}
      onClick={card.color !== 'grey' ? onToggle : undefined}
      role={card.color !== 'grey' ? 'button' : undefined}
    >
      <div className="dh-check-summary">
        <div className={`dh-check-icon dh-check-icon--${card.color}`}>{card.icon}</div>
        <div className="dh-check-text">
          <p className="dh-check-title">{card.title}</p>
          <p className="dh-check-evidence"
            style={card.color === 'grey' ? { fontStyle: 'italic', opacity: .35 } : undefined}
          >{card.evidence}</p>
        </div>
        {card.color !== 'grey' && (
          <span className="dh-check-chevron">{expanded ? '▲' : '▼'}</span>
        )}
        {card.color === 'grey' && (
          <span className="dh-check-chevron" style={{ opacity: .15 }}>▼</span>
        )}
      </div>
      {expanded && card.color !== 'grey' && (
        <div className="dh-check-body">
          {card.whatWeKnow && (
            <div className="dh-ans-section">
              <p className="dh-ans-eyebrow">What we know</p>
              <ul className="dh-ans-bullets">
                {card.whatWeKnow.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          )}
          {card.whatThisMeans && (
            <div className="dh-ans-section">
              <p className="dh-ans-eyebrow">What this means</p>
              <p className="dh-ans-lead">{card.whatThisMeans}</p>
            </div>
          )}
          {card.tradeoff && (
            <div className="dh-ans-tradeoff">
              <p className="dh-ans-eyebrow dh-ans-eyebrow--amber">⚠ Tradeoff / watch out</p>
              <p className="dh-ans-prose">{card.tradeoff}</p>
            </div>
          )}
          {card.whatWeDontKnow && (
            <div className="dh-ans-section">
              <p className="dh-ans-eyebrow" style={{ opacity: .3 }}>What we don&apos;t know</p>
              <p className="dh-ans-dim">{card.whatWeDontKnow}</p>
            </div>
          )}
          {card.tourQuestion && (
            <div className="dh-ans-tour">
              <p className="dh-ans-tour-q">&ldquo;{card.tourQuestion}&rdquo;</p>
              {card.tourTarget && <p className="dh-ans-tour-target">{card.tourTarget}</p>}
            </div>
          )}
          {card.source && (
            <span className="dh-source-pill">↗ {card.source}</span>
          )}
        </div>
      )}
    </div>
  )
}

// ── VerdictView ───────────────────────────────────────────────────────────────

function VerdictView({
  activeSchool,
  shortlist,
  structuredData,
  profile,
  onChangeSchool,
  onOpenModal,
}: {
  activeSchool: ShortlistedSchool | null
  shortlist: ShortlistedSchool[]
  structuredData: SchoolStructuredData[]
  profile: ParentProfile | null
  onChangeSchool: () => void
  onOpenModal: () => void
}) {
  const [expandedCardId, setExpandedCardId] = useState<string | null>('fees')
  const sData = structuredData.find(d => d.school_slug === activeSchool?.school_slug)
  const checks = activeSchool ? getRealChecks(activeSchool, sData) : []
  const greenCount = checks.filter(c => c.color === 'green').length
  const amberCount = checks.filter(c => c.color === 'amber').length
  const greyCount  = checks.filter(c => c.color === 'grey').length

  const profileText = [
    profile?.boarding_pref ?? 'Boarding',
    profile?.top_priority ?? 'Academic ambition',
    profile?.budget_range ? `Budget: ${profile.budget_range}` : null,
    'Shortlisting stage',
  ].filter(Boolean).join(' · ')

  return (
    <div className="dh-workspace-scroll">
      <div className="dh-ws-school-header">
        <div>
          <p className="dh-ws-eyebrow">Stress-testing your shortlist</p>
          <h1 className="dh-ws-school-name">{activeSchool?.school_name ?? 'Your shortlisted school'}</h1>
        </div>
        {shortlist.length > 1 && (
          <button className="dh-ws-change-btn" onClick={onChangeSchool}>Change school</button>
        )}
      </div>

      <button className="dh-profile-pill" onClick={onOpenModal}>
        <span className="dh-profile-pill-dot" />
        Checks personalised for: {profileText}
        <span style={{ opacity: .6, marginLeft: 2 }}>· Edit</span>
      </button>

      <div className="dh-verdict-bar">
        {greenCount > 0 && <div className="dh-verdict-seg--green" style={{ flex: greenCount }} />}
        {amberCount > 0 && <div className="dh-verdict-seg--amber" style={{ flex: amberCount }} />}
        {greyCount > 0  && <div className="dh-verdict-seg--grey"  style={{ flex: greyCount }} />}
      </div>
      <div className="dh-verdict-labels">
        {greenCount > 0 && (
          <span className="dh-verdict-label dh-verdict-label--green">
            <span className="dh-verdict-dot" />{greenCount} holding up
          </span>
        )}
        {amberCount > 0 && (
          <span className="dh-verdict-label dh-verdict-label--amber">
            <span className="dh-verdict-dot" />{amberCount} to watch
          </span>
        )}
        {greyCount > 0 && (
          <span className="dh-verdict-label dh-verdict-label--grey">
            <span className="dh-verdict-dot" />{greyCount} limited data
          </span>
        )}
      </div>

      <div className="dh-checks-list">
        {checks.map(card => (
          <CheckCardRow
            key={card.id}
            card={card}
            expanded={expandedCardId === card.id}
            onToggle={() => setExpandedCardId(expandedCardId === card.id ? null : card.id)}
          />
        ))}
      </div>

      <div className="dh-honest-read">
        <p className="dh-honest-read-eyebrow">Nana&apos;s honest read</p>
        <p className="dh-honest-read-body">
          {sData?.report_verdict?.headline
            ?? (activeSchool
              ? `Ask Nana in the panel on the right to dig deeper on any specific question about ${activeSchool.school_name}.`
              : 'Add schools to your shortlist to see a personalised verdict.')}
        </p>
      </div>
    </div>
  )
}

// ── CompareView ───────────────────────────────────────────────────────────────

function CompareView({
  shortlist,
  structuredData,
  profile,
  onOpenModal,
  onOpenReport,
}: {
  shortlist: ShortlistedSchool[]
  structuredData: SchoolStructuredData[]
  profile: ParentProfile | null
  onOpenModal: () => void
  onOpenReport: (slug: string, name: string) => void
}) {
  const priorities = [
    profile?.top_priority ?? 'Academic ambition',
    profile?.boarding_pref ? 'Boarding' : null,
    profile?.budget_range  ? 'Budget' : null,
    'ISI Rating',
  ].filter(Boolean) as string[]

  function getStructured(slug: string): SchoolStructuredData | undefined {
    return structuredData.find(d => d.school_slug === slug)
  }

  function hasDeepData(slug: string): boolean {
    const d = getStructured(slug)
    return !!(d?.exam_results || d?.report_verdict || d?.sports_profile)
  }

  function getALevel(slug: string): string {
    const d = getStructured(slug)
    const al = d?.exam_results?.a_level
    if (!al) return '—'
    if (al.pct_a_star_a != null) return `${al.pct_a_star_a}% A*–A`
    if (al.notes) return al.notes.slice(0, 35)
    return '—'
  }

  function getGCSE(slug: string): string {
    const d = getStructured(slug)
    const gc = d?.exam_results?.gcse
    if (!gc) return '—'
    if (gc.pct_7_to_9 != null) return `${gc.pct_7_to_9}% 7–9`
    if (gc.notes) return gc.notes.slice(0, 35)
    return '—'
  }

  function getSafeguarding(slug: string): string {
    const d = getStructured(slug)
    const lights = d?.report_verdict?.lights ?? []
    const safe = lights.find(l => l.label === 'Safeguarding')
    return safe?.value ?? '—'
  }

  function getFinancialHealth(slug: string): string {
    const d = getStructured(slug)
    const lights = d?.report_verdict?.lights ?? []
    const fin = lights.find(l => l.label === 'Financial health')
    return fin?.value ?? '—'
  }

  function getBoardingFees(school: ShortlistedSchool): string {
    const d = getStructured(school.school_slug)
    const boardingRow = d?.fees_by_grade?.rows?.find(r => r.phase?.toLowerCase().includes('boarding'))
    const cur = d?.fees_currency ?? 'GBP'
    const sym = cur === 'GBP' ? '£' : cur + ' '
    if (boardingRow?.per_year) return `${sym}${boardingRow.per_year.toLocaleString()}/yr`
    if (school.fees_min) return `${sym}${school.fees_min.toLocaleString()}/yr`
    return '—'
  }

  // Build row definitions driven by priorities
  const rows: Array<{ label: string; getValue: (school: ShortlistedSchool) => string }> = []

  if (priorities.includes('Academic ambition')) {
    rows.push(
      { label: 'A*–A at A-level', getValue: s => getALevel(s.school_slug) },
      { label: 'Grades 7–9 at GCSE', getValue: s => getGCSE(s.school_slug) },
    )
  }
  rows.push(
    { label: 'Boarding fees/year', getValue: s => getBoardingFees(s) },
    { label: 'Safeguarding', getValue: s => getSafeguarding(s.school_slug) },
    { label: 'Financial health', getValue: s => getFinancialHealth(s.school_slug) },
  )

  const displaySchools = shortlist.slice(0, 5)

  return (
    <div className="dh-matrix-view">
      <div className="dh-matrix-profile-bar">
        <span className="dh-mpb-label">Showing rows for:</span>
        <div className="dh-mpb-chips">
          {priorities.map(p => <span key={p} className="dh-mpb-chip">{p}</span>)}
        </div>
        <button className="dh-mpb-edit" onClick={onOpenModal}>Edit priorities →</button>
      </div>

      <div className="dh-matrix-header">
        <p className="dh-matrix-count">{displaySchools.length} shortlisted school{displaySchools.length !== 1 ? 's' : ''} · rows driven by your priorities</p>
      </div>

      {displaySchools.length === 0 ? (
        <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--dh-navy)', opacity: .4, fontSize: 14 }}>
          Add schools to your shortlist to compare them here.
        </div>
      ) : (
        <div className="dh-matrix-scroll">
          <table className="dh-matrix-table">
            <thead>
              <tr>
                <th></th>
                {displaySchools.map(school => (
                  <th key={school.school_slug}>
                    <div className="dh-school-col-header">
                      <span className="dh-school-col-name">{school.school_name}</span>
                      <span className={`dh-school-col-badge${hasDeepData(school.school_slug) ? '' : ' dh-school-col-badge--limited'}`}>
                        {hasDeepData(school.school_slug) ? 'Deep data' : 'Limited data'}
                      </span>
                      <button
                        className="dh-school-col-report"
                        onClick={() => onOpenReport(school.school_slug, school.school_name)}
                      >
                        View report ↗
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  {displaySchools.map(school => {
                    const val = row.getValue(school)
                    return (
                      <td key={school.school_slug}>
                        {val === '—' ? <span className="dh-cell-na">—</span> : val}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="dh-add-row-hint">+ Ask Nana a question to add a new comparison row</p>
        </div>
      )}
    </div>
  )
}

// ── ReportView ────────────────────────────────────────────────────────────────

function ReportView({
  reportSlug,
  reportName,
}: {
  reportSlug: string
  reportName: string
}) {
  return (
    <div className="dh-report-view">
      <div className="dh-report-bar">
        <span className="dh-report-bar-eyebrow">Deep report</span>
        <span className="dh-report-bar-name">{reportName}</span>
        <a
          className="dh-report-bar-open"
          href={`/schools/${reportSlug}/report`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in new tab ↗
        </a>
      </div>
      <iframe
        className="dh-report-iframe"
        src={`/schools/${reportSlug}/report`}
        title={`${reportName} deep report`}
      />
    </div>
  )
}

// ── ProfileModal ──────────────────────────────────────────────────────────────

function ProfileModal({
  profile,
  onClose,
}: {
  profile: ParentProfile | null
  onClose: () => void
}) {
  const [boarding, setBoarding] = useState<string>(profile?.boarding_pref ?? 'Boarding')
  const [priorities, setPriorities] = useState<string[]>(
    profile?.top_priority ? [profile.top_priority] : ['Academic ambition']
  )
  const [stage, setStage] = useState<string>('Shortlisting')

  function togglePriority(p: string) {
    setPriorities(prev =>
      prev.includes(p)
        ? prev.filter(x => x !== p)
        : prev.length < 3 ? [...prev, p] : prev
    )
  }

  return (
    <div className="dh-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="dh-modal">
        <p className="dh-modal-eyebrow">Your priorities</p>
        <h2 className="dh-modal-title">Tell Nana about your child</h2>
        <p className="dh-modal-sub">So everything you see is tailored to your family — not a generic list.</p>

        <div className="dh-modal-field">
          <label className="dh-modal-label">Boarding, day, or open to both?</label>
          <div className="dh-modal-chips">
            {['Boarding', 'Day', 'Flexi / weekly', 'Open to both'].map(opt => (
              <button
                key={opt}
                className={`dh-modal-chip${boarding === opt ? ' dh-modal-chip--selected' : ''}`}
                onClick={() => setBoarding(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div className="dh-modal-field">
          <label className="dh-modal-label">What matters most? (pick up to 3 — these drive which checks appear)</label>
          <div className="dh-modal-chips">
            {['Academic ambition', 'Sport', 'Arts', 'Pastoral care', 'SEND support', 'Social fit', 'Religious ethos', 'Location'].map(opt => (
              <button
                key={opt}
                className={`dh-modal-chip${priorities.includes(opt) ? ' dh-modal-chip--selected' : ''}`}
                onClick={() => togglePriority(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div className="dh-modal-field">
          <label className="dh-modal-label">Where are you in the process?</label>
          <div className="dh-modal-chips">
            {['Still researching', 'Shortlisting', 'Visited some', 'Received offers', 'Deciding now'].map(opt => (
              <button
                key={opt}
                className={`dh-modal-chip${stage === opt ? ' dh-modal-chip--selected' : ''}`}
                onClick={() => setStage(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div className="dh-modal-footer">
          <button className="dh-modal-submit" onClick={onClose}>Show me the verdict →</button>
        </div>
      </div>
    </div>
  )
}

// ── Helpers: confidence badge + source pills ──────────────────────────────────

function ConfidenceBadge({ level }: { level: string }) {
  const map: Record<string, [string, string]> = {
    high:   ['dh-conf--high',   'High confidence'],
    medium: ['dh-conf--medium', 'Medium confidence'],
    low:    ['dh-conf--low',    'Low confidence'],
    none:   ['dh-conf--none',   'No data'],
  }
  const [cls, label] = map[level] ?? ['', level]
  return <span className={`dh-conf-badge ${cls}`}>{label}</span>
}

function isSafeUrl(url: string): boolean {
  try { const u = new URL(url); return u.protocol === 'https:' || u.protocol === 'http:' }
  catch { return false }
}

function CandidateCard({ c, inList, onAdd }: { c: RecommendedSchool; inList: boolean; onAdd: () => void }) {
  return (
    <div className="dh-candidate-card">
      <p className="dh-candidate-name">{c.name}</p>
      <p className="dh-candidate-why">{c.why}</p>
      {c.concern && <p className="dh-candidate-concern">⚠ {c.concern}</p>}
      {inList
        ? <span className="dh-candidate-added">✓ In your shortlist</span>
        : <button className="dh-candidate-add" onClick={onAdd}>Add to shortlist +</button>}
    </div>
  )
}

function buildOpeningBriefing(
  shortlist: ShortlistedSchool[],
  profile: ParentProfile | null,
  activeSchool: ShortlistedSchool | null,
): string {
  if (shortlist.length === 0)
    return 'Ask me to find schools — best for sport, boarding near London, under a specific budget.'
  const parts: string[] = [`I've looked at your ${shortlist.length} school${shortlist.length > 1 ? 's' : ''}.`]
  if (profile?.top_priority) parts.push(`Your top priority is ${profile.top_priority.toLowerCase()}.`)
  if (activeSchool) parts.push(`I'm focused on ${activeSchool.school_name} — ask me anything specific.`)
  else parts.push('Ask me anything — fees, results, pastoral care, how they compare.')
  return parts.join(' ')
}

// ── Chat message rendering ────────────────────────────────────────────────────

function NanaMsgBubble({
  msg,
  isStreaming,
  streamBuf,
}: {
  msg?: ResearchMessage
  isStreaming?: boolean
  streamBuf?: string
}) {
  const parsed = msg?.parsed
  const s = parsed?.sections ?? {}

  const liveShort = isStreaming && streamBuf
    ? extractStreamingField(streamBuf, 'short_answer')
    : ''

  const showSkeleton = isStreaming && !liveShort

  return (
    <div className="dh-msg-nana">
      {(liveShort || s.short_answer) && (
        <>
          <p className="dh-msg-nana-eyebrow">Short answer</p>
          <p className="dh-msg-nana-lead">
            {isStreaming ? liveShort || '…' : renderMd(s.short_answer!)}
          </p>
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

      {!isStreaming && s.confirmed_facts && s.confirmed_facts !== 'Nothing to flag here.' && (
        <p className="dh-msg-nana-prose">{renderMd(s.confirmed_facts)}</p>
      )}

      {!isStreaming && s.what_this_means && s.what_this_means !== 'Nothing to flag here.' && (
        <div className="dh-ans-section">
          <p className="dh-msg-nana-eyebrow">What this means</p>
          <p className="dh-msg-nana-prose">{renderMd(s.what_this_means)}</p>
        </div>
      )}

      {!isStreaming && s.tradeoff && s.tradeoff !== 'Nothing to flag here.' && (
        <div className="dh-msg-nana-tradeoff">
          <p className="dh-msg-nana-tradeoff-label">⚠ Watch out</p>
          {renderMd(s.tradeoff)}
        </div>
      )}

      {!isStreaming && s.what_we_dont_know && s.what_we_dont_know !== 'Nothing to flag here.' && (
        <div className="dh-ans-section dh-ans-section--dim">
          <p className="dh-msg-nana-eyebrow">What we don&apos;t know</p>
          <p className="dh-msg-nana-prose">{renderMd(s.what_we_dont_know)}</p>
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
            .filter(s => s.source_url && s.section_label && isSafeUrl(s.source_url))
            .slice(0, 6)
            .map((s, i) => (
              <a key={i} href={s.source_url} target="_blank" rel="noopener noreferrer" className="dh-source-pill dh-source-pill--chat">
                {s.section_label.slice(0, 40)} ↗
              </a>
            ))}
        </div>
      )}

      {!isStreaming && msg?.shareToken && (
        <Link href={`/nana/answer/${msg.shareToken}`} className="dh-msg-share" target="_blank">
          Share ↗
        </Link>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function DecisionHub({
  profile,
  shortlist,
  structuredData,
  initialSession,
  initialMessages,
}: Props) {
  // ── Workspace state ──────────────────────────────────────────────────────
  type ActiveTab = 'verdict' | 'compare' | 'report'
  const [activeTab, setActiveTab] = useState<ActiveTab>('verdict')
  const [activeSchoolIdx, setActiveSchoolIdx] = useState(0)
  const [reportSlug, setReportSlug] = useState(shortlist[0]?.school_slug ?? '')
  const [reportName, setReportName] = useState(shortlist[0]?.school_name ?? '')
  const [showProfileModal, setShowProfileModal] = useState(false)

  // F6: local shortlist state — updates live without page reload
  const [localShortlist, setLocalShortlist] = useState<ShortlistedSchool[]>(shortlist)

  const activeSchool = localShortlist[activeSchoolIdx] ?? null

  function cycleSchool() {
    setActiveSchoolIdx(prev => (prev + 1) % Math.max(localShortlist.length, 1))
  }

  async function addToShortlist(slug: string, name: string) {
    // Check closure value — avoids queued-updater timing issue with wasNew flag
    if (localShortlist.some(s => s.school_slug === slug)) return
    setLocalShortlist(prev => [...prev, { school_slug: slug, school_name: name, fees_min: null, fees_max: null }])
    try {
      const res = await fetch('/api/shortlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      if (!res.ok) setLocalShortlist(prev => prev.filter(s => s.school_slug !== slug))
    } catch {
      setLocalShortlist(prev => prev.filter(s => s.school_slug !== slug))
    }
  }

  function openReport(slug: string, name: string) {
    setReportSlug(slug)
    setReportName(name)
    setActiveTab('report')
  }

  // ── Chat (SSE) state ─────────────────────────────────────────────────────
  const [session, setSession] = useState<Session | null>(initialSession)
  const [messages, setMessages] = useState<ResearchMessage[]>(
    (initialMessages ?? []).map((m: any) => ({
      id: m.id,
      question: m.question,
      parsed: m.parsed_answer,
      shareToken: m.share_token,
      createdAt: m.created_at,
    }))
  )
  const [question, setQuestion] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamBuf, setStreamBuf] = useState('')
  const [activeQuestion, setActiveQuestion] = useState('')
  const [activeParsed, setActiveParsed] = useState<ParsedAnswer | null>(null)
  const [activeShareToken, setActiveShareToken] = useState<string | undefined>()
  const [devilsAdvocate, setDevilsAdvocate] = useState(false)
  const [candidates, setCandidates] = useState<RecommendedSchool[]>([])
  const [showTooltip, setShowTooltip] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem('nana-dh-visited')) {
      setShowTooltip(true)
      localStorage.setItem('nana-dh-visited', '1')
    }
  }, [])

  const abortRef   = useRef<AbortController | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, streamBuf, isStreaming])

  const ask = useCallback(async () => {
    const q = question.trim()
    if (!q || isStreaming) return

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setIsStreaming(true)
    setStreamBuf('')
    setActiveQuestion(q)
    setActiveParsed(null)
    setActiveShareToken(undefined)
    setQuestion('')
    setCandidates([])

    try {
      const res = await fetch('/api/nana-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          sessionId: session?.id,
          devilsAdvocate,
          activeTab,
          activeSchoolSlug: activeSchool?.school_slug ?? null,
          shortlistSlugs: localShortlist.map(s => s.school_slug),
        }),
        signal: ac.signal,
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(err.error || 'Request failed')
      }

      const reader = res.body.getReader()
      const dec    = new TextDecoder()
      let   rawBuf = ''
      let   shareToken: string | undefined
      let   localParsed: ParsedAnswer | null = null
      let   hasContent = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        rawBuf += dec.decode(value, { stream: true })
        const lines = rawBuf.split('\n')
        rawBuf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          let evt: any
          try { evt = JSON.parse(line.slice(5).trim()) } catch { continue }

          switch (evt.type) {
            case 'session_ready':
              setSession(prev => {
                if (prev && prev.id === evt.sessionId) return prev
                return {
                  id: evt.sessionId,
                  title: q.slice(0, 80),
                  summary: null,
                  created_at: new Date().toISOString(),
                  last_active_at: new Date().toISOString(),
                }
              })
              break

            case 'token':
              hasContent = true
              setStreamBuf(prev => prev + (evt.text ?? ''))
              break

            case 'final':
              shareToken = evt.shareToken
              setActiveShareToken(evt.shareToken)
              if (evt.payload?.parsed) {
                localParsed = evt.payload.parsed
                setActiveParsed(localParsed)
              }
              setIsStreaming(false)
              if (localParsed || hasContent) {
                setMessages(prev => [...prev, {
                  id:        crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
                  question:  q,
                  parsed:    localParsed,
                  shareToken,
                  createdAt: new Date().toISOString(),
                }])
              }
              // F5: react to ui_intent — auto-switch left pane tab silently
              // localShortlist is captured at ask() call time via useCallback deps — correct semantics
              {
                const intent = evt.uiIntent as any
                if (intent?.action === 'show_verdict' && intent.schoolSlug) {
                  const idx = localShortlist.findIndex(s => s.school_slug === intent.schoolSlug)
                  if (idx >= 0) { setActiveSchoolIdx(idx); setActiveTab('verdict') }
                } else if (intent?.action === 'show_compare') {
                  const allInList = (intent.schoolSlugs as string[]).every(
                    (slug: string) => localShortlist.some(s => s.school_slug === slug)
                  )
                  if (allInList) setActiveTab('compare')
                } else if (intent?.action === 'show_candidates' && intent.candidates) {
                  setCandidates(intent.candidates)
                }
              }
              break

            case 'summary_generating':
              break

            case 'summary_update':
              if (evt.payload?.summary) {
                setSession(prev => prev ? { ...prev, summary: evt.payload.summary } : prev)
              }
              break
          }
        }
      }

    } catch (e: any) {
      if (e?.name === 'AbortError') return
    } finally {
      setIsStreaming(false)
    }
  }, [question, isStreaming, session, devilsAdvocate, activeTab, activeSchool, localShortlist])

  function stopStream() {
    abortRef.current?.abort()
    setIsStreaming(false)
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      ask()
    }
  }

  function handleTextareaInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setQuestion(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  function useStarter(q: string) {
    setQuestion(q)
    inputRef.current?.focus()
  }

  const starterChips = localShortlist.length === 0
    ? ['Best schools for competitive football', 'Top boarding near London under £40k', 'Best schools for art and drama']
    : ['What would you ask at the open day?', 'Any red flags I should know?', 'Compare fees across my shortlist']

  const headerSchoolName = activeSchool?.school_name ?? (localShortlist[0]?.school_name ?? '')

  return (
    <div className="dh-shell">
      {/* ── Header ── */}
      <header className="dh-header">
        <Link href="/schools" className="dh-header-back">← Directory</Link>
        <span className="dh-header-sep">·</span>
        <div className="dh-header-pulse" />
        <span className="dh-header-brand">Nana</span>
        <span className="dh-header-mode">UK Schools Research</span>
        {headerSchoolName && (
          <span className="dh-header-school">{headerSchoolName}</span>
        )}
      </header>

      <div className="dh-body">

        {/* ══ WORKSPACE (left 60%) ══ */}
        <div className="dh-workspace">

          {/* Tab bar */}
          <div className="dh-view-tabs">
            <button
              className={`dh-view-tab${activeTab === 'verdict' ? ' dh-view-tab--active' : ''}`}
              onClick={() => setActiveTab('verdict')}
            >
              <span className="dh-tab-icon">◉</span>Verdict
            </button>
            <button
              className={`dh-view-tab${activeTab === 'compare' ? ' dh-view-tab--active' : ''}`}
              onClick={() => setActiveTab('compare')}
            >
              <span className="dh-tab-icon">⊞</span>Compare schools
            </button>
            <button
              className={`dh-view-tab dh-tab-report${activeTab === 'report' ? ' dh-view-tab--active' : ''}`}
              onClick={() => setActiveTab('report')}
            >
              <span className="dh-tab-icon">↗</span>School report
            </button>
          </div>

          {/* Views */}
          {activeTab === 'verdict' && (
            <VerdictView
              activeSchool={activeSchool}
              shortlist={localShortlist}
              structuredData={structuredData}
              profile={profile}
              onChangeSchool={cycleSchool}
              onOpenModal={() => setShowProfileModal(true)}
            />
          )}
          {activeTab === 'compare' && (
            <CompareView
              shortlist={localShortlist}
              structuredData={structuredData}
              profile={profile}
              onOpenModal={() => setShowProfileModal(true)}
              onOpenReport={openReport}
            />
          )}
          {activeTab === 'report' && (
            <ReportView reportSlug={reportSlug} reportName={reportName} />
          )}

        </div>

        {/* ══ CHAT PANEL (dark navy, right 40%) ══ */}
        <div className="dh-chat-panel">
          <div className="dh-chat-header">
            <div className="dh-chat-header-top">
              <div className="dh-chat-nana-pulse" />
              <span className="dh-chat-nana-title">Nana</span>
              <button
                className={`dh-devils-toggle${devilsAdvocate ? ' dh-devils-toggle--active' : ''}`}
                onClick={() => setDevilsAdvocate(p => !p)}
              >
                {devilsAdvocate ? '👿 Second opinion ON' : 'Second opinion'}
              </button>
            </div>
            <p className="dh-chat-nana-sub">Ask anything about any UK independent school</p>
          </div>

          <div className="dh-chat-messages">
            {/* F1: Smart empty state — Discovery mode or Opening briefing */}
            {messages.length === 0 && !isStreaming && (
              <div className="dh-msg-nana">
                <p className="dh-msg-nana-eyebrow">
                  {localShortlist.length === 0 ? 'Discovery mode' : 'Opening briefing'}
                </p>
                <p className="dh-msg-nana-lead">
                  {buildOpeningBriefing(localShortlist, profile, activeSchool)}
                </p>
                {localShortlist.length === 0 && (
                  <a href="/schools" className="dh-msg-affordance">Browse the directory →</a>
                )}
              </div>
            )}

            {/* Message history — all committed messages render as static bubbles */}
            {messages.map(msg => (
              <div key={msg.id}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                  <div className="dh-msg-user">{msg.question}</div>
                </div>
                <NanaMsgBubble msg={msg} />
              </div>
            ))}

            {/* New question streaming in flight — not yet committed to messages[] */}
            {isStreaming && activeQuestion && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                  <div className="dh-msg-user">{activeQuestion}</div>
                </div>
                <NanaMsgBubble isStreaming streamBuf={streamBuf} />
              </div>
            )}

            {/* F7: Candidate cards — shown after recommendation questions */}
            {candidates.length > 0 && !isStreaming && (
              <div className="dh-candidates-section">
                <p className="dh-msg-nana-eyebrow">Schools Nana suggests</p>
                {candidates.map(c => (
                  <CandidateCard
                    key={c.slug}
                    c={c}
                    inList={localShortlist.some(s => s.school_slug === c.slug)}
                    onAdd={() => addToShortlist(c.slug, c.name)}
                  />
                ))}
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Starter chips */}
          <div className="dh-chat-starters">
            {starterChips.map(chip => (
              <button key={chip} className="dh-starter-chip" onClick={() => useStarter(chip)}>
                {chip}
              </button>
            ))}
          </div>

          {/* F1: First-visit tooltip */}
          {showTooltip && (
            <div className="dh-tooltip" onClick={() => setShowTooltip(false)}>
              Ask Nana a question — schools she mentions appear on the left for comparison
              <button className="dh-tooltip-close" onClick={e => { e.stopPropagation(); setShowTooltip(false) }}>✕</button>
            </div>
          )}

          {/* Input bar */}
          <div className="dh-chat-input-bar">
            <textarea
              ref={inputRef}
              className="dh-chat-input"
              placeholder="Ask Nana anything about these schools…"
              value={question}
              onChange={handleTextareaInput}
              onKeyDown={handleKey}
              rows={1}
              disabled={isStreaming}
            />
            {isStreaming ? (
              <button className="dh-chat-stop-btn" onClick={stopStream}>■ Stop</button>
            ) : (
              <button
                className="dh-chat-ask-btn"
                onClick={ask}
                disabled={!question.trim()}
              >
                Ask →
              </button>
            )}
          </div>
        </div>

      </div>

      {/* ── Profile modal ── */}
      {showProfileModal && (
        <ProfileModal profile={profile} onClose={() => setShowProfileModal(false)} />
      )}
    </div>
  )
}

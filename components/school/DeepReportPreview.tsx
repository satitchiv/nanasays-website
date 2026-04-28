interface TourQuestion {
  label?: string
  text?: string
  category?: string
}

interface Props {
  schoolName: string
  slug: string
  sourceCount?: number
  tourQuestions?: TourQuestion[] | null
}

const LOCKED_SECTIONS = [
  { label: 'Full ISI Inspection Analysis', sub: 'Every standard rated · what inspectors flagged' },
  { label: 'Fees Breakdown by Year Group', sub: 'Boarding vs day · what\'s included in fees' },
  { label: 'Pastoral & Wellbeing Deep Dive', sub: 'Safeguarding · boarding culture · mental health staffing' },
  { label: 'Admissions Strategy', sub: 'What they look for · exam prep · realistic chances' },
  { label: 'Sport Rankings & National Results', sub: 'SOCS national tiers · cup results · alumni pathway' },
  { label: 'Full University Destinations', sub: 'All placements with counts by university' },
  { label: 'Complete Parent Fit Analysis', sub: 'All fit signals · score · what to verify on tour' },
  { label: 'Finance & Fees Analysis', sub: 'True cost · bursary likelihood · comparison to peers' },
]

function LockItem({ label, sub }: { label: string; sub: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 8, padding: '10px 13px',
      display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <span style={{ fontSize: 14, opacity: 0.45, flexShrink: 0, marginTop: 1 }}>🔒</span>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.75)', lineHeight: 1.3 }}>{label}</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  )
}

export default function DeepReportPreview({ schoolName, slug, sourceCount, tourQuestions }: Props) {
  // Pick one non-financial tour question to tease
  const teaserQ = tourQuestions?.find(q => q.category !== 'money') ?? tourQuestions?.[0] ?? null

  return (
    <div style={{
      background: 'var(--navy)', borderRadius: 12, padding: '26px 24px', marginBottom: 52,
    }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontSize: 19, fontWeight: 800, color: '#fff', marginBottom: 3 }}>
          {schoolName} — Deep Report
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.35)', marginLeft: 8 }}>by Nana</span>
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
          Full independent analysis{sourceCount ? ` · ${sourceCount} sources researched` : ''}
        </div>
      </div>

      {/* Locked section grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        {LOCKED_SECTIONS.map(s => <LockItem key={s.label} {...s} />)}
      </div>

      {/* Tour question tease */}
      {teaserQ && (
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, padding: '12px 14px', marginBottom: 12,
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>
            🔒 Questions to Ask on the School Tour — example
          </div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.6 }}>
            &ldquo;{teaserQ.label ?? teaserQ.text?.slice(0, 120)}&rdquo;
          </p>
          {tourQuestions && tourQuestions.length > 1 && (
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: '6px 0 0' }}>
              +{tourQuestions.length - 1} more questions covering finance, safety and pastoral care in the Full Report
            </p>
          )}
        </div>
      )}

      {/* Nana AI row — full width, highlighted */}
      <div style={{
        background: 'rgba(27,181,161,0.1)', border: '1px solid rgba(27,181,161,0.35)',
        borderRadius: 8, padding: '12px 14px', marginBottom: 18,
        display: 'flex', alignItems: 'flex-start', gap: 10,
      }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>✦</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)' }}>Ask Nana — AI School Advisor</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
            Chat live about {schoolName} · fully sourced answers · "Is this right for my daughter?"
          </div>
        </div>
      </div>

      {/* CTA */}
      <a
        href={`/schools/${slug}/report`}
        style={{
          display: 'block', textAlign: 'center',
          background: 'var(--teal)', color: '#fff',
          fontFamily: 'var(--font-nunito), Nunito, sans-serif',
          fontSize: 15, fontWeight: 800,
          padding: '14px 24px', borderRadius: 8,
          textDecoration: 'none',
        }}
      >
        Unlock Full Report — {schoolName}
      </a>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 8 }}>
        NanaSays subscription · All UK schools included · Cancel anytime
      </div>
    </div>
  )
}

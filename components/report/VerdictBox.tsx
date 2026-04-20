/**
 * <VerdictBox> — The one-minute verdict card at the top of the report.
 *
 * Data comes from school_structured_data.report_verdict (JSONB), populated by
 * scripts/generate-narrative.js. Shape:
 *   {
 *     headline: string
 *     body: string
 *     lights: [{ label, status: 'green'|'amber'|'red', value }]
 *     best_fit_for: string
 *     harder_fit_for: string
 *     top_3_questions: [{ label, category, text }]
 *   }
 */

type Light = { label: string; status: 'green' | 'amber' | 'red'; value: string }
type Question = { label: string; category: string; text: string }

export type Verdict = {
  headline?: string
  body?: string
  lights?: Light[]
  best_fit_for?: string
  harder_fit_for?: string
  top_3_questions?: Question[]
}

export default function VerdictBox({ verdict }: { verdict: Verdict | null }) {
  if (!verdict) {
    return (
      <div className="verdict-box">
        <div className="verdict-title">The one-minute verdict</div>
        <p className="verdict-body">
          The narrative sections of this report have not been generated yet.
          Run <code>node scripts/generate-narrative.js --slug &lt;this-school&gt;</code> to populate them.
        </p>
      </div>
    )
  }

  return (
    <div className="verdict-box">
      <div className="verdict-title">The one-minute verdict</div>

      {verdict.headline && <div className="verdict-headline">{verdict.headline}</div>}
      {verdict.body && <p className="verdict-body">{verdict.body}</p>}

      {verdict.lights && verdict.lights.length > 0 && (
        <div className="verdict-lights">
          {verdict.lights.map((l, i) => (
            <div key={i} className={`vlight ${l.status}`}>
              <div className="vlight-label">{l.label}</div>
              <div className="vlight-value">
                <span className="vlight-dot" />
                {l.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {(verdict.best_fit_for || verdict.harder_fit_for) && (
        <div className="verdict-splits">
          {verdict.best_fit_for && (
            <div className="vsplit">
              <div className="vsplit-label">✓ Best fit for</div>
              <div className="vsplit-text">{verdict.best_fit_for}</div>
            </div>
          )}
          {verdict.harder_fit_for && (
            <div className="vsplit warn">
              <div className="vsplit-label">— Harder fit for</div>
              <div className="vsplit-text">{verdict.harder_fit_for}</div>
            </div>
          )}
        </div>
      )}

      {verdict.top_3_questions && verdict.top_3_questions.length > 0 && (
        <div className="verdict-qs">
          <span className="qs-head">If you only ask 3 questions on the tour</span>
          <ol>
            {verdict.top_3_questions.map((q, i) => (
              <li key={i}>
                <strong>{q.label}</strong> <em>({q.category})</em> — {q.text}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

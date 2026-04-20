/**
 * <SafeguardingSection> — Safeguarding summary + verified TRA status + leadership team list.
 *
 * Data:
 *   - school_sensitive where source='dfe_prohibition' (TRA verified hits)
 *   - school_sensitive charity_commission SIRs
 *   - schools.leadership (senior team list)
 *
 * Rule from writing style guide: never name a TRA teacher unless verified === true.
 */

type TRAPublication = { title?: string; link?: string; evidence_quote?: string }

type Leader = {
  name: string
  role?: string | null
  tenure_start?: string | number | null
}

type Props = {
  verifiedTRA?: TRAPublication[]
  uncertainTRACount?: number
  droppedTRACount?: number
  sirCount5yr?: number
  isiSafeguardingEffective?: boolean
  head?: { name: string; role?: string | null; tenureStart?: string | number | null } | null
  chair?: string | null
  seniorTeam?: Leader[]
}

export default function SafeguardingSection({
  verifiedTRA = [], uncertainTRACount = 0, droppedTRACount = 0,
  sirCount5yr = 0, isiSafeguardingEffective,
  head, chair, seniorTeam = [],
}: Props) {
  return (
    <section className="block" id="safeguarding">
      <h2 className="block-title">Safeguarding</h2>

      <div className="translate">
        <p><strong>Bottom line: {verifiedTRA.length === 0 && sirCount5yr === 0 ? 'no concerns in the public record.' : 'review the flags below before deciding.'}</strong></p>
        <p>
          {sirCount5yr === 0
            ? 'Zero serious incident reports filed with the Charity Commission in the last 5 years. '
            : `${sirCount5yr} serious incident report(s) on file in the last 5 years. `}
          {isiSafeguardingEffective && 'Most recent ISI inspection confirmed safeguarding arrangements effective.'}
        </p>
      </div>

      <h3 className="block-sub">Teacher prohibition check (DfE TRA)</h3>
      {verifiedTRA.length === 0 ? (
        <p>
          We ran an automated search of Teaching Regulation Agency (TRA — the government body that bans teachers
          found guilty of misconduct) publications for this school and verified each candidate against the school&apos;s
          name and location. <strong>Zero confirmed hits.</strong>
          {droppedTRACount > 0 && (
            <> {droppedTRACount} raw keyword match{droppedTRACount === 1 ? '' : 'es'} appeared but {droppedTRACount === 1 ? 'was' : 'were'} confirmed to be unrelated (e.g., matching on common words like &quot;abbey&quot; or &quot;college&quot; in a different place name).</>
          )}
          {uncertainTRACount > 0 && (
            <> {uncertainTRACount} hit{uncertainTRACount === 1 ? '' : 's'} could not be automatically verified and {uncertainTRACount === 1 ? 'is' : 'are'} held back pending manual review.</>
          )}
        </p>
      ) : (
        <>
          <p>
            The following {verifiedTRA.length} panel outcome{verifiedTRA.length === 1 ? ' was' : 's were'} verified as
            relating to this school. Click each link to read the full decision — we have not parsed the PDFs.
          </p>
          <ul>
            {verifiedTRA.map((p, i) => (
              <li key={i}>
                {p.link ? <a href={p.link}>{p.title}</a> : p.title}
                {p.evidence_quote && (
                  <>
                    <br />
                    <small style={{ color: 'var(--muted)' }}>Evidence from page: &quot;{p.evidence_quote}&quot;</small>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {(head || chair || seniorTeam.length > 0) && (
        <>
          <h3 className="block-sub">Leadership team</h3>
          <p>For a multi-year enrolment decision, knowing who runs the school — and how stable that leadership is — matters.</p>
          <ul>
            {head && (
              <li>
                <strong>{head.name}</strong>{head.role && ` — ${head.role}`}.
                {head.tenureStart
                  ? <> In post since {head.tenureStart}.</>
                  : <> <em>Tenure start date not in our data — ask on tour.</em></>}
              </li>
            )}
            {chair && (
              <li>
                <strong>{chair}</strong> — Chair of Governors.
              </li>
            )}
            {seniorTeam.map((l, i) => (
              <li key={i}>
                <strong>{l.name}</strong>
                {l.role && ` — ${l.role}`}
                {l.tenure_start && ` (from ${l.tenure_start})`}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

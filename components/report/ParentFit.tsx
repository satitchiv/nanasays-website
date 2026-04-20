/**
 * <ParentFit> — 2-column "thrives / harder" grid.
 *
 * Data comes from school_structured_data.report_parent_fit (JSONB):
 *   { thrives: string[], harder: string[] }
 */

export type ParentFitData = {
  thrives?: string[]
  harder?: string[]
}

export default function ParentFit({ fit }: { fit: ParentFitData | null }) {
  if (!fit || (!fit.thrives?.length && !fit.harder?.length)) {
    return (
      <section className="block" id="fit">
        <h2 className="block-title">Parent fit</h2>
        <p>Parent-fit analysis has not been generated for this school yet.</p>
      </section>
    )
  }

  return (
    <section className="block" id="fit">
      <h2 className="block-title">Parent fit — is this school right for your family?</h2>

      <div className="fit-grid">
        {fit.thrives && fit.thrives.length > 0 && (
          <div className="fit-col fit-thrive">
            <h4>Likely to thrive</h4>
            <ul>
              {fit.thrives.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        )}
        {fit.harder && fit.harder.length > 0 && (
          <div className="fit-col fit-harder">
            <h4>May find it harder</h4>
            <ul>
              {fit.harder.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

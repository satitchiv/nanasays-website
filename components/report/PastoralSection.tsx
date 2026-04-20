/**
 * <PastoralSection> — Pastoral care model + facilities + ISI pastoral quote.
 *
 * Data: school_structured_data (facilities, pastoral fields) + optional ISI quote.
 */

type Props = {
  description?: string | null
  facilities?: string[] | null
  pastoralModel?: string | null
  isiPastoralQuote?: string | null
  isiCitation?: string | null
}

export default function PastoralSection({ description, facilities, pastoralModel, isiPastoralQuote, isiCitation }: Props) {
  if (!description && !facilities?.length && !pastoralModel && !isiPastoralQuote) return null

  return (
    <section className="block" id="pastoral">
      <h2 className="block-title">Pastoral care & facilities</h2>

      {description && <p>{description}</p>}
      {pastoralModel && <p><strong>Pastoral model:</strong> {pastoralModel}</p>}

      {facilities && facilities.length > 0 && (
        <>
          <h3 className="block-sub">Signature facilities</h3>
          <p>{facilities.join(' · ')}</p>
        </>
      )}

      {isiPastoralQuote && (
        <blockquote>
          {isiPastoralQuote}
          {isiCitation && <cite>— {isiCitation}</cite>}
        </blockquote>
      )}
    </section>
  )
}

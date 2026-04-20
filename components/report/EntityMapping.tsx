/**
 * <EntityMapping> — "ENTITY MAPPING · READ FIRST" callout box.
 *
 * Explains the two-entity structure (operating charity + optional foundation) in plain
 * language so parents don't get alarmed by seeing two Companies House records.
 */

type Props = {
  schoolName: string
  charityLegalName?: string | null
  charityWorkingName?: string | null
  charityNumber?: string | null
  charityRegisteredDate?: string | null
  foundationName?: string | null
  foundationNumber?: string | null
  foundationUrl?: string | null
  charityUrl?: string | null
}

export default function EntityMapping({
  schoolName, charityLegalName, charityWorkingName, charityNumber, charityRegisteredDate,
  foundationName, foundationNumber, foundationUrl, charityUrl,
}: Props) {
  if (!charityNumber) return null

  const hasFoundation = !!foundationName && !!foundationNumber

  return (
    <div className="entity-box">
      <p>
        <span className="verdict-chip">
          Verdict: {hasFoundation ? 'Working-name match + separate Foundation' : 'Working-name match'}
        </span>
        <strong> Read this carefully — there {hasFoundation ? 'are two legal entities' : 'is the operating charity'}.</strong>
      </p>
      <p>
        <em>
          When you look up a UK school in public records, you might find more than one entry. That&apos;s because schools often
          have a separate legal &quot;shell&quot; for fundraising. This is normal and not a cause for concern — but it can be
          confusing. Here&apos;s what you need to know about {schoolName}:
        </em>
      </p>
      <p>
        The Charity Commission record for the operating school is filed under the legal name{' '}
        <strong>&quot;{charityLegalName || '(legal name not captured)'}&quot;</strong>
        {charityWorkingName && charityWorkingName !== charityLegalName && <> (working name: {charityWorkingName})</>},
        charity <strong>{charityNumber}</strong>
        {charityRegisteredDate && <>, registered {charityRegisteredDate}</>}.
        {' '}That corporate name is the school itself — not a multi-school group, not a fundraising arm. The figures in this
        report describe <strong>total school operations</strong>.
      </p>
      {hasFoundation && (
        <p>
          Separately, <strong>{foundationName}</strong>
          {foundationNumber && <> (Companies House <strong>{foundationNumber}</strong>)</>} exists as a distinct legal entity
          — a fundraising vehicle, not the operating school.{' '}
          <strong>Do not read its figures as the school&apos;s finances.</strong>
          {' '}Sources:{' '}
          {charityUrl && <><a href={charityUrl}>charity {charityNumber}</a></>}
          {charityUrl && foundationUrl && <>, </>}
          {foundationUrl && <><a href={foundationUrl}>Companies House {foundationNumber}</a></>}.
        </p>
      )}
    </div>
  )
}

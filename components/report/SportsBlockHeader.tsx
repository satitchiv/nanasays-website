/**
 * SportsBlockHeader — banner that introduces the Sports & Athletics group.
 * Sits above SportsSection (overview) and TennisSection (academy deep-dive)
 * in the report, so readers see them as one coherent area rather than two
 * unrelated blocks. Future academy sports (cricket, rugby, hockey) slot in
 * under the same banner as additional siblings.
 */

export default function SportsBlockHeader() {
  return (
    <div className="sports-block-banner">
      <div className="sports-block-banner-title">
        <span className="sports-block-banner-icon" aria-hidden="true">🏆</span>
        Sports &amp; Athletics
      </div>
      <p className="sports-block-banner-lede">
        The school&apos;s overall sport programme plus deep-dives on specialist academy
        pathways — tennis today, with cricket, rugby and other specialisms to follow.
      </p>
    </div>
  )
}

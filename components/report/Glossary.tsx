/**
 * <Glossary> — alphabetical definitions of jargon used in the report.
 * This is a fallback for parents who skim; the style guide requires inline
 * definitions at first use too.
 */

const DEFAULT_TERMS: Array<[string, string]> = [
  ['Bursary', 'A means-tested fee reduction — the school looks at your family\'s income and assets before deciding how much help you get.'],
  ['CAMHS', 'Child and Adolescent Mental Health Services — NHS mental health care for young people.'],
  ['Charity Commission', 'The government body that keeps a public record of every UK charity\'s finances and legal status.'],
  ['Companies House', 'The government body that registers every UK company and makes its filings public.'],
  ['DofE', 'The Duke of Edinburgh\'s Award — a UK youth achievement programme.'],
  ['EAL', 'English as an Additional Language — pupils whose first language isn\'t English.'],
  ['EHC plan', 'Education, Health and Care plan — a legal document for children with significant additional needs.'],
  ['GCSE', 'General Certificate of Secondary Education — the main UK exam taken at age 16.'],
  ['IB', 'International Baccalaureate — an alternative to A-Levels.'],
  ['ISEB Common Pre-Test', 'Standardised online test in English, Maths and reasoning used by many UK private schools for 11+/13+ entry.'],
  ['ISI', 'Independent Schools Inspectorate — the government-approved body that inspects private schools in England.'],
  ['Means-tested', 'The school looks at your family\'s income and assets to decide how much help you get.'],
  ['Scholarship', 'A merit-based fee reduction — awarded for academic, music, sport etc., no family-income test.'],
  ['SEND', 'Special Educational Needs and Disabilities — pupils needing extra learning support.'],
  ['TRA', 'Teaching Regulation Agency — the government body that bans teachers found guilty of misconduct.'],
]

type Props = { terms?: Array<[string, string]> }

export default function Glossary({ terms = DEFAULT_TERMS }: Props) {
  return (
    <section className="glossary-box" id="glossary">
      <h2 className="block-title">Glossary</h2>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 8px' }}>
        Every term used in the report is defined inline the first time it appears. This index is a quick-reference backup.
      </p>
      <dl>
        {terms.map(([term, def]) => (
          <div key={term} style={{ display: 'contents' }}>
            <dt>{term}</dt>
            <dd>{def}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

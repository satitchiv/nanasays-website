/**
 * <RecentSection> — "What's happened in the last 12 months" timeline of news items.
 *
 * Data: derived from school_sensitive records (ISI dates, CC filings, strategic milestones).
 * If we have nothing concrete, render a simple summary of what the most recent regulatory records say.
 */

type NewsItem = { date: string; text: string }

type Props = { items: NewsItem[] }

export default function RecentSection({ items }: Props) {
  if (!items || items.length === 0) return null

  return (
    <section className="block" id="recent">
      <h2 className="block-title">What&apos;s happened in the last 12 months</h2>
      <p>Signals from public records — each one tells you something about current momentum.</p>

      <div className="news-list">
        {items.map((item, i) => (
          <div key={i} className="news-item">
            <div className="news-date">{item.date}</div>
            <div className="news-text" dangerouslySetInnerHTML={{ __html: item.text }} />
          </div>
        ))}
      </div>
    </section>
  )
}

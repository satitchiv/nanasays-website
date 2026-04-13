'use client'

import FaqItem from './school/FaqItem'
import Link from 'next/link'

export interface FaqEntry {
  question: string
  answer: string
  articleHeadline?: string
  articleId?: string
}

interface Props {
  faqs: FaqEntry[]
  title?: string
}

export default function FaqAccordion({ faqs, title }: Props) {
  if (!faqs.length) return null

  return (
    <div>
      {title && (
        <div style={{
          fontSize: 12, fontWeight: 700, color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12,
        }}>
          {title}
        </div>
      )}
      {faqs.map((faq, i) => (
        <div key={i}>
          <FaqItem
            question={faq.question}
            answer={faq.answer}
          />
          {/* Source attribution — rendered below the FaqItem row */}
          <div style={{
            fontSize: 11,
            color: 'var(--muted)',
            paddingBottom: 10,
            paddingLeft: 2,
          }}>
            {faq.articleId ? (
              <>
                From:{' '}
                <Link
                  href={`/news/${faq.articleId}`}
                  style={{ color: 'var(--teal-dk)', textDecoration: 'none', fontWeight: 600 }}
                >
                  {faq.articleHeadline || 'article'}
                </Link>
              </>
            ) : (
              <span>Source: school data</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

import Link from 'next/link'
import type { DemoQuestion } from '@/lib/demo-questions'
import './NanaDemoTeaser.css'

interface Props {
  slug: string
  schoolName: string
  questions: DemoQuestion[]
}

export default function NanaDemoTeaser({ slug, schoolName, questions }: Props) {
  if (!questions.length) return null

  return (
    <div className="ndt-wrap">
      <div className="ndt-header">
        <div className="ndt-pulse" />
        <span className="ndt-label">Ask Nana — free preview</span>
        <span className="ndt-badge">No login needed</span>
      </div>

      <p className="ndt-intro">
        Nana is our AI advisor trained on {schoolName}&apos;s inspections, financials,
        sports records, and academic data. Try a question:
      </p>

      <div className="ndt-pills">
        {questions.map(q => (
          <Link
            key={q.id}
            href={`/nana/demo/${slug}?q=${q.id}`}
            className="ndt-pill"
          >
            <span className="ndt-pill-emoji">{q.emoji}</span>
            <span className="ndt-pill-text">{q.label}</span>
            <span className="ndt-pill-arrow">→</span>
          </Link>
        ))}
      </div>

      <div className="ndt-footer">
        <Link href="/unlock" className="ndt-unlock">
          Unlock all 140 schools — £39/month
        </Link>
        <span className="ndt-footer-note">Ask unlimited questions · Compare schools · Cancel any time</span>
      </div>
    </div>
  )
}

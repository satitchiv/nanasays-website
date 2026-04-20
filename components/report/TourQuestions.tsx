/**
 * <TourQuestions> — The 5 pointed questions parents should ask on a tour.
 *
 * Data comes from school_structured_data.report_tour_questions (JSONB):
 *   [{ label: string, category: string, text: string }]
 */

export type TourQuestion = {
  label: string
  category: string
  text: string
}

export default function TourQuestions({ questions }: { questions: TourQuestion[] | null }) {
  if (!questions || questions.length === 0) {
    return (
      <section className="block" id="questions">
        <h2 className="block-title">5 questions to ask on a tour</h2>
        <p>Tour questions have not been generated for this school yet.</p>
      </section>
    )
  }

  return (
    <section className="block" id="questions">
      <h2 className="block-title">5 questions to ask on a tour</h2>
      <p>Pointed, specific questions drawn from gaps or flags in the public data — each tied to a real fact you can reference during the visit.</p>

      <ol className="q-list">
        {questions.map((q, i) => (
          <li key={i} className="q-item">
            <div className="q-label">
              {q.label}
              {q.category && <span className="q-cat">{q.category}</span>}
            </div>
            <div className="q-text">{q.text}</div>
          </li>
        ))}
      </ol>
    </section>
  )
}

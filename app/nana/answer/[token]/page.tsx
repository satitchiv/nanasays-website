import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import './shared-answer.css'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { data } = await supabase
    .from('nana_chat_logs')
    .select('question, school_slug')
    .eq('share_token', token)
    .maybeSingle()
  if (!data) return { title: 'Shared answer — Nanasays' }
  return {
    title: `${data.question.slice(0, 60)} — Nanasays`,
    description: `A research answer about ${data.school_slug} from Nanasays`,
  }
}

export default async function SharedAnswerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const { data } = await supabase
    .from('nana_chat_logs')
    .select('question, parsed_answer, school_slug, created_at')
    .eq('share_token', token)
    .maybeSingle()

  if (!data || !data.parsed_answer) notFound()

  const parsed = data.parsed_answer as any
  const s = parsed.sections ?? {}
  const sources: any[] = parsed.sources_used ?? []
  const schoolSlug: string = data.school_slug
  // Phase A — dual-render. Prose answers (intent router path) carry
  // { format: 'prose_v1', prose, citations } instead of { sections }.
  const isProse: boolean = parsed?.format === 'prose_v1' && typeof parsed?.prose === 'string'
  const proseCitations: string[] = Array.isArray(parsed?.citations) ? parsed.citations : []
  // P6 — share-route parity with NanaPanel + NanaBubble: hide citations
  // when the persisted validator output flagged hallucinations / out-of-scope
  // slugs. Same regex contract as NanaPanel.tsx:623 + NanaBubble.tsx:180.
  // Without this guard, prose answers reaching the public share link could
  // surface unverifiable URLs even though the in-app bubble hid them.
  const validationIssues: string[] = Array.isArray(parsed?.validationIssues)
    ? parsed.validationIssues
    : []
  const citationFailure = validationIssues.some((v: any) =>
    typeof v === 'string' && /sources_used|source_url|citation/i.test(v)
  )
  function isSafeShareUrl(u: string): boolean {
    try { const url = new URL(u); return url.protocol === 'https:' || url.protocol === 'http:' }
    catch { return false }
  }

  return (
    <div className="shared-answer-shell">
      <header className="shared-answer-header">
        <Link href="/" className="shared-answer-logo">nana<span>says</span></Link>
        <span className="shared-answer-school">
          Research on {schoolSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
        </span>
      </header>

      <main className="shared-answer-main">
        <div className="shared-answer-question">{data.question}</div>

        <article className="shared-answer-article">
          {isProse ? (
            <>
              <section>
                <p className="shared-prose" style={{ whiteSpace: 'pre-wrap' }}>{parsed.prose}</p>
              </section>
              {citationFailure ? (
                <section className="shared-sources">
                  <p className="shared-prose">
                    ⚠ Some source links were hidden because Nana cited something we couldn&apos;t verify.
                  </p>
                </section>
              ) : proseCitations.length > 0 && (
                <section className="shared-sources">
                  <div className="shared-eyebrow">Sources</div>
                  <div className="shared-pills">
                    {proseCitations
                      .filter((url) => typeof url === 'string' && isSafeShareUrl(url))
                      .slice(0, 8)
                      .map((url, i) => {
                        let label = 'source'
                        try { label = new URL(url).hostname.replace(/^www\./, '') } catch {}
                        return <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="shared-pill">{label}</a>
                      })}
                  </div>
                </section>
              )}
            </>
          ) : (<>
          {s.short_answer && (
            <section>
              <div className="shared-eyebrow">Short Answer</div>
              <p className="shared-short-answer">{s.short_answer}</p>
            </section>
          )}

          {s.confirmed_facts && (
            <section>
              <div className="shared-eyebrow">Confirmed Facts</div>
              <p className="shared-prose">{s.confirmed_facts}</p>
            </section>
          )}

          {s.what_this_means && (
            <section>
              <div className="shared-eyebrow">What This Means</div>
              <p className="shared-prose">{s.what_this_means}</p>
            </section>
          )}

          {s.tradeoff && (
            <section>
              <div className="shared-eyebrow shared-eyebrow--amber">⚠ Tradeoff / Watch-Out</div>
              <p className="shared-tradeoff">{s.tradeoff}</p>
            </section>
          )}

          {s.what_we_dont_know && (
            <section>
              <div className="shared-eyebrow">What We Don&apos;t Know</div>
              <p className="shared-prose">{s.what_we_dont_know}</p>
            </section>
          )}

          {citationFailure ? (
            <section className="shared-sources">
              <p className="shared-prose">
                ⚠ Some source links were hidden because Nana cited something we couldn&apos;t verify.
              </p>
            </section>
          ) : sources.length > 0 && (
            <section className="shared-sources">
              <div className="shared-eyebrow">Sources</div>
              <div className="shared-pills">
                {sources.map((src: any, i: number) => (
                  <span key={i} className="shared-pill">
                    {src.section_label || src.section_id || 'source'}
                  </span>
                ))}
              </div>
            </section>
          )}
          </>)}
        </article>

        <div className="shared-answer-cta">
          <p>This answer was researched by <strong>Nana</strong> — an AI advisor for parents choosing UK independent schools.</p>
          <Link href="/signup" className="shared-cta-btn">
            Research schools with Nanasays →
          </Link>
        </div>
      </main>
    </div>
  )
}

'use client'

import './assistant.css'
import { useState, useRef, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const navy  = '#1B3252'
const teal  = '#34C3A0'
const off   = '#F6F8FA'
const border = '#E2E8F0'
const muted  = '#6B7280'

type Source = { label: string; url: string }
type Message = {
  role: 'user' | 'assistant'
  text: string
  sources?: Source[]
  loading?: boolean
}

const SUGGESTED = [
  'What are the current tuition fees?',
  'What support do we offer for students with learning differences?',
  'What IB programmes does the school offer?',
  'How does the admissions process work?',
]

export default function AssistantPage() {
  const [slug, setSlug]       = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function getSlug() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: school } = await supabase
        .from('schools')
        .select('slug')
        .eq('admin_email', session.user.email)
        .single()
      if (school?.slug) setSlug(school.slug)
    }
    getSlug()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(question: string) {
    if (!question.trim() || loading || !slug) return
    setInput('')
    setLoading(true)

    setMessages(prev => [
      ...prev,
      { role: 'user', text: question },
      { role: 'assistant', text: '', loading: true },
    ])

    try {
      const res = await fetch('/api/school-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, question }),
      })
      const data = await res.json()

      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = {
          role: 'assistant',
          text: data.answer || data.error || 'No response.',
          sources: data.sources || [],
          loading: false,
        }
        return next
      })
    } catch {
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = {
          role: 'assistant',
          text: 'Something went wrong. Please try again.',
          loading: false,
        }
        return next
      })
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  return (
    <div className="ns-portal-assistant-content" style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: navy, margin: 0 }}>School Assistant</h1>
        <p style={{ fontSize: 13, color: muted, margin: '4px 0 0' }}>
          Ask anything about your school. Answers come only from your crawled website data and NanaSays profile.
        </p>
      </div>

      {/* Chat area */}
      <div style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16,
        paddingBottom: 16,
      }}>

        {/* Empty state */}
        {messages.length === 0 && (
          <div style={{ marginTop: 32 }}>
            <p style={{ fontSize: 13, color: muted, marginBottom: 16, fontWeight: 600 }}>Suggested questions</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SUGGESTED.map(q => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  style={{
                    textAlign: 'left', padding: '12px 16px', borderRadius: 10,
                    border: `1px solid ${border}`, background: '#fff',
                    fontSize: 14, color: navy, cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '82%',
              padding: '12px 16px',
              borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: msg.role === 'user' ? navy : '#fff',
              border: msg.role === 'assistant' ? `1px solid ${border}` : 'none',
              color: msg.role === 'user' ? '#fff' : navy,
              fontSize: 14,
              lineHeight: 1.6,
            }}>
              {msg.loading ? (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '4px 0' }}>
                  {[0,1,2].map(j => (
                    <div key={j} style={{
                      width: 6, height: 6, borderRadius: '50%', background: teal,
                      animation: `bounce 1s ease-in-out ${j * 0.2}s infinite`,
                    }} />
                  ))}
                </div>
              ) : (
                <>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
                  {msg.sources && msg.sources.length > 0 && (
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${border}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {msg.sources.map((s, si) => (
                        <a
                          key={si}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 11, color: teal, textDecoration: 'none',
                            display: 'flex', alignItems: 'center', gap: 4,
                          }}
                        >
                          <span style={{ opacity: 0.6 }}>Source:</span> {s.label}
                          <span style={{ opacity: 0.5, fontSize: 10 }}>↗</span>
                        </a>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div style={{
        borderTop: `1px solid ${border}`, paddingTop: 16,
        display: 'flex', gap: 10, alignItems: 'flex-end',
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask a question about your school..."
          rows={1}
          style={{
            flex: 1, padding: '12px 14px', borderRadius: 10,
            border: `1px solid ${border}`, fontSize: 14,
            fontFamily: 'inherit', resize: 'none', outline: 'none',
            color: navy, lineHeight: 1.5,
          }}
        />
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim() || !slug}
          style={{
            padding: '12px 20px', borderRadius: 10, border: 'none',
            background: loading || !input.trim() ? border : teal,
            color: loading || !input.trim() ? muted : '#fff',
            fontSize: 14, fontWeight: 700, cursor: loading || !input.trim() ? 'default' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          Send
        </button>
      </div>

    </div>
  )
}

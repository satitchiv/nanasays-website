'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Nav from '@/components/Nav'
import Link from 'next/link'

type Message = {
  role: 'nana' | 'user'
  text: string
}

const CHIPS = [
  'UK boarding schools under £40,000',
  'IB schools in Switzerland',
  'Schools in Singapore for age 10',
  'No entrance exam boarding',
]

function AskPageInner() {
  const searchParams = useSearchParams()
  const initialQ = searchParams.get('q') || ''

  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'nana',
      text: "Sawadee kha! I'm Nana — I help international families find the right school abroad. What would you like to know?",
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasAutoSent, setHasAutoSent] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-send initial query from URL param
  useEffect(() => {
    if (initialQ && !hasAutoSent) {
      setHasAutoSent(true)
      sendMessage(initialQ)
    }
  }, [initialQ]) // eslint-disable-line react-hooks/exhaustive-deps

  async function sendMessage(text: string) {
    const q = text.trim()
    if (!q || loading) return

    setMessages(prev => [...prev, { role: 'user', text: q }])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q }),
      })
      const data = await res.json()
      if (data.reply) {
        setMessages(prev => [...prev, { role: 'nana', text: data.reply }])
      } else {
        setMessages(prev => [...prev, { role: 'nana', text: "Sorry, I couldn't connect right now. Please try again." }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'nana', text: "Sorry, I couldn't connect right now. Please try again." }])
    } finally {
      setLoading(false)
    }
  }

  function handleSend() {
    sendMessage(input)
  }

  function handleChip(chip: string) {
    sendMessage(chip)
  }

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  return (
    <>
      <Nav />
      <div style={{
        marginTop: 60,
        minHeight: 'calc(100vh - 60px)',
        background: '#F0F4F8',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '32px 20px 40px',
      }}>

        {/* Back link */}
        <div style={{ width: '100%', maxWidth: 780, marginBottom: 16 }}>
          <Link href="/" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 13, color: 'var(--muted)', fontWeight: 500,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to home
          </Link>
        </div>

        {/* Chat container */}
        <div style={{
          width: '100%', maxWidth: 780,
          background: '#fff', borderRadius: 24,
          border: '1px solid var(--border)',
          boxShadow: '0 4px 32px rgba(27,50,82,.10)',
          display: 'flex', flexDirection: 'column',
          minHeight: 600,
          overflow: 'hidden',
        }}>

          {/* Header */}
          <div style={{
            padding: '20px 24px 18px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 14,
            flexShrink: 0,
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
              border: '2.5px solid rgba(52,195,160,.35)',
            }}>
              <svg width="52" height="52"><use href="#ic-nana" /></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{
                fontFamily: 'var(--font-nunito), Nunito, sans-serif',
                fontSize: 17, fontWeight: 900, color: 'var(--navy)', marginBottom: 2,
              }}>Nana</div>
              <div style={{
                fontSize: 10, fontWeight: 700, color: 'var(--muted)',
                textTransform: 'uppercase', letterSpacing: '1.2px',
              }}>Your International School Advisor</div>
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: '#fff', border: '1.5px solid #22C55E', borderRadius: 100,
              padding: '6px 14px', fontSize: 12, fontWeight: 800, color: '#22C55E',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E', display: 'inline-block' }} />
              LIVE
            </div>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, padding: '24px 24px 16px',
            display: 'flex', flexDirection: 'column', gap: 16,
            overflowY: 'auto', minHeight: 400,
          }}>
            {messages.map((msg, i) => (
              msg.role === 'nana' ? (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0 }}>
                    <svg width="30" height="30"><use href="#ic-nana" /></svg>
                  </div>
                  <div style={{
                    background: 'var(--off)', border: '1px solid var(--border)',
                    borderRadius: '4px 18px 18px 18px', padding: '14px 18px',
                    maxWidth: '85%',
                  }}>
                    <p style={{
                      fontSize: 14, lineHeight: 1.7, color: 'var(--body)',
                      whiteSpace: 'pre-wrap', margin: 0,
                    }}>{msg.text}</p>
                  </div>
                </div>
              ) : (
                <div key={i} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{
                    background: 'var(--navy)', color: '#fff',
                    borderRadius: '18px 4px 18px 18px', padding: '13px 17px',
                    maxWidth: '80%', fontSize: 14, lineHeight: 1.6,
                  }}>
                    {msg.text}
                  </div>
                </div>
              )
            ))}

            {/* Loading dots */}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0 }}>
                  <svg width="30" height="30"><use href="#ic-nana" /></svg>
                </div>
                <div style={{
                  background: 'var(--off)', border: '1px solid var(--border)',
                  borderRadius: '4px 18px 18px 18px', padding: '16px 20px',
                  display: 'flex', gap: 5, alignItems: 'center',
                }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{
                      width: 7, height: 7, borderRadius: '50%', background: 'var(--teal)',
                      display: 'inline-block',
                      animation: 'pulse 1.2s ease-in-out infinite',
                      animationDelay: `${i * 0.2}s`,
                    }} />
                  ))}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Chips — shown only when no conversation yet */}
          {messages.length <= 1 && !loading && (
            <div style={{ padding: '0 20px 12px', display: 'flex', gap: 7, flexWrap: 'wrap', flexShrink: 0 }}>
              {CHIPS.map(chip => (
                <button
                  key={chip}
                  onClick={() => handleChip(chip)}
                  style={{
                    padding: '8px 16px', borderRadius: 100, border: '1.5px solid var(--bmd)',
                    background: '#fff', fontSize: 12, fontWeight: 600, color: 'var(--navy)',
                    cursor: 'pointer', fontFamily: "'Nunito Sans', sans-serif",
                  }}
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ padding: '0 20px 16px', flexShrink: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, background: '#fff',
              border: '1.5px solid var(--bmd)', borderRadius: 100, padding: '10px 10px 10px 18px',
            }}>
              <svg width="16" height="16" style={{ color: 'var(--muted)', flexShrink: 0 }}>
                <use href="#ic-search" />
              </svg>
              <input
                type="text"
                placeholder="Ask Nana about any school, country, or curriculum..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                disabled={loading}
                style={{
                  flex: 1, border: 'none', outline: 'none',
                  fontFamily: "'Nunito Sans', sans-serif",
                  fontSize: 14, color: 'var(--navy)', background: 'transparent',
                }}
              />
              <button
                onClick={handleSend}
                disabled={loading}
                style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: loading ? 'var(--bmd)' : 'var(--navy)',
                  border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: loading ? 'not-allowed' : 'pointer', flexShrink: 0,
                  transition: 'background .15s',
                }}
              >
                <svg width="15" height="15" style={{ color: '#fff' }}>
                  <use href="#ic-send" />
                </svg>
              </button>
            </div>
          </div>

          <div style={{
            padding: '0 20px 16px', fontSize: 10, color: 'var(--muted)',
            textAlign: 'center', fontWeight: 300, lineHeight: 1.5, flexShrink: 0,
          }}>
            Nana uses school data to give personalised suggestions — always verify directly with the school.
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  )
}


export default function AskPage() {
  return (
    <Suspense>
      <AskPageInner />
    </Suspense>
  )
}

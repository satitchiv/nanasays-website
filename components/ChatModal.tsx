'use client'

import './ChatModal.css'
import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'nana' | 'user'
  text: string
}

const WELCOME: Message = {
  role: 'nana',
  text: "Hi! I'm Nana. Ask me anything about international schools — fees, curriculum, boarding, or which school might suit your child.",
}

export default function ChatModal({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text }])
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, {
        role: 'nana',
        text: data.reply || "Sorry, I couldn't get a response right now. Try again?",
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'nana',
        text: "Sorry, I couldn't connect right now. Please try again.",
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 900,
          background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 901,
        width: 520, maxWidth: '100vw',
        background: '#fff',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 32px rgba(0,0,0,0.18)',
      }}>
        {/* Header */}
        <div style={{
          background: 'var(--navy)', padding: '16px 20px',
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%',
            background: 'var(--teal)', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="4" fill="white"/>
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontWeight: 800, fontSize: 16, color: '#fff' }}>
              Ask Nana
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)' }}>
              International school advisor
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,.12)',
              border: 'none', color: '#fff', width: 32, height: 32, borderRadius: 8,
              cursor: 'pointer', fontSize: 18, lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '20px 16px',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          {messages.map((msg, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              gap: 8, alignItems: 'flex-end',
            }}>
              {msg.role === 'nana' && (
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="8" r="4" fill="white"/>
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
              )}
              <div style={{
                maxWidth: '78%',
                background: msg.role === 'nana' ? 'var(--teal-bg)' : 'var(--navy)',
                color: msg.role === 'nana' ? 'var(--body)' : '#fff',
                borderRadius: msg.role === 'nana' ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
                padding: '10px 14px',
                fontSize: 13,
                lineHeight: 1.6,
                fontFamily: "'Nunito Sans', sans-serif",
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {msg.text}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="8" r="4" fill="white"/>
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <div style={{
                background: 'var(--teal-bg)', borderRadius: '4px 14px 14px 14px',
                padding: '12px 16px', display: 'flex', gap: 5, alignItems: 'center',
              }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: 'var(--teal)',
                    animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{
          borderTop: '1px solid var(--border)', padding: '12px 16px',
          display: 'flex', gap: 8, flexShrink: 0, background: '#fff',
        }}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Ask about schools, fees, boarding..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            disabled={loading}
            style={{
              flex: 1, border: '1.5px solid var(--border)', borderRadius: 9,
              padding: '10px 14px', fontSize: 13, fontFamily: "'Nunito Sans', sans-serif",
              color: 'var(--body)', outline: 'none', background: loading ? 'var(--off)' : '#fff',
            }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            style={{
              padding: '10px 16px', borderRadius: 9, border: 'none',
              background: input.trim() && !loading ? 'var(--navy)' : 'var(--bmd)',
              color: '#fff', cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
              fontWeight: 700, fontSize: 13, fontFamily: "'Nunito Sans', sans-serif",
              transition: 'background .15s',
            }}
          >
            Send
          </button>
        </div>
      </div>

    </>
  )
}

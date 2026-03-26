'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useLang } from './LanguageProvider'

const SCHOOL_CARDS = [
  { name: 'TASIS England', meta: 'Surrey · IB + AP · From £35,740', color: '#34C3A0', slug: 'tasis-england' },
  { name: 'Marlborough College', meta: 'Wiltshire · A-Levels + IB · Sciences', color: '#2D7DD2', slug: 'marlborough-college' },
  { name: 'Cheltenham College', meta: 'Gloucestershire · IB · Sport focus', color: '#1B3252', slug: 'cheltenham-college' },
]

export default function HeroChat() {
  const [input, setInput] = useState('')
  const router = useRouter()
  const { t } = useLang()

  function handleSend() {
    const q = input.trim()
    if (!q) return
    router.push(`/ask?q=${encodeURIComponent(q)}`)
  }

  function handleChip(chip: string) {
    router.push(`/ask?q=${encodeURIComponent(chip)}`)
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      background: '#fff', borderRadius: 24, border: '1px solid rgba(255,255,255,.15)',
      overflow: 'hidden', boxShadow: '0 12px 60px rgba(0,0,0,.45)',
      height: 'calc(100vh - 160px)', maxHeight: 680,
    }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
            border: '2.5px solid rgba(52,195,160,.35)',
          }}>
            <svg width="52" height="52"><use href="#ic-nana" /></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontSize: 17, fontWeight: 900, color: 'var(--navy)', marginBottom: 2 }}>Nana</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1.2px' }}>{t('chat_header_sub')}</div>
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

        {/* Messages (static preview) */}
        <div style={{ flex: 1, padding: '24px 24px 16px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
          {/* Nana greeting */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0 }}>
              <svg width="30" height="30"><use href="#ic-nana" /></svg>
            </div>
            <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: '4px 18px 18px 18px', padding: '12px 16px', maxWidth: '88%' }}>
              <p style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--body)' }}>
                Sawadee kha! I&apos;m <strong style={{ color: 'var(--navy)' }}>Nana</strong> — I help international families find the right school abroad. Tell me about your child.
              </p>
            </div>
          </div>

          {/* User message */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ background: 'var(--navy)', color: '#fff', borderRadius: '18px 4px 18px 18px', padding: '12px 16px', maxWidth: '80%', fontSize: 13.5, lineHeight: 1.55 }}>
              My son is 14, loves science and sport. UK boarding, IB preferred.
            </div>
          </div>

          {/* Nana school suggestions */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0 }}>
              <svg width="30" height="30"><use href="#ic-nana" /></svg>
            </div>
            <div style={{ background: 'var(--off)', border: '1px solid var(--border)', borderRadius: '4px 18px 18px 18px', padding: '14px 16px', maxWidth: '88%' }}>
              <p style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--body)', marginBottom: 10 }}>
                Great profile. Here are 3 UK boarding schools that match well:
              </p>
              {SCHOOL_CARDS.map(school => (
                <Link key={school.name} href={`/schools/${school.slug}`} style={{
                  background: '#fff', border: '1px solid var(--border)', borderRadius: 14,
                  overflow: 'hidden', display: 'flex', alignItems: 'center', marginTop: 8, textDecoration: 'none',
                }}>
                  <div style={{ width: 6, alignSelf: 'stretch', background: school.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, padding: '11px 13px' }}>
                    <div style={{ fontFamily: 'var(--font-nunito), Nunito, sans-serif', fontSize: 13, fontWeight: 800, color: 'var(--navy)', marginBottom: 2 }}>{school.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{school.meta}</div>
                  </div>
                  <svg width="16" height="16" style={{ color: 'var(--muted)', marginRight: 12, flexShrink: 0 }}>
                    <use href="#ic-chevron" />
                  </svg>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Chips */}
        <div style={{ padding: '0 20px 12px', display: 'flex', gap: 7, flexWrap: 'wrap', flexShrink: 0 }}>
          {([t('chat_chip1'), t('chat_chip2'), t('chat_chip3'), t('chat_chip4')] as string[]).map(chip => (
            <button
              key={chip}
              onClick={() => handleChip(chip)}
              style={{
                padding: '8px 16px', borderRadius: 100, border: '1.5px solid var(--bmd)',
                background: '#fff', fontSize: 12, fontWeight: 600, color: 'var(--navy)', cursor: 'pointer',
                fontFamily: "'Nunito Sans', sans-serif",
              }}
            >
              {chip}
            </button>
          ))}
        </div>

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
              placeholder={t('chat_placeholder')}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              style={{
                flex: 1, border: 'none', outline: 'none',
                fontFamily: "'Nunito Sans', sans-serif", fontSize: 14, color: 'var(--navy)', background: 'transparent',
              }}
            />
            <button
              onClick={handleSend}
              style={{
                width: 40, height: 40, borderRadius: '50%', background: 'var(--navy)',
                border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              <svg width="15" height="15" style={{ color: '#fff' }}>
                <use href="#ic-send" />
              </svg>
            </button>
          </div>
        </div>

        <div style={{ padding: '0 20px 16px', fontSize: 10, color: 'var(--muted)', textAlign: 'center', fontWeight: 300, lineHeight: 1.5, flexShrink: 0 }}>
          {t('chat_disclaimer')}
        </div>
    </div>
  )
}

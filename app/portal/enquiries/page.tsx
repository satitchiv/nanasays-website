'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Enquiry {
  id: string
  parent_name: string
  parent_email: string
  child_age: string | null
  entry_year: string | null
  message: string
  is_read: boolean
  created_at: string
}

export default function EnquiriesPage() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [schoolId, setSchoolId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [isPartner, setIsPartner] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: school } = await supabase
        .from('schools')
        .select('id,is_partner,partner_expires')
        .eq('admin_email', session.user.email)
        .single()

      if (!school) return
      setSchoolId(school.id)

      const active = school.is_partner && school.partner_expires
        && new Date(school.partner_expires) > new Date()
      setIsPartner(!!active)

      if (active) {
        const { data } = await supabase
          .from('enquiries')
          .select('*')
          .eq('school_id', school.id)
          .order('created_at', { ascending: false })
        setEnquiries((data ?? []) as Enquiry[])
      }
      setLoading(false)
    }
    load()
  }, [])

  async function markRead(id: string) {
    await supabase.from('enquiries').update({ is_read: true }).eq('id', id)
    setEnquiries(prev => prev.map(e => e.id === id ? { ...e, is_read: true } : e))
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = prev === id ? null : id
      if (next) markRead(id)
      return next
    })
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const navy = '#1B3252'
  const teal = '#34C3A0'
  const tealDk = '#239C80'
  const tealBg = '#E8FAF6'
  const border = '#E2E8F0'
  const muted = '#6B7280'
  const off = '#F6F8FA'

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <div style={{ width: 36, height: 36, border: `3px solid ${tealBg}`, borderTop: `3px solid ${teal}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div className="ns-portal-content" style={{ padding: '40px 0 60px' }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: tealDk, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>
          School Portal
        </div>
        <h1 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 28, color: navy, margin: 0 }}>
          Parent Enquiries
        </h1>
      </div>

      {!isPartner ? (
        <div style={{
          background: '#fff', border: `1px solid ${border}`, borderRadius: 14,
          padding: '48px 36px', textAlign: 'center', maxWidth: 500, margin: '0 auto',
        }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={border} strokeWidth="1.5" style={{ display: 'block', margin: '0 auto' }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h2 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 20, color: navy, marginBottom: 12 }}>
            Partner feature
          </h2>
          <p style={{ fontSize: 14, color: muted, lineHeight: 1.7, marginBottom: 24 }}>
            Direct parent enquiries are available on the Partner plan.
            Upgrade to receive qualified leads from parents actively searching for schools in your region.
          </p>
          <a
            href="/partners#pricing"
            style={{
              display: 'inline-block', padding: '12px 28px', borderRadius: 10,
              background: teal, color: '#fff', textDecoration: 'none',
              fontSize: 13, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
            }}
          >
            Upgrade to Partner — £5,000/yr
          </a>
        </div>
      ) : enquiries.length === 0 ? (
        <div style={{
          background: '#fff', border: `1px solid ${border}`, borderRadius: 14,
          padding: '48px 36px', textAlign: 'center',
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={border} strokeWidth="1.5" style={{ display: 'block', margin: '0 auto 16px' }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <h2 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 20, color: navy, marginBottom: 12 }}>
            No enquiries yet
          </h2>
          <p style={{ fontSize: 14, color: muted, lineHeight: 1.7 }}>
            As parents find and engage with your profile, their messages will appear here.
            Make sure your profile is complete to maximise visibility.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {enquiries.map(e => (
            <div
              key={e.id}
              style={{
                background: '#fff', border: `1px solid ${e.is_read ? border : teal}`,
                borderRadius: 12, overflow: 'hidden',
                boxShadow: e.is_read ? 'none' : '0 0 0 3px rgba(52,195,160,0.08)',
              }}
            >
              {/* Row */}
              <button
                onClick={() => toggleExpand(e.id)}
                style={{
                  width: '100%', textAlign: 'left', padding: '16px 20px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 16,
                }}
              >
                {/* Unread dot */}
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: e.is_read ? 'transparent' : teal,
                  border: e.is_read ? `1.5px solid ${border}` : 'none',
                }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: navy, fontFamily: 'Nunito, sans-serif' }}>
                      {e.parent_name}
                    </span>
                    {e.child_age && (
                      <span style={{ fontSize: 11, color: muted }}>Child age: {e.child_age}</span>
                    )}
                    {e.entry_year && (
                      <span style={{ fontSize: 11, color: muted }}>Entry: {e.entry_year}</span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 13, color: muted, marginTop: 2,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {expanded === e.id ? e.parent_email : e.message}
                  </div>
                </div>

                <div style={{ fontSize: 12, color: muted, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                  {formatDate(e.created_at)}
                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2"
                    style={{ transform: expanded === e.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                  >
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
              </button>

              {/* Expanded */}
              {expanded === e.id && (
                <div style={{
                  borderTop: `1px solid ${border}`, padding: '20px 20px 20px 44px',
                  background: off,
                }}>
                  <div style={{ fontSize: 13, color: muted, marginBottom: 12, lineHeight: 1.7 }}>
                    {e.message}
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: muted, flexWrap: 'wrap' }}>
                    <span>
                      <strong style={{ color: navy }}>Email:</strong>{' '}
                      <a href={`mailto:${e.parent_email}`} style={{ color: tealDk }}>{e.parent_email}</a>
                    </span>
                    {e.child_age && <span><strong style={{ color: navy }}>Child&apos;s age:</strong> {e.child_age}</span>}
                    {e.entry_year && <span><strong style={{ color: navy }}>Target entry:</strong> {e.entry_year}</span>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const DEMO_SCHOOL_ID = '00000000-0000-0000-0000-000000000002'

const navy = '#1B3252'
const teal = '#34C3A0'
const tealDk = '#239C80'
const tealBg = '#E8FAF6'
const border = '#E2E8F0'
const muted = '#6B7280'
const off = '#F6F8FA'

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

export default function DemoEnquiriesPage() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('enquiries')
      .select('*')
      .eq('school_id', DEMO_SCHOOL_ID)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setEnquiries((data ?? []) as Enquiry[])
        setLoading(false)
      })
  }, [])

  function toggleExpand(id: string) {
    setExpanded(prev => prev === id ? null : id)
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <div style={{ width: 36, height: 36, border: `3px solid ${tealBg}`, borderTop: `3px solid ${teal}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 32px 60px' }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: tealDk, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>
          School Portal
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h1 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 28, color: navy, margin: 0 }}>
            Parent Enquiries
          </h1>
          <span style={{ fontSize: 13, color: muted }}>{enquiries.length} total</span>
          {enquiries.filter(e => !e.is_read).length > 0 && (
            <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', background: teal, borderRadius: 100, padding: '2px 10px' }}>
              {enquiries.filter(e => !e.is_read).length} unread
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {enquiries.map(e => (
          <div
            key={e.id}
            style={{
              background: '#fff',
              border: `1px solid ${e.is_read ? border : teal}`,
              borderRadius: 12, overflow: 'hidden',
              boxShadow: e.is_read ? 'none' : '0 0 0 3px rgba(52,195,160,0.08)',
            }}
          >
            <button
              onClick={() => toggleExpand(e.id)}
              style={{
                width: '100%', textAlign: 'left', padding: '16px 20px',
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 16,
              }}
            >
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
                  {e.child_age && <span style={{ fontSize: 11, color: muted }}>Child age: {e.child_age}</span>}
                  {e.entry_year && <span style={{ fontSize: 11, color: muted }}>Entry: {e.entry_year}</span>}
                </div>
                <div style={{ fontSize: 13, color: muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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

            {expanded === e.id && (
              <div style={{ borderTop: `1px solid ${border}`, padding: '20px 20px 20px 44px', background: off }}>
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
    </div>
  )
}

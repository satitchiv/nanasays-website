'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

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

interface GrowthInsight {
  headline: string
  insight: string
  action: string
  priority: 'high' | 'medium' | 'low'
}

export default function DemoPortalPage() {
  const [stats, setStats] = useState({ impressions: 0, views: 0, enquiries: 0, unread: 0 })
  const [loading, setLoading] = useState(true)
  const [growthInsight, setGrowthInsight] = useState<GrowthInsight | null>(null)
  const [insightLoading, setInsightLoading] = useState(false)

  useEffect(() => {
    async function load() {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

      const [{ data: analytics }, { data: enquiries }] = await Promise.all([
        supabase.from('school_analytics').select('event_type').eq('school_id', DEMO_SCHOOL_ID).gte('created_at', since),
        supabase.from('enquiries').select('is_read').eq('school_id', DEMO_SCHOOL_ID),
      ])

      const impressions = analytics?.filter(e => e.event_type === 'impression').length ?? 0
      const views = analytics?.filter(e => e.event_type === 'view').length ?? 0
      const enquiryCount = enquiries?.length ?? 0
      const unread = enquiries?.filter(e => !e.is_read).length ?? 0

      setStats({ impressions, views, enquiries: enquiryCount, unread })
      setLoading(false)

      // Load AI growth insight
      setInsightLoading(true)
      fetch('/api/growth-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolId: DEMO_SCHOOL_ID }),
      })
        .then(r => r.json())
        .then(data => { if (data.recommendation) setGrowthInsight(data.recommendation) })
        .catch(() => {})
        .finally(() => setInsightLoading(false))
    }
    load()
  }, [])

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

      {/* Header */}
      <div style={{ marginBottom: 32, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: tealDk, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>
            School Portal
          </div>
          <h1 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 28, color: navy, letterSpacing: '-0.02em', margin: 0 }}>
            Demo International School Bangkok
          </h1>
          <div style={{ fontSize: 13, color: muted, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            Bangkok, Thailand
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, fontWeight: 800, color: tealDk, background: tealBg,
              border: '1px solid rgba(52,195,160,0.3)', borderRadius: 100, padding: '2px 8px',
            }}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
              Verified Partner
            </span>
          </div>
        </div>
        <a
          href="/schools/demo-international-school-bangkok"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '10px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700,
            background: '#fff', border: `1.5px solid ${border}`, color: navy,
            textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          View public listing
        </a>
      </div>

      {/* Stats hero */}
      <div style={{
        background: navy, borderRadius: 16, padding: '32px 36px', marginBottom: 20,
        backgroundImage: 'radial-gradient(circle at 80% 50%, rgba(52,195,160,0.08) 0%, transparent 60%)',
      }}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>Last 7 days</div>
        <div style={{ fontSize: 'clamp(18px,3vw,26px)', fontWeight: 900, color: '#fff', fontFamily: 'Nunito, sans-serif', marginBottom: 6, lineHeight: 1.2 }}>
          Your school was seen{' '}
          <span style={{ color: teal }}>{stats.impressions.toLocaleString()} times</span>
          {' '}by parents searching international schools in Thailand
        </div>
        <div style={{ display: 'flex', gap: 32, marginTop: 24, flexWrap: 'wrap' }}>
          {[
            { label: 'Impressions', value: stats.impressions, desc: 'appeared in searches' },
            { label: 'Profile views', value: stats.views, desc: 'visited your page' },
            { label: 'Enquiries', value: stats.enquiries, desc: 'messages from parents', highlight: stats.unread > 0 },
          ].map(stat => (
            <div key={stat.label}>
              <div style={{ fontSize: 32, fontWeight: 900, color: stat.highlight ? teal : '#fff', fontFamily: 'Nunito, sans-serif', lineHeight: 1 }}>
                {stat.value.toLocaleString()}
                {stat.highlight && (
                  <span style={{ fontSize: 13, color: teal, marginLeft: 8 }}>({stats.unread} new)</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
                {stat.label} — {stat.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Enquiries panel */}
        <div style={{ background: '#fff', border: `1px solid ${border}`, borderRadius: 12, padding: '24px 26px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: navy, fontFamily: 'Nunito, sans-serif' }}>
              Parent enquiries
            </div>
            <Link href="/portal/demo/enquiries" style={{ fontSize: 12, color: tealDk, textDecoration: 'none', fontWeight: 700 }}>
              View all →
            </Link>
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: navy, fontFamily: 'Nunito, sans-serif' }}>
            {stats.enquiries}
            <span style={{ fontSize: 13, color: muted, fontWeight: 400, marginLeft: 8 }}>total</span>
            {stats.unread > 0 && (
              <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 800, color: '#fff', background: teal, borderRadius: 100, padding: '2px 10px' }}>
                {stats.unread} unread
              </span>
            )}
          </div>
        </div>

        {/* Profile quick actions */}
        <div style={{ background: '#fff', border: `1px solid ${border}`, borderRadius: 12, padding: '24px 26px' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: navy, fontFamily: 'Nunito, sans-serif', marginBottom: 16 }}>
            Your profile
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Description', ok: true },
              { label: 'Hero image', ok: true },
              { label: 'Fees', ok: true },
              { label: 'Accreditations', ok: true },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span style={{ color: muted }}>{item.label}</span>
                <span style={{ fontWeight: 700, color: item.ok ? tealDk : '#e53e3e' }}>{item.ok ? 'Set' : 'Missing'}</span>
              </div>
            ))}
          </div>
          <Link
            href="/portal/demo/edit"
            style={{
              display: 'block', textAlign: 'center', marginTop: 18,
              padding: '9px 16px', borderRadius: 8,
              background: off, border: `1.5px solid ${border}`,
              color: navy, textDecoration: 'none', fontSize: 12, fontWeight: 700,
            }}
          >
            Edit profile
          </Link>
        </div>
      </div>

      {/* Content Booster */}
      <div style={{
        background: navy, borderRadius: 12, padding: '24px 26px', marginBottom: 16,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: teal, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>
            Content Booster
          </div>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', fontFamily: 'Nunito, sans-serif', marginBottom: 6 }}>
            4 blog posts included per year
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
            Your first post is being prepared. AI-optimised, multilingual content targeting parents in your key markets.
            Expect it within 2–3 weeks of joining.
          </div>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 10, padding: '14px 20px', textAlign: 'center', minWidth: 120, flexShrink: 0,
        }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: teal, fontFamily: 'Nunito, sans-serif', lineHeight: 1 }}>0</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>of 4 published</div>
        </div>
      </div>

      {/* Growth Advisor */}
      <div style={{
        background: growthInsight ? navy : '#fff',
        border: growthInsight ? 'none' : `1.5px dashed ${border}`,
        borderRadius: 12, padding: '24px 26px',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: growthInsight ? 'rgba(255,255,255,0.08)' : off,
            border: growthInsight ? '1px solid rgba(255,255,255,0.15)' : `1px solid ${border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {insightLoading ? (
              <div style={{ width: 16, height: 16, border: `2px solid rgba(52,195,160,0.3)`, borderTop: `2px solid ${teal}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={tealDk} strokeWidth="2">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: growthInsight ? '#fff' : navy, fontFamily: 'Nunito, sans-serif' }}>
                Growth Advisor
              </div>
              {growthInsight && (
                <span style={{
                  fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em',
                  color: growthInsight.priority === 'high' ? '#fff' : teal,
                  background: growthInsight.priority === 'high' ? teal : 'rgba(52,195,160,0.2)',
                  padding: '2px 8px', borderRadius: 100,
                }}>
                  {growthInsight.priority} priority
                </span>
              )}
            </div>
            {insightLoading ? (
              <div style={{ fontSize: 13, color: muted }}>Generating your personalised recommendation...</div>
            ) : growthInsight ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 800, color: teal, fontFamily: 'Nunito, sans-serif', marginBottom: 8 }}>
                  {growthInsight.headline}
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.65, marginBottom: 12 }}>
                  {growthInsight.insight}
                </div>
                <div style={{
                  background: 'rgba(52,195,160,0.12)', border: '1px solid rgba(52,195,160,0.25)',
                  borderRadius: 8, padding: '10px 14px',
                  fontSize: 13, color: '#fff', lineHeight: 1.6,
                }}>
                  <span style={{ fontWeight: 700, color: teal }}>This week: </span>
                  {growthInsight.action}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: muted, lineHeight: 1.6 }}>
                Generating AI recommendation based on your 45 days of data...
              </div>
            )}
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>

    </div>
  )
}

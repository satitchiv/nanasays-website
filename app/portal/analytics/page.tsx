'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const navy = '#1B3252'
const teal = '#34C3A0'
const tealDk = '#239C80'
const tealBg = '#E8FAF6'
const border = '#E2E8F0'
const muted = '#6B7280'
const off = '#F6F8FA'

type Period = '7' | '30' | '90'

interface DayBucket {
  date: string
  impressions: number
  views: number
  enquiries: number
}

interface Stats {
  totalImpressions: number
  totalViews: number
  totalEnquiries: number
  prevImpressions: number
  prevViews: number
  prevEnquiries: number
  buckets: DayBucket[]
  peakDay: string
  peakDayImpressions: number
  conversionRate: number
}

function pct(curr: number, prev: number) {
  if (prev === 0) return curr > 0 ? '+100%' : '—'
  const diff = Math.round(((curr - prev) / prev) * 100)
  return diff >= 0 ? `+${diff}%` : `${diff}%`
}

function pctColor(curr: number, prev: number) {
  if (prev === 0) return muted
  return curr >= prev ? tealDk : '#e53e3e'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function AnalyticsPage() {
  const [schoolId, setSchoolId] = useState<string | null>(null)
  const [isPartner, setIsPartner] = useState(false)
  const [period, setPeriod] = useState<Period>('30')
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadSchool() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: school } = await supabase
        .from('schools')
        .select('id, is_partner, partner_expires')
        .eq('admin_email', session.user.email)
        .single()
      if (!school) return
      const active = school.is_partner && school.partner_expires && new Date(school.partner_expires) > new Date()
      setIsPartner(!!active)
      setSchoolId(school.id)
    }
    loadSchool()
  }, [])

  useEffect(() => {
    if (!schoolId) return
    loadStats(schoolId, period)
  }, [schoolId, period])

  async function loadStats(id: string, days: Period) {
    setLoading(true)
    const daysNum = parseInt(days)
    const since = new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000).toISOString()
    const prevSince = new Date(Date.now() - daysNum * 2 * 24 * 60 * 60 * 1000).toISOString()

    const [{ data: analytics }, { data: prevAnalytics }, { data: enquiries }, { data: prevEnquiries }] = await Promise.all([
      supabase.from('school_analytics').select('event_type, created_at').eq('school_id', id).gte('created_at', since),
      supabase.from('school_analytics').select('event_type, created_at').eq('school_id', id).gte('created_at', prevSince).lt('created_at', since),
      supabase.from('enquiries').select('created_at').eq('school_id', id).gte('created_at', since),
      supabase.from('enquiries').select('created_at').eq('school_id', id).gte('created_at', prevSince).lt('created_at', since),
    ])

    const curr = analytics ?? []
    const prev = prevAnalytics ?? []
    const enq = enquiries ?? []
    const prevEnq = prevEnquiries ?? []

    const totalImpressions = curr.filter(e => e.event_type === 'impression').length
    const totalViews = curr.filter(e => e.event_type === 'view').length
    const totalEnquiries = enq.length
    const prevImpressions = prev.filter(e => e.event_type === 'impression').length
    const prevViews = prev.filter(e => e.event_type === 'view').length
    const prevEnquiriesCount = prevEnq.length

    // Build daily buckets
    const bucketMap: Record<string, DayBucket> = {}
    for (let i = daysNum - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      const key = d.toISOString().slice(0, 10)
      bucketMap[key] = { date: key, impressions: 0, views: 0, enquiries: 0 }
    }
    curr.forEach(e => {
      const key = e.created_at.slice(0, 10)
      if (bucketMap[key]) {
        if (e.event_type === 'impression') bucketMap[key].impressions++
        if (e.event_type === 'view') bucketMap[key].views++
      }
    })
    enq.forEach(e => {
      const key = e.created_at.slice(0, 10)
      if (bucketMap[key]) bucketMap[key].enquiries++
    })

    const buckets = Object.values(bucketMap)
    const peakBucket = buckets.reduce((a, b) => b.impressions > a.impressions ? b : a, buckets[0])
    const conversionRate = totalImpressions > 0 ? Math.round((totalViews / totalImpressions) * 100) : 0

    setStats({
      totalImpressions, totalViews, totalEnquiries,
      prevImpressions, prevViews, prevEnquiries: prevEnquiriesCount,
      buckets, peakDay: peakBucket?.date ?? '', peakDayImpressions: peakBucket?.impressions ?? 0,
      conversionRate,
    })
    setLoading(false)
  }

  // Chart helpers
  function MiniChart({ buckets, field, color }: { buckets: DayBucket[], field: keyof DayBucket, color: string }) {
    const values = buckets.map(b => b[field] as number)
    const max = Math.max(...values, 1)
    const w = 600
    const h = 120
    const gap = w / (values.length - 1 || 1)

    const points = values.map((v, i) => `${i * gap},${h - (v / max) * (h - 10)}`).join(' ')

    // Show only ~6 date labels
    const step = Math.ceil(buckets.length / 6)
    const labels = buckets.filter((_, i) => i % step === 0 || i === buckets.length - 1)

    return (
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${w} ${h + 24}`} style={{ width: '100%', minWidth: 280, display: 'block' }}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(frac => (
            <line
              key={frac}
              x1={0} y1={h - frac * (h - 10)}
              x2={w} y2={h - frac * (h - 10)}
              stroke={border} strokeWidth={1}
            />
          ))}
          {/* Area fill */}
          <polygon
            points={`0,${h} ${points} ${(values.length - 1) * gap},${h}`}
            fill={color} opacity={0.08}
          />
          {/* Line */}
          <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
          {/* Dots */}
          {values.map((v, i) => (
            <circle
              key={i}
              cx={i * gap}
              cy={h - (v / max) * (h - 10)}
              r={values.length <= 14 ? 3 : 2}
              fill={color}
            />
          ))}
          {/* Date labels */}
          {labels.map(b => {
            const i = buckets.indexOf(b)
            return (
              <text key={b.date} x={i * gap} y={h + 18} textAnchor="middle" fontSize={9} fill={muted}>
                {formatDate(b.date)}
              </text>
            )
          })}
        </svg>
      </div>
    )
  }

  if (!schoolId || loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <div style={{ width: 36, height: 36, border: `3px solid ${tealBg}`, borderTop: `3px solid ${teal}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  return (
    <div className="ns-portal-content" style={{ padding: '40px 0 60px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: tealDk, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>
            Analytics
          </div>
          <h1 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 26, color: navy, letterSpacing: '-0.02em', margin: 0 }}>
            Performance overview
          </h1>
        </div>
        {/* Period selector */}
        <div style={{ display: 'flex', gap: 6, background: '#fff', border: `1px solid ${border}`, borderRadius: 10, padding: 4 }}>
          {(['7', '30', '90'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: '6px 16px', borderRadius: 7, fontSize: 12, fontWeight: 700,
                background: period === p ? navy : 'transparent',
                color: period === p ? '#fff' : muted,
                border: 'none', cursor: 'pointer',
              }}
            >
              {p}d
            </button>
          ))}
        </div>
      </div>

      {/* Partner gate */}
      {!isPartner && (
        <div style={{
          background: '#fff', border: `1px solid ${border}`, borderRadius: 12,
          padding: '20px 24px', marginBottom: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: 13, color: muted, lineHeight: 1.6 }}>
            Full analytics are available on the <strong style={{ color: navy }}>Partner plan</strong>. You can see your last 7 days on the overview.
          </div>
          <a href="/partners#pricing" style={{ padding: '9px 20px', borderRadius: 8, background: teal, color: '#fff', textDecoration: 'none', fontSize: 12, fontWeight: 800, fontFamily: 'Nunito, sans-serif', whiteSpace: 'nowrap', flexShrink: 0 }}>
            Upgrade →
          </a>
        </div>
      )}

      {/* KPI cards */}
      <div className="ns-portal-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Impressions', value: stats!.totalImpressions, prev: stats!.prevImpressions, desc: 'appeared in search' },
          { label: 'Profile views', value: stats!.totalViews, prev: stats!.prevViews, desc: 'visited your page' },
          { label: 'Enquiries', value: stats!.totalEnquiries, prev: stats!.prevEnquiries, desc: 'messages from parents' },
          { label: 'Click-through', value: stats!.conversionRate, prev: 0, desc: '% impressions → view', isPercent: true },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: '#fff', border: `1px solid ${border}`, borderRadius: 12, padding: '20px 22px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
              {kpi.label}
            </div>
            <div style={{ fontFamily: 'Nunito, sans-serif', fontSize: 32, fontWeight: 900, color: navy, lineHeight: 1, marginBottom: 4 }}>
              {kpi.isPercent ? `${kpi.value}%` : kpi.value.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: muted, marginBottom: 8 }}>{kpi.desc}</div>
            {!kpi.isPercent && (
              <div style={{ fontSize: 11, fontWeight: 700, color: pctColor(kpi.value, kpi.prev) }}>
                {pct(kpi.value, kpi.prev)} vs prev period
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20, marginBottom: 24 }}>

        {/* Impressions chart */}
        <div style={{ background: '#fff', border: `1px solid ${border}`, borderRadius: 14, padding: '28px 28px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: navy, fontFamily: 'Nunito, sans-serif' }}>
              Impressions &amp; profile views
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: muted }}>
                <span style={{ width: 10, height: 2, background: teal, display: 'inline-block', borderRadius: 2 }} />
                Impressions
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: muted }}>
                <span style={{ width: 10, height: 2, background: navy, display: 'inline-block', borderRadius: 2 }} />
                Views
              </span>
            </div>
          </div>
          {/* Dual-line chart */}
          <DualChart buckets={stats!.buckets} />
        </div>

        {/* Enquiries chart */}
        <div style={{ background: '#fff', border: `1px solid ${border}`, borderRadius: 14, padding: '28px 28px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: navy, fontFamily: 'Nunito, sans-serif', marginBottom: 20 }}>
            Enquiries over time
          </div>
          <MiniChart buckets={stats!.buckets} field="enquiries" color="#2D7DD2" />
        </div>
      </div>

      {/* Insights row */}
      <div className="ns-form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>

        {/* Peak day */}
        <div style={{ background: navy, borderRadius: 12, padding: '24px 26px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: teal, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>
            Peak day
          </div>
          <div style={{ fontFamily: 'Nunito, sans-serif', fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 4 }}>
            {stats!.peakDay ? formatDate(stats!.peakDay) : '—'}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            {stats!.peakDayImpressions > 0
              ? `${stats!.peakDayImpressions} impressions — your busiest day this period`
              : 'No data yet for this period'}
          </div>
        </div>

        {/* Conversion insight */}
        <div style={{ background: '#fff', border: `1px solid ${border}`, borderRadius: 12, padding: '24px 26px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: tealDk, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>
            Conversion insight
          </div>
          <div style={{ fontFamily: 'Nunito, sans-serif', fontSize: 22, fontWeight: 900, color: navy, marginBottom: 4 }}>
            {stats!.conversionRate}% click-through
          </div>
          <div style={{ fontSize: 13, color: muted, lineHeight: 1.6 }}>
            {stats!.conversionRate >= 15
              ? 'Strong — parents who see your school are clicking through to learn more.'
              : stats!.conversionRate >= 5
              ? 'Average — a stronger hero image or description could lift this.'
              : 'Below average — consider updating your profile photo and description.'}
          </div>
        </div>
      </div>

      {/* Growth Advisor CTA */}
      <div style={{
        background: off, border: `1.5px dashed ${border}`, borderRadius: 12, padding: '24px 26px',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: navy, fontFamily: 'Nunito, sans-serif', marginBottom: 4 }}>
            Growth Advisor
          </div>
          <div style={{ fontSize: 13, color: muted, lineHeight: 1.6, maxWidth: 500 }}>
            Get a personalised AI recommendation based on how parents are finding and engaging with your school.
            Available once you have 30 days of data.
          </div>
        </div>
        <Link
          href="/portal"
          style={{
            padding: '9px 20px', borderRadius: 8, background: '#fff', border: `1.5px solid ${border}`,
            color: navy, textDecoration: 'none', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          Back to overview
        </Link>
      </div>

    </div>
  )
}

function DualChart({ buckets }: { buckets: DayBucket[] }) {
  const impressions = buckets.map(b => b.impressions)
  const views = buckets.map(b => b.views)
  const max = Math.max(...impressions, ...views, 1)
  const w = 600
  const h = 120
  const gap = w / (buckets.length - 1 || 1)

  const impPoints = impressions.map((v, i) => `${i * gap},${h - (v / max) * (h - 10)}`).join(' ')
  const viewPoints = views.map((v, i) => `${i * gap},${h - (v / max) * (h - 10)}`).join(' ')

  const step = Math.ceil(buckets.length / 6)
  const labels = buckets.filter((_, i) => i % step === 0 || i === buckets.length - 1)

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${w} ${h + 24}`} style={{ width: '100%', minWidth: 280, display: 'block' }}>
        {[0, 0.25, 0.5, 0.75, 1].map(frac => (
          <line key={frac} x1={0} y1={h - frac * (h - 10)} x2={w} y2={h - frac * (h - 10)} stroke={border} strokeWidth={1} />
        ))}
        <polygon points={`0,${h} ${impPoints} ${(buckets.length - 1) * gap},${h}`} fill={teal} opacity={0.07} />
        <polyline points={impPoints} fill="none" stroke={teal} strokeWidth={2} strokeLinejoin="round" />
        <polyline points={viewPoints} fill="none" stroke={navy} strokeWidth={1.5} strokeLinejoin="round" strokeDasharray="4 3" />
        {labels.map(b => {
          const i = buckets.indexOf(b)
          return (
            <text key={b.date} x={i * gap} y={h + 18} textAnchor="middle" fontSize={9} fill={muted}>
              {new Date(b.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

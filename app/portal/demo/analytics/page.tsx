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

type Period = '7' | '30' | '90'

interface DayBucket { date: string; impressions: number; views: number; enquiries: number }

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

export default function DemoAnalyticsPage() {
  const [period, setPeriod] = useState<Period>('30')
  const [data, setData] = useState<{
    totalImpressions: number; totalViews: number; totalEnquiries: number
    prevImpressions: number; prevViews: number; prevEnquiries: number
    buckets: DayBucket[]; peakDay: string; peakDayImpressions: number; conversionRate: number
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadStats(period) }, [period])

  async function loadStats(days: Period) {
    setLoading(true)
    const daysNum = parseInt(days)
    const since = new Date(Date.now() - daysNum * 86400000).toISOString()
    const prevSince = new Date(Date.now() - daysNum * 2 * 86400000).toISOString()

    const [{ data: curr }, { data: prev }, { data: enq }, { data: prevEnq }] = await Promise.all([
      supabase.from('school_analytics').select('event_type,created_at').eq('school_id', DEMO_SCHOOL_ID).gte('created_at', since),
      supabase.from('school_analytics').select('event_type,created_at').eq('school_id', DEMO_SCHOOL_ID).gte('created_at', prevSince).lt('created_at', since),
      supabase.from('enquiries').select('created_at').eq('school_id', DEMO_SCHOOL_ID).gte('created_at', since),
      supabase.from('enquiries').select('created_at').eq('school_id', DEMO_SCHOOL_ID).gte('created_at', prevSince).lt('created_at', since),
    ])

    const totalImpressions = curr?.filter(e => e.event_type === 'impression').length ?? 0
    const totalViews = curr?.filter(e => e.event_type === 'view').length ?? 0
    const totalEnquiries = enq?.length ?? 0
    const prevImpressions = prev?.filter(e => e.event_type === 'impression').length ?? 0
    const prevViews = prev?.filter(e => e.event_type === 'view').length ?? 0
    const prevEnquiries = prevEnq?.length ?? 0

    const bucketMap: Record<string, DayBucket> = {}
    for (let i = daysNum - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000)
      const key = d.toISOString().slice(0, 10)
      bucketMap[key] = { date: key, impressions: 0, views: 0, enquiries: 0 }
    }
    curr?.forEach(e => {
      const key = e.created_at.slice(0, 10)
      if (bucketMap[key]) {
        if (e.event_type === 'impression') bucketMap[key].impressions++
        if (e.event_type === 'view') bucketMap[key].views++
      }
    })
    enq?.forEach(e => {
      const key = e.created_at.slice(0, 10)
      if (bucketMap[key]) bucketMap[key].enquiries++
    })

    const buckets = Object.values(bucketMap)
    const peak = buckets.reduce((a, b) => b.impressions > a.impressions ? b : a, buckets[0])
    const conversionRate = totalImpressions > 0 ? Math.round((totalViews / totalImpressions) * 100) : 0

    setData({ totalImpressions, totalViews, totalEnquiries, prevImpressions, prevViews, prevEnquiries, buckets, peakDay: peak?.date ?? '', peakDayImpressions: peak?.impressions ?? 0, conversionRate })
    setLoading(false)
  }

  function DualChart({ buckets }: { buckets: DayBucket[] }) {
    const imp = buckets.map(b => b.impressions)
    const views = buckets.map(b => b.views)
    const max = Math.max(...imp, ...views, 1)
    const w = 600; const h = 120
    const gap = w / (buckets.length - 1 || 1)
    const impPts = imp.map((v, i) => `${i * gap},${h - (v / max) * (h - 10)}`).join(' ')
    const viewPts = views.map((v, i) => `${i * gap},${h - (v / max) * (h - 10)}`).join(' ')
    const step = Math.ceil(buckets.length / 6)
    const labels = buckets.filter((_, i) => i % step === 0 || i === buckets.length - 1)
    return (
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${w} ${h + 24}`} style={{ width: '100%', minWidth: 280, display: 'block' }}>
          {[0, 0.25, 0.5, 0.75, 1].map(f => <line key={f} x1={0} y1={h - f * (h - 10)} x2={w} y2={h - f * (h - 10)} stroke={border} strokeWidth={1} />)}
          <polygon points={`0,${h} ${impPts} ${(buckets.length - 1) * gap},${h}`} fill={teal} opacity={0.07} />
          <polyline points={impPts} fill="none" stroke={teal} strokeWidth={2} strokeLinejoin="round" />
          <polyline points={viewPts} fill="none" stroke={navy} strokeWidth={1.5} strokeLinejoin="round" strokeDasharray="4 3" />
          {labels.map(b => {
            const i = buckets.indexOf(b)
            return <text key={b.date} x={i * gap} y={h + 18} textAnchor="middle" fontSize={9} fill={muted}>{formatDate(b.date)}</text>
          })}
        </svg>
      </div>
    )
  }

  function MiniChart({ buckets, color }: { buckets: DayBucket[]; color: string }) {
    const vals = buckets.map(b => b.enquiries)
    const max = Math.max(...vals, 1)
    const w = 600; const h = 120
    const gap = w / (vals.length - 1 || 1)
    const pts = vals.map((v, i) => `${i * gap},${h - (v / max) * (h - 10)}`).join(' ')
    const step = Math.ceil(buckets.length / 6)
    const labels = buckets.filter((_, i) => i % step === 0 || i === buckets.length - 1)
    return (
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${w} ${h + 24}`} style={{ width: '100%', minWidth: 280, display: 'block' }}>
          {[0, 0.25, 0.5, 0.75, 1].map(f => <line key={f} x1={0} y1={h - f * (h - 10)} x2={w} y2={h - f * (h - 10)} stroke={border} strokeWidth={1} />)}
          <polygon points={`0,${h} ${pts} ${(vals.length - 1) * gap},${h}`} fill={color} opacity={0.08} />
          <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
          {labels.map(b => {
            const i = buckets.indexOf(b)
            return <text key={b.date} x={i * gap} y={h + 18} textAnchor="middle" fontSize={9} fill={muted}>{formatDate(b.date)}</text>
          })}
        </svg>
      </div>
    )
  }

  if (loading || !data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <div style={{ width: 36, height: 36, border: `3px solid ${tealBg}`, borderTop: `3px solid ${teal}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 32px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: tealDk, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>Analytics</div>
          <h1 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 26, color: navy, letterSpacing: '-0.02em', margin: 0 }}>Performance overview</h1>
        </div>
        <div style={{ display: 'flex', gap: 6, background: '#fff', border: `1px solid ${border}`, borderRadius: 10, padding: 4 }}>
          {(['7', '30', '90'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: '6px 16px', borderRadius: 7, fontSize: 12, fontWeight: 700,
              background: period === p ? navy : 'transparent',
              color: period === p ? '#fff' : muted,
              border: 'none', cursor: 'pointer',
            }}>{p}d</button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Impressions', value: data.totalImpressions, prev: data.prevImpressions, desc: 'appeared in search' },
          { label: 'Profile views', value: data.totalViews, prev: data.prevViews, desc: 'visited your page' },
          { label: 'Enquiries', value: data.totalEnquiries, prev: data.prevEnquiries, desc: 'messages from parents' },
          { label: 'Click-through', value: data.conversionRate, prev: 0, desc: '% impressions → view', isPercent: true },
        ].map(kpi => (
          <div key={kpi.label} style={{ background: '#fff', border: `1px solid ${border}`, borderRadius: 12, padding: '20px 22px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>{kpi.label}</div>
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

      <div style={{ display: 'grid', gap: 20, marginBottom: 24 }}>
        <div style={{ background: '#fff', border: `1px solid ${border}`, borderRadius: 14, padding: '28px 28px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: navy, fontFamily: 'Nunito, sans-serif' }}>Impressions &amp; profile views</div>
            <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: muted }}>
                <span style={{ width: 10, height: 2, background: teal, display: 'inline-block', borderRadius: 2 }} />Impressions
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: muted }}>
                <span style={{ width: 10, height: 2, background: navy, display: 'inline-block', borderRadius: 2 }} />Views
              </span>
            </div>
          </div>
          <DualChart buckets={data.buckets} />
        </div>

        <div style={{ background: '#fff', border: `1px solid ${border}`, borderRadius: 14, padding: '28px 28px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: navy, fontFamily: 'Nunito, sans-serif', marginBottom: 20 }}>Enquiries over time</div>
          <MiniChart buckets={data.buckets} color="#2D7DD2" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: navy, borderRadius: 12, padding: '24px 26px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: teal, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>Peak day</div>
          <div style={{ fontFamily: 'Nunito, sans-serif', fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 4 }}>
            {data.peakDay ? formatDate(data.peakDay) : '—'}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            {data.peakDayImpressions > 0 ? `${data.peakDayImpressions} impressions — your busiest day this period` : 'No data yet'}
          </div>
        </div>
        <div style={{ background: '#fff', border: `1px solid ${border}`, borderRadius: 12, padding: '24px 26px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: tealDk, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>Conversion insight</div>
          <div style={{ fontFamily: 'Nunito, sans-serif', fontSize: 22, fontWeight: 900, color: navy, marginBottom: 4 }}>{data.conversionRate}% click-through</div>
          <div style={{ fontSize: 13, color: muted, lineHeight: 1.6 }}>
            {data.conversionRate >= 15 ? 'Strong — parents who see your school are clicking through.' : data.conversionRate >= 5 ? 'Average — a stronger hero image could lift this.' : 'Below average — update your profile photo and description.'}
          </div>
        </div>
      </div>
    </div>
  )
}

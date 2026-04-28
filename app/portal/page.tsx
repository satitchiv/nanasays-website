'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface School {
  id: string
  name: string
  country: string | null
  city: string | null
  slug: string
  is_partner: boolean | null
  partner_tier: string | null
  partner_since: string | null
  partner_expires: string | null
  description: string | null
  hero_image: string | null
}

interface Stats {
  impressions: number
  views: number
  enquiries: number
  unread: number
}

interface GrowthInsight {
  headline: string
  insight: string
  action: string
  priority: 'high' | 'medium' | 'low'
}

export default function PortalPage() {
  const [school, setSchool] = useState<School | null>(null)
  const [stats, setStats] = useState<Stats>({ impressions: 0, views: 0, enquiries: 0, unread: 0 })
  const [loading, setLoading] = useState(true)
  const [growthInsight, setGrowthInsight] = useState<GrowthInsight | null>(null)
  const [insightLoading, setInsightLoading] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data: schoolData } = await supabase
        .from('schools')
        .select('id,name,country,city,slug,is_partner,partner_tier,partner_since,partner_expires,description,hero_image')
        .eq('admin_email', session.user.email)
        .single()

      if (!schoolData) return
      setSchool(schoolData as School)

      // Fetch last 7 days of analytics
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { data: analyticsData } = await supabase
        .from('school_analytics')
        .select('event_type')
        .eq('school_id', schoolData.id)
        .gte('created_at', since)

      const impressions = analyticsData?.filter(e => e.event_type === 'impression').length ?? 0
      const views = analyticsData?.filter(e => e.event_type === 'view').length ?? 0

      // Fetch enquiries
      const { data: enquiryData } = await supabase
        .from('enquiries')
        .select('is_read')
        .eq('school_id', schoolData.id)

      const totalEnquiries = enquiryData?.length ?? 0
      const unread = enquiryData?.filter(e => !e.is_read).length ?? 0

      setStats({ impressions, views, enquiries: totalEnquiries, unread })
      setLoading(false)

      // Load growth insight for all active partners who have any analytics data
      if (schoolData.is_partner && (analyticsData?.length ?? 0) > 0) {
        setInsightLoading(true)
        fetch('/api/growth-insight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ schoolId: schoolData.id }),
        })
          .then(r => r.json())
          .then(data => { if (data.recommendation) setGrowthInsight(data.recommendation) })
          .catch(() => {})
          .finally(() => setInsightLoading(false))
      }
    }
    load()
  }, [])

  const navy = '#1B3252'
  const teal = '#34C3A0'
  const tealDk = '#239C80'
  const tealBg = '#E8FAF6'
  const border = '#E2E8F0'
  const muted = '#6B7280'
  const off = '#F6F8FA'

  const isPartner = school?.is_partner && school?.partner_expires && new Date(school.partner_expires) > new Date()

  if (loading || !school) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <div style={{ width: 36, height: 36, border: `3px solid ${tealBg}`, borderTop: `3px solid ${teal}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  return (
    <div className="ns-portal-content" style={{ padding: '40px 0 60px' }}>

      {/* Page header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: tealDk, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>
          School Portal
        </div>
        <h1 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 28, color: navy, letterSpacing: '-0.02em', margin: 0 }}>
          {school.name}
        </h1>
        <div style={{ fontSize: 13, color: muted, marginTop: 4 }}>
          {[school.city, school.country].filter(Boolean).join(', ')}
          {isPartner && (
            <span style={{
              marginLeft: 10, display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, fontWeight: 800, color: tealDk, background: tealBg,
              border: `1px solid rgba(52,195,160,0.3)`, borderRadius: 100, padding: '2px 8px',
            }}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
              Verified Partner
            </span>
          )}
        </div>
      </div>

      {/* VALUE-FIRST: Big stats hero */}
      <div style={{
        background: navy, borderRadius: 16, padding: '32px 36px', marginBottom: 20,
        backgroundImage: 'radial-gradient(circle at 80% 50%, rgba(52,195,160,0.08) 0%, transparent 60%)',
      }}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>
          Last 7 days
        </div>
        <div style={{ fontSize: 'clamp(20px,3vw,28px)', fontWeight: 900, color: '#fff', fontFamily: 'Nunito, sans-serif', marginBottom: 6, lineHeight: 1.2 }}>
          Your school was seen{' '}
          <span style={{ color: teal }}>{stats.impressions.toLocaleString()} times</span>
          {school.country && (
            <> by parents searching international schools in {school.country}</>
          )}
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

      {/* Starter conversion card (shown when NOT a partner) */}
      {!isPartner && (
        <div style={{
          background: '#fff', border: `1px solid ${border}`, borderRadius: 12,
          padding: '20px 24px', marginBottom: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: navy, marginBottom: 4 }}>
              You are on the free Starter plan
            </div>
            <div style={{ fontSize: 13, color: muted, lineHeight: 1.6 }}>
              Partner schools appear in the top positions in search results.
              Upgrade to reach more families and receive direct enquiries.
            </div>
          </div>
          <a
            href="/partners#pricing"
            style={{
              padding: '10px 22px', borderRadius: 9, background: teal, color: '#fff',
              textDecoration: 'none', fontSize: 13, fontWeight: 800,
              fontFamily: 'Nunito, sans-serif', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            Upgrade to Partner →
          </a>
        </div>
      )}

      <div className="ns-form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Enquiries quick panel */}
        <div style={{
          background: '#fff', border: `1px solid ${border}`, borderRadius: 12, padding: '24px 26px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: navy, fontFamily: 'Nunito, sans-serif' }}>
              Parent enquiries
            </div>
            <Link href="/portal/enquiries" style={{ fontSize: 12, color: tealDk, textDecoration: 'none', fontWeight: 700 }}>
              View all →
            </Link>
          </div>
          {!isPartner ? (
            <div style={{ padding: '20px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: muted, marginBottom: 12, lineHeight: 1.6 }}>
                Direct parent enquiries are available on the Partner plan.
              </div>
              <a href="/partners#pricing" style={{ fontSize: 12, color: tealDk, fontWeight: 700, textDecoration: 'underline' }}>
                Unlock enquiries
              </a>
            </div>
          ) : stats.enquiries === 0 ? (
            <div style={{ padding: '16px 0', fontSize: 13, color: muted }}>
              No enquiries yet. As parents find your profile, messages will appear here.
            </div>
          ) : (
            <div style={{ fontSize: 24, fontWeight: 900, color: navy, fontFamily: 'Nunito, sans-serif' }}>
              {stats.enquiries}
              <span style={{ fontSize: 13, color: muted, fontWeight: 400, marginLeft: 8 }}>total</span>
              {stats.unread > 0 && (
                <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 800, color: '#fff', background: teal, borderRadius: 100, padding: '2px 10px' }}>
                  {stats.unread} unread
                </span>
              )}
            </div>
          )}
        </div>

        {/* Profile quick actions */}
        <div style={{
          background: '#fff', border: `1px solid ${border}`, borderRadius: 12, padding: '24px 26px',
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: navy, fontFamily: 'Nunito, sans-serif', marginBottom: 16 }}>
            Your profile
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
              <span style={{ color: muted }}>Description</span>
              <span style={{ fontWeight: 700, color: school.description ? tealDk : '#e53e3e' }}>
                {school.description ? 'Set' : 'Missing'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
              <span style={{ color: muted }}>Hero image</span>
              <span style={{ fontWeight: 700, color: school.hero_image ? tealDk : '#e53e3e' }}>
                {school.hero_image ? 'Set' : 'Missing'}
              </span>
            </div>
          </div>
          <Link
            href={isPartner ? '/portal/edit' : '/partners#pricing'}
            style={{
              display: 'block', textAlign: 'center', marginTop: 18,
              padding: '9px 16px', borderRadius: 8,
              background: isPartner ? off : 'transparent',
              border: `1.5px solid ${isPartner ? border : navy}`,
              color: navy, textDecoration: 'none', fontSize: 12, fontWeight: 700,
            }}
          >
            {isPartner ? 'Edit profile' : 'Upgrade to edit profile'}
          </Link>
        </div>
      </div>

      {/* Content Booster card (Partner only) */}
      {isPartner && (
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
      )}

      {/* Growth Advisor card */}
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
                {isPartner
                  ? 'Insight loading — available once your profile has 30 days of data. Your advisor will surface one personalised recommendation each week.'
                  : 'Available on the Partner plan. Upgrade to receive weekly AI-powered recommendations tailored to your school.'}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}

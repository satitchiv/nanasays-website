// Internal-only render endpoint. Puppeteer opens these URLs and screenshots.
// Blocked from search engines via /public/robots.txt.
//
// URL: /render/[template_slug]?postId=<uuid>&channel=<channel_slug>
//
// This page:
//   1. Reads the post row (copy + source_data) from Supabase using the service-role
//      key (server-side fetch).
//   2. Reads the design tokens + layout for (template, channel) from Supabase.
//   3. Renders a stub template at fixed width/height matching the channel.
//
// The real template components will come from the Claude Design session and
// replace the <StubTemplate /> below. Until then this stub proves the pipeline
// works end-to-end (Puppeteer can screenshot it and R2 upload works).

import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import {
  CHANNEL_SIZES, DEFAULT_TOKENS, DEFAULT_LAYOUT,
  tokenBool, type ChannelSlug, type Tokens, type LayoutJson, type TemplateData,
} from '@/lib/social-design'

export const dynamic = 'force-dynamic'   // no caching — design edits must be instant

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
// Use service-role for render so RLS doesn't block internal reads. This page
// is never user-facing (robots blocked, not linked anywhere).
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

type PageProps = {
  params: { slug: string }
  searchParams: { postId?: string; channel?: string; preview?: string }
}

export default async function RenderPage({ params, searchParams }: PageProps) {
  const templateSlug = params.slug
  const channelSlug = (searchParams.channel || 'facebook_feed_square') as ChannelSlug
  const postId = searchParams.postId
  const previewMode = searchParams.preview   // 'tokens' | 'layout' | undefined

  const channel = CHANNEL_SIZES[channelSlug]
  if (!channel) {
    return <ErrorPage msg={`Unknown channel: ${channelSlug}`} />
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Load tokens
  const { data: tokenRows } = await supabase.from('social_design_tokens').select('key, value')
  const tokens: Tokens = { ...DEFAULT_TOKENS }
  for (const row of (tokenRows || [])) tokens[row.key] = row.value

  // Load layout for (template_slug, channel_slug)
  const { data: layoutRow } = await supabase
    .from('social_template_layouts')
    .select('layout_json')
    .eq('template_slug', templateSlug)
    .eq('channel_slug', channelSlug)
    .maybeSingle()
  const layout: LayoutJson = layoutRow?.layout_json || DEFAULT_LAYOUT

  // Load post (skipped in preview mode — we render with sample data)
  let htmlContent: string | null = null
  let data: TemplateData | null = null
  if (postId && postId !== 'draft-xxx' && !previewMode) {
    const { data: post } = await supabase
      .from('social_posts')
      .select('id, copy_en, source_data, pillar_id, html_content, social_pillars(slug, name_en)')
      .eq('id', postId)
      .single()
    if (post) {
      // Dynamic posts: serve stored HTML directly
      if (post.html_content) {
        htmlContent = post.html_content as string
      } else {
        const school = (post.source_data as { school_snapshot?: Record<string, unknown> } | null)?.school_snapshot
        const slotCopy = (post.source_data as { slot_copy?: Record<string, string | null> } | null)?.slot_copy
        const pillarRow = post.social_pillars as { slug: string; name_en: string } | null
        data = {
          name:           school?.name as string | undefined,
          city:           school?.city as string | undefined,
          country:        school?.country as string | undefined,
          curriculum:     school?.curriculum as string[] | null | undefined,
          age_min:        school?.age_min as number | null | undefined,
          age_max:        school?.age_max as number | null | undefined,
          founded_year:   school?.founded_year as number | null | undefined,
          student_count:  school?.student_count as number | null | undefined,
          accreditations: school?.accreditations as string[] | null | undefined,
          boarding:       school?.boarding as boolean | null | undefined,
          verified_at:    school?.verified_at as string | null | undefined,
          slot_copy: slotCopy as TemplateData['slot_copy'],
          pillar: pillarRow ? { slug: pillarRow.slug as TemplateData['pillar']['slug'], name_en: pillarRow.name_en } : null,
        }
      }
    }
  }

  // Dynamic HTML post — redirect to the raw-HTML route handler
  if (htmlContent) {
    redirect(`/api/render-html/${postId}`)
  }

  if (!data) {
    // Sample data for preview / design-editor iframe use.
    data = SAMPLE_DATA
  }

  return (
    <div style={{ margin: 0, padding: 0, background: '#eee', minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <StubTemplate
        templateSlug={templateSlug}
        channel={channel}
        channelSlug={channelSlug}
        tokens={tokens}
        layout={layout}
        data={data}
      />
    </div>
  )
}

// ─── Stub template ─────────────────────────────────────────────────────────
// Uses the real NanaSays brand: Nunito + Nunito Sans, navy + teal palette.
// Replace slot rendering with real Claude Design components once they land.

const FONT_URL = 'https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Nunito+Sans:wght@300;400;500;600;700&display=swap'

function StubTemplate({
  templateSlug, channel, channelSlug, tokens, layout, data,
}: {
  templateSlug: string
  channel: { width: number; height: number; aspect: string }
  channelSlug: ChannelSlug
  tokens: Tokens
  layout: LayoutJson
  data: TemplateData
}) {
  const navy    = tokens['color.navy']    || '#1B3252'
  const teal    = tokens['color.teal']    || '#34C3A0'
  const tealDk  = tokens['color.teal_dk'] || '#239C80'
  const tealBg  = tokens['color.teal_bg'] || '#E8FAF6'
  const off     = tokens['color.off']     || '#F6F8FA'
  const ink     = tokens['color.ink']     || '#1F2937'
  const muted   = tokens['color.muted']   || '#6B7280'
  const border  = tokens['color.border']  || '#E5E7EB'

  const showWordmark = tokenBool(tokens, 'bool.show_wordmark', true)
  const showChip     = tokenBool(tokens, 'bool.show_pillar_chip', true)

  const verifiedDate = data.verified_at || data.tuition_verified_at
  const verifiedLabel = verifiedDate
    ? `Verified ${new Date(verifiedDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
    : null

  const pillarLabel = data.pillar?.name_en?.toUpperCase()
    || templateSlug.split('__')[0]?.replace(/_/g, ' ').toUpperCase()
    || 'POST'

  const pad = channel.width >= 1200 ? 40 : 48

  return (
    <>
      <link rel="stylesheet" href={FONT_URL} />
      <div
        id="render-root"
        style={{
          width: channel.width,
          height: channel.height,
          background: off,
          color: ink,
          fontFamily: "'Nunito Sans', sans-serif",
          padding: pad,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* ── Top bar: wordmark left + pillar chip right ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          {showWordmark && (
            <div style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 900, fontSize: 22, letterSpacing: -0.5, lineHeight: 1 }}>
              <span style={{ color: navy }}>Nana</span><span style={{ color: teal }}>Says</span>
            </div>
          )}
          {showChip && (
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
              textTransform: 'uppercase',
              background: tealBg,
              color: tealDk,
              border: `1px solid rgba(52,195,160,.25)`,
              padding: '5px 12px', borderRadius: 100,
              fontFamily: "'Nunito Sans', sans-serif",
            }}>
              {pillarLabel}
            </div>
          )}
        </div>

        {/* ── Headline ── */}
        <div style={{
          fontFamily: "'Nunito', sans-serif",
          fontWeight: 900,
          fontSize: channel.height >= 1800 ? 64 : channel.width >= 1200 ? 36 : 46,
          lineHeight: 1.05,
          letterSpacing: -1,
          color: navy,
          marginBottom: 10,
        }}>
          {data.slot_copy?.headline || data.name || '(headline)'}
        </div>

        {/* ── Subhead ── */}
        {(() => {
          const curriculumPart = data.curriculum?.length ? data.curriculum.join(' · ') : null
          const agePart = data.age_min != null && data.age_max != null ? `Ages ${data.age_min}–${data.age_max}` : null
          const cityPart = data.city || null
          const autoSubhead = [curriculumPart, agePart, cityPart].filter(Boolean).join(' · ')
          const text = data.slot_copy?.subhead || autoSubhead
          return text ? (
            <div style={{ fontSize: 16, color: muted, fontWeight: 500, marginBottom: 24, letterSpacing: 0.1 }}>
              {text}
            </div>
          ) : null
        })()}

        {/* ── Divider ── */}
        <div style={{ height: 1, background: border, marginBottom: 24 }} />

        {/* ── Data grid ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
          {[
            data.founded_year        ? ['Founded',       String(data.founded_year)] : null,
            data.student_count       ? ['Enrolment',     `~${data.student_count.toLocaleString()} students`] : null,
            data.age_min != null && data.age_max != null ? ['Ages', `${data.age_min}–${data.age_max}`] : null,
            data.curriculum?.length  ? ['Curriculum',    data.curriculum.join(' · ')] : null,
            data.boarding != null    ? ['Boarding',      data.boarding ? 'Yes' : 'No'] : null,
          ].filter(Boolean).map(([label, value], i) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              padding: '11px 0',
              borderBottom: `1px solid ${border}`,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: navy, textAlign: 'right', maxWidth: '60%', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
            </div>
          ))}

          {/* Accreditations */}
          {data.accreditations?.length ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: 1 }}>Accredited by</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {data.accreditations.slice(0, 3).map(a => (
                  <span key={a} style={{
                    fontSize: 11, fontWeight: 700, color: tealDk,
                    background: tealBg, border: `1px solid rgba(52,195,160,.2)`,
                    padding: '3px 9px', borderRadius: 100,
                  }}>{a}</span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Body copy if present */}
          {data.slot_copy?.body && (
            <div style={{ fontSize: 14, lineHeight: 1.65, color: ink, marginTop: 16, fontWeight: 300 }}>
              {data.slot_copy.body}
            </div>
          )}
        </div>

        {/* ── Footer stamp ── */}
        <div style={{
          marginTop: 'auto',
          paddingTop: 16,
          borderTop: `1px solid ${border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          {verifiedLabel && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 11, fontWeight: 700, color: tealDk,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: teal }} />
              {verifiedLabel}
            </div>
          )}
          <div style={{ fontSize: 11, color: muted, fontWeight: 500, marginLeft: 'auto' }}>
            {tokens['text.footer_url'] || 'nanasays.com'}
          </div>
        </div>

        {/* Stub label — remove when real components land */}
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          fontSize: 9, color: 'rgba(107,114,128,.4)',
          letterSpacing: 1, textTransform: 'uppercase', pointerEvents: 'none',
        }}>
          stub · {channelSlug}
        </div>
      </div>
    </>
  )
}

function ErrorPage({ msg }: { msg: string }) {
  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif', color: '#900' }}>
      <h1>Render error</h1>
      <p>{msg}</p>
    </div>
  )
}

const SAMPLE_DATA: TemplateData = {
  name: 'Shrewsbury International School Bangkok',
  city: 'Bangkok',
  country: 'Thailand',
  curriculum: ['IB', 'IGCSE', 'A-Level'],
  age_min: 3, age_max: 18,
  founded_year: 1992,
  student_count: 1800,
  accreditations: ['CIS', 'WASC'],
  boarding: true,
  verified_at: new Date().toISOString(),
  slot_copy: {
    headline: 'Shrewsbury International School Bangkok',
    subhead: 'Bangkok · Est. 1992',
    body: 'Founded 1992. Enrolment of approximately 1,800 students from Early Years through Sixth Form. Boarding available from Year 7.',
    eyebrow: null,
  },
  pillar: { slug: 'school_spotlight', name_en: 'School Spotlight' },
}

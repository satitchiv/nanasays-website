// Types + defaults for the social-media-planner templates, tokens, layouts.
// Shared between the /render/[slug] page and future admin Design/Layout editors.

export type ChannelSlug =
  | 'facebook_feed_square'
  | 'instagram_feed_portrait'
  | 'instagram_story'
  | 'linkedin_landscape'

export type PillarSlug =
  | 'school_spotlight'
  | 'tuition_snapshot'
  | 'inspection_snapshot'

export const CHANNEL_SIZES: Record<ChannelSlug, { width: number; height: number; aspect: string }> = {
  facebook_feed_square:    { width: 1080, height: 1080, aspect: '1:1' },
  instagram_feed_portrait: { width: 1080, height: 1350, aspect: '4:5' },
  instagram_story:         { width: 1080, height: 1920, aspect: '9:16' },
  linkedin_landscape:      { width: 1200, height: 628,  aspect: '1.91:1' },
}

export type TokenKind = 'color' | 'text' | 'bool' | 'number'

export type Tokens = Record<string, string>   // values arrive as strings from DB; callers coerce bool/number

export function tokenBool(tokens: Tokens, key: string, defaultValue = false): boolean {
  const v = tokens[key]
  if (v == null) return defaultValue
  return v === 'true' || v === '1'
}

export function tokenNumber(tokens: Tokens, key: string, defaultValue = 0): number {
  const v = tokens[key]
  if (v == null) return defaultValue
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : defaultValue
}

export type SlotAlign = 'left' | 'center' | 'right'

export type SlotDef = {
  key: string
  visible: boolean
  align: SlotAlign
  padding_top: number
}

export type LayoutJson = {
  slots: SlotDef[]
}

export type TemplateData = {
  name?: string
  city?: string
  country?: string
  curriculum?: string[] | null
  age_min?: number | null
  age_max?: number | null
  founded_year?: number | null
  student_count?: number | null
  accreditations?: string[] | null
  boarding?: boolean | null
  verified_at?: string | null
  tuition_verified_at?: string | null
  // Generator-filled slot copy (from Claude)
  slot_copy?: {
    headline?: string | null
    subhead?: string | null
    body?: string | null
    eyebrow?: string | null
  }
  // Pillar info for chips
  pillar?: { slug: PillarSlug; name_en: string } | null
}

// Default tokens — NanaSays brand palette (navy + teal)
export const DEFAULT_TOKENS: Tokens = {
  'color.navy':      '#1B3252',
  'color.teal':      '#34C3A0',
  'color.teal_dk':   '#239C80',
  'color.teal_bg':   '#E8FAF6',
  'color.off':       '#F6F8FA',
  'color.ink':       '#1F2937',
  'color.muted':     '#6B7280',
  'color.border':    '#E5E7EB',
  'text.footer_url': 'nanasays.com',
  'bool.show_verification_badge': 'true',
  'bool.show_wordmark':           'true',
  'bool.show_pillar_chip':        'true',
}

export const DEFAULT_LAYOUT: LayoutJson = {
  slots: [
    { key: 'wordmark',     visible: true, align: 'left',   padding_top: 0 },
    { key: 'pillar_chip',  visible: true, align: 'right',  padding_top: 0 },
    { key: 'headline',     visible: true, align: 'left',   padding_top: 32 },
    { key: 'subhead',      visible: true, align: 'left',   padding_top: 8 },
    { key: 'body',         visible: true, align: 'left',   padding_top: 16 },
    { key: 'accred_row',   visible: true, align: 'left',   padding_top: 24 },
    { key: 'footer_stamp', visible: true, align: 'center', padding_top: 32 },
  ],
}

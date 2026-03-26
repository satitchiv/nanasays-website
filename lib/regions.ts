import type { Region, CountrySummary } from './types'

export const COUNTRY_FLAGS: Record<string, string> = {
  'Thailand': 'TH',
  'United Kingdom': 'GB',
  'Switzerland': 'CH',
  'Singapore': 'SG',
  'China': 'CN',
  'Hong Kong': 'HK',
  'Japan': 'JP',
  'Taiwan': 'TW',
  'Malaysia': 'MY',
  'Indonesia': 'ID',
  'Philippines': 'PH',
  'South Korea': 'KR',
  'Vietnam': 'VN',
  'Myanmar': 'MM',
  'Cambodia': 'KH',
  'Italy': 'IT',
  'Germany': 'DE',
  'Austria': 'AT',
}

export function flagUrl(code: string, size: '20x15' | '24x18' | '32x24' = '24x18'): string {
  return `https://flagcdn.com/${size}/${code.toLowerCase()}.png`
}

// Nana's editorial notes per country — shown on country cards
export const NANA_NOTES: Record<string, string> = {
  'United Kingdom': 'Top boarding tradition, strong IB & A-Levels',
  'Switzerland': 'Premium boarding, multilingual, stunning campuses',
  'Singapore': 'Asia hub, rigorous academics, strong university outcomes',
  'Japan': 'Safe, disciplined, growing international scene',
  'China': 'Large international school network in major cities',
  'Hong Kong': 'Gateway to Asia, British-style education',
  'Thailand': 'Excellent value, vibrant international community',
  'Malaysia': 'Affordable English-medium with strong academic standards',
}

export const REGIONS: Region[] = [
  {
    id: 'southeast-asia',
    name: 'Southeast Asia',
    countries: [
      { name: 'Thailand', code: 'TH', flag: 'TH', schoolCount: 171, featured: true, nanaNote: NANA_NOTES['Thailand'] },
      { name: 'Singapore', code: 'SG', flag: 'SG', schoolCount: 112, featured: true, nanaNote: NANA_NOTES['Singapore'] },
      { name: 'Malaysia', code: 'MY', flag: 'MY', schoolCount: 20, nanaNote: NANA_NOTES['Malaysia'] },
      { name: 'Indonesia', code: 'ID', flag: 'ID', schoolCount: 20 },
      { name: 'Philippines', code: 'PH', flag: 'PH', schoolCount: 20 },
      { name: 'Vietnam', code: 'VN', flag: 'VN', schoolCount: 18 },
      { name: 'Myanmar', code: 'MM', flag: 'MM', schoolCount: 7 },
      { name: 'Cambodia', code: 'KH', flag: 'KH', schoolCount: 5 },
    ],
  },
  {
    id: 'east-asia',
    name: 'East Asia',
    countries: [
      { name: 'China', code: 'CN', flag: 'CN', schoolCount: 165 },
      { name: 'Hong Kong', code: 'HK', flag: 'HK', schoolCount: 134, featured: true, nanaNote: NANA_NOTES['Hong Kong'] },
      { name: 'Japan', code: 'JP', flag: 'JP', schoolCount: 107, nanaNote: NANA_NOTES['Japan'] },
      { name: 'Taiwan', code: 'TW', flag: 'TW', schoolCount: 20 },
      { name: 'South Korea', code: 'KR', flag: 'KR', schoolCount: 20 },
    ],
  },
  {
    id: 'europe',
    name: 'Europe',
    countries: [
      { name: 'United Kingdom', code: 'GB', flag: 'GB', schoolCount: 52, featured: true, nanaNote: NANA_NOTES['United Kingdom'] },
      { name: 'Switzerland', code: 'CH', flag: 'CH', schoolCount: 109, featured: true, nanaNote: NANA_NOTES['Switzerland'] },
      { name: 'Italy', code: 'IT', flag: 'IT', schoolCount: 7 },
      { name: 'Germany', code: 'DE', flag: 'DE', schoolCount: 3 },
      { name: 'Austria', code: 'AT', flag: 'AT', schoolCount: 1 },
    ],
  },
]

export const ALL_COUNTRIES: CountrySummary[] = REGIONS.flatMap(r => r.countries)
  .sort((a, b) => b.schoolCount - a.schoolCount)

export const TOTAL_SCHOOLS = ALL_COUNTRIES.reduce((s, c) => s + c.schoolCount, 0)

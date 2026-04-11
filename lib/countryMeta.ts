import { REGIONS_DATA } from './regionData'

export interface CountryPageMeta {
  name: string
  slug: string
  flagCode: string
  regionName: string
  regionSlug: string
  nanaNote: string
  heroImage: string
  schoolCount: number
  mapCenter: [number, number]
  mapZoom: number
  countryIntro?: string
  feeTableSchools?: Array<{
    name: string
    slug: string
    curriculum: string | null
    fees_usd_min: number | null
    fees_usd_max: number | null
    city: string | null
    age_min: number | null
    age_max: number | null
  }>
}

const MAP_CONFIG: Record<string, { center: [number, number]; zoom: number }> = {
  'United Kingdom': { center: [54.0, -2.0], zoom: 5 },
  'Thailand': { center: [13.0, 101.0], zoom: 6 },
  'Singapore': { center: [1.3521, 103.8198], zoom: 12 },
  'Hong Kong': { center: [22.3193, 114.1694], zoom: 11 },
  'China': { center: [35.8617, 104.1954], zoom: 4 },
  'Japan': { center: [36.2048, 138.2529], zoom: 5 },
  'Switzerland': { center: [46.8182, 8.2275], zoom: 7 },
  'Malaysia': { center: [4.2105, 108.9758], zoom: 6 },
  'Taiwan': { center: [23.6978, 120.9605], zoom: 7 },
  'South Korea': { center: [35.9078, 127.7669], zoom: 6 },
  'Indonesia': { center: [-2.5489, 118.0149], zoom: 5 },
  'Vietnam': { center: [14.0583, 108.2772], zoom: 6 },
  'Philippines': { center: [12.8797, 121.7740], zoom: 6 },
  'Myanmar': { center: [19.1633, 96.0785], zoom: 6 },
  'Cambodia': { center: [12.5657, 104.9910], zoom: 7 },
  'Italy': { center: [41.8719, 12.5674], zoom: 5 },
  'Germany': { center: [51.1657, 10.4515], zoom: 6 },
  'Austria': { center: [47.5162, 14.5501], zoom: 7 },
  'France': { center: [46.2276, 2.2137], zoom: 5 },
  'Ireland': { center: [53.4129, -8.2439], zoom: 7 },
  'Turkey': { center: [38.9637, 35.2433], zoom: 6 },
  'Argentina': { center: [-38.4161, -63.6167], zoom: 4 },
  'Colombia': { center: [4.5709, -74.2973], zoom: 5 },
  'Chile': { center: [-35.6751, -71.5430], zoom: 4 },
  'Peru': { center: [-9.1900, -75.0152], zoom: 5 },
  'Costa Rica': { center: [9.7489, -83.7534], zoom: 7 },
  'Ecuador': { center: [-1.8312, -78.1834], zoom: 6 },
  'Uganda': { center: [1.3733, 32.2903], zoom: 7 },
  'Morocco': { center: [31.7917, -7.0926], zoom: 5 },
  'Ethiopia': { center: [9.1450, 40.4897], zoom: 5 },
  'Ghana': { center: [7.9465, -1.0232], zoom: 6 },
  'Rwanda': { center: [-1.9403, 29.8739], zoom: 8 },
  'Zambia': { center: [-13.1339, 27.8493], zoom: 5 },
  'Lebanon': { center: [33.8547, 35.8623], zoom: 8 },
  'Brunei': { center: [4.5353, 114.7277], zoom: 9 },
  'Spain': { center: [40.4637, -3.7492], zoom: 5 },
  'Netherlands': { center: [52.1326, 5.2913], zoom: 7 },
  'Jordan': { center: [30.5852, 36.2384], zoom: 7 },
  'United States': { center: [37.0902, -95.7129], zoom: 4 },
  'Canada': { center: [56.1304, -106.3468], zoom: 4 },
  'India': { center: [20.5937, 78.9629], zoom: 4 },
  'Saudi Arabia': { center: [23.8859, 45.0792], zoom: 5 },
  'United Arab Emirates': { center: [23.4241, 53.8478], zoom: 7 },
  'Qatar': { center: [25.3548, 51.1839], zoom: 9 },
  'Bahrain': { center: [26.0667, 50.5577], zoom: 10 },
  'Oman': { center: [21.4735, 55.9754], zoom: 6 },
  'Kuwait': { center: [29.3117, 47.4818], zoom: 9 },
  'Egypt': { center: [26.8206, 30.8025], zoom: 5 },
  'Kenya': { center: [-0.0236, 37.9062], zoom: 6 },
  'Nigeria': { center: [9.0820, 8.6753], zoom: 6 },
  'South Africa': { center: [-30.5595, 22.9375], zoom: 5 },
  'Tanzania': { center: [-6.3690, 34.8888], zoom: 6 },
  'Australia': { center: [-25.2744, 133.7751], zoom: 4 },
  'New Zealand': { center: [-40.9006, 174.8860], zoom: 5 },
  'Brazil': { center: [-14.2350, -51.9253], zoom: 4 },
  'Mexico': { center: [23.6345, -102.5528], zoom: 5 },
}

export function getCountryPageMeta(slug: string): CountryPageMeta | null {
  for (const region of REGIONS_DATA) {
    const country = region.countries.find(c => c.slug === slug)
    if (country) {
      const mapCfg = MAP_CONFIG[country.name] ?? { center: [20, 0] as [number, number], zoom: 4 }
      return {
        name: country.name,
        slug: country.slug,
        flagCode: country.flagCode,
        regionName: region.name,
        regionSlug: region.slug,
        nanaNote: country.nanaNote,
        heroImage: country.imageUrl,
        schoolCount: country.schoolCount,
        mapCenter: mapCfg.center,
        mapZoom: mapCfg.zoom,
      }
    }
  }
  return null
}

export function slugToCountryName(slug: string): string | null {
  for (const region of REGIONS_DATA) {
    const country = region.countries.find(c => c.slug === slug)
    if (country) return country.name
  }
  return null
}

export function getAllCountrySlugs(): string[] {
  return REGIONS_DATA.flatMap(r => r.countries.map(c => c.slug))
}

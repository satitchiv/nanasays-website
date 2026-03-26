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

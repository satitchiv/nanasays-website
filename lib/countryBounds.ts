// Per-country lat/lng bounding boxes for map-pin sanity checks.
// Used by CountryMap.getCoords() to drop pins that fall outside the page's
// country bbox — defends against bad-geocode rows leaking onto the wrong
// continent (e.g. UK schools rendering in Africa because lat/long were
// swapped or duplicated at ingest time). See data/2026-05-28 audit.
//
// Antimeridian-crossing countries (Fiji, USA with Aleutians) use multi-box
// arrays so any one box matching is sufficient.
//
// Bounds are deliberately generous (~0.5° buffer) to tolerate small geocode
// inaccuracy on coast/island schools. They're for catching gross errors,
// not for cartographic precision.
//
// Behaviour for countries NOT in this table: fail-OPEN — pin is allowed.
// Add a new entry rather than relying on the fallback when you find a
// country leaking bad pins.

export type GeoBox = { lat: [number, number]; lng: [number, number] }

export const COUNTRY_BOUNDS: Record<string, GeoBox[]> = {
  // Europe
  'United Kingdom': [{ lat: [49.5, 61.0], lng: [-8.5, 2.0] }],
  'Ireland': [{ lat: [51.0, 55.5], lng: [-11.0, -5.5] }],
  'France': [{ lat: [41.0, 51.5], lng: [-5.5, 10.0] }],
  'Spain': [{ lat: [27.5, 44.0], lng: [-19.0, 5.0] }],
  'Portugal': [{ lat: [32.0, 42.5], lng: [-32.0, -6.0] }],
  'Germany': [{ lat: [47.0, 55.5], lng: [5.5, 15.5] }],
  'Switzerland': [{ lat: [45.5, 48.0], lng: [5.5, 11.0] }],
  'Italy': [{ lat: [35.0, 47.5], lng: [6.0, 19.0] }],
  'Netherlands': [{ lat: [50.5, 53.8], lng: [3.0, 7.5] }],
  'Belgium': [{ lat: [49.0, 52.0], lng: [2.0, 7.0] }],
  'Austria': [{ lat: [46.0, 49.5], lng: [9.0, 17.5] }],
  'Sweden': [{ lat: [55.0, 70.0], lng: [10.5, 24.5] }],
  'Norway': [{ lat: [57.5, 71.5], lng: [4.0, 32.0] }],
  'Denmark': [{ lat: [54.0, 58.0], lng: [7.5, 15.5] }],
  'Finland': [{ lat: [59.5, 70.5], lng: [19.0, 32.0] }],
  'Poland': [{ lat: [49.0, 55.0], lng: [14.0, 24.5] }],
  'Czech Republic': [{ lat: [48.5, 51.5], lng: [12.0, 19.0] }],
  'Hungary': [{ lat: [45.5, 49.0], lng: [16.0, 23.0] }],
  'Romania': [{ lat: [43.5, 48.5], lng: [20.0, 30.0] }],
  'Greece': [{ lat: [34.5, 42.0], lng: [19.0, 30.0] }],

  // Middle East
  'United Arab Emirates': [{ lat: [22.0, 26.5], lng: [51.0, 56.5] }],
  'Saudi Arabia': [{ lat: [16.0, 33.0], lng: [34.0, 56.0] }],
  'Qatar': [{ lat: [24.0, 27.0], lng: [50.5, 52.0] }],
  'Bahrain': [{ lat: [25.5, 26.5], lng: [50.0, 51.0] }],
  'Kuwait': [{ lat: [28.5, 30.5], lng: [46.5, 48.5] }],
  'Oman': [{ lat: [16.5, 27.0], lng: [52.0, 60.0] }],
  'Israel': [{ lat: [29.0, 33.5], lng: [34.0, 36.0] }],
  'Jordan': [{ lat: [29.0, 33.5], lng: [34.5, 39.5] }],
  'Turkey': [{ lat: [35.5, 42.5], lng: [25.5, 45.0] }],

  // South + South-East Asia
  'India': [{ lat: [6.5, 36.0], lng: [67.0, 98.0] }],
  'Pakistan': [{ lat: [23.5, 37.5], lng: [60.5, 78.0] }],
  'Sri Lanka': [{ lat: [5.5, 10.0], lng: [79.0, 82.0] }],
  'Bangladesh': [{ lat: [20.5, 26.5], lng: [88.0, 93.0] }],
  'Nepal': [{ lat: [26.0, 30.5], lng: [80.0, 88.5] }],
  'Thailand': [{ lat: [5.5, 20.5], lng: [97.0, 106.0] }],
  'Singapore': [{ lat: [1.0, 1.6], lng: [103.5, 104.2] }],
  'Malaysia': [{ lat: [0.5, 7.5], lng: [99.5, 119.5] }],
  'Indonesia': [{ lat: [-11.5, 6.5], lng: [94.5, 141.5] }],
  'Philippines': [{ lat: [4.5, 21.5], lng: [116.0, 127.0] }],
  'Vietnam': [{ lat: [8.0, 23.5], lng: [102.0, 110.0] }],
  'Cambodia': [{ lat: [10.0, 15.0], lng: [102.0, 108.0] }],
  'Myanmar': [{ lat: [9.5, 28.5], lng: [92.0, 101.5] }],
  'Laos': [{ lat: [13.5, 22.5], lng: [100.0, 108.0] }],
  'Brunei': [{ lat: [4.0, 5.1], lng: [114.0, 115.5] }],
  'Brunei Darussalam': [{ lat: [4.0, 5.1], lng: [114.0, 115.5] }],

  // East Asia
  'China': [{ lat: [17.0, 54.5], lng: [73.0, 135.5] }],
  'Hong Kong': [{ lat: [22.0, 22.7], lng: [113.7, 114.6] }],
  'Macao': [{ lat: [22.0, 22.3], lng: [113.4, 113.7] }],
  'Japan': [{ lat: [24.0, 46.0], lng: [122.0, 146.0] }],
  'South Korea': [{ lat: [33.0, 39.0], lng: [124.5, 132.0] }],
  'Taiwan': [{ lat: [21.5, 26.0], lng: [119.5, 122.5] }],
  'Mongolia': [{ lat: [41.0, 52.5], lng: [87.0, 120.0] }],

  // Oceania (Fiji crosses the antimeridian)
  'Australia': [{ lat: [-44.0, -9.5], lng: [112.0, 154.5] }],
  'New Zealand': [{ lat: [-47.5, -33.5], lng: [165.5, 179.5] }],
  'Fiji': [
    { lat: [-21.0, -12.0], lng: [177.0, 180.0] },
    { lat: [-21.0, -12.0], lng: [-180.0, -178.0] },
  ],
  'Papua New Guinea': [{ lat: [-12.0, -1.0], lng: [140.5, 156.5] }],

  // Americas (USA includes Alaska antimeridian + Hawaii)
  'United States': [
    { lat: [24.0, 50.0], lng: [-125.5, -66.5] }, // CONUS
    { lat: [51.0, 72.0], lng: [-180.0, -130.0] }, // Alaska (east of antimeridian)
    { lat: [51.0, 72.0], lng: [172.0, 180.0] }, // Aleutian tail (west of antimeridian)
    { lat: [18.5, 23.0], lng: [-161.0, -154.5] }, // Hawaii
  ],
  'Canada': [{ lat: [41.5, 84.0], lng: [-141.5, -52.0] }],
  'Mexico': [{ lat: [14.0, 33.0], lng: [-118.5, -86.0] }],
  'Brazil': [{ lat: [-34.0, 5.5], lng: [-74.5, -34.0] }],
  'Argentina': [{ lat: [-55.5, -21.5], lng: [-73.5, -53.5] }],
  'Chile': [{ lat: [-56.5, -17.5], lng: [-76.0, -66.0] }],
  'Colombia': [{ lat: [-4.5, 13.0], lng: [-82.0, -66.5] }],
  'Peru': [{ lat: [-18.5, 0.0], lng: [-81.5, -68.5] }],

  // Africa
  'South Africa': [{ lat: [-35.0, -22.0], lng: [16.0, 33.0] }],
  'Egypt': [{ lat: [21.5, 32.0], lng: [24.5, 37.0] }],
  'Kenya': [{ lat: [-5.0, 5.5], lng: [33.5, 42.0] }],
  'Nigeria': [{ lat: [3.5, 14.0], lng: [2.5, 15.0] }],
  'Morocco': [{ lat: [21.0, 36.0], lng: [-17.5, -1.0] }],
  'Tanzania': [{ lat: [-12.0, -0.5], lng: [29.0, 41.0] }],
  'Ghana': [{ lat: [4.5, 11.5], lng: [-3.5, 1.5] }],
  'Mauritius': [{ lat: [-21.0, -19.5], lng: [56.5, 58.0] }],
  'Uganda': [{ lat: [-1.5, 4.5], lng: [29.5, 35.5] }],
  'Ethiopia': [{ lat: [3.0, 15.0], lng: [33.0, 48.5] }],
  'Rwanda': [{ lat: [-3.0, -1.0], lng: [28.5, 31.0] }],
  'Zambia': [{ lat: [-18.5, -8.0], lng: [21.5, 34.0] }],

  // Americas — additional country pages
  'Costa Rica': [{ lat: [8.0, 11.5], lng: [-86.0, -82.5] }],
  'Ecuador': [{ lat: [-5.5, 2.0], lng: [-92.5, -75.0] }],

  // Middle East — additional country pages
  'Lebanon': [{ lat: [33.0, 34.8], lng: [35.0, 36.7] }],
}

export function isInCountryBounds(
  lat: number,
  lng: number,
  country: string | null | undefined
): boolean {
  // Order matters: invalid coords are always rejected, even for unknown countries.
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false
  if (!country) return true
  const boxes = COUNTRY_BOUNDS[country]
  if (!boxes) return true // unknown country = fail-open; add bounds and recheck
  return boxes.some(b => lat >= b.lat[0] && lat <= b.lat[1] && lng >= b.lng[0] && lng <= b.lng[1])
}

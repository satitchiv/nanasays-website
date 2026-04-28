import path from 'path'
import fs from 'fs'

export type SocsPerfRow = {
  season: string
  division: string
  rank: number
  total: number
  win_pct?: string | null
  is_final: boolean
}

export type SocsAcRow = {
  season: string
  division: string
  rank: number
  total: number
  is_final: boolean
}

export type IshcMatch = {
  gender: string
  age_group: string
  round: string
  cup_or_plate: string
  home: string
  away: string
  winner: string | null
  score: string | null
}

export type HockeyArchiveData = {
  socsPerformance: SocsPerfRow[]
  socsAllComers: SocsAcRow[]
  ishcCurrentSeason: IshcMatch[]
}

const DATA_DIR = path.join(process.cwd(), '..', 'data', 'shared', 'hockey-competitions')

// Module-level cache: parsed once per process, reused on every request
let perfData: any = null
let acData: any = null
let ishcData: any = null
const schoolCache: Record<string, HockeyArchiveData> = {}

function loadJson(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'))
  } catch {
    return null
  }
}

function ensureLoaded() {
  if (!perfData) perfData = loadJson('socs-performance.json')
  if (!acData)   acData   = loadJson('socs-all-comers.json')
  if (!ishcData) ishcData = loadJson('ishc-current-season.json')
}

export function getHockeyArchivesForSchool(slug: string, schoolName: string): HockeyArchiveData {
  const cacheKey = slug
  if (schoolCache[cacheKey]) return schoolCache[cacheKey]

  ensureLoaded()

  const socsPerformance: SocsPerfRow[] = []
  const socsAllComers: SocsAcRow[] = []
  const ishcCurrentSeason: IshcMatch[] = []

  // SOCS performance
  if (perfData?.seasons) {
    for (const season of perfData.seasons) {
      for (const div of season.divisions ?? []) {
        const row = (div.rows ?? []).find((r: any) => r.school_slug === slug)
        if (row) {
          socsPerformance.push({
            season:    season.season,
            division:  div.age_level,
            rank:      row.rank,
            total:     div.rows.length,
            win_pct:   row.league_points ?? row.win_pct ?? null,
            is_final:  season.is_final ?? true,
          })
        }
      }
    }
  }

  // SOCS all-comers
  if (acData?.seasons) {
    for (const season of acData.seasons) {
      for (const div of season.divisions ?? []) {
        const row = (div.rows ?? []).find((r: any) => r.school_slug === slug)
        if (row) {
          socsAllComers.push({
            season:   season.season,
            division: div.age_level,
            rank:     row.rank,
            total:    div.rows.length,
            is_final: season.is_final ?? true,
          })
        }
      }
    }
  }

  // ISHC current season — match by school name (case-insensitive prefix/contains)
  if (ishcData?.matches && schoolName) {
    const needle = schoolName.toLowerCase()
    for (const match of ishcData.matches) {
      const home = (match.home ?? '').toLowerCase()
      const away = (match.away ?? '').toLowerCase()
      if (home.includes(needle) || away.includes(needle) ||
          needle.includes(home.split(' ')[0]) || needle.includes(away.split(' ')[0])) {
        ishcCurrentSeason.push(match)
      }
    }
  }

  const result: HockeyArchiveData = { socsPerformance, socsAllComers, ishcCurrentSeason }
  schoolCache[cacheKey] = result
  return result
}

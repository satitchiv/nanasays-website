const SEED_ROW_SLUGS = new Map<string, string>([
  ['school type', 'school_type'],
  ['location', 'location'],
  ['travel from heathrow', 'heathrow_minutes'],
  ['class size', 'class_size'],
  ['total pupils', 'total_pupils'],
  ['lowest boarding entry', 'lowest_boarding_entry'],
  ['boarding pupils', 'boarding_pupils'],
  ['international pupils', 'international_pupils'],
  ['day pupils', 'day_pupils'],
  ['boarding ratio', 'boarding_ratio'],
  ['boarding mix', 'boarding_ratio'],
  ['gcse 9–7', 'gcse_pct'],
  ['a-level a*–a', 'a_level_pct'],
  ['boarding fee · per term', 'boarding_fee_term'],
  ['boarding fee · per year', 'boarding_fee_year'],
  ['registration fee', 'registration_fee'],
  ['year 9 / 10 admissions', 'y9_y10_admissions'],
  ['entry timeline', 'y9_y10_admissions'],
  ['school view', 'school_view'],
])

export function generalSeedRowSlug(rowName: string): string | null {
  return SEED_ROW_SLUGS.get(rowName.trim().toLowerCase().replace(/\s+/g, ' ')) ?? null
}

export function isGeneralSeedRowName(rowName: string): boolean {
  return generalSeedRowSlug(rowName) != null
}

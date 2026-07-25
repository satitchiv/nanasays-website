export type DatabaseTopicCandidate = {
  id: string
  label: string
  evidencePaths: string[]
  questionAliases?: string[]
}

function normalizeScoutText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// These are deliberately explicit database-backed dimensions, not AI guesses.
// A candidate is only reported when its paths contain verified values for at
// least ten comparison-ready UK schools.
export const DATABASE_TOPIC_CANDIDATES: DatabaseTopicCandidate[] = [
  { id: 'ib_results', label: 'IB results', evidencePaths: ['exam_results.ib'] },
  { id: 'subject_strengths', label: 'Subject strengths', evidencePaths: ['subject_strengths'] },
  { id: 'ethos_values_faith', label: 'School ethos, values and faith character', evidencePaths: ['school_life.ethos', 'school_life.faith_character'] },
  { id: 'community_service', label: 'Community service', evidencePaths: ['school_life.community_service'] },
  { id: 'trips_expeditions', label: 'Trips and expeditions', evidencePaths: ['school_life.trips_expeditions'] },
  { id: 'school_traditions', label: 'School traditions', evidencePaths: ['school_life.notable_traditions'] },
  { id: 'school_history', label: 'School history', evidencePaths: ['school_life.school_history'] },
  { id: 'sixth_form_life', label: 'Sixth-form life', evidencePaths: ['school_life.sixth_form_life'] },
  { id: 'sports_coaching', label: 'Sports coaching staff', evidencePaths: ['sports_profile.coaching_staff'] },
  { id: 'sports_competitive_tier', label: 'School-wide sports competitive level', evidencePaths: ['sports_profile.competitive_tier'] },
  { id: 'sports_fixture_volume', label: 'Sports fixture volume', evidencePaths: ['sports_profile.fixture_volume', 'sports_profile.fixtures_per_year_approx'] },
  { id: 'sports_tours', label: 'Sports tours', evidencePaths: ['sports_profile.sports_tours'] },
  {
    id: 'sports_team_depth',
    label: 'Sports team depth',
    evidencePaths: ['sports_profile.teams_by_sport'],
    questionAliases: ['How many sports teams does the school have?', 'Are there teams for different age groups?', 'How deep is the sports programme?'],
  },
  {
    id: 'sports_competition_participation',
    label: 'Sports competition participation',
    evidencePaths: ['sports_profile.competitions_entered'],
    questionAliases: ['Which sports competitions does the school enter?', 'Does the school compete nationally?', 'What competitions do the teams take part in?'],
  },
  {
    id: 'signature_sports',
    label: 'Signature sports',
    evidencePaths: ['sports_profile.signature_sports'],
    questionAliases: ['Which sports is the school known for?', 'What are the school’s strongest sports?', 'Which sports are the main focus?'],
  },
  { id: 'cricket', label: 'Cricket opportunities', evidencePaths: ['sports_profile.cricket'] },
  { id: 'hockey', label: 'Hockey opportunities', evidencePaths: ['sports_profile.hockey'] },
  { id: 'rugby', label: 'Rugby opportunities', evidencePaths: ['sports_profile.rugby'] },
  { id: 'tennis', label: 'Tennis opportunities', evidencePaths: ['sports_profile.tennis'] },
  { id: 'nearest_station', label: 'Nearest train station', evidencePaths: ['location_profile.nearest_station'] },
  { id: 'school_setting', label: 'Rural, coastal or urban setting', evidencePaths: ['location_profile.setting', 'location_profile.setting_note'] },
]

/** Resolve parent wording to a canonical database-backed topic label. */
export function canonicalDatabaseTopicLabel(value: string): string {
  const normalized = normalizeScoutText(value)
  return DATABASE_TOPIC_CANDIDATES.find(candidate => [candidate.label, ...(candidate.questionAliases ?? [])]
    .some(alias => normalizeScoutText(alias) === normalized))?.label ?? value.trim()
}

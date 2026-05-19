/**
 * isi-deep-bundle-mapper.js — pure mapping function for ISI deep facts → bundle.
 *
 * Why a separate file: tools.js (which used to inline this switch) imports
 * `school-name-overrides.ts`, so it can't be loaded directly from a Node
 * smoke script without a build step. Extracting the isi_deep mapping into
 * a pure-JS module lets the production `loadDimFactsBundles` AND the smoke
 * test (`scripts/smoke-isi-deep-scorers.mjs`) call the SAME function.
 *
 * Per Codex Step 8 finding #2 (2026-05-10): the smoke must exercise real
 * production paths. This module is the production mapping.
 */

/**
 * Apply one isi_deep school_facts row's contribution to a bundle object.
 *
 * @param {object} fact            row from school_facts (must have fact_type, claim, source_url)
 * @param {object} dimBundle       mutable bundle object; gets sub-fields added in place
 *                                  (caller initialises `{ sources: [] }` before first call)
 */
export function applyIsiDeepFactToBundle(fact, dimBundle) {
  if (!fact || !dimBundle) return;
  // Codex P2 defensive guard: callers already gate `dimension==='isi_deep'`,
  // but if a non-ISI row slips through we silently no-op rather than mis-map.
  if (fact.dimension && fact.dimension !== 'isi_deep') return;
  switch (fact.fact_type) {
    case 'isi_teaching_quality':         dimBundle.teaching_grade            = fact.claim?.grade ?? null; break;
    case 'isi_pshe_quality':             dimBundle.pshe_grade                = fact.claim?.grade ?? null; break;
    case 'isi_send_support_quality':     dimBundle.send_support_grade        = fact.claim?.grade ?? null; break;
    case 'isi_leadership_quality':       dimBundle.leadership_grade          = fact.claim?.grade ?? null; break;
    case 'isi_boarding_quality':         dimBundle.boarding_grade            = fact.claim?.grade ?? null; break;
    case 'isi_personal_development':     dimBundle.personal_development_grade = fact.claim?.grade ?? null; break;
    case 'isi_lgbtq_inclusion':
      dimBundle.lgbtq_signal = fact.claim?.signal ?? null;
      dimBundle.lgbtq_detail = fact.claim?.detail ?? null;
      break;
    case 'isi_bullying_culture':
      dimBundle.bullying_signal = fact.claim?.signal ?? null;
      dimBundle.bullying_detail = fact.claim?.detail ?? null;
      break;
    case 'isi_mental_health_provision':
      dimBundle.mental_health_signal = fact.claim?.signal ?? null;
      dimBundle.mental_health_detail = fact.claim?.detail ?? null;
      break;
    case 'isi_diversity_culture':        dimBundle.diversity_signal         = fact.claim?.signal ?? null; break;
    case 'isi_pupil_voice':              dimBundle.pupil_voice_signal       = fact.claim?.signal ?? null; break;
    case 'isi_wellbeing_spaces':         dimBundle.wellbeing_spaces_signal  = fact.claim?.signal ?? null; break;
    case 'isi_online_safety_education':  dimBundle.online_safety_signal     = fact.claim?.signal ?? null; break;
    case 'isi_sustainability_focus':     dimBundle.sustainability_signal    = fact.claim?.signal ?? null; break;
    case 'isi_community_service':        dimBundle.community_service_signal = fact.claim?.signal ?? null; break;
    case 'isi_recommended_next_steps':   dimBundle.recommended_steps_count  = fact.claim?.step_count ?? null; break;
  }
  // inspection_date is shared across many fact_types; first non-null wins.
  if (fact.claim?.inspection_date && !dimBundle.inspection_date) {
    dimBundle.inspection_date = fact.claim.inspection_date;
  }
}

/**
 * utm.ts — UTM tag builder for all outbound links leaving NanaSays.
 *
 * Every link to a school's external site carries full UTM attribution
 * so NanaSays can prove referral value in school sales meetings.
 *
 * Example output:
 *   https://school.com/?utm_source=nanasays&utm_medium=referral&utm_campaign=school-profile&utm_content=sidebar-visit-website
 *
 * Placements:
 *   hero-visit-website      — hero stats bar CTA
 *   sidebar-visit-website   — sidebar "Visit Website" button
 *   open-day-link           — open day page link
 *   explore-visit-website   — Explore section: website
 *   explore-prospectus      — Explore section: view prospectus
 *   explore-virtual-tour    — Explore section: virtual tour
 *   explore-video           — Explore section: watch video
 */

export function buildUtmUrl(url: string, placement: string): string {
  // Guard: if URL is bare (no protocol), prepend https://
  // url-fixer.js should have resolved these, but safety net for any edge cases
  let safeUrl = url
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    safeUrl = 'https://' + url
  }

  try {
    const u = new URL(safeUrl)
    u.searchParams.set('utm_source', 'nanasays')
    u.searchParams.set('utm_medium', 'referral')
    u.searchParams.set('utm_campaign', 'school-profile')
    u.searchParams.set('utm_content', placement)
    return u.toString()
  } catch {
    // If URL is truly unparseable, return original — better than crashing the page
    return url
  }
}

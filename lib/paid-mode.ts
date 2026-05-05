/**
 * Site-wide paid-mode flag. Read by middleware, server components, client
 * components, and API routes — must work in all four contexts to keep the
 * Footer / Nav / About pricing block hydration-safe.
 *
 * Uses `NEXT_PUBLIC_PAID_MODE` so Next.js inlines the value into the client
 * bundle at build time. (Without `NEXT_PUBLIC_`, client-bundled components
 * read `undefined` and produce hydration mismatches against server-rendered
 * HTML.) The flag is pure UI gating — no secret to protect.
 *
 * When `NEXT_PUBLIC_PAID_MODE=off` (set explicitly in Netlify env), every
 * paid surface is hidden or redirected: paywall pages, paid CTAs on the free
 * school page, paid API endpoints, login/signup that route to paid dashboards.
 * Free SEO pages remain fully visible.
 *
 * Default is `on` when unset — preserves local-dev behaviour. Flip to `off`
 * only on the deployed Netlify build (Build scope; rebuild required to
 * propagate to client bundles).
 */
export function isPaidModeOn(): boolean {
  return (process.env.NEXT_PUBLIC_PAID_MODE ?? 'on').toLowerCase() !== 'off'
}

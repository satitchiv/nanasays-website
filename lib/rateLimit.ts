const store = new Map<string, { count: number; resetAt: number }>()

const WINDOW_MS = 10 * 60 * 1000 // 10 minutes

const LIMITS: Record<string, number> = {
  'general-enquiry':    5,
  'claim-enquiry':      5,
  'request-prospectus': 5,
  'chat':               20, // 20 per 10 min
}

function getIp(req: Request): string {
  // x-nf-client-connection-ip is set by Netlify's edge network and cannot be
  // spoofed by the client — always prefer it over x-forwarded-for.
  return (
    req.headers.get('x-nf-client-connection-ip') ??
    req.headers.get('cf-connecting-ip') ??         // Cloudflare fallback
    'unknown'
    // Intentionally NOT falling back to x-forwarded-for — it is client-controlled
  )
}

export function checkRateLimit(req: Request, endpoint: string): boolean {
  const ip = getIp(req)
  const max = LIMITS[endpoint] ?? 5
  const key = `${endpoint}:${ip}`
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }

  if (entry.count >= max) return false

  entry.count++
  return true
}

const store = new Map<string, { count: number; resetAt: number }>()

const WINDOW_MS = 10 * 60 * 1000 // 10 minutes
const MAX_REQUESTS = 5

export function checkRateLimit(req: Request, endpoint: string): boolean {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'

  const key = `${endpoint}:${ip}`
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }

  if (entry.count >= MAX_REQUESTS) return false

  entry.count++
  return true
}

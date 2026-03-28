/** Escape user-supplied strings before embedding in HTML email bodies */
export function esc(str: string | null | undefined): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Basic email format check */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/** Field length guards */
export const MAX_NAME    = 200
export const MAX_EMAIL   = 254
export const MAX_MESSAGE = 5000
export const MAX_SHORT   = 300

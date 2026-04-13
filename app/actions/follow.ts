'use server'

const EDUWORLD = process.env.EDUWORLD_URL || 'http://localhost:8001'

export async function followSchool(
  slug: string,
  email: string,
  interests: string[],
  schoolName: string,
): Promise<{ status: 'confirmation_sent' | 'already_following' | 'error' }> {
  try {
    const res = await fetch(`${EDUWORLD}/api/schools/${slug}/follow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, interests, school_name: schoolName }),
      cache: 'no-store',
    })
    if (!res.ok) return { status: 'error' }
    return await res.json()
  } catch {
    return { status: 'error' }
  }
}

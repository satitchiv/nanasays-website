// Build-time feature flags. Reads NEXT_PUBLIC_* env vars so the same call works
// on server and client. Default off until the flag is set to 'on'.

export function isResearchRoomEnabled(): boolean {
  return process.env.NEXT_PUBLIC_RESEARCH_ROOM === 'on'
}

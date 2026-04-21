export default function SchedulePage() {
  return (
    <div style={{
      background: '#fff', padding: 60, borderRadius: 10, border: '1px dashed #CBD5E1',
      textAlign: 'center', color: '#6B7280',
    }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: '#1B3252' }}>
        Schedule editor — coming in Phase 4b
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 420, margin: '0 auto' }}>
        For now the default schedule (Mon/Wed/Fri 05:00 BKK) is seeded in the database.
        Edit directly in Supabase → Table Editor → <code>social_schedule_weekly</code> if you need to change it before the UI ships.
      </div>
    </div>
  )
}

export default function DesignPage() {
  return (
    <div style={{
      background: '#fff', padding: 60, borderRadius: 10, border: '1px dashed #CBD5E1',
      textAlign: 'center', color: '#6B7280',
    }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🎨</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: '#1B3252' }}>
        Design Settings editor — coming in Phase 4b
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 420, margin: '0 auto' }}>
        Colors, wordmark, toggles, font scale. For now defaults are seeded in the database.
        Edit directly in Supabase → Table Editor → <code>social_design_tokens</code> to tweak before the UI ships.
      </div>
    </div>
  )
}

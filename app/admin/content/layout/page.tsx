export default function LayoutPage() {
  return (
    <div style={{
      background: '#fff', padding: 60, borderRadius: 10, border: '1px dashed #CBD5E1',
      textAlign: 'center', color: '#6B7280',
    }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🧩</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: '#1B3252' }}>
        Template Layout editor — Phase 6b
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 420, margin: '0 auto' }}>
        Reorder slots, toggle visibility, adjust alignment per (template, channel). Lands after the pipeline is live.
      </div>
    </div>
  )
}

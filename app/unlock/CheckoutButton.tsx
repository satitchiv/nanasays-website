'use client'

import { useState } from 'react'

export default function CheckoutButton({ from }: { from: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleClick() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || 'Something went wrong')
      window.location.href = data.url
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          width: '100%', padding: '16px', borderRadius: 12, border: 'none',
          background: loading ? '#e2e8f0' : '#1bb5a1',
          color: loading ? '#64748b' : '#fff',
          fontSize: 16, fontWeight: 800, cursor: loading ? 'wait' : 'pointer',
          fontFamily: 'Nunito, sans-serif', letterSpacing: '-0.01em',
          transition: 'background 0.15s',
        }}
      >
        {loading ? 'Redirecting to payment…' : 'Start £39/month — unlock all reports'}
      </button>
      {error && (
        <p style={{ marginTop: 10, fontSize: 13, color: '#c0392b', textAlign: 'center' }}>
          {error}
        </p>
      )}
      <p style={{ marginTop: 10, fontSize: 12, color: '#64748b', textAlign: 'center' }}>
        Secure payment via Stripe · Cancel any time
      </p>
    </div>
  )
}

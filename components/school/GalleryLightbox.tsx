'use client'

import { useState, useEffect, useCallback } from 'react'

interface GalleryCell {
  imageUrl: string | null
  label: string
  gridRow?: string
}

interface Props {
  cells: GalleryCell[]
  allImages: string[]
  schoolName: string
}

export default function GalleryLightbox({ cells: _cells, allImages, schoolName }: Props) {
  const [offset, setOffset] = useState(0)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const close = useCallback(() => setActiveIndex(null), [])
  const prev = useCallback(() => setActiveIndex(i => (i! > 0 ? i! - 1 : allImages.length - 1)), [allImages.length])
  const next = useCallback(() => setActiveIndex(i => (i! < allImages.length - 1 ? i! + 1 : 0)), [allImages.length])

  useEffect(() => {
    if (activeIndex === null) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeIndex, close, prev, next])

  const placeholderLabels = ['Campus', 'Classrooms', 'Boarding', 'Sports', 'Arts']
  const visibleImages = allImages.slice(offset, offset + 5)
  const cells = Array.from({ length: 5 }, (_, i) => ({
    imageUrl: visibleImages[i] ?? null,
    label: placeholderLabels[i],
    gridRow: i === 0 ? '1 / 3' : undefined,
  }))

  const canPrev = offset > 0
  const canNext = offset + 5 < allImages.length
  const hasImages = allImages.length > 0

  return (
    <>
      <div style={{ position: 'relative', marginBottom: 52 }}>

        {/* Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr',
          gridTemplateRows: '180px 180px',
          gap: 6, borderRadius: 10, overflow: 'hidden',
        }}>
          {cells.map((cell, i) => (
            <div
              key={i}
              onClick={() => {
                if (!cell.imageUrl) return
                setActiveIndex(offset + i)
              }}
              style={{
                background: cell.imageUrl ? 'linear-gradient(135deg, #ddf0ea, #b8e6d8)' : '#111e30',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gridRow: cell.gridRow, position: 'relative', overflow: 'hidden',
                cursor: cell.imageUrl ? 'pointer' : 'default',
              }}
            >
              {cell.imageUrl ? (
                <img
                  src={cell.imageUrl}
                  alt={`${schoolName} — ${cell.label}`}
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                /* PHOTOS COMING SOON — V2: dark navy + camera + pill */
                <div style={{
                  position: 'absolute', inset: 0, background: '#111e30',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
                }}>
                  <svg width={i === 0 ? 26 : 20} height={i === 0 ? 26 : 20} viewBox="0 0 24 24" fill="none" stroke="#34C3A0" strokeWidth="1" opacity="0.5">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                  {i === 0 && (
                    <div style={{
                      fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
                      color: 'rgba(52,195,160,0.55)', border: '1px solid rgba(52,195,160,0.2)',
                      borderRadius: 20, padding: '3px 10px',
                    }}>Coming soon</div>
                  )}
                </div>
              )}

              {/* Photo count badge on first cell */}
              {i === 0 && (
                <div style={{
                  position: 'absolute', bottom: 10, right: 10,
                  background: 'rgba(255,255,255,0.92)', border: '1px solid var(--border)',
                  borderRadius: 5, fontSize: 12, fontWeight: 600, color: 'var(--navy)',
                  padding: '5px 12px', pointerEvents: 'none',
                }}>
                  {hasImages ? `${allImages.length} photos` : 'Photos coming soon'}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Grid navigation arrows — only when there are enough images */}
        {allImages.length > 5 && (
          <>
            <button
              onClick={() => setOffset(o => Math.max(0, o - 5))}
              disabled={!canPrev}
              style={{
                position: 'absolute', left: -18, top: '50%', transform: 'translateY(-50%)',
                width: 36, height: 36, borderRadius: '50%',
                background: canPrev ? '#fff' : 'rgba(255,255,255,0.4)',
                border: '1px solid var(--border)',
                boxShadow: canPrev ? '0 2px 8px rgba(0,0,0,0.12)' : 'none',
                color: canPrev ? 'var(--navy)' : '#aaa',
                cursor: canPrev ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, zIndex: 2,
              }}
            >‹</button>
            <button
              onClick={() => setOffset(o => Math.min(allImages.length - 5, o + 5))}
              disabled={!canNext}
              style={{
                position: 'absolute', right: -18, top: '50%', transform: 'translateY(-50%)',
                width: 36, height: 36, borderRadius: '50%',
                background: canNext ? '#fff' : 'rgba(255,255,255,0.4)',
                border: '1px solid var(--border)',
                boxShadow: canNext ? '0 2px 8px rgba(0,0,0,0.12)' : 'none',
                color: canNext ? 'var(--navy)' : '#aaa',
                cursor: canNext ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, zIndex: 2,
              }}
            >›</button>
          </>
        )}

        {/* Dot indicators */}
        {allImages.length > 5 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 12 }}>
            {Array.from({ length: Math.ceil(allImages.length / 5) }, (_, i) => (
              <button
                key={i}
                onClick={() => setOffset(i * 5)}
                style={{
                  width: offset / 5 === i ? 18 : 6,
                  height: 6, borderRadius: 3, border: 'none',
                  background: offset / 5 === i ? 'var(--teal)' : 'var(--border)',
                  cursor: 'pointer', padding: 0,
                  transition: 'width 0.2s, background 0.2s',
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {activeIndex !== null && (
        <div
          onClick={close}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.94)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <button onClick={close} style={{
            position: 'absolute', top: 20, right: 24,
            background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff', borderRadius: 8, width: 40, height: 40,
            cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>

          <div style={{
            position: 'absolute', top: 24, left: '50%', transform: 'translateX(-50%)',
            color: 'rgba(255,255,255,0.6)', fontSize: 13,
          }}>
            {activeIndex + 1} / {allImages.length}
          </div>

          {allImages.length > 1 && (
            <button onClick={e => { e.stopPropagation(); prev() }} style={{
              position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff', borderRadius: 8, width: 44, height: 44,
              cursor: 'pointer', fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>‹</button>
          )}

          <img
            src={allImages[activeIndex]}
            alt={`${schoolName} — photo ${activeIndex + 1}`}
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '88vw', maxHeight: '84vh',
              objectFit: 'contain', borderRadius: 8,
              boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
            }}
          />

          {allImages.length > 1 && (
            <button onClick={e => { e.stopPropagation(); next() }} style={{
              position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff', borderRadius: 8, width: 44, height: 44,
              cursor: 'pointer', fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>›</button>
          )}
        </div>
      )}
    </>
  )
}

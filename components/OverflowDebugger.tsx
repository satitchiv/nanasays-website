'use client'

import { useEffect, useState } from 'react'

interface Offender {
  el: Element
  tag: string
  cls: string
  id: string
  right: number
  width: number
  text: string
}

export default function OverflowDebugger() {
  const [enabled, setEnabled] = useState(false)
  const [offenders, setOffenders] = useState<Offender[]>([])
  const [viewportInfo, setViewportInfo] = useState<string>('')

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('debug') === 'overflow') setEnabled(true)
  }, [])

  useEffect(() => {
    if (!enabled) return

    function scan() {
      const vw = window.innerWidth
      const scrollWidth = document.documentElement.scrollWidth
      const vv = window.visualViewport
      setViewportInfo(
        `layoutVW=${vw}px · scrollWidth=${scrollWidth}px · ` +
        `visualVW=${vv ? vv.width.toFixed(1) : '?'}px · scale=${vv ? vv.scale.toFixed(3) : '?'}`
      )

      if (scrollWidth <= vw + 1) {
        setOffenders([])
        return
      }

      const all = document.body.querySelectorAll<HTMLElement>('*')
      const found: Offender[] = []
      all.forEach(el => {
        const rect = el.getBoundingClientRect()
        if (rect.right > vw + 1 && rect.width > 0) {
          // Skip our debugger itself
          if (el.closest('[data-overflow-debugger]')) return
          found.push({
            el,
            tag: el.tagName.toLowerCase(),
            cls: el.className?.toString().slice(0, 60) ?? '',
            id: el.id ?? '',
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            text: (el.textContent ?? '').trim().slice(0, 40),
          })
        }
      })
      // Keep only the deepest offenders (children of offenders are usually redundant)
      const leafOffenders = found.filter(o =>
        !found.some(other => other !== o && o.el.contains(other.el))
      )
      setOffenders(leafOffenders.slice(0, 20))

      console.group('[OverflowDebugger] Horizontal overflow detected')
      console.log('Viewport:', { vw, scrollWidth, diff: scrollWidth - vw })
      leafOffenders.slice(0, 20).forEach(o => {
        console.log(`right=${o.right}px width=${o.width}px <${o.tag}${o.id ? '#' + o.id : ''}${o.cls ? '.' + o.cls.replace(/\s+/g, '.') : ''}>`, o.el)
      })
      console.groupEnd()
    }

    scan()
    const ro = new ResizeObserver(() => scan())
    ro.observe(document.body)
    window.addEventListener('resize', scan)
    window.addEventListener('load', scan)
    const interval = setInterval(scan, 2000)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', scan)
      window.removeEventListener('load', scan)
      clearInterval(interval)
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <div
      data-overflow-debugger
      style={{
        position: 'fixed', bottom: 8, left: 8, right: 8, zIndex: 999999,
        background: offenders.length > 0 ? 'rgba(200,30,30,0.95)' : 'rgba(30,130,60,0.92)',
        color: '#fff', borderRadius: 8, padding: '10px 12px',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 11, lineHeight: 1.4, maxHeight: '45vh', overflowY: 'auto',
        boxShadow: '0 6px 24px rgba(0,0,0,.3)',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>
        {offenders.length > 0
          ? `⚠ ${offenders.length} overflowing element(s)`
          : '✓ No horizontal overflow'}
      </div>
      <div style={{ opacity: 0.85, marginBottom: offenders.length ? 8 : 0 }}>
        {viewportInfo}
      </div>
      {offenders.map((o, i) => (
        <div key={i} style={{ borderTop: '1px solid rgba(255,255,255,.2)', paddingTop: 6, marginTop: 6 }}>
          <div>
            <span style={{ background: 'rgba(0,0,0,.35)', padding: '1px 5px', borderRadius: 3 }}>
              {o.tag}{o.id ? '#' + o.id : ''}
            </span>
            {o.cls && <span style={{ marginLeft: 6, opacity: 0.8 }}>.{o.cls.replace(/\s+/g, '.')}</span>}
          </div>
          <div>right={o.right}px width={o.width}px</div>
          {o.text && <div style={{ opacity: 0.7 }}>&ldquo;{o.text}&rdquo;</div>}
        </div>
      ))}
    </div>
  )
}

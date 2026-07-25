import assert from 'node:assert/strict'
import puppeteer from 'puppeteer'
import { comparisonTableMinWidth } from '../lib/research-room/comparison-table-layout.ts'

const browser = await puppeteer.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })

  for (const schoolCount of [6, 8, 10]) {
    for (const zoom of [0.85, 1, 1.15]) {
      const tableWidth = comparisonTableMinWidth(schoolCount)
      const schoolCells = Array.from(
        { length: schoolCount },
        (_, index) => `<div class="school">School ${index + 1}</div>`,
      ).join('')
      await page.setContent(`
        <style>
          * { box-sizing: border-box; }
          .wrap { width: 900px; overflow: auto; border: 1px solid #ddd; zoom: ${zoom}; }
          .table { display: flex; flex-direction: column; min-width: ${tableWidth}px; }
          .row { display: grid; grid-template-columns: 260px repeat(${schoolCount}, minmax(220px, 1fr)); }
          .label { position: sticky; left: 0; z-index: 3; background: white; }
          .label, .school { min-height: 72px; padding: 16px; border-right: 1px solid #ddd; }
        </style>
        <div class="wrap">
          <div class="table">
            <div class="row"><div class="label">Comparison details</div>${schoolCells}</div>
          </div>
        </div>
      `)

      const result = await page.evaluate(async () => {
        const wrap = document.querySelector<HTMLElement>('.wrap')!
        const label = document.querySelector<HTMLElement>('.label')!
        const before = label.getBoundingClientRect().left
        wrap.scrollLeft = wrap.scrollWidth
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
        return {
          before,
          after: label.getBoundingClientRect().left,
          clientWidth: wrap.clientWidth,
          scrollWidth: wrap.scrollWidth,
        }
      })
      assert.ok(result.scrollWidth > result.clientWidth, `${schoolCount} schools should scroll`)
      assert.ok(
        Math.abs(result.after - result.before) < 1,
        `${schoolCount} schools at ${zoom} zoom moved the sticky label`,
      )
    }
  }

  await page.setViewport({ width: 390, height: 800 })
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      .wrap { width: 350px; overflow: visible; border: 1px solid #ddd; }
      .table { display: flex; flex-direction: column; min-width: 0; }
      .row { display: grid; grid-template-columns: minmax(132px, .82fr) minmax(0, 1.18fr); }
      .label { position: static; }
      .label, .school { min-height: 72px; padding: 14px; }
    </style>
    <div class="wrap">
      <div class="table">
        <div class="row"><div class="label">Comparison details</div><div class="school">Millfield School</div></div>
      </div>
    </div>
  `)
  const mobile = await page.$eval('.wrap', element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))
  assert.ok(mobile.scrollWidth <= mobile.clientWidth, 'single-school mobile table should not scroll')

  console.log('Sticky comparison table passed desktop, zoom and mobile checks')
} finally {
  await browser.close()
}

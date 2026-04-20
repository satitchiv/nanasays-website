/**
 * PDF generation helper — wraps Puppeteer so we can swap implementations later.
 *
 * Current: uses full `puppeteer` (bundles Chromium, ~200MB). Works on the Mac Mini
 * out of the box.
 *
 * Future (when we deploy to Netlify serverless): swap to `puppeteer-core` +
 * `@sparticuz/chromium`. Only this file needs to change — consumers of renderPdf()
 * stay the same.
 */

import puppeteer, { PDFOptions } from 'puppeteer'

export type RenderPdfOptions = {
  /** Full URL the headless browser should navigate to. */
  url: string
  /** Optional override for PDFOptions (margins, format, etc.). */
  pdfOptions?: Partial<PDFOptions>
  /** Optional custom header HTML (supports puppeteer variables like <span class="title"></span>) */
  headerTemplate?: string
  /** Optional custom footer HTML */
  footerTemplate?: string
  /** Wait for this selector before emitting PDF (ensures full render) */
  waitForSelector?: string
  /** Wait for network idle before emitting (default: true) */
  waitForNetworkIdle?: boolean
}

export async function renderPdf(opts: RenderPdfOptions): Promise<Uint8Array> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 1800, deviceScaleFactor: 2 })

    await page.goto(opts.url, {
      waitUntil: opts.waitForNetworkIdle === false ? 'domcontentloaded' : 'networkidle0',
      timeout: 60_000,
    })
    if (opts.waitForSelector) {
      await page.waitForSelector(opts.waitForSelector, { timeout: 30_000 })
    }
    // Force the print stylesheet to apply
    await page.emulateMediaType('print')

    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '22mm', bottom: '20mm', left: '14mm', right: '14mm' },
      displayHeaderFooter: !!(opts.headerTemplate || opts.footerTemplate),
      headerTemplate: opts.headerTemplate || '<div></div>',
      footerTemplate: opts.footerTemplate || '<div></div>',
      ...(opts.pdfOptions || {}),
    })
    return buffer
  } finally {
    await browser.close()
  }
}

/** Standard nanasays PDF header — navy text, small caps. */
export function defaultHeader(schoolName: string) {
  return `
    <div style="width:100%; font-size:9px; color:#1B3252; padding: 0 14mm; font-family: 'Helvetica', sans-serif;">
      <span style="float:left; font-weight:700; letter-spacing:.08em; text-transform:uppercase;">
        Deep School Report · nanasays.school
      </span>
      <span style="float:right; color:#6B7280;">
        ${schoolName.replace(/</g, '&lt;')}
      </span>
    </div>
  `
}

/** Standard nanasays PDF footer — date + page number. */
export function defaultFooter() {
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  return `
    <div style="width:100%; font-size:9px; color:#6B7280; padding: 0 14mm; font-family: 'Helvetica', sans-serif;">
      <span style="float:left;">Generated ${today}</span>
      <span style="float:right;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>
  `
}

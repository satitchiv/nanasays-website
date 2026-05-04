/**
 * pdf-util.js — fetch a PDF URL and extract its text.
 * Shared by crawl-school-site.js and fill-gaps-via-search.js so both
 * handle PDF ingestion the same way.
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

/**
 * Detect URLs that resolve to PDFs even without a `.pdf` extension.
 * Catches the common "hidden PDF" cases we kept missing:
 *   - Google Docs export URLs (docs.google.com/document/d/ID/export?format=pdf)
 *   - Google Docs view/edit URLs we can transform
 *   - Any URL with a ?format=pdf query param
 *   - Traditional .pdf file URLs
 */
export function isPdfLikeUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (/\.pdf(\?|$)/i.test(u.pathname)) return true;
    // Case-insensitive match on both key and value — some sites use ?Format=PDF.
    for (const [k, v] of u.searchParams.entries()) {
      if (k.toLowerCase() === 'format' && v.toLowerCase() === 'pdf') return true;
      // ISI (reports.isi.net/DownloadReport.aspx?r=xxx.pdf) and similar
      // download-proxy URLs put the .pdf in a query parameter. Check every
      // query value for a .pdf filename ref.
      if (/\.pdf$/i.test(v)) return true;
    }
    if (/^docs\.google\.com$/i.test(u.hostname) && /\/document\/d\/[^/]+/i.test(u.pathname)) return true;
  } catch { /* malformed URL */ }
  return false;
}

/**
 * Rewrite known PDF-viewer URLs to their direct PDF download form.
 * For Google Docs view/edit/pub URLs, swap in /export?format=pdf.
 * Otherwise returns the url unchanged.
 */
export function resolveToPdfUrl(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (/^docs\.google\.com$/i.test(u.hostname)) {
      const m = u.pathname.match(/^\/document\/d\/([^/]+)(?:\/.*)?$/i);
      if (m) return `https://docs.google.com/document/d/${m[1]}/export?format=pdf`;
    }
  } catch { /* malformed URL */ }
  return url;
}

/** Extract text from a local PDF file. Returns null on failure (preserves crawler's existing contract). */
export async function extractPdfFromFile(filepath) {
  try {
    const buf = readFileSync(filepath);
    const parsed = await new PDFParse({ data: buf }).getText();
    return parsed.text || null;
  } catch {
    return null;
  }
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function fetchAndExtractPdf(url, { timeoutMs = 45_000, maxMb = 10 } = {}) {
  const fetchUrl = resolveToPdfUrl(url); // e.g. Google Docs view → export?format=pdf
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(fetchUrl, { headers: { 'User-Agent': UA }, signal: ctrl.signal, redirect: 'follow' });
    clearTimeout(t);
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const ct = res.headers.get('content-type') || '';
    const buf = Buffer.from(await res.arrayBuffer());
    const mb = buf.length / 1024 / 1024;
    if (mb > maxMb) return { ok: false, reason: `too large (${mb.toFixed(1)}MB)` };
    // Accept either application/pdf or fallback to magic-byte sniff
    const isPdfMime = /pdf/i.test(ct);
    const isPdfMagic = buf.slice(0, 4).toString() === '%PDF';
    if (!isPdfMime && !isPdfMagic) return { ok: false, reason: 'not a PDF' };
    const parsed = await new PDFParse({ data: buf }).getText();
    const text = (parsed.text || '').replace(/\s+/g, ' ').trim();
    const words = text.split(/\s+/).filter(Boolean).length;
    return { ok: true, text, words, sizeMb: parseFloat(mb.toFixed(2)) };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

/**
 * chunk-content.js
 * Splits plain text into topic-sized chunks (300-500 words).
 * Used by rechunk-existing.js (plain text path) and crawl-school-site.js (HTML path).
 */

// ── Plain-text chunker (for existing rows already extracted) ──────────────────

const TARGET_WORDS = 400;
const MIN_WORDS    = 80;
const MAX_WORDS    = 600;

/**
 * Detect if a line looks like a heading:
 * short (< 10 words), not ending with punctuation, not all-lowercase
 */
function isHeadingLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const words = trimmed.split(/\s+/);
  if (words.length > 10) return false;
  if (/[.!?,;:]$/.test(trimmed)) return false;
  if (trimmed === trimmed.toLowerCase()) return false;
  return true;
}

/**
 * chunkPlainText(text, sourceTitle)
 * Split plain text (already extracted) into chunks.
 * Returns Array of { heading, content, word_count, chunk_index }
 */
export function chunkPlainText(text, sourceTitle = '') {
  if (!text || !text.trim()) return [];

  // Split into paragraphs on double newlines
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);

  const sections  = [];
  let currentHeading = sourceTitle || '';
  let currentParas   = [];

  for (const para of paragraphs) {
    if (isHeadingLine(para)) {
      // Seal current section
      if (currentParas.length > 0) {
        sections.push({ heading: currentHeading, content: currentParas.join('\n\n') });
      }
      currentHeading = para;
      currentParas   = [];
    } else {
      currentParas.push(para);
    }
  }
  // Seal last section
  if (currentParas.length > 0) {
    sections.push({ heading: currentHeading, content: currentParas.join('\n\n') });
  }

  // If only one section, return as-is (no splitting needed)
  if (sections.length === 0) {
    return [{ heading: sourceTitle, content: text.trim(), word_count: countWords(text), chunk_index: 0 }];
  }

  // Merge tiny sections, split large ones
  const merged = mergeTinySections(sections);
  const split  = merged.flatMap(s => splitLargeSection(s));

  return split.map((s, i) => ({
    heading:     s.heading,
    content:     s.content,
    word_count:  countWords(s.content),
    chunk_index: i,
  }));
}

/**
 * chunkHtml(html, cheerioLoad, sourceTitle)
 * Split HTML using actual heading tags (h2/h3) for higher quality.
 * Used by the crawler which has the original HTML.
 * Returns same shape as chunkPlainText.
 */
export function chunkHtml(html, cheerioLoad, sourceTitle = '') {
  const $ = cheerioLoad(html);

  // Remove noise elements (same as crawler)
  $('nav, header, footer, aside, script, style, noscript, iframe, form, .nav, .menu, .footer, .header, .sidebar').remove();

  const body = $('main, article, [role="main"], .content, .page-content, body').first();
  if (!body.length) return chunkPlainText($.text(), sourceTitle);

  const sections  = [];
  let currentHeading = sourceTitle || ($('h1').first().text().trim()) || '';
  let currentTexts   = [];

  body.find('h2, h3, p, li, td, dt, dd').each((_, el) => {
    const tag  = el.tagName?.toLowerCase();
    const text = $(el).text().trim();
    if (!text) return;

    if (tag === 'h2' || tag === 'h3') {
      if (currentTexts.length > 0) {
        sections.push({ heading: currentHeading, content: currentTexts.join('\n\n') });
      }
      currentHeading = text;
      currentTexts   = [];
    } else {
      currentTexts.push(text);
    }
  });

  if (currentTexts.length > 0) {
    sections.push({ heading: currentHeading, content: currentTexts.join('\n\n') });
  }

  if (sections.length === 0) {
    const allText = body.text().replace(/\s+/g, ' ').trim();
    return [{ heading: sourceTitle, content: allText, word_count: countWords(allText), chunk_index: 0 }];
  }

  const merged = mergeTinySections(sections);
  const split  = merged.flatMap(s => splitLargeSection(s));

  return split.map((s, i) => ({
    heading:     s.heading,
    content:     s.content,
    word_count:  countWords(s.content),
    chunk_index: i,
  }));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function mergeTinySections(sections) {
  const result = [];
  for (const section of sections) {
    const wc = countWords(section.content);
    if (wc < MIN_WORDS && result.length > 0) {
      // Merge into previous section
      const prev = result[result.length - 1];
      prev.content += '\n\n' + (section.heading ? section.heading + '\n' : '') + section.content;
    } else {
      result.push({ ...section });
    }
  }
  return result;
}

function splitLargeSection(section) {
  const words = section.content.split(/\s+/);
  if (words.length <= MAX_WORDS) return [section];

  const chunks = [];
  let i = 0;
  let subIdx = 0;
  while (i < words.length) {
    const slice = words.slice(i, i + TARGET_WORDS).join(' ');
    chunks.push({
      heading: section.heading + (subIdx > 0 ? ` (${subIdx + 1})` : ''),
      content: slice,
    });
    i += TARGET_WORDS;
    subIdx++;
  }
  return chunks;
}

/**
 * Verify the WhatsApp clipboard contains a tappable map link when an agent
 * copies a surroundings answer.
 */
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:3002';
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    window.__clipboardLog = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      get() { return { writeText: async (t) => { window.__clipboardLog.push(t); } }; },
    });
  });
  await page.goto(`${BASE}/portal/demo/assistant`, { waitUntil: 'networkidle2', timeout: 30000 });

  const ta = await page.$('textarea');
  await ta.click();
  await ta.type('Where is the school located?');
  await page.keyboard.press('Enter');
  // Wait for surroundings narrative
  await page.waitForFunction(() => /surselva|graubünden/i.test(document.body.innerText), { timeout: 30000 });
  await new Promise(r => setTimeout(r, 1500));

  // Click WhatsApp button
  const clicked = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => /whatsapp/i.test(x.textContent || ''));
    if (!b) return false;
    b.click();
    return true;
  });
  if (!clicked) { console.error('❌ WhatsApp button not found'); process.exit(1); }
  await new Promise(r => setTimeout(r, 600));

  const log = await page.evaluate(() => window.__clipboardLog);
  if (!log?.length) { console.error('❌ Clipboard not written'); process.exit(1); }
  const text = log[0];
  console.log('=== Clipboard text ===\n');
  console.log(text);
  console.log('\n=== Checks ===');
  const checks = [
    ['Contains *bold* school name',     /\*Gymnasium .* Disentis\*/.test(text)],
    ['Contains *Map:* label',            /\*Map:\*/.test(text)],
    ['Contains maps.google.com/?q= URL', /maps\.google\.com\/\?q=/.test(text)],
    ['Contains Disentis lat coords',     /46\.7/.test(text)],
    ['No iframe-only embed param',       !/output=embed/.test(text)],
  ];
  let ok = 0;
  for (const [name, pass] of checks) {
    console.log(`${pass ? '✅' : '❌'}  ${name}`);
    if (pass) ok++;
  }
  console.log(`\n${ok}/${checks.length} checks passed\n`);
  process.exit(ok === checks.length ? 0 : 1);
} finally {
  await browser.close();
}

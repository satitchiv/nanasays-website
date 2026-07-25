/**
 * Verify token-driven UI scoping:
 *  - With ?demo=<token> (1 school) → switcher hidden, school name shown as label
 *  - Without token → full SCHOOLS dropdown visible
 */
import puppeteer from 'puppeteer';

const TOKEN = '89fb36b2b1dc81f5840e1a59f6088f92e54b7ca2995f351f3d0ca7f35acc4230';
const BASE  = 'http://localhost:3002';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
try {
  const ok = (label, val) => console.log(`${val ? '✅' : '❌'}  ${label}`);

  // ── With token (Disentis-only) ──────────────────────────────────────────────
  console.log('\n=== With scoped token ===');
  const p1 = await browser.newPage();
  await p1.goto(`${BASE}/portal/demo/assistant?demo=${TOKEN}`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1500)); // let token validation land

  const r1 = await p1.evaluate(() => {
    const select = document.querySelector('select');
    const labels = Array.from(document.querySelectorAll('label')).map(l => (l.textContent || '').trim());
    const text = document.body.innerText;
    return {
      hasSelect: !!select,
      labels,
      hasSchoolLabel: labels.includes('School'),
      hasSwitchSchool: labels.includes('Switch school'),
      hasYourSchools: labels.includes('Your schools'),
      hasDemoFor: /demo for:/i.test(text),
      hasDisentis: /Gymnasium .* Disentis/.test(text),
      hasOtherSchools: /Le Rosey|Aiglon|Wellington|NIST/.test(text),
    };
  });
  console.log(JSON.stringify(r1, null, 2));
  ok('Switcher hidden (no <select>)', !r1.hasSelect);
  ok('Static "School" label shown', r1.hasSchoolLabel);
  ok('"Switch school" label NOT shown', !r1.hasSwitchSchool);
  ok('Disentis name visible', r1.hasDisentis);
  ok('Other-country schools NOT visible', !r1.hasOtherSchools);
  ok('"Demo for:" prospect attribution visible', r1.hasDemoFor);

  await p1.close();

  // ── Without token (internal/PIN path) ───────────────────────────────────────
  console.log('\n=== Without token (internal access) ===');
  const p2 = await browser.newPage();
  await p2.goto(`${BASE}/portal/demo/assistant`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1000));

  const r2 = await p2.evaluate(() => {
    const select = document.querySelector('select');
    const opts = select ? Array.from(select.options).map(o => o.textContent || '') : [];
    const labels = Array.from(document.querySelectorAll('label')).map(l => (l.textContent || '').trim());
    return {
      hasSelect: !!select,
      optionCount: opts.length,
      hasSwitchSchool: labels.includes('Switch school'),
      hasOtherSchools: opts.some(o => /Le Rosey|Aiglon|Wellington|NIST/.test(o)),
    };
  });
  console.log(JSON.stringify(r2, null, 2));
  ok('Switcher visible (<select> present)', r2.hasSelect);
  ok('Many options in dropdown (29+)', r2.optionCount >= 29);
  ok('"Switch school" label shown', r2.hasSwitchSchool);
  ok('Other schools visible', r2.hasOtherSchools);

  await p2.close();
  console.log('\nDone\n');
} finally {
  await browser.close();
}

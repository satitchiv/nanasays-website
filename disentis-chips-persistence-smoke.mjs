/**
 * Verify shortcut chips persist after sending a message.
 */
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:3002/portal/demo/assistant', { waitUntil: 'networkidle2', timeout: 30000 });

  const countChips = () => page.evaluate(() => {
    const expectedChips = [
      'Send me the brochure',
      'What are the total annual fees?',
      'Send me the boarding rules PDF',
      'Where is the school located?',
      'What is the nearest airport?',
      'How do I apply?',
      'Do you offer summer camps?',
      'Tell me about the boarding house',
    ];
    const buttons = Array.from(document.querySelectorAll('button')).map(b => (b.textContent || '').trim());
    return expectedChips.filter(c => buttons.includes(c)).length;
  });

  const before = await countChips();
  console.log(`Chips visible BEFORE first chat: ${before}/8`);

  // Send a message
  const ta = await page.$('textarea');
  await ta.click();
  await ta.type('What is the curriculum?');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /matura|curriculum/i.test(document.body.innerText), { timeout: 30000 });
  await new Promise(r => setTimeout(r, 1500));

  const after = await countChips();
  console.log(`Chips visible AFTER first chat:  ${after}/8`);

  if (before === 8 && after === 8) {
    console.log('\n✅  Chips persistent — all 8 visible before AND after a chat');
    process.exit(0);
  } else {
    console.log(`\n❌  Persistence failed: before=${before} after=${after}`);
    process.exit(1);
  }
} finally {
  await browser.close();
}

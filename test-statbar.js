const { chromium } = require('/opt/homebrew/lib/node_modules/playwright')

const ADMIN_URL = 'http://localhost:3001'
const SCHOOL_URL = 'http://localhost:3000/schools/ruamrudee-international-school'
const API_KEY = 'hV1ETCU8KD9GHvMlhcg_Tz8Kk5V-myJS0JSZOouO0wM'
const SESSION = 'HSK44HepMkeoHDoml1OaHktbdtIcY6yoCTJBpyJ5ugo'
const STUDENT_ID = 'fd4c5a5e-ee70-4f14-8cbd-1dfccdb99f22'

async function apiPatch(path, body) {
  return fetch(`http://localhost:8001${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(body),
  })
}

async function resetDB() {
  await apiPatch('/api/admin/display-settings', { max_stat_cards: 5 })
  await apiPatch(`/api/admin/stat-bar-config/${STUDENT_ID}`, { enabled: true, pinned: false })
}

let passed = 0
let failed = 0

function check(label, value) {
  const ok = !!value
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}`)
  if (ok) passed++; else failed++
  return ok
}

function log(msg) { console.log(`[----] ${msg}`) }

;(async () => {
  await resetDB()
  log('DB reset to baseline (max_cards=5, student_count enabled)')

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    storageState: {
      cookies: [{
        name: 'eduworld_admin', value: SESSION,
        domain: 'localhost', path: '/', httpOnly: true,
        secure: false, sameSite: 'Lax',
        expires: Date.now() / 1000 + 86400,
      }],
      origins: [],
    }
  })
  const page = await ctx.newPage()
  page.setDefaultTimeout(15000)

  // ───────────────────────────────────────────────────
  // STEP 1 — Admin settings page loads
  // ───────────────────────────────────────────────────
  console.log('\n── Step 1: Load admin settings')
  await page.goto(`${ADMIN_URL}/admin/settings`, { waitUntil: 'networkidle' })
  check('Admin settings page loaded', page.url().includes('/admin/settings'))
  await page.waitForSelector('text=Stat bar metrics', { timeout: 8000 })
  check('Stat bar metrics section visible', true)

  // ───────────────────────────────────────────────────
  // STEP 2 — Make changes
  // ───────────────────────────────────────────────────
  console.log('\n── Step 2: Make changes in admin')

  // Change max_cards to 3
  const maxSelect = page.locator('select').first()
  await maxSelect.selectOption('3')
  await page.waitForTimeout(300)
  check('max_cards select changed to 3', await maxSelect.inputValue() === '3')

  // Disable student_count (first toggle in that row)
  const studentRow = page.locator('tr').filter({ hasText: 'student_count' })
  const enabledToggle = studentRow.locator('button').nth(0)
  const bgBefore = await enabledToggle.evaluate(el => el.style.background)
  await enabledToggle.click()
  await page.waitForTimeout(400)
  const bgAfter = await enabledToggle.evaluate(el => el.style.background)
  const wasEnabled = bgBefore.includes('184') || bgBefore.includes('B8')
  const nowDisabled = !bgAfter.includes('184') && !bgAfter.includes('B8')
  check('student_count was enabled before toggle', wasEnabled)
  check('student_count is disabled after toggle', nowDisabled)

  // Unsaved changes bar
  await page.waitForSelector('text=You have unsaved changes', { timeout: 5000 })
  check('Unsaved changes bar appeared', true)

  // ───────────────────────────────────────────────────
  // STEP 3 — Save changes
  // ───────────────────────────────────────────────────
  console.log('\n── Step 3: Save changes')
  await page.click('button:has-text("Save changes")')
  await page.waitForSelector('text=All changes saved', { timeout: 8000 })
  check('"All changes saved" bar shown', true)

  // Verify DB immediately after save
  const db = await fetch('http://localhost:8001/api/stat-bar-config').then(r => r.json())
  const studentInDB = db.metrics.find(m => m.metric_key === 'student_count')
  check(`DB max_cards saved as 3 (got ${db.max_cards})`, db.max_cards === 3)
  check(`DB student_count disabled (enabled=${studentInDB?.enabled})`, studentInDB?.enabled === false)

  // ───────────────────────────────────────────────────
  // STEP 4 — Admin preview reflects saved config
  // ───────────────────────────────────────────────────
  console.log('\n── Step 4: Admin preview')
  const schoolSelect = page.locator('select').filter({ hasText: 'Select a school' }).first()
  const schoolOptions = await schoolSelect.locator('option').count()
  check(`School select has options (got ${schoolOptions})`, schoolOptions > 1)
  await schoolSelect.selectOption({ index: 1 })
  await page.click('button:has-text("Load preview")')
  await page.waitForTimeout(3000)
  // Preview section should show after loading (either cards or empty message)
  const previewVisible = await page.evaluate(() => {
    const el = document.body.innerText
    return el.includes('Max:') || el.includes('no pulse data') || el.includes('from school record') || el.includes('live')
  })
  check('Preview section rendered after Load', previewVisible)
  const previewCardsCount = await page.evaluate(() =>
    document.querySelectorAll('[style*="minWidth: 90"]').length
  )
  log(`Preview cards rendered: ${previewCardsCount}`)

  // ───────────────────────────────────────────────────
  // STEP 5 — School page reflects changes
  // ───────────────────────────────────────────────────
  console.log('\n── Step 5: Ruamrudee school page')
  const schoolPage = await ctx.newPage()
  await schoolPage.goto(SCHOOL_URL, { waitUntil: 'domcontentloaded' })
  await schoolPage.waitForSelector('h1', { timeout: 10000 })
  await schoolPage.screenshot({ path: '/tmp/ruamrudee.png' })

  const statCards = await schoolPage.evaluate(() =>
    Array.from(document.querySelectorAll('div'))
      .filter(d => {
        const s = window.getComputedStyle(d)
        return s.fontSize === '22px' && s.fontWeight === '900'
      })
      .map(d => d.textContent?.trim())
      .filter(Boolean)
  )
  log(`Stat bar values on school page: ${JSON.stringify(statCards)}`)
  log('NOTE: stat bar config is cached (revalidate: 3600) — school page reflects DB changes within 1 hour, not instantly')
  log(`School page card count: ${statCards.length} (may still show old config until cache expires)`)
  check('School page loaded and stat bar rendered', statCards.length > 0)

  await schoolPage.close()

  // ───────────────────────────────────────────────────
  // STEP 6 — Return to admin, verify state persisted after reload
  // ───────────────────────────────────────────────────
  console.log('\n── Step 6: Reload admin and verify persisted state')
  await page.goto(`${ADMIN_URL}/admin/settings`, { waitUntil: 'networkidle' })
  await page.waitForSelector('text=Stat bar metrics', { timeout: 8000 })

  const maxValAfterReload = await page.locator('select').first().inputValue()
  check(`max_cards still 3 after reload (got ${maxValAfterReload})`, maxValAfterReload === '3')

  const studentRowAfter = page.locator('tr').filter({ hasText: 'student_count' })
  const toggleAfterReload = studentRowAfter.locator('button').nth(0)
  const bgReload = await toggleAfterReload.evaluate(el => el.style.background)
  const stillDisabled = !bgReload.includes('184') && !bgReload.includes('B8')
  check(`student_count still disabled after reload (bg: ${bgReload})`, stillDisabled)

  const savedBarVisible = await page.locator('text=All changes saved').isVisible().catch(() => false)
  check('"All changes saved" shown on fresh load (no unsaved state)', savedBarVisible)

  // ───────────────────────────────────────────────────
  // RESTORE
  // ───────────────────────────────────────────────────
  console.log('\n── Restore: reset DB to original state')
  await resetDB()
  log('DB restored to max_cards=5, student_count enabled')

  await browser.close()

  // ───────────────────────────────────────────────────
  // RESULTS
  // ───────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(44)}`)
  console.log(`Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log('SOME CHECKS FAILED')
    process.exit(1)
  } else {
    console.log('ALL CHECKS PASSED')
  }
})().catch(err => {
  console.error('Test crashed:', err.message)
  process.exit(1)
})

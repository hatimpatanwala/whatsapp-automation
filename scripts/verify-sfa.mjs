import { chromium } from 'playwright';

const BASE = 'https://staging-whatsappdemo.duckdns.org';
const EMAIL = 'fitnflow@gmail.com';
const PASS = 'FitNFlow@123';

const api = [];   // sfa API calls seen
const errors = [];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('response', (r) => {
  const u = r.url();
  if (u.includes('/api/sfa/')) api.push(`${r.status()} ${u.replace(BASE, '').split('?')[0]}`);
});

async function login() {
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const email = page.locator('input[type="email"], input[formcontrolname="email"], input[name="email"]').first();
  const pass = page.locator('input[type="password"]').first();
  await email.fill(EMAIL);
  await pass.fill(PASS);
  await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first().click();
  await page.waitForTimeout(4000);
  console.log('after login url:', page.url());
}

async function visit(path, label) {
  api.length = 0;
  await page.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);
  const url = page.url();
  const bodyText = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400);
  console.log(`\n=== ${label} (${path}) ===`);
  console.log('landed:', url.replace(BASE, ''));
  console.log('sfa api:', api.length ? api.join(' | ') : '(none)');
  console.log('text:', bodyText.slice(0, 260));
  await page.screenshot({ path: `scripts/sfa-${label}.png`, fullPage: false }).catch(() => {});
}

try {
  await login();
  await visit('field-sales', 'field-sales');
  // click through tabs if present
  for (const t of ['Salesmen', 'Beats', 'Targets', 'Visits', 'Performance']) {
    const b = page.locator(`button:has-text("${t}")`).first();
    if (await b.count()) { await b.click().catch(() => {}); await page.waitForTimeout(1200); }
  }
  await page.screenshot({ path: 'scripts/sfa-field-sales-tabs.png' }).catch(() => {});
  await visit('my-sales', 'my-sales');
  console.log('\n=== console errors ===');
  console.log(errors.length ? errors.slice(0, 8).join('\n') : '(none)');
} catch (e) {
  console.error('FATAL', e.message);
} finally {
  await browser.close();
}

import { chromium } from 'playwright';
const BASE = 'https://staging-whatsappdemo.duckdns.org';
const EMAIL = 'fitnflow@gmail.com';
const PASS = 'FitNFlow@123';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });

async function login() {
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.locator('input[type="email"],input[formcontrolname="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(4500);
}
// Flag tokens that look like machine codes: 6-12 char all-caps alnum with no spaces
function codes(text) {
  const set = new Set();
  for (const t of (text.match(/\b[A-Z0-9]{6,12}\b/g) || [])) {
    if (/^[0-9]+$/.test(t)) continue;               // pure numbers ok
    if (/^(GST|GSTIN|HSN|IGST|CGST|SGST|INR|TOTAL|LTR)$/.test(t)) continue;
    if (!/[0-9]/.test(t) && /^[A-Z]+$/.test(t) && t.length <= 7) continue; // plain words like SALES
    set.add(t);
  }
  return [...set].slice(0, 25);
}
async function grab(path, label, tabs = []) {
  await page.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const areas = ['wa-ai-insights-card', 'main', 'body'];
  let text = '';
  for (const a of areas) { const el = page.locator(a).first(); if (await el.count()) { text = await el.innerText().catch(() => ''); break; } }
  console.log(`\n########## ${label} (${path}) ##########`);
  console.log('CODE-LIKE TOKENS:', codes(text).join(', ') || '(none)');
  console.log('TEXT>>>', text.replace(/\s+/g, ' ').slice(0, 900));
  for (const t of tabs) {
    const b = page.locator(`button:has-text("${t}")`).first();
    if (await b.count()) {
      await b.click().catch(() => {});
      await page.waitForTimeout(2500);
      const el = page.locator('main').first();
      const tt = await el.innerText().catch(() => '');
      console.log(`\n--- tab ${t} ---`);
      console.log('CODES:', codes(tt).join(', ') || '(none)');
      console.log('TEXT>>>', tt.replace(/\s+/g, ' ').slice(0, 600));
    }
  }
}
try {
  await login();
  await grab('dashboard', 'DASHBOARD');
  await grab('erp/dashboard', 'BUSINESS-OVERVIEW');
  await grab('field-sales', 'FIELD-SALES', ['Salesmen', 'Beats', 'Targets', 'Visits', 'Follow-ups', 'Performance']);
  await grab('my-sales', 'MY-FIELD-APP', ['Beat', 'Order', 'Collect', 'Performance', 'Visits', 'Today']);
  console.log('\n\nCONSOLE ERRORS:', errs.length ? errs.slice(0, 8).join(' || ') : '(none)');
} catch (e) { console.error('FATAL', e.message); }
finally { await browser.close(); }

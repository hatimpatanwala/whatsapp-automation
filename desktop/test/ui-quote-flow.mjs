// E2E: quote with Free/D1/D2 for a real party → quotation register shows it.
import { chromium } from 'playwright-core';

for (;;) { try { const t = await (await fetch('http://127.0.0.1:9222/json/list')).json(); if (t.some((x) => x.type === 'page' && x.url.includes('43110'))) break; } catch {} await new Promise((r) => setTimeout(r, 1500)); }
await new Promise((r) => setTimeout(r, 3000));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('43110')) ?? ctx.pages()[0];

async function go(url) {
  await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1500);
  if (page.url().includes('/auth')) {
    await page.fill('input[type="email"]', 'uitest@local.test');
    await page.fill('input[type="password"]', 'test1234');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2500);
    await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1500);
  }
}

// Hard reload to pick up the rebuilt bundle.
await go('http://127.0.0.1:43110/entry/quote');
await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(1500);

// Party
await go('http://127.0.0.1:43110/entry/quote');
await page.click('[data-cell="party"]');
await page.type('[data-cell="party"]', 'Walkin', { delay: 60 });
await page.waitForTimeout(1200);
await page.keyboard.press('Enter'); // pick first hit or open quick-create
await page.waitForTimeout(1200);
// If quick-create modal opened, fill phone + save.
if (await page.$('wa-quick-create')) {
  await page.fill('wa-quick-create [data-qc="phone"]', '9' + String(Date.now()).slice(-9));
  await page.click('wa-quick-create .qc-save');
  await page.waitForTimeout(2500);
}

// Item row: Cement Bag, qty 100 + 10 free, rate 8, D1 5, D2 2, GST 28 (auto)
await page.click('[data-cell="0:name"]');
await page.type('[data-cell="0:name"]', 'Cement', { delay: 60 });
await page.waitForTimeout(1300);
await page.keyboard.press('Enter'); // pick product
await page.waitForTimeout(800);
await page.fill('[data-cell="0:qty"]', '100');
await page.fill('[data-cell="0:free"]', '10');
await page.fill('[data-cell="0:rate"]', '8');
await page.fill('[data-cell="0:d1"]', '5');
await page.fill('[data-cell="0:d2"]', '2');
await page.screenshot({ path: 'shots/q1-quote-filled.png', fullPage: true });
await page.keyboard.press('Control+a');
await page.waitForTimeout(2500);
await page.screenshot({ path: 'shots/q2-quote-saved.png', fullPage: true });

// Quotation register
await go('http://127.0.0.1:43110/entry/registers/quote');
await page.waitForTimeout(1000);
await page.screenshot({ path: 'shots/q3-register-quote.png', fullPage: true });

await browser.close();
console.log('QUOTE FLOW DONE');

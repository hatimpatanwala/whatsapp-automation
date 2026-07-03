// Verify the new Item Master + Registers + upgraded Quote grid.
// Flow: login → /entry/items (create an item w/ dual units + opening stock) →
// /entry/registers/sales → /entry/quote. Screenshots into shots/.
import { chromium } from 'playwright-core';

for (;;) { try { const t = await (await fetch('http://127.0.0.1:9222/json/list')).json(); if (t.some((x) => x.type === 'page' && x.url.includes('43110'))) break; } catch {} await new Promise((r) => setTimeout(r, 1500)); }
await new Promise((r) => setTimeout(r, 4000));
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

// 1) Item Master — create an item with dual units + opening stock.
await go('http://127.0.0.1:43110/entry/items');
const stamp = String(Date.now()).slice(-5);
await page.click('[data-cell="name"]');
await page.fill('[data-cell="name"]', `Cement Bag ${stamp}`);
await page.fill('[data-cell="unit"]', 'kg');
await page.fill('[data-cell="altUnit"]', 'bag');
await page.fill('[data-cell="factor"]', '50');
await page.fill('[data-cell="hsn"]', '2523');
await page.fill('[data-cell="gst"]', '28');
await page.fill('[data-cell="pRate"]', '6.5');
await page.fill('[data-cell="sRate"]', '8');
await page.fill('[data-cell="mrp"]', '9');
await page.fill('[data-cell="minStock"]', '100');
await page.fill('[data-cell="stockQty"]', '500');
await page.screenshot({ path: 'shots/m1-items-form.png', fullPage: true });
await page.keyboard.press('Control+a');
await page.waitForTimeout(2500);
await page.screenshot({ path: 'shots/m2-items-saved.png', fullPage: true });

// 2) Registers — sales register with totals.
await go('http://127.0.0.1:43110/entry/registers/sales');
await page.screenshot({ path: 'shots/m3-register-sales.png', fullPage: true });
await go('http://127.0.0.1:43110/entry/registers/purchase');
await page.screenshot({ path: 'shots/m4-register-purchase.png', fullPage: true });

// 3) Quote grid — new Free/D1/D2 columns.
await go('http://127.0.0.1:43110/entry/quote');
await page.screenshot({ path: 'shots/m5-quote-grid.png', fullPage: true });

await browser.close();
console.log('ITEMS/REGISTERS SHOTS DONE');

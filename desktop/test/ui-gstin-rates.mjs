// E2E: (1) find party by GSTIN, (2) bill an item at a specific rate,
// (3) new entry → Alt+L shows THAT customer's last rate → Enter applies it.
import { chromium } from 'playwright-core';

for (;;) { try { const t = await (await fetch('http://127.0.0.1:9222/json/list')).json(); if (t.some((x) => x.type === 'page' && x.url.includes('43110'))) break; } catch {} await new Promise((r) => setTimeout(r, 1500)); }
await new Promise((r) => setTimeout(r, 5000));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('43110')) ?? ctx.pages()[0];

async function go(url) {
  await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1800);
  if (page.url().includes('/auth')) {
    await page.fill('input[type="email"]', 'uitest@local.test');
    await page.fill('input[type="password"]', 'test1234');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2500);
    await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1800);
  }
}

// ── 1) GSTIN search in the sales screen ─────────────────────────────────────
await go('http://127.0.0.1:43110/entry/sales');
await page.type('[data-cell="party"]', '24AAACW', { delay: 70 });
await page.waitForTimeout(1400);
await page.screenshot({ path: 'shots/g1-gstin-search.png' });
await page.keyboard.press('Enter'); // pick Walkin via GSTIN
await page.waitForTimeout(1600);

// ── 2) Bill Cement Bag @ 7.25 so Walkin has invoice history ────────────────
await page.type('[data-cell="0:name"]', 'Cement', { delay: 60 });
await page.waitForTimeout(1300);
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);
await page.fill('[data-cell="0:qty"]', '5');
await page.fill('[data-cell="0:rate"]', '7.25');
await page.keyboard.press('Control+a');
await page.waitForTimeout(3000);
await page.screenshot({ path: 'shots/g2-invoice-saved.png' });

// ── 3) Fresh entry: pick Walkin + item, Alt+L shows 7.25, Enter applies ────
await go('http://127.0.0.1:43110/entry/quote'); // prove it works on quotation too
await page.type('[data-cell="party"]', '24AAACW', { delay: 70 });
await page.waitForTimeout(1400);
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
await page.type('[data-cell="0:name"]', 'Cement', { delay: 60 });
await page.waitForTimeout(1300);
await page.keyboard.press('Enter');
await page.waitForTimeout(1000);
await page.fill('[data-cell="0:qty"]', '20');

await page.keyboard.press('Alt+l');
await page.waitForTimeout(1600);
await page.screenshot({ path: 'shots/g3-last-rates.png' });
await page.keyboard.press('Enter'); // apply the top (latest) rate
await page.waitForTimeout(900);
const applied = await page.inputValue('[data-cell="0:rate"]');
console.log('rate applied from history:', applied);
await page.screenshot({ path: 'shots/g4-rate-applied.png' });

await browser.close();
console.log('GSTIN/RATES SHOTS DONE');

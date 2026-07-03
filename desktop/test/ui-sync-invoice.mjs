// Create an invoice in the LOCAL app; the relay should push it to staging async.
import { chromium } from 'playwright-core';

for (;;) { try { const t = await (await fetch('http://127.0.0.1:9222/json/list')).json(); if (t.some((x) => x.type === 'page' && x.url.includes('43110'))) break; } catch {} await new Promise((r) => setTimeout(r, 1500)); }
await new Promise((r) => setTimeout(r, 3000));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('43110')) ?? ctx.pages()[0];

await page.goto('http://127.0.0.1:43110/entry/sales', { waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(1800);
if (page.url().includes('/auth')) {
  await page.fill('input[type="email"]', 'uitest@local.test');
  await page.fill('input[type="password"]', 'test1234');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  await page.goto('http://127.0.0.1:43110/entry/sales', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1800);
}

await page.type('[data-cell="party"]', 'Walkin', { delay: 60 });
await page.waitForTimeout(1400);
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
await page.type('[data-cell="0:name"]', 'Cement', { delay: 60 });
await page.waitForTimeout(1300);
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);
await page.fill('[data-cell="0:qty"]', '2');
await page.keyboard.press('Control+a');
await page.waitForTimeout(3000);
const saved = await page.evaluate(() => document.body.innerText.match(/Saved (INV-[\w-]+)/)?.[1] || '(?)');
console.log('locally saved:', saved);
await browser.close();

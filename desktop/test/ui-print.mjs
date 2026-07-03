import { chromium } from 'playwright-core';
const invId = process.argv[2];
for (;;) { try { const t = await (await fetch('http://127.0.0.1:9222/json/list')).json(); if (t.some((x) => x.type === 'page' && x.url.includes('43110'))) break; } catch {} await new Promise((r) => setTimeout(r, 1500)); }
await new Promise((r) => setTimeout(r, 4000));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('43110')) ?? ctx.pages()[0];
await page.goto('http://127.0.0.1:43110/print/invoice/' + invId, { waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(1500);
if (page.url().includes('/auth')) {
  await page.fill('input[type="email"]', 'uitest@local.test');
  await page.fill('input[type="password"]', 'test1234');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  await page.goto('http://127.0.0.1:43110/print/invoice/' + invId, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1500);
}
await page.screenshot({ path: 'shots/p1-print.png', fullPage: true });
await browser.close();
console.log('PRINT SHOT DONE');

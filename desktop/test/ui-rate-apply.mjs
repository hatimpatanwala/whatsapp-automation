// Prove Alt+L Enter APPLIES the historical rate (not just the prefill):
// set rate to 9.99 manually, open Alt+L, Enter → rate must become 7.25.
import { chromium } from 'playwright-core';

for (;;) { try { const t = await (await fetch('http://127.0.0.1:9222/json/list')).json(); if (t.some((x) => x.type === 'page' && x.url.includes('43110'))) break; } catch {} await new Promise((r) => setTimeout(r, 1500)); }
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('43110')) ?? ctx.pages()[0];

await page.goto('http://127.0.0.1:43110/entry/order', { waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(1800);
if (page.url().includes('/auth')) {
  await page.fill('input[type="email"]', 'uitest@local.test');
  await page.fill('input[type="password"]', 'test1234');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  await page.goto('http://127.0.0.1:43110/entry/order', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1800);
}
await page.type('[data-cell="party"]', '24AAACW', { delay: 70 });
await page.waitForTimeout(1400);
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
await page.type('[data-cell="0:name"]', 'Cement', { delay: 60 });
await page.waitForTimeout(1300);
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);
await page.fill('[data-cell="0:qty"]', '3');
await page.fill('[data-cell="0:rate"]', '9.99');
console.log('rate before:', await page.inputValue('[data-cell="0:rate"]'));

await page.keyboard.press('Alt+l');
await page.waitForTimeout(2500); // let history load
await page.screenshot({ path: 'shots/g5-rates-loaded.png' });
await page.keyboard.press('Enter');
await page.waitForTimeout(900);
console.log('rate after Alt+L Enter:', await page.inputValue('[data-cell="0:rate"]'));
console.log('focused:', await page.evaluate(() => document.activeElement?.getAttribute('data-cell')));

await browser.close();
console.log('RATE APPLY TEST DONE');

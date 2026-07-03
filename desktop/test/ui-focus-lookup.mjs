// Verify: auto-focus on nav, Alt+I item popup, Alt+P party popup, Alt+H help overlay.
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

const focusInfo = () => page.evaluate(() => {
  const a = document.activeElement;
  return a ? `${a.tagName}[data-cell=${a.getAttribute('data-cell')}]` : 'none';
});

// 1) Sales screen: party auto-focused?
await go('http://127.0.0.1:43110/entry/sales');
console.log('sales focus:', await focusInfo());

// 2) Item master: search auto-focused?
await go('http://127.0.0.1:43110/entry/items');
console.log('items focus:', await focusInfo());

// 3) Registers: filter auto-focused?
await go('http://127.0.0.1:43110/entry/registers/sales');
console.log('registers focus:', await focusInfo());

// 4) Back to sales: pick party + item, then Alt+P and Alt+I popups.
await go('http://127.0.0.1:43110/entry/sales');
await page.type('[data-cell="party"]', 'Walkin', { delay: 60 });
await page.waitForTimeout(1300);
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
await page.type('[data-cell="0:name"]', 'Cement', { delay: 60 });
await page.waitForTimeout(1300);
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);

await page.keyboard.press('Alt+p');
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/f1-party-popup.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
console.log('after party-popup esc focus:', await focusInfo());

await page.keyboard.press('Alt+i');
await page.waitForTimeout(1500);
await page.screenshot({ path: 'shots/f2-item-popup.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
console.log('after item-popup esc focus:', await focusInfo());
console.log('url after escapes:', page.url());

// 5) Help overlay
await page.keyboard.press('Alt+h');
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/f3-help.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
console.log('url after help esc:', page.url());

await browser.close();
console.log('FOCUS/LOOKUP SHOTS DONE');

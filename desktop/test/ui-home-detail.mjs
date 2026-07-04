// Verify: ERP Home dashboard renders + registers row-click opens the detail popup.
import { chromium } from 'playwright-core';

for (;;) { try { const t = await (await fetch('http://127.0.0.1:9222/json/list')).json(); if (t.some((x) => x.type === 'page' && x.url.includes('43110'))) break; } catch {} await new Promise((r) => setTimeout(r, 1500)); }
await new Promise((r) => setTimeout(r, 4000));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('43110')) ?? ctx.pages()[0];

async function go(url) {
  await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2000);
  if (page.url().includes('/auth')) {
    await page.fill('input[type="email"]', 'backup.hatim@gmail.com');
    await page.fill('input[type="password"]', 'Hatim@1234');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
    await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(2000);
  }
}

// 1) Home dashboard
await go('http://127.0.0.1:43110/home');
await page.waitForTimeout(1500);
await page.screenshot({ path: 'shots/h1-home.png', fullPage: true });
console.log('home url:', page.url());

// 2) Registers: click the first sales row → detail popup with line items
await go('http://127.0.0.1:43110/entry/registers/sales');
await page.waitForTimeout(1200);
const firstRow = page.locator('tbody tr').first();
await firstRow.click();
await page.waitForTimeout(1800);
const popup = !!(await page.$('[data-detail-box]'));
console.log('detail popup open:', popup);
await page.screenshot({ path: 'shots/h2-detail.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
console.log('after esc url:', page.url(), '| popup still open:', !!(await page.$('[data-detail-box]')));

await browser.close();
console.log('HOME/DETAIL SHOTS DONE');

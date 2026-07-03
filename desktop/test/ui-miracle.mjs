// Exercise the Miracle behaviors: quick-create popup, date field, Alt menu.
import { chromium } from 'playwright-core';
import fs from 'fs';
for (;;) { try { const t = await (await fetch('http://127.0.0.1:9222/json/list')).json(); if (t.some((x) => x.type === 'page' && x.url.includes('43110'))) break; } catch {} await new Promise((r) => setTimeout(r, 1500)); }
await new Promise((r) => setTimeout(r, 4000));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('43110')) ?? ctx.pages()[0];
fs.mkdirSync('shots', { recursive: true });

// login
await page.goto('http://127.0.0.1:43110/entry/sales', { waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(1500);
if (page.url().includes('/auth')) {
  await page.fill('input[type="email"]', 'uitest@local.test');
  await page.fill('input[type="password"]', 'test1234');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  await page.goto('http://127.0.0.1:43110/entry/sales', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1500);
}

// 1. Type an unknown customer → quick-create hint appears
await page.click('[data-cell="party"]');
await page.type('[data-cell="party"]', 'Mehta Traders', { delay: 30 });
await page.waitForTimeout(900);
await page.screenshot({ path: 'shots/m1-create-hint.png' });

// 2. Enter opens the quick-create modal
await page.keyboard.press('Enter');
await page.waitForTimeout(700);
await page.screenshot({ path: 'shots/m2-create-modal.png' });

// 3. Fill phone, Enter → created + picked, then unknown ITEM
await page.fill('[data-qc="phone"]', '+919888777666');
await page.keyboard.press('Enter');
await page.waitForTimeout(1800);
await page.type('[data-cell="0:name"]', 'Steel Bucket 5L', { delay: 25 });
await page.waitForTimeout(900);
await page.keyboard.press('Enter');
await page.waitForTimeout(700);
await page.fill('[data-qc="rate"]', '250');
await page.keyboard.press('Enter');
await page.waitForTimeout(1800);
await page.screenshot({ path: 'shots/m3-item-created.png' });

// 4. Alt+R opens Report menu
await page.keyboard.press('Alt+r');
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/m4-alt-menu.png' });
await page.keyboard.press('Escape');

await browser.close();
console.log('MIRACLE FLOW DONE');

// Full Miracle billing scenario: CASH memo, free qty, D1+D2, freight+GST, round-off.
import { chromium } from 'playwright-core';
import fs from 'fs';
for (;;) { try { const t = await (await fetch('http://127.0.0.1:9222/json/list')).json(); if (t.some((x) => x.type === 'page' && x.url.includes('43110'))) break; } catch {} await new Promise((r) => setTimeout(r, 1500)); }
await new Promise((r) => setTimeout(r, 4000));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('43110')) ?? ctx.pages()[0];
fs.mkdirSync('shots', { recursive: true });

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

// Cash memo
await page.selectOption('select', 'cash');
// Item: Steel Bucket (created earlier), qty 10, free 1, D1 10%, D2 5%
await page.click('[data-cell="0:name"]');
await page.type('[data-cell="0:name"]', 'Steel', { delay: 40 });
await page.waitForTimeout(900);
await page.keyboard.press('Enter'); // pick first hit
await page.waitForTimeout(900);
await page.fill('[data-cell="0:qty"]', '10');
await page.fill('[data-cell="0:free"]', '1');
await page.fill('[data-cell="0:d1"]', '10');
await page.fill('[data-cell="0:d2"]', '5');
await page.fill('[data-cell="0:gstRate"]', '18');
// Freight 100 @ 18
const chargeAmts = await page.$$('input[type="number"]');
await page.waitForTimeout(300);
// fill freight via its labeled row (first charge row: label input then ₹ then GST%)
const freightRow = page.locator('div', { hasText: 'Add / Less charges' }).locator('..');
await page.locator('input').filter({ hasText: '' }).first(); // noop guard
// simpler: target the charge rows by their default labels
const rows = page.locator('div.flex.items-center.gap-2.mb-1');
await rows.nth(0).locator('input').nth(1).fill('100');
await rows.nth(0).locator('input').nth(2).fill('18');
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/t1-cash-memo.png' });
// Save
await page.keyboard.press('Control+a');
await page.waitForTimeout(2500);
await page.screenshot({ path: 'shots/t2-saved.png' });
await browser.close();
console.log('TRADE FLOW DONE');

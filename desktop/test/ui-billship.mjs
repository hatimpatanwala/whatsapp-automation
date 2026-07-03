import { chromium } from 'playwright-core';
import fs from 'fs';
for (;;) { try { const t = await (await fetch('http://127.0.0.1:9222/json/list')).json(); if (t.some((x) => x.type === 'page' && x.url.includes('43110'))) break; } catch {} await new Promise((r) => setTimeout(r, 1500)); }
await new Promise((r) => setTimeout(r, 4000));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('43110')) ?? ctx.pages()[0];
await page.goto('http://127.0.0.1:43110/entry/sales', { waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(1500);
if (page.url().includes('/auth')) {
  await page.fill('input[type="email"]', 'uitest@local.test');
  await page.fill('input[type="password"]', 'test1234');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  await page.goto('http://127.0.0.1:43110/entry/sales', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1200);
}
// pick Mehta Traders (created earlier) then open Bill/Ship, uncheck same-as
await page.click('[data-cell="party"]');
await page.type('[data-cell="party"]', 'Mehta', { delay: 40 });
await page.waitForTimeout(900);
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);
await page.click('text=Bill/Ship ▾');
await page.waitForTimeout(400);
await page.uncheck('input[type="checkbox"] >> nth=0').catch(() => {});
// the first checkbox might be interstate; target by proximity: click the same-as label
await page.click('text=same as Bill To').catch(() => {});
await page.waitForTimeout(500);
fs.mkdirSync('shots', { recursive: true });
await page.screenshot({ path: 'shots/bs1-billship.png' });
await browser.close();
console.log('BILLSHIP SHOT DONE');

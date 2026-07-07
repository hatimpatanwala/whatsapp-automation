import { chromium } from 'playwright-core';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('staging-whatsappdemo')) ?? ctx.pages()[0];
await page.goto('https://staging-whatsappdemo.duckdns.org/entry/items', { waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(2500);
if (page.url().includes('/auth')) {
  await page.fill('input[type="email"]', 'backup.hatim@gmail.com');
  await page.fill('input[type="password"]', 'Hatim@1234');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3500);
  await page.goto('https://staging-whatsappdemo.duckdns.org/entry/items', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2500);
}
await page.fill('[data-cell="search"]', 'Batch Test');
await page.waitForTimeout(1200);
await page.locator('tbody tr', { hasText: 'Batch Test Soap' }).first().click();
await page.waitForTimeout(2000);
await page.locator('button', { hasText: 'Advanced' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/im1-parity.png', fullPage: true });
console.log('ITEM PARITY SHOT DONE');
await browser.close();

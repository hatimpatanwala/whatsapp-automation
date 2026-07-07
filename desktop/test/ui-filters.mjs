import { chromium } from 'playwright-core';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('staging-whatsappdemo')) ?? ctx.pages()[0];
await page.goto('https://staging-whatsappdemo.duckdns.org/entry/registers/sales', { waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(2500);
if (page.url().includes('/auth')) {
  await page.fill('input[type="email"]', 'backup.hatim@gmail.com');
  await page.fill('input[type="password"]', 'Hatim@1234');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3500);
  await page.goto('https://staging-whatsappdemo.duckdns.org/entry/registers/sales', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2500);
}
const count = async () => (await page.locator('tbody tr').count());
// All dates → everything
await page.selectOption('select[title="Quick period"]', 'all');
await page.waitForTimeout(600);
console.log('all dates rows:', await count());
// unpaid only
await page.selectOption('select[title="Status"]', 'unpaid');
await page.waitForTimeout(500);
console.log('unpaid rows:', await count());
// with balance only
await page.locator('input[type="checkbox"]').first().check();
await page.waitForTimeout(500);
console.log('unpaid+due rows:', await count());
// amount min
await page.fill('input[placeholder="min"]', '100000');
await page.waitForTimeout(500);
console.log('min 1L rows:', await count());
// sort by amount
await page.locator('th', { hasText: 'Amount' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/fl1-filters.png' });
console.log('first amount cell:', await page.locator('tbody tr').first().locator('td').nth(4).textContent());
await browser.close();
console.log('FILTERS TEST DONE');

import { chromium } from 'playwright-core';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('43110')) ?? ctx.pages()[0];
await page.goto('http://127.0.0.1:43110/entry/party', { waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(2500);
if (page.url().includes('/auth')) {
  await page.fill('input[type="email"]', 'backup.hatim@gmail.com');
  await page.fill('input[type="password"]', 'Hatim@1234');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3500);
  await page.goto('http://127.0.0.1:43110/entry/party', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2500);
}
console.log('url:', page.url());
await page.screenshot({ path: 'shots/pm0-state.png', fullPage: true });
console.log('rows:', await page.locator('tbody tr').count());
await browser.close();

import { chromium } from 'playwright-core';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('staging-whatsappdemo')) ?? ctx.pages()[0];
await page.goto('https://staging-whatsappdemo.duckdns.org/entry/sales', { waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(2500);
if (page.url().includes('/auth')) {
  await page.fill('input[type="email"]', 'backup.hatim@gmail.com');
  await page.fill('input[type="password"]', 'Hatim@1234');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3500);
  await page.goto('https://staging-whatsappdemo.duckdns.org/entry/sales', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2500);
}
await page.type('[data-cell="party"]', 'Hamza', { delay: 70 });
await page.waitForTimeout(1500);
await page.keyboard.press('Enter');
await page.waitForTimeout(2200);
const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-cell'));
const bt = await page.inputValue('[data-cell="bt-name"]');
const st = await page.inputValue('[data-cell="st-name"]');
console.log('focused after pick:', focused, '| billTo.name:', bt, '| shipTo.name:', st);
// Enter-walk a few fields then PgDn to the grid
await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
console.log('after 2 Enters:', await page.evaluate(() => document.activeElement?.getAttribute('data-cell')));
await page.keyboard.press('PageDown');
console.log('after PgDn:', await page.evaluate(() => document.activeElement?.getAttribute('data-cell')));
await page.screenshot({ path: 'shots/bs1-billship.png', fullPage: true });
await browser.close();
console.log('BILLSHIP SHOT DONE');

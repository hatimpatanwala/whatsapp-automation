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
// 1) PgDn from the PARTY field (no party entered) → straight to items
await page.keyboard.press('PageDown');
await page.waitForTimeout(400);
console.log('PgDn from party →', await page.evaluate(() => document.activeElement?.getAttribute('data-cell')));

// 2) Bill a quick cash item and save (cash memo needs no party)
await page.selectOption('select', 'cash');
await page.waitForTimeout(300);
await page.type('[data-cell="0:name"]', 'Apple Airpods', { delay: 50 });
await page.waitForTimeout(1500);
await page.keyboard.press('Enter');
await page.waitForTimeout(1000);
await page.fill('[data-cell="0:qty"]', '1');
await page.keyboard.press('Control+Enter');
await page.waitForTimeout(3500);

// 3) The post-save tray: open the e-Way form and screenshot
const trayText = await page.evaluate(() => document.body.innerText.match(/saved & posted[^\n]*/)?.[0] || 'NO TRAY');
console.log('tray:', trayText);
await page.locator('button', { hasText: 'e-Way Bill' }).first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/sf1-tray.png' });
console.log('eway fields:', await page.evaluate(() =>
  Array.from(document.querySelectorAll('.border-emerald-400 label')).map(l => l.textContent?.trim().split('\n')[0]).join(' | ')));
await browser.close();
console.log('SALESFIX SHOTS DONE');

import { chromium } from 'playwright-core';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('staging-whatsappdemo')) ?? ctx.pages()[0];
await page.goto('https://staging-whatsappdemo.duckdns.org/home', { waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(2500);
if (page.url().includes('/auth')) {
  await page.fill('input[type="email"]', 'backup.hatim@gmail.com');
  await page.fill('input[type="password"]', 'Hatim@1234');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3500);
  await page.goto('https://staging-whatsappdemo.duckdns.org/home', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2000);
}
const jump = async (combo) => { await page.evaluate(() => (document.activeElement)?.blur()); await page.keyboard.press(combo); await page.waitForTimeout(1200); return page.url().split('duckdns.org')[1]; };
console.log('Alt+Q →', await jump('Alt+q'));
console.log('Alt+O →', await jump('Alt+o'));
console.log('Alt+N →', await jump('Alt+n'));
console.log('Alt+J →', await jump('Alt+j'));
console.log('Alt+K →', await jump('Alt+k'));
console.log('Alt+V →', await jump('Alt+v'));
console.log('Alt+A →', await jump('Alt+a'));
console.log('Ctrl+G →', await jump('Control+g'));
// portal → ERP link
await page.goto('https://staging-whatsappdemo.duckdns.org/dashboard', { waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(2500);
const hasLink = await page.locator('a,button', { hasText: 'ERP (Keyboard view)' }).count();
console.log('portal ERP link present:', hasLink > 0);
if (hasLink) { await page.locator('a,button', { hasText: 'ERP (Keyboard view)' }).first().click(); await page.waitForTimeout(2000); console.log('after click →', page.url().split('duckdns.org')[1]); }
await browser.close();
console.log('SHORTCUTS TEST DONE');

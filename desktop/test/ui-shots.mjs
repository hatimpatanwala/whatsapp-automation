// Drives the REAL Electron window over CDP (DESKTOP_DEBUG=1) and screenshots the ERP
// screens for visual verification. Usage: node test/ui-shots.mjs [routes...]
import { chromium } from 'playwright-core';
import fs from 'fs';

await new Promise((r) => setTimeout(r, 4000)); // let the app finish its own first navigation
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0] ?? await ctx.newPage();
fs.mkdirSync('shots', { recursive: true });

const shot = (name) => page.screenshot({ path: `shots/${name}.png` });

// Login if we're on the auth screen.
await page.goto('http://127.0.0.1:43110/gateway', { waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(1200);
if (page.url().includes('/auth')) {
  await shot('00-login');
  await page.fill('input[type="email"]', 'uitest@local.test');
  await page.fill('input[type="password"]', 'test1234');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  await page.goto('http://127.0.0.1:43110/gateway', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1200);
}

const routes = process.argv.slice(2).length ? process.argv.slice(2) : [
  ['gateway', '/gateway'],
  ['sales', '/entry/sales'],
  ['receipt', '/entry/receipt'],
  ['trial-balance', '/accounting/reports/trial-balance'],
  ['masters', '/entry/masters'],
].map((r) => Array.isArray(r) ? r : [r.replace(/\W+/g, '-'), r]);

let i = 1;
for (const [name, route] of routes) {
  await page.goto(`http://127.0.0.1:43110${route}`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1000);
  await shot(`${String(i).padStart(2, '0')}-${name}`);
  console.log(`shot: ${name} (${page.url()})`);
  i++;
}
await browser.close();
console.log('DONE');

// Verify the Miracle-audit additions: F9 calculator, F1 help, manual No. field,
// narration recall, quote→invoice convert, Ctrl+Enter save.
import { chromium } from 'playwright-core';

for (;;) { try { const t = await (await fetch('http://127.0.0.1:9222/json/list')).json(); if (t.some((x) => x.type === 'page' && x.url.includes('43110'))) break; } catch {} await new Promise((r) => setTimeout(r, 1500)); }
await new Promise((r) => setTimeout(r, 4000));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('43110')) ?? ctx.pages()[0];

async function go(url) {
  await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1800);
  if (page.url().includes('/auth')) {
    await page.fill('input[type="email"]', 'backup.hatim@gmail.com');
    await page.fill('input[type="password"]', 'Hatim@1234');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
    await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1800);
  }
}

// 1) F9 calculator in a numeric field on the sales screen
await go('http://127.0.0.1:43110/entry/sales');
await page.click('[data-cell="0:qty"]');
await page.keyboard.press('F9');
await page.waitForTimeout(700);
await page.fill('[data-calc-input]', '250*12-5%');
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/a1-calc.png' });
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
console.log('qty after calc:', await page.inputValue('[data-cell="0:qty"]'));

// 2) F1 help overlay
await page.keyboard.press('Escape'); // ensure nothing open
await page.evaluate(() => (document.activeElement)?.blur());
await page.keyboard.press('F1');
await page.waitForTimeout(700);
const helpVisible = !!(await page.$('.mcl-help'));
console.log('F1 help overlay:', helpVisible);
await page.screenshot({ path: 'shots/a2-help.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// 3) Quote → invoice convert from the register
await go('http://127.0.0.1:43110/entry/registers/quote');
await page.waitForTimeout(1200);
await page.keyboard.press('Enter'); // convert the selected quote if any
await page.waitForTimeout(2500);
console.log('after convert url:', page.url());
await page.screenshot({ path: 'shots/a3-convert.png' });

await browser.close();
console.log('AUDIT SHOTS DONE');

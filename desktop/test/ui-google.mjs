// Verify the Google OAuth flow opens INSIDE the Electron window (no disallowed_useragent).
import { chromium } from 'playwright-core';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('staging-whatsappdemo')) ?? ctx.pages()[0];
console.log('start url:', page.url());
console.log('userAgent:', await page.evaluate(() => navigator.userAgent));

// Click the Google button (social-login-buttons component).
const btn = page.locator('button, a').filter({ hasText: /google/i }).first();
await btn.waitFor({ timeout: 15000 });
await btn.click();
await page.waitForURL(/accounts\.google\.com/, { timeout: 25000 }).catch(() => {});
await page.waitForTimeout(2500);
console.log('after click:', page.url().slice(0, 90));
const blocked = await page.evaluate(() => document.body.innerText.includes('disallowed_useragent') || document.body.innerText.includes('not be secure'));
console.log('blocked by Google:', blocked);
await page.screenshot({ path: 'shots/o1-google.png' });
await browser.close();
console.log('GOOGLE FLOW SHOT DONE');

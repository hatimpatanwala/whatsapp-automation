import { chromium } from 'playwright-core';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('43110')) ?? ctx.pages()[0];
await page.locator('tbody tr', { hasText: 'Gujarat Traders' }).first().click();
await page.waitForTimeout(1800);
await page.screenshot({ path: 'shots/pm1-party.png', fullPage: true });
console.log('PARTY SHOT DONE');
await browser.close();

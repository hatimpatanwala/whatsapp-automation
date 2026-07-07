import { chromium } from 'playwright-core';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('staging-whatsappdemo')) ?? ctx.pages()[0];
page.on('console', (m) => { if (m.type() === 'error') console.log('[err]', m.text().slice(0, 160)); });
const info = await page.evaluate(() => ({
  batchRows: Array.from(document.querySelectorAll('table')).length,
  hasBatchesPanel: document.body.innerText.includes('BATCHES — ONE ITEM, MANY LOTS') || document.body.innerText.includes('Batches — one item'),
  batchText: document.body.innerText.match(/OLD-LOT[^\n]*/)?.[0] || null,
  newLot: document.body.innerText.match(/NEW-LOT[^\n]*/)?.[0] || null,
  tracking: (document.querySelector('input[name="trk"][value="batch"]') as any)?.checked,
}));
console.log(JSON.stringify(info, null, 1));
await browser.close();

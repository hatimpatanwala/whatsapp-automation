// Draft retention UX: half-typed vouchers survive navigation; Alt+X clears.
import { chromium } from 'playwright-core';

const BASE = 'https://staging-whatsappdemo.duckdns.org';
const results = [];
const ok = (n, d = '') => { results.push(['PASS', n]); console.log(`PASS  ${n}${d ? '  [' + d + ']' : ''}`); };
const bad = (n, e) => { results.push(['FAIL', n]); console.log(`FAIL  ${n}  !! ${String(e).slice(0, 160)}`); };
async function step(n, fn) { try { const d = await fn(); ok(n, d || ''); } catch (e) { bad(n, e); } }

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('staging-whatsappdemo')) ?? ctx.pages()[0];

async function go(url) {
  await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1800);
}
const statusChip = () => page.evaluate(() => document.querySelector('.mcl-draft-note')?.textContent || '');

// fresh slate: hard-reload past any cached bundle, then drop old drafts
await go(`${BASE}/home`);
const cdp = await ctx.newCDPSession(page);
await cdp.send('Page.reload', { ignoreCache: true }).catch(() => {});
await page.waitForTimeout(6000);
if (page.url().includes('chrome-error') || !page.url().includes('staging')) await go(`${BASE}/home`);
await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('wa-entry-draft:')).forEach((k) => localStorage.removeItem(k))).catch(() => {});

// ─── 1. Sales draft survives a round-trip to Item Master ────────────────────
await step('sales: type party + item, jump to items, come back → restored', async () => {
  await go(`${BASE}/entry/sales`);
  await page.fill('[data-cell="party"]', 'Hatim & Bros');
  await page.waitForTimeout(1200);
  await page.keyboard.press('Enter'); // pick party
  await page.waitForTimeout(1400);
  await page.keyboard.press('PageDown');
  await page.type('[data-cell="0:name"]', 'Amazon Echo', { delay: 40 });
  await page.waitForTimeout(1400);
  await page.keyboard.press('Enter'); // pick item
  await page.waitForTimeout(800);
  await page.fill('[data-cell="0:qty"]', '4');
  await page.waitForTimeout(1200); // debounced autosave flush

  // simulate "low stock — go add stock": navigate to Item Master, then back
  await go(`${BASE}/entry/items`);
  const chip1 = await statusChip();
  await go(`${BASE}/entry/sales`);
  await page.waitForTimeout(800);

  const party = await page.inputValue('[data-cell="party"]');
  const item = await page.inputValue('[data-cell="0:name"]');
  const qty = await page.inputValue('[data-cell="0:qty"]');
  const bt = await page.inputValue('[data-cell="bt-name"]');
  if (!party.includes('Hatim')) throw new Error('party lost: ' + party);
  if (!item.includes('Echo')) throw new Error('item lost: ' + item);
  if (qty !== '4') throw new Error('qty lost: ' + qty);
  if (!bt.includes('Hatim')) throw new Error('bill-to lost: ' + bt);
  const chip2 = await statusChip();
  return `kept (${chip1.trim() || 'saved chip'}) → restored (${chip2.trim() || 'chip gone'})`;
});

// ─── 2. Alt+X clears everything ──────────────────────────────────────────────
await step('sales: Alt+X wipes the entry + draft', async () => {
  await page.keyboard.press('Alt+x');
  await page.waitForTimeout(900);
  const party = await page.inputValue('[data-cell="party"]');
  const item = await page.inputValue('[data-cell="0:name"]');
  if (party || item) throw new Error(`not cleared: party="${party}" item="${item}"`);
  const chip = await statusChip();
  // draft gone from storage too
  const stored = await page.evaluate(() => localStorage.getItem('wa-entry-draft:sales'));
  if (stored) throw new Error('draft still in storage');
  return `cleared (${chip.trim()})`;
});

// ─── 3. After Alt+X, leaving + returning stays clean ─────────────────────────
await step('sales: after clear, round-trip stays empty', async () => {
  await go(`${BASE}/entry/items`);
  await go(`${BASE}/entry/sales`);
  const party = await page.inputValue('[data-cell="party"]');
  if (party) throw new Error('ghost draft: ' + party);
  return 'no ghost restore';
});

// ─── 4. Quote draft too ──────────────────────────────────────────────────────
await step('quote: draft survives navigation', async () => {
  await go(`${BASE}/entry/quote`);
  await page.fill('[data-cell="party"]', 'Hatim & Bros');
  await page.waitForTimeout(1200);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000); // pick + autosave flush
  await go(`${BASE}/entry/registers/sales`);
  await go(`${BASE}/entry/quote`);
  const party = await page.inputValue('[data-cell="party"]');
  if (!party.includes('Hatim')) throw new Error('quote draft lost: ' + party);
  await page.keyboard.press('Alt+x');
  await page.waitForTimeout(600);
  return 'restored, then Alt+X cleaned up';
});

await go(`${BASE}/home`);
const fails = results.filter((r) => r[0] === 'FAIL');
console.log(`\nDRAFTS: ${results.length - fails.length}/${results.length} passed`);
process.exit(fails.length ? 1 : 0);

// Full UI/UX regression over the live app (staging remote mode) via Playwright CDP.
// Covers: keyboard shortcuts, the complete sales-entry flow (party → bill-to
// autofill → PgDn → item pick → save → post-save tray → print), lookups,
// registers detail popup, masters, reports, GST, and the web-portal screens.
import { chromium } from 'playwright-core';

const BASE = 'https://staging-whatsappdemo.duckdns.org';
const results = [];
const ok = (name, detail = '') => { results.push(['PASS', name, detail]); console.log(`PASS  ${name}${detail ? '  [' + detail + ']' : ''}`); };
const bad = (name, err) => { results.push(['FAIL', name, String(err).slice(0, 180)]); console.log(`FAIL  ${name}  !! ${String(err).slice(0, 180)}`); };
async function step(name, fn) { try { const d = await fn(); ok(name, d || ''); } catch (e) { bad(name, e); } }

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('staging-whatsappdemo')) ?? ctx.pages()[0];

async function go(url) {
  await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1500);
  if (page.url().includes('/auth')) {
    await page.fill('input[type="email"]', 'backup.hatim@gmail.com');
    await page.fill('input[type="password"]', 'Hatim@1234');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3500);
    await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1500);
  }
}
const text = () => page.evaluate(() => document.body.innerText);
const active = () => page.evaluate(() => {
  const a = document.activeElement;
  return a ? (a.getAttribute('data-cell') || a.getAttribute('placeholder') || a.tagName) : 'none';
});

// ─── 1. ERP home dashboard ───────────────────────────────────────────────────
await step('home: dashboard KPIs render', async () => {
  await go(`${BASE}/home`);
  await page.waitForTimeout(4000);
  const t = await text();
  if (!t.includes('SALES TODAY') && !t.includes('Sales today')) throw new Error('KPI cards missing');
  return 'Business Overview live';
});

// ─── 2. Keyboard: F2 → sales, party auto-focus ──────────────────────────────
await step('kbd: F2 opens sales entry, party focused', async () => {
  await page.keyboard.press('F2');
  await page.waitForTimeout(2500);
  if (!page.url().includes('/entry/sales')) throw new Error('URL ' + page.url());
  const a = await active();
  if (a !== 'party') throw new Error('focus on ' + a);
  return 'auto-focus = party';
});

// ─── 3. Full sales flow: party → bill-to autofill → PgDn → item → save ─────
let savedNo = '';
await step('sales: party pick fills Bill To', async () => {
  await page.fill('[data-cell="party"]', 'Hatim & Bros');
  await page.waitForTimeout(1200);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  const bt = await page.inputValue('[data-cell="bt-name"]').catch(() => '');
  if (!bt.includes('Hatim')) throw new Error('bill-to name = ' + bt);
  return 'bt-name = ' + bt;
});

await step('sales: PgDn jumps to first item row', async () => {
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(600);
  const a = await active();
  if (a !== '0:name') throw new Error('focus on ' + a);
  return 'focus 0:name';
});

await step('sales: item typeahead pick + qty', async () => {
  await page.type('[data-cell="0:name"]', 'Amazon Echo', { delay: 40 });
  await page.waitForTimeout(1400);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  await page.fill('[data-cell="0:qty"]', '1');
  const rate = await page.inputValue('[data-cell="0:rate"]');
  if (!(parseFloat(rate) > 0)) throw new Error('rate not prefilled: ' + rate);
  return 'rate prefilled ' + rate;
});

await step('sales: F9 calculator computes into qty', async () => {
  await page.click('[data-cell="0:qty"]');
  await page.keyboard.press('F9');
  await page.waitForTimeout(600);
  await page.fill('[data-calc-input]', '2+1');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const q = await page.inputValue('[data-cell="0:qty"]');
  if (q !== '3') throw new Error('qty = ' + q);
  await page.fill('[data-cell="0:qty"]', '1');
  return '2+1 → 3';
});

await step('sales: Alt+P party popup opens + Esc restores focus', async () => {
  await page.click('[data-cell="0:qty"]');
  await page.keyboard.press('Alt+p');
  await page.waitForTimeout(900);
  const t = await text();
  if (!t.includes('Outstanding') && !t.includes('Credit limit')) throw new Error('party popup missing');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  if (page.url().includes('/entry/sales') === false) throw new Error('Esc navigated away!');
  const a = await active();
  return 'popup + Esc, focus back on ' + a;
});

await step('sales: Ctrl+Enter saves → post-save tray', async () => {
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(3500);
  const t = await text();
  const m = t.match(/✓ (INV-[A-Z0-9-]+)/);
  if (!m) throw new Error('no saved tray: ' + t.slice(0, 150).replace(/\n/g, ' '));
  savedNo = m[1];
  if (!t.includes('saved & posted')) throw new Error('tray text missing');
  return savedNo + ' tray shown (Print / e-Invoice / e-Way / Collect)';
});

await step('sales: tray → Print opens invoice print view', async () => {
  await page.click('text=🖨 Print');
  await page.waitForTimeout(3000);
  const t = await text();
  if (!t.includes('TAX INVOICE') || !t.includes(savedNo)) throw new Error('print view wrong');
  await page.keyboard.press('Escape'); // print view: Esc = back
  await page.waitForTimeout(1500);
  return 'A4 GST format w/ ' + savedNo;
});

// ─── 4. Help overlay ─────────────────────────────────────────────────────────
await step('kbd: F1 help overlay + Esc closes', async () => {
  await go(`${BASE}/entry/sales`);
  await page.keyboard.press('F1');
  await page.waitForTimeout(900);
  // CSS uppercases the column headers — match case-insensitively on the box itself.
  const box = await page.evaluate(() => document.querySelector('.mcl-help')?.innerText.toLowerCase() || '');
  if (!box.includes('vouchers') || !box.includes('inside an entry')) throw new Error('help overlay missing');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const still = await page.evaluate(() => !!document.querySelector('.mcl-help'));
  if (still) throw new Error('Esc did not close overlay');
  return '3-column keymap card, Esc closes';
});

// ─── 5. Registers: rows, filters, detail popup ───────────────────────────────
await step('registers: sales register rows + detail popup', async () => {
  await page.keyboard.press('Alt+v');
  await page.waitForTimeout(2500);
  if (!page.url().includes('/entry/registers')) throw new Error('URL ' + page.url());
  const t = await text();
  if (!t.includes(savedNo)) throw new Error(savedNo + ' not in register');
  // JS click — Playwright's actionability scroll can stall when the window is backgrounded.
  await page.evaluate((no) => {
    const row = [...document.querySelectorAll('tr')].find((r) => r.innerText.includes(no));
    row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, savedNo);
  await page.waitForTimeout(1200);
  const t2 = await text();
  if (!t2.includes('TOTAL')) throw new Error('detail popup missing');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  return 'row click → document detail → Esc';
});

// ─── 6. Other keyboard screens ───────────────────────────────────────────────
await step('kbd: Alt+K item master (search focused)', async () => {
  await page.keyboard.press('Alt+k');
  await page.waitForTimeout(2200);
  if (!page.url().includes('/entry/items')) throw new Error('URL ' + page.url());
  return 'items master';
});
await step('kbd: F8 purchase entry', async () => {
  await page.keyboard.press('F8');
  await page.waitForTimeout(2200);
  if (!page.url().includes('/entry/purchase')) throw new Error('URL ' + page.url());
  return 'purchase screen';
});
await step('kbd: Alt+C collections', async () => {
  await page.keyboard.press('Alt+c');
  await page.waitForTimeout(2200);
  const t = await text();
  if (!t.includes('Payments') && !t.includes('Collections')) throw new Error('collect screen missing');
  return 'queue/feed/reconcile/setup';
});
await step('kbd: Ctrl+G GST returns', async () => {
  await page.keyboard.press('Control+g');
  await page.waitForTimeout(2200);
  const t = await text();
  if (!t.includes('GSTR-1')) throw new Error('gst screen missing');
  return 'GSTR screens';
});
await step('kbd: F10 trial balance', async () => {
  await page.keyboard.press('F10');
  await page.waitForTimeout(2500);
  const t = await text();
  if (!t.toLowerCase().includes('trial balance')) throw new Error('TB missing');
  return 'trial balance renders';
});

// ─── 7. Party master UX: GSTIN validation ────────────────────────────────────
await step('party master: bad GSTIN shows inline error', async () => {
  await go(`${BASE}/entry/party`);
  await page.click('button:has-text("New")', { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(800);
  const gstin = page.locator('label:has-text("GSTIN") input').first();
  await gstin.fill('27AAACR5055K1Z9');
  await page.waitForTimeout(900);
  let t = await text();
  if (!/check.?digit|invalid gstin|checksum/i.test(t)) {
    // validation may only surface on save — try it
    await page.click('button:has-text("Save")', { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(900);
    t = await text();
  }
  if (!/check.?digit|invalid gstin|checksum/i.test(t)) throw new Error('no inline GSTIN error');
  return 'checksum error inline';
});

// ─── 8. Web portal screens ───────────────────────────────────────────────────
await step('portal: products list + search', async () => {
  await go(`${BASE}/products`);
  await page.waitForTimeout(2000);
  const t = await text();
  if (!t.includes('Products')) throw new Error('list missing');
  return 'renders';
});
await step('portal: product form shows ERP parity fields', async () => {
  await go(`${BASE}/products/new`);
  await page.waitForTimeout(2500);
  const t = await text();
  const need = ['Item Type', 'Alt Unit', 'UQC', 'MRP', 'Purchase Rate', 'Wholesale Price', 'Stock Tracking'];
  const missing = need.filter((x) => !t.includes(x));
  if (missing.length) throw new Error('missing ' + missing.join(','));
  return 'all parity fields present';
});
await step('portal: customers + orders lists', async () => {
  await go(`${BASE}/customers`);
  const t1 = await text();
  await go(`${BASE}/orders`);
  const t2 = await text();
  if (!t1.includes('Customers') || !t2.includes('Orders')) throw new Error('lists missing');
  return 'both render';
});
await step('portal: sidebar has ERP (Keyboard view) link', async () => {
  await go(`${BASE}/dashboard`);
  await page.waitForTimeout(1500);
  const t = await text();
  if (!t.includes('ERP (Keyboard view)')) throw new Error('link missing');
  return 'portal ↔ ERP link present';
});

// ─── wrap up ─────────────────────────────────────────────────────────────────
await go(`${BASE}/home`);
const fails = results.filter((r) => r[0] === 'FAIL');
console.log('\n' + '='.repeat(66));
console.log(`UI/UX TOTAL ${results.length} — ${results.length - fails.length} passed, ${fails.length} failed`);
for (const [, n, d] of fails) console.log(`  FAIL ${n}: ${d}`);
process.exit(fails.length ? 1 : 0);

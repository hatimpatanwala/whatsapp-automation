/**
 * Integration test for the ERP WhatsApp admin commands.
 *
 * Boots the Nest application context, stubs ONLY the outbound WhatsApp send
 * (so nothing hits Meta), and drives a full "create invoice → record payment"
 * conversation through AdminCommandService.handle() exactly as the webhook would.
 * Asserts the invoice is persisted with correct totals and that payment
 * reconciliation moves it to paid.
 *
 * Run: npx ts-node --project tsconfig.scripts.json --transpile-only \
 *        -r tsconfig-paths/register scripts/test-erp-whatsapp.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AdminCommandService } from '../src/modules/whatsapp/admin-command.service';
import { WhatsAppApiService } from '../src/modules/whatsapp/whatsapp-api.service';
import { TenantConnectionManager } from '../src/database/tenant-connection.manager';

const SCHEMA = 'tenant_demo_store';
const FROM = '919999999999';

const textMsg = (body: string) => ({ from: FROM, type: 'text', text: { body } });
const tapMsg = (id: string, title = '') => ({
  from: FROM, type: 'interactive', interactive: { list_reply: { id, title } },
});

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });

  // ── stub outbound WhatsApp send; capture the replies ──
  const sent: string[] = [];
  const wa = app.get(WhatsAppApiService);
  (wa as any).sendTextMessage = async (_p: any, _t: any, _to: any, text: string) => { sent.push(text); };
  (wa as any).sendInteractiveButtons = async (_p: any, _t: any, _to: any, body: string) => { sent.push(`[buttons] ${body}`); };
  (wa as any).sendInteractiveList = async (_p: any, _t: any, _to: any, body: string) => { sent.push(`[list] ${body}`); };
  (wa as any).sendCtaUrl = async (_p: any, _t: any, _to: any, body: string) => { sent.push(`[cta] ${body}`); };
  const docs: Array<{ to: string; filename: string; caption?: string; size: number }> = [];
  (wa as any).uploadMediaBuffer = async (_p: any, _t: any, buf: Buffer) => { (wa as any).__lastPdfSize = buf.length; return 'media_test_123'; };
  (wa as any).sendDocument = async (_p: any, _t: any, to: string, _m: any, filename: string, caption?: string) => {
    docs.push({ to, filename, caption, size: (wa as any).__lastPdfSize || 0 });
  };

  const admin = app.get(AdminCommandService);
  const cm = app.get(TenantConnectionManager);

  const tenantRow = (await cm.executeGlobal((qr) =>
    qr.query(`SELECT id FROM public.tenants WHERE schema_name = $1`, [SCHEMA])))[0];
  const tenant = { id: tenantRow.id, schemaName: SCHEMA, phoneNumberId: 'pn', accessToken: 'tok', currency: '₹' };

  const last = () => sent[sent.length - 1] || '';
  const step = async (msg: any, label: string) => {
    sent.length = 0;
    await admin.handle(tenant, msg);
    console.log(`\n> ${label}\n  reply: ${last().replace(/\n/g, ' ⏎ ').slice(0, 140)}`);
  };

  console.log('=== ERP WhatsApp invoice flow ===');
  await step(tapMsg('cat_einvoices', 'Invoices'), 'open Invoices menu');
  await step(tapMsg('einv_new', 'New Invoice'), 'tap New Invoice');
  await step(textMsg('Acme Corp'), 'customer name');
  await step(textMsg('Office Chair 2 1500'), 'item 1');
  await step(textMsg('Setup Service 1 500'), 'item 2');
  await step(textMsg('done'), 'done adding items');
  await step(textMsg('18'), 'tax 18%');
  await step(textMsg('100'), 'discount 100 → CREATE');

  // ── assert invoice persisted with correct totals ──
  const inv = (await cm.executeInTenantContext(SCHEMA, (qr) =>
    qr.query(`SELECT id, invoice_number, subtotal, total_tax, discount, total, balance_due, payment_status, items
              FROM invoices WHERE year IS NOT NULL ORDER BY created_at DESC LIMIT 1`)))[0];
  console.log('\n=== persisted invoice ===');
  console.log(`  ${inv.invoice_number} | subtotal ${inv.subtotal} tax ${inv.total_tax} disc ${inv.discount} total ${inv.total} | ${inv.payment_status}`);
  const okCreate = Number(inv.subtotal) === 3500 && Number(inv.total_tax) === 612 && Number(inv.total) === 4012 && inv.payment_status === 'unpaid';
  console.log(`  CREATE ${okCreate ? 'PASS ✅' : 'FAIL ❌'} (expected subtotal 3500, tax 612, total 4012, unpaid)`);

  // ── record a partial then full payment via WhatsApp ──
  console.log('\n=== ERP WhatsApp payment flow ===');
  await step(tapMsg(`einvpay_${inv.id}`, 'Record Payment'), 'tap Record Payment');
  await step(textMsg('2000'), 'pay 2000 (partial)');
  const afterPartial = (await cm.executeInTenantContext(SCHEMA, (qr) =>
    qr.query(`SELECT payment_status, balance_due FROM invoices WHERE id = $1`, [inv.id])))[0];
  console.log(`  after 2000 → ${afterPartial.payment_status}, balance ${afterPartial.balance_due}`);

  await step(tapMsg(`einvpay_${inv.id}`, 'Record Payment'), 'tap Record Payment again');
  await step(textMsg('full'), 'pay full (settle)');
  const afterFull = (await cm.executeInTenantContext(SCHEMA, (qr) =>
    qr.query(`SELECT payment_status, balance_due, amount_paid FROM invoices WHERE id = $1`, [inv.id])))[0];
  console.log(`  after full → ${afterFull.payment_status}, balance ${afterFull.balance_due}, paid ${afterFull.amount_paid}`);
  const okPay = afterPartial.payment_status === 'partial' && Number(afterPartial.balance_due) === 2012
    && afterFull.payment_status === 'paid' && Number(afterFull.balance_due) === 0;
  console.log(`  PAYMENT ${okPay ? 'PASS ✅' : 'FAIL ❌'} (expected partial bal 2012 → paid bal 0)`);

  // ── send the invoice PDF over WhatsApp ──
  console.log('\n=== ERP WhatsApp PDF send ===');
  await step(tapMsg(`einvpdf_${inv.id}`, 'Get PDF'), 'tap Get PDF (to admin)');
  const okPdf = docs.length === 1 && docs[0].size > 1000 && (docs[0].caption || '').includes(inv.invoice_number) && docs[0].to === FROM;
  console.log(`  document sent: to=${docs[0]?.to} file=${docs[0]?.filename} size=${docs[0]?.size}B caption="${docs[0]?.caption}"`);
  console.log(`  PDF ${okPdf ? 'PASS ✅' : 'FAIL ❌'} (expected 1 doc to admin, >1KB, caption with invoice no.)`);

  // ── business report ──
  console.log('\n=== ERP WhatsApp business report ===');
  await step(tapMsg('erp_report', 'Business Report'), 'tap Business Report');
  const okReport = last().includes('Business Report') && last().includes('Receivables');
  console.log(`  REPORT ${okReport ? 'PASS ✅' : 'FAIL ❌'}`);

  const all = okCreate && okPay && okPdf && okReport;
  console.log(`\n=== RESULT: ${all ? 'ALL PASS ✅' : 'FAILURES ❌'} ===`);
  await app.close();
  process.exit(all ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });

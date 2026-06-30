/**
 * Tests the sectioned + sticky WhatsApp admin menu.
 * Boots the Nest context, stubs the outbound WhatsApp send, and drives
 * AdminCommandService.handle() to verify: main menu shows sections; tapping a
 * section opens it + makes it sticky; "menu" then returns to the sticky section;
 * "main menu" / the Main Menu row reset to the section list.
 *
 * Run: npx ts-node --project tsconfig.scripts.json --transpile-only -r tsconfig-paths/register scripts/test-erp-whatsapp-menu.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AdminCommandService } from '../src/modules/whatsapp/admin-command.service';
import { WhatsAppApiService } from '../src/modules/whatsapp/whatsapp-api.service';
import { TenantConnectionManager } from '../src/database/tenant-connection.manager';

const SCHEMA = 'tenant_demo_store';
const FROM = '919999999999';
const textMsg = (body: string) => ({ from: FROM, type: 'text', text: { body } });
const tapMsg = (id: string, title = '') => ({ from: FROM, type: 'interactive', interactive: { list_reply: { id, title } } });

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });

  let lastBody = '';
  let lastRows: string[] = [];
  const wa = app.get(WhatsAppApiService);
  (wa as any).sendTextMessage = async (_p: any, _t: any, _to: any, text: string) => { lastBody = text; lastRows = []; };
  (wa as any).sendInteractiveButtons = async (_p: any, _t: any, _to: any, body: string, buttons: any[]) => { lastBody = body; lastRows = (buttons || []).map((b) => b.title); };
  (wa as any).sendInteractiveList = async (_p: any, _t: any, _to: any, body: string, _btn: string, sections: any[]) => {
    lastBody = body; lastRows = (sections || []).flatMap((s: any) => s.rows.map((r: any) => r.title));
  };

  const admin = app.get(AdminCommandService);
  const cm = app.get(TenantConnectionManager);
  const t = (await cm.executeGlobal((qr) => qr.query(`SELECT id FROM public.tenants WHERE schema_name = $1`, [SCHEMA])))[0];
  const tenant = { id: t.id, schemaName: SCHEMA, phoneNumberId: 'pn', accessToken: 'tok', currency: '₹' };

  const step = async (msg: any, label: string) => { await admin.handle(tenant, msg); console.log(`\n> ${label}\n  body: ${lastBody.split('\n')[0]}\n  rows: ${lastRows.join(' | ')}`); };
  const has = (s: string) => lastRows.some((r) => r.includes(s)) || lastBody.includes(s);

  const results: Array<[string, boolean]> = [];

  await step(textMsg('menu'), 'type "menu" → main menu (sections)');
  results.push(['main menu shows Sales+Catalog+Money sections', has('Sales') && has('Catalog') && has('Money') && has('Reports')]);
  results.push(['main menu does NOT show leaf actions (New Invoice)', !lastRows.some((r) => r.includes('New Invoice'))]);

  await step(tapMsg('sec_sales', 'Sales'), 'tap Sales section');
  results.push(['Sales section shows New Invoice + Orders + Main Menu', has('New Invoice') && has('Orders') && has('Main Menu')]);

  await step(textMsg('menu'), 'type "menu" again → sticky Sales');
  results.push(['"menu" returns to sticky Sales section', has('New Invoice') && has('Main Menu')]);

  await step(textMsg('main menu'), 'type "main menu" → reset to sections');
  results.push(['"main menu" resets to section list', has('Sales') && has('Reports') && !lastRows.some((r) => r.includes('New Invoice'))]);

  await step(tapMsg('sec_catalog', 'Catalog'), 'tap Catalog section');
  results.push(['Catalog section shows Product List + Low Stock', has('Product List') && has('Low Stock')]);

  await step(tapMsg('main_menu', 'Main Menu'), 'tap Main Menu row');
  results.push(['Main Menu row resets to section list', has('Sales') && !lastRows.some((r) => r.includes('Product List'))]);

  await step(textMsg('menu'), 'type "menu" after reset → main menu (sticky cleared)');
  results.push(['sticky cleared after main menu → shows sections', has('Catalog') && !lastRows.some((r) => r.includes('Product List'))]);

  console.log('\n=== RESULTS ===');
  let allPass = true;
  for (const [name, ok] of results) { console.log(`  ${ok ? 'PASS ✅' : 'FAIL ❌'}  ${name}`); if (!ok) allPass = false; }
  console.log(`\n=== ${allPass ? 'ALL PASS ✅' : 'FAILURES ❌'} ===`);
  await app.close();
  process.exit(allPass ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

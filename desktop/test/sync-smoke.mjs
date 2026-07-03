/**
 * End-to-end sync-engine smoke test (Phase 2). Run on a NON-elevated shell:
 *
 *   cd ..  && npm run build          # compile the backend (produces dist/…/migrations)
 *   cd desktop && node test/sync-smoke.mjs
 *
 * Boots one embedded Postgres and simulates a `node` (distributor) schema and a `cloud`
 * schema, applies the REAL tenant migration 059 to both, then exercises push/pull and
 * asserts: outbox capture, no cloud echo, LWW convergence.
 */
import EmbeddedPostgres from 'embedded-postgres';
import migrationsMod from '../../dist/database/migrations/tenant/index.js';
import { rmSync, existsSync } from 'fs';

const tenantMigrations = migrationsMod.tenantMigrations;
const m059 = tenantMigrations.find((m) => m.name === '059_sync_infrastructure');
const dataDir = new URL('./.smoke-sync-pgdata', import.meta.url).pathname.replace(/^\//, '');

if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });

let pass = 0;
let fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}`); }
}

const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: 54330, persistent: false });

async function main() {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('smoke');

  // embedded-postgres's client targets the default db; make our own to 'smoke'.
  const { Client } = await import('pg');
  const c = new Client({ host: 'localhost', port: 54330, user: 'postgres', password: 'postgres', database: 'smoke' });
  await c.connect();

  // qr shim compatible with the migration's queryRunner.query(sql, params) → rows[]
  const qr = { query: async (sql, params) => (await c.query(sql, params)).rows };

  // Provision both schemas with a minimal products table + the sync migration.
  for (const schema of ['cloud', 'node']) {
    await c.query(`CREATE SCHEMA "${schema}"`);
    await c.query(`
      CREATE TABLE "${schema}".products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        base_price NUMERIC(10,2) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
    await m059.up(qr, schema);
  }

  // ── 1. Local write on the node → outbox capture ──────────────────────────
  await c.query(`SET search_path = node`);
  await c.query(`SET sync.role = 'node'`);
  const ins = await c.query(`INSERT INTO node.products (name, base_price) VALUES ('Widget', 100) RETURNING id, sync_version`);
  const id = ins.rows[0].id;
  const outbox = await c.query(`SELECT * FROM node.sync_outbox`);
  check('node write enqueued to outbox', outbox.rows.length === 1 && outbox.rows[0].op === 'I');
  check('node write got a sync_version', Number(ins.rows[0].sync_version) > 0);

  // ── 2. Push node → cloud (apply-mode) ────────────────────────────────────
  const nodeRow = (await c.query(`SELECT to_jsonb(x) AS row FROM node.products x WHERE id = $1`, [id])).rows[0].row;
  await applyToCloud(c, nodeRow);
  const cloudRow = (await c.query(`SELECT * FROM cloud.products WHERE id = $1`, [id])).rows[0];
  check('product pushed to cloud', cloudRow && cloudRow.name === 'Widget');
  check('cloud stamped its own sync_version', Number(cloudRow.sync_version) > 0);
  const cloudOutbox = await c.query(`SELECT COUNT(*)::int n FROM cloud.sync_outbox`);
  check('cloud did NOT echo to its outbox', cloudOutbox.rows[0].n === 0);

  // ── 3. Update on cloud, pull → node (LWW newer wins) ─────────────────────
  await c.query(`SET search_path = cloud`);
  await c.query(`RESET sync.role`); // cloud is not a node
  await c.query(`UPDATE cloud.products SET base_price = 150 WHERE id = $1`, [id]);
  const cloudUpdated = (await c.query(`SELECT to_jsonb(x) AS row FROM cloud.products x WHERE id = $1`, [id])).rows[0].row;

  const outboxBefore = (await c.query(`SELECT COUNT(*)::int n FROM node.sync_outbox`)).rows[0].n;
  await applyToNode(c, cloudUpdated);
  const nodeAfter = (await c.query(`SELECT base_price FROM node.products WHERE id = $1`, [id])).rows[0];
  check('cloud update pulled into node (LWW newer wins)', Number(nodeAfter.base_price) === 150);
  const outboxAfter = (await c.query(`SELECT COUNT(*)::int n FROM node.sync_outbox`)).rows[0].n;
  check('applying remote change did NOT echo to node outbox', outboxAfter === outboxBefore);

  // ── 4. LWW: older change is rejected ─────────────────────────────────────
  const stale = { ...cloudUpdated, base_price: 1, updated_at: '2000-01-01T00:00:00Z' };
  await applyToNode(c, stale);
  const nodeStale = (await c.query(`SELECT base_price FROM node.products WHERE id = $1`, [id])).rows[0];
  check('older change rejected by LWW', Number(nodeStale.base_price) === 150);

  await c.end();
  await pg.stop();
  rmSync(dataDir, { recursive: true, force: true });
  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

async function applyToCloud(c, row) {
  await c.query('BEGIN');
  await c.query(`SET search_path = cloud`);
  await c.query(`SELECT set_config('sync.apply','on',true)`);
  const payload = { ...row };
  delete payload.sync_version;
  await c.query(
    `INSERT INTO cloud.products SELECT * FROM jsonb_populate_record(NULL::cloud.products, $1::jsonb)
     ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, base_price=EXCLUDED.base_price,
        created_at=EXCLUDED.created_at, updated_at=EXCLUDED.updated_at, origin_node=EXCLUDED.origin_node,
        deleted_at=EXCLUDED.deleted_at
     WHERE cloud.products.updated_at IS NULL OR cloud.products.updated_at < EXCLUDED.updated_at`,
    [JSON.stringify(payload)],
  );
  await c.query('COMMIT');
}

async function applyToNode(c, row) {
  await c.query('BEGIN');
  await c.query(`SET search_path = node`);
  await c.query(`SELECT set_config('sync.apply','on',true)`);
  const payload = { ...row };
  delete payload.sync_version;
  await c.query(
    `INSERT INTO node.products SELECT * FROM jsonb_populate_record(NULL::node.products, $1::jsonb)
     ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, base_price=EXCLUDED.base_price,
        created_at=EXCLUDED.created_at, updated_at=EXCLUDED.updated_at, origin_node=EXCLUDED.origin_node,
        deleted_at=EXCLUDED.deleted_at
     WHERE node.products.updated_at IS NULL OR node.products.updated_at < EXCLUDED.updated_at`,
    [JSON.stringify(payload)],
  );
  await c.query('COMMIT');
}

main().catch(async (e) => {
  console.error('SMOKE ERROR:', e);
  try { await pg.stop(); } catch {}
  process.exit(1);
});

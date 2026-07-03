/**
 * Import a pg_dump of the ONLINE PORTAL's database into the desktop's local database,
 * so the desktop ERP runs over your real products/customers/orders.
 *
 * Usage:
 *   node scripts/import-dump.mjs <dump.sql> [--db docker|embedded]
 *
 * Get the dump from the server (adjust host/container; plain-SQL format):
 *   ssh -i ../wa-commece.pem ubuntu@<EC2-HOST> \
 *     "docker exec <postgres-container> pg_dump -U postgres -d whatsapp_commerce \
 *        --no-owner --no-privileges" > cloud.sql
 *   (find the container name with:  ssh ... "docker ps")
 *
 * The import DROPS and recreates the local whatsapp_commerce database (UTF-8), then
 * replays the dump. On next app start, tenant migrations (59-67) auto-apply to the
 * imported tenant schemas, enabling all desktop ERP features over the real data.
 */
import { spawn } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require2 = createRequire(import.meta.url);
const args = process.argv.slice(2);
const dumpFile = args.find((a) => !a.startsWith('--'));
const mode = args.includes('--db') ? args[args.indexOf('--db') + 1] : (process.env.DESKTOP_DB === 'docker' ? 'docker' : 'docker');

if (!dumpFile || !fs.existsSync(dumpFile)) {
  console.error('Usage: node scripts/import-dump.mjs <dump.sql> [--db docker|embedded]');
  console.error('The dump file must exist. See the header of this script for how to create it.');
  process.exit(1);
}

const DB = 'whatsapp_commerce';
const PG = { user: 'postgres', password: 'postgres' };
const port = mode === 'embedded' ? 54329 : 5432;

const run = (cmd, cmdArgs, opts = {}) =>
  new Promise((resolve, reject) => {
    const c = spawn(cmd, cmdArgs, { stdio: opts.stdin ? ['pipe', 'inherit', 'inherit'] : 'inherit', ...opts.spawn });
    if (opts.stdin) opts.stdin.pipe(c.stdin);
    c.on('error', reject);
    c.on('exit', (code) => (code === 0 ? resolve(0) : reject(new Error(`${cmd} exited with ${code}`))));
  });

async function main() {
  console.log(`Importing ${dumpFile} into ${mode} database (port ${port})…`);

  if (mode === 'docker') {
    // Make sure the container is up.
    const composeFile = path.resolve(process.cwd(), '..', 'docker-compose.yml');
    await run('docker', ['compose', '-f', composeFile, 'up', '-d', 'postgres']);
  }

  // Wait for Postgres, then drop + recreate the DB (UTF-8).
  const { Client } = require2('pg');
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const probe = new Client({ host: '127.0.0.1', port, ...PG, database: 'postgres', connectionTimeoutMillis: 2000 });
      await probe.connect(); await probe.end();
      break;
    } catch (e) {
      if (Date.now() > deadline) throw e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const admin = new Client({ host: '127.0.0.1', port, ...PG, database: 'postgres' });
  await admin.connect();
  console.log('Dropping and recreating the local database…');
  await admin.query(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${DB}" ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`);
  await admin.end();

  console.log('Replaying the dump (this can take a few minutes)…');
  if (mode === 'docker') {
    // psql inside the container — no client tooling needed on the host.
    await run('docker', ['exec', '-i', 'wa-postgres', 'psql', '-q', '-v', 'ON_ERROR_STOP=0', '-U', PG.user, '-d', DB], {
      stdin: fs.createReadStream(dumpFile),
    });
  } else {
    // Embedded mode ships no psql — use a throwaway Docker psql pointed at the host.
    // (The embedded server must be running: start the app once, or pg_ctl start.)
    await run('docker', [
      'run', '--rm', '-i', '-e', `PGPASSWORD=${PG.password}`, 'postgres:17-alpine',
      'psql', '-q', '-v', 'ON_ERROR_STOP=0', '-h', 'host.docker.internal', '-p', String(port), '-U', PG.user, '-d', DB,
    ], { stdin: fs.createReadStream(dumpFile) });
  }

  console.log('✅ Import complete. Start the app — tenant migrations will auto-apply on boot.');
  console.log(mode === 'docker' ? '   Run:  npm run start:docker' : '   Run:  npm start');
}

main().catch((err) => {
  console.error('Import failed:', err.message);
  process.exit(1);
});

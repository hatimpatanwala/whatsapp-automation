// Proves the pg_ctl start path works from an ELEVATED shell (postgres.exe direct spawn
// refuses; pg_ctl drops privileges via a restricted token).
import { spawn } from 'child_process';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';

const require2 = createRequire(import.meta.url);
const { pg_ctl } = await import('@embedded-postgres/windows-x64');
const dataDir = path.join(process.env.APPDATA, 'WaCommerceERP', 'pgdata');
const logFile = path.join(process.env.APPDATA, 'WaCommerceERP', 'pg.log');

const run = (args) => new Promise((resolve) => {
  const c = spawn(pg_ctl, args, { windowsHide: true });
  c.stdout.on('data', d => process.stdout.write(String(d)));
  c.stderr.on('data', d => process.stdout.write(String(d)));
  c.on('exit', code => resolve(code ?? -1));
});

console.log('== status =='); const st = await run(['-D', dataDir, 'status']); console.log('status exit:', st);
if (st !== 0) {
  console.log('== start via pg_ctl (elevated shell) ==');
  const code = await run(['-D', dataDir, '-o', '-p 54329', '-w', '-t', '60', '-l', logFile, 'start']);
  console.log('start exit:', code);
  if (code !== 0) { console.log('SERVER LOG TAIL:\n', fs.readFileSync(logFile, 'utf8').split(/\r?\n/).slice(-15).join('\n')); process.exit(1); }
}

console.log('== connect + create db ==');
const { Client } = require2('pg');
const admin = new Client({ host: '127.0.0.1', port: 54329, user: 'postgres', password: 'postgres', database: 'postgres' });
await admin.connect();
const v = await admin.query('select version()');
console.log('CONNECTED:', v.rows[0].version.split(',')[0]);
const ex = await admin.query(`SELECT 1 FROM pg_database WHERE datname='whatsapp_commerce'`);
if (!ex.rows.length) { await admin.query(`CREATE DATABASE "whatsapp_commerce"`); console.log('db created'); } else console.log('db already exists');
await admin.query(`ALTER DATABASE "whatsapp_commerce" SET sync.role = 'node'`);
await admin.end();

console.log('== stop ==');
console.log('stop exit:', await run(['-D', dataDir, '-m', 'fast', '-w', 'stop']));
console.log('✅ ELEVATED-SHELL PG LIFECYCLE PASS');

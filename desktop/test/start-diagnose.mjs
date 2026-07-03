// Reproduces the boot failure with the new log-capture + classification.
import EmbeddedPostgres from 'embedded-postgres';
import path from 'path';

const dataDir = path.join(process.env.APPDATA, 'WaCommerceERP', 'pgdata');
const logs = [];
const capture = (m) => String(m ?? '').split(/\r?\n/).forEach((l) => l.trim() && logs.push(l.trim()));

const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres', port: 54329,
  persistent: true, onLog: capture, onError: capture,
});

try {
  await pg.start();
  console.log('STARTED OK — problem was NOT reproducible in this shell');
  await pg.stop();
} catch (err) {
  const combined = `${err instanceof Error ? err.message : String(err ?? '')}\n${logs.join('\n')}`;
  console.log('START FAILED. Raw rejection:', err === undefined ? 'undefined (as expected)' : err);
  console.log('--- captured log tail ---');
  console.log(logs.slice(-10).join('\n'));
  console.log('--- classification ---');
  if (/administrative permissions|unprivileged/i.test(combined)) console.log('>> ADMIN-ELEVATION refusal (friendly message will show)');
  else if (/could not bind|already in use/i.test(combined)) console.log('>> PORT conflict');
  else console.log('>> other');
}

// embedded-postgres is ESM-only; this file compiles to CommonJS (Electron main), so we
// import the type statically and load the implementation with a runtime dynamic import().
import type EmbeddedPostgres from 'embedded-postgres' with { 'resolution-mode': 'import' };
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { pgDataDir, parentRoot } from './paths';
import { PG_PORT, PG_USER, PG_PASSWORD, DB_NAME, DB_MODE, DOCKER_PG_PORT } from './config';

/**
 * Ring buffer of recent initdb/pg_ctl/postgres output. embedded-postgres rejects with
 * `undefined` when a process exits early — the real reason only appears on its
 * onLog/onError stream, so we keep the tail and attach it to thrown errors.
 */
const recentLogs: string[] = [];
function captureLog(message: unknown): void {
  const text = String(message ?? '').trim();
  if (!text) return;
  for (const line of text.split(/\r?\n/)) {
    const l = line.trim();
    if (!l) continue;
    recentLogs.push(l);
    if (recentLogs.length > 80) recentLogs.shift();
    console.log('[pg]', l);
  }
}

/** Build a helpful Error out of a (possibly undefined) rejection + the captured logs. */
function pgError(stage: string, err: unknown): Error {
  const errText = err instanceof Error ? err.message : err ? String(err) : '';
  const logTail = recentLogs.slice(-25).join('\n');
  const combined = `${errText}\n${logTail}`;

  if (/administrative permissions|unprivileged/i.test(combined)) {
    return new Error(
      'PostgreSQL refused to run with administrator privileges. ' +
        'Start the app from a normal (non-elevated) window, or report this — pg_ctl should have dropped privileges.\n\n' + logTail,
    );
  }
  if (/could not bind|address already in use|Address already in use/i.test(combined)) {
    return new Error(
      `Port ${PG_PORT} is already in use — another copy of the local database may still be running. ` +
        'Close other instances (or reboot) and try again.\n\n' + logTail,
    );
  }
  if (/database files are incompatible|is not compatible/i.test(combined)) {
    return new Error(
      'The local database files are from an incompatible PostgreSQL version. ' +
        `Delete the data folder (${pgDataDir()}) to reset, then start again.\n\n` + logTail,
    );
  }
  if (/lock file .* already exists|postmaster\.pid/i.test(combined)) {
    return new Error(
      'A previous run did not shut down cleanly (stale lock file). ' +
        `If no other copy is running, delete ${path.join(pgDataDir(), 'postmaster.pid')} and try again.\n\n` + logTail,
    );
  }
  return new Error(`${stage} failed.${errText ? ` ${errText}` : ''}\n\nRecent database log:\n${logTail || '(no output captured)'}`);
}

/**
 * Locate pg_ctl from the platform binaries package (@embedded-postgres/<platform>),
 * which ESM-exports absolute paths to its binaries. The specifier is a variable so
 * TypeScript doesn't demand type declarations for the platform package.
 */
function platformBinPkg(): string {
  return process.platform === 'win32'
    ? '@embedded-postgres/windows-x64'
    : process.platform === 'darwin'
      ? (process.arch === 'arm64' ? '@embedded-postgres/darwin-arm64' : '@embedded-postgres/darwin-x64')
      : (process.arch === 'arm64' ? '@embedded-postgres/linux-arm64' : '@embedded-postgres/linux-x64');
}

// Binaries cannot be spawned from inside the asar archive — use the unpacked copy.
function unpackedBin(p: string): string {
  return String(p).replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
}

let pgCtlExe: string | null = null;
async function getPgCtl(): Promise<string> {
  if (pgCtlExe) return pgCtlExe;
  const mod: { pg_ctl: string } = await import(platformBinPkg() as string);
  pgCtlExe = unpackedBin(mod.pg_ctl);
  return pgCtlExe;
}

let initdbExe: string | null = null;
async function getInitdb(): Promise<string> {
  if (initdbExe) return initdbExe;
  const mod: { initdb: string } = await import(platformBinPkg() as string);
  initdbExe = unpackedBin(mod.initdb);
  return initdbExe;
}

/**
 * Initialise a fresh cluster with initdb — run via the UNPACKED binary. We deliberately
 * do NOT use embedded-postgres's own `initialise()`: it resolves initdb to the packed
 * app.asar path, which the OS can't execute ("spawn …app.asar…initdb.exe ENOENT" on
 * first run). Args mirror the library's (auth=password + a temp pwfile); the server
 * itself is started separately via pg_ctl.
 */
async function runInitdb(dataDir: string): Promise<void> {
  const exe = await getInitdb();
  const pwfile = path.join(os.tmpdir(), `pg-pw-${crypto.randomBytes(6).toString('hex')}`);
  fs.writeFileSync(pwfile, PG_PASSWORD + '\n');
  try {
    const code = await new Promise<number>((resolve) => {
      const child = spawn(
        exe,
        [
          `--pgdata=${dataDir}`,
          '--auth=password',
          `--username=${PG_USER}`,
          `--pwfile=${pwfile}`,
          // Force UTF-8 + C locale so ₹/Unicode store correctly regardless of the
          // Windows system codepage.
          '--encoding=UTF8',
          '--locale=C',
        ],
        { windowsHide: true },
      );
      child.stdout?.on('data', captureLog);
      child.stderr?.on('data', captureLog);
      child.on('error', (e) => {
        captureLog(String(e));
        resolve(-1);
      });
      child.on('exit', (c) => resolve(c ?? -1));
    });
    if (code !== 0) throw pgError('Database initialisation (initdb)', undefined);
  } finally {
    try {
      fs.rmSync(pwfile, { force: true });
    } catch {
      /* ignore */
    }
  }
}

/** Run pg_ctl with the given args, capturing output; resolves with the exit code. */
async function runPgCtl(args: string[]): Promise<number> {
  const exe = await getPgCtl();
  return new Promise((resolve) => {
    const child = spawn(exe, args, { windowsHide: true });
    child.stdout?.on('data', captureLog);
    child.stderr?.on('data', captureLog);
    child.on('error', (e) => {
      captureLog(String(e));
      resolve(-1);
    });
    child.on('exit', (code) => resolve(code ?? -1));
  });
}

/** Is a postmaster already serving this data directory? (pg_ctl status → 0 = running) */
async function serverRunning(dataDir: string): Promise<boolean> {
  return (await runPgCtl(['-D', dataDir, 'status'])) === 0;
}

/**
 * Start the embedded PostgreSQL for this install. On first run it initialises the data
 * directory (initdb); afterwards it just starts the existing cluster.
 *
 * IMPORTANT: the server is started via **pg_ctl**, not by spawning postgres.exe
 * directly (which is what embedded-postgres does). pg_ctl launches postgres with a
 * RESTRICTED token, so the app also works when launched from an elevated
 * (Administrator) shell — postgres.exe run directly refuses in that case.
 */
export async function startLocalDb(): Promise<void> {
  if (DB_MODE === 'docker') {
    await startDockerInfra();
    return;
  }
  const dataDir = pgDataDir();
  const initialised = fs.existsSync(path.join(dataDir, 'PG_VERSION'));

  // A partially-initialised data dir (folder exists but no PG_VERSION) makes initdb
  // fail with "directory not empty" forever — wipe it and start fresh.
  if (!initialised && fs.existsSync(dataDir)) {
    console.warn('[localdb] wiping partial data directory from a previous failed init');
    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  if (!initialised) {
    // Create the cluster with initdb from the UNPACKED binary (see runInitdb). The server
    // is started below via pg_ctl. We no longer use the embedded-postgres library at
    // runtime, so its packed-asar binary path can't break startup.
    fs.mkdirSync(dataDir, { recursive: true });
    await runInitdb(dataDir);
  }

  // Reuse a server left running by a previous unclean app exit; else start one.
  if (await serverRunning(dataDir)) {
    captureLog('reusing already-running local PostgreSQL');
  } else {
    const logFile = path.join(path.dirname(dataDir), 'pg.log');
    const code = await runPgCtl(['-D', dataDir, '-o', `-p ${PG_PORT}`, '-w', '-t', '60', '-l', logFile, 'start']);
    if (code !== 0) {
      try {
        captureLog(fs.readFileSync(logFile, 'utf8').split(/\r?\n/).slice(-25).join('\n'));
      } catch {
        /* no server log yet */
      }
      throw pgError('PostgreSQL start', undefined);
    }
  }

  // Ensure the app database exists and is flagged as a sync "node" (the enqueue trigger
  // records local changes to the outbox only on nodes; the cloud never sets this).
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { Client } = require('pg');
  const admin = new Client({ host: '127.0.0.1', port: PG_PORT, user: PG_USER, password: PG_PASSWORD, database: 'postgres' });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
    if (!exists.rows.length) {
      // Explicit UTF-8 from template0 — correct even if the cluster was initialised
      // with a legacy Windows codepage by an older build.
      await admin.query(`CREATE DATABASE "${DB_NAME}" ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`);
    }
    await admin.query(`ALTER DATABASE "${DB_NAME}" SET sync.role = 'node'`);
  } finally {
    await admin.end().catch(() => undefined);
  }
}

export async function stopLocalDb(): Promise<void> {
  // Docker infra is the developer's shared stack — never stop it on app exit.
  if (DB_MODE === 'docker') return;
  try {
    await runPgCtl(['-D', pgDataDir(), '-m', 'fast', '-w', '-t', '30', 'stop']);
  } catch {
    /* ignore shutdown races */
  }
}

// ─── Docker mode (existing docker-compose Postgres + Redis) ──────────────────

/** Run a command, capturing output into the log ring; resolves with the exit code. */
function runCmd(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true, cwd: parentRoot() });
    child.stdout?.on('data', captureLog);
    child.stderr?.on('data', captureLog);
    child.on('error', (e) => {
      captureLog(String(e));
      resolve(-1);
    });
    child.on('exit', (code) => resolve(code ?? -1));
  });
}

/**
 * Bring up the repo's docker-compose postgres + redis and wait until Postgres accepts
 * connections. The app database is ensured but NOT provisioned here — in docker mode
 * the data typically comes from an imported cloud dump (npm run import:dump).
 */
async function startDockerInfra(): Promise<void> {
  const composeFile = path.join(parentRoot(), 'docker-compose.yml');
  captureLog(`docker mode: compose up postgres+redis (${composeFile})`);
  const up = await runCmd('docker', ['compose', '-f', composeFile, 'up', '-d', 'postgres', 'redis']);
  if (up !== 0) {
    throw pgError('Docker infrastructure start (is Docker Desktop running?)', undefined);
  }

  // Wait for Postgres to accept connections (fresh containers need a few seconds).
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { Client } = require('pg');
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const probe = new Client({ host: '127.0.0.1', port: DOCKER_PG_PORT, user: PG_USER, password: PG_PASSWORD, database: 'postgres', connectionTimeoutMillis: 2000 });
      await probe.connect();
      await probe.end();
      break;
    } catch (err) {
      if (Date.now() > deadline) throw pgError('Docker PostgreSQL did not become ready', err);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // Ensure the app database exists (UTF8), then flag it as a sync node.
  const admin = new Client({ host: '127.0.0.1', port: DOCKER_PG_PORT, user: PG_USER, password: PG_PASSWORD, database: 'postgres' });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
    if (!exists.rows.length) {
      await admin.query(`CREATE DATABASE "${DB_NAME}" ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`);
    }
    await admin.query(`ALTER DATABASE "${DB_NAME}" SET sync.role = 'node'`);
  } finally {
    await admin.end().catch(() => undefined);
  }
}

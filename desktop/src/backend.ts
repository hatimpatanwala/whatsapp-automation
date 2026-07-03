import { app } from 'electron';
import { spawn, execSync, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import { backendEntry, frontendDir } from './paths';
import { LOCAL_PORT, PG_PORT, PG_USER, PG_PASSWORD, DB_NAME, DB_MODE, DOCKER_PG_PORT, DOCKER_REDIS_PORT, CLOUD_API_URL } from './config';
import { getSecrets } from './secrets';

let child: ChildProcess | null = null;

/** Tail of the backend's output — attached to startup errors for diagnosis. */
const outputTail: string[] = [];
function remember(chunk: unknown, stream: NodeJS.WriteStream): void {
  const text = String(chunk);
  stream.write(`[backend] ${text}`);
  for (const line of text.split(/\r?\n/)) {
    const l = line.trim();
    if (!l) continue;
    outputTail.push(l);
    if (outputTail.length > 40) outputTail.shift();
  }
}

/**
 * Resolve the ABSOLUTE path of the system Node executable for dev runs. Electron
 * patches child_process.fork, and spawning a bare 'node' from the Electron main
 * process is unreliable — always use a full path.
 */
export function systemNodeExe(): string {
  return systemNode();
}

function systemNode(): string {
  if (process.env.DESKTOP_NODE && fs.existsSync(process.env.DESKTOP_NODE)) return process.env.DESKTOP_NODE;
  try {
    const found = execSync(process.platform === 'win32' ? 'where node' : 'which node', { encoding: 'utf8' })
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)[0];
    if (found && fs.existsSync(found)) return found;
  } catch {
    /* fall through */
  }
  throw new Error('Could not find the Node.js executable (needed to run the local backend in dev). Install Node or set DESKTOP_NODE.');
}

export function backendEnv(): NodeJS.ProcessEnv {
  const secrets = getSecrets();
  const docker = DB_MODE === 'docker';
  return {
    ...process.env,
    NODE_ENV: 'production',
    DESKTOP_MODE: '1',
    PORT: String(LOCAL_PORT),
    // Local database: embedded PG on its private port, or the docker-compose stack on
    // the standard ports. Docker mode also has a real Redis, so queues work.
    DB_HOST: '127.0.0.1',
    DB_PORT: String(docker ? DOCKER_PG_PORT : PG_PORT),
    DB_USERNAME: PG_USER,
    DB_PASSWORD: PG_PASSWORD,
    DB_NAME,
    ...(docker ? { REDIS_HOST: '127.0.0.1', REDIS_PORT: String(DOCKER_REDIS_PORT) } : {}),
    // Serve the SPA from the local backend so cookies are same-origin.
    SERVE_STATIC_DIR: frontendDir(),
    CORS_ORIGIN: `http://127.0.0.1:${LOCAL_PORT}`,
    // Per-install persisted secrets — the desktop has no .env, so every required
    // backend secret must be provided here (PlatformConfigService hard-fails without
    // a stable 32+ char TOKEN_ENCRYPTION_KEY).
    SESSION_SECRET: secrets.sessionSecret,
    TOKEN_ENCRYPTION_KEY: secrets.tokenEncryptionKey,
    SYNC_LOCAL_KEY: secrets.syncLocalKey,
    // Online-first login: the local backend tries this cloud /auth/login first and
    // mirrors accepted credentials locally (offline cache). See AuthService.
    DESKTOP_CLOUD_API: CLOUD_API_URL,
  };
}

/**
 * Spawn the compiled backend and resolve once it answers /health.
 *
 * Uses plain spawn with an absolute executable path — NOT fork(): Electron patches
 * fork/execPath and the child can silently never start. Dev runs use system Node
 * (native modules are built for its ABI); packaged runs use Electron's own binary
 * with ELECTRON_RUN_AS_NODE.
 */
export async function startBackend(): Promise<void> {
  const packaged = app.isPackaged;
  const env = { ...backendEnv() };
  const exe = packaged ? process.execPath : systemNode();
  if (packaged) env.ELECTRON_RUN_AS_NODE = '1';
  console.log(`[backend] spawning: ${exe} ${backendEntry()}`);

  child = spawn(exe, [backendEntry()], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let exited: { code: number | null } | null = null;
  let spawnError: Error | null = null;
  child.stdout?.on('data', (d) => remember(d, process.stdout));
  child.stderr?.on('data', (d) => remember(d, process.stderr));
  child.on('error', (e) => {
    spawnError = e;
    console.error('[backend] spawn error:', e.message);
  });
  child.on('exit', (code) => {
    exited = { code };
    if (code && code !== 0) console.error(`[backend] exited with code ${code}`);
    child = null;
  });

  await waitForHealth(LOCAL_PORT, 90_000, () => {
    if (spawnError) return `The backend process could not be started: ${spawnError.message}`;
    if (exited) return `The backend exited early (code ${exited.code}).\n\nLast output:\n${outputTail.slice(-15).join('\n')}`;
    return null;
  });
}

export function stopBackend(): void {
  if (child) {
    child.kill();
    child = null;
  }
}

/**
 * Poll GET /health until it answers, the process dies (fail fast via checkDead),
 * or the timeout elapses — the timeout error carries the output tail.
 */
function waitForHealth(port: number, timeoutMs: number, checkDead: () => string | null): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const dead = checkDead();
      if (dead) return reject(new Error(dead));
      const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) return resolve();
        retry();
      });
      req.on('error', retry);
      req.on('timeout', () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() > deadline) {
        return reject(
          new Error(
            `Backend did not become healthy in time.\n\nLast backend output:\n${outputTail.slice(-15).join('\n') || '(none — the process produced no output)'}`,
          ),
        );
      }
      setTimeout(tick, 500);
    };
    tick();
  });
}

import { app } from 'electron';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { parentRoot, stateFile } from './paths';
import { backendEnv, systemNodeExe } from './backend';
import { DEFAULT_TENANT } from './config';

const MARKER = '.provisioned';

export function isProvisioned(): boolean {
  return fs.existsSync(stateFile(MARKER));
}

/**
 * First-run provisioning: fork the compiled provisioning CLI (dist/provision-cli.js),
 * which runs public + tenant migrations and creates the single local tenant. Works in
 * dev (system Node) and packaged (Electron's Node) with no ts-node/npm dependency.
 */
export async function provision(onStep?: (label: string) => void): Promise<void> {
  onStep?.('Setting up your company (first run)…');

  const packaged = app.isPackaged;
  const env: NodeJS.ProcessEnv = {
    ...backendEnv(),
    TENANT_NAME: DEFAULT_TENANT.name,
    TENANT_SLUG: DEFAULT_TENANT.slug,
    OWNER_EMAIL: DEFAULT_TENANT.ownerEmail,
    OWNER_PHONE: DEFAULT_TENANT.ownerPhone,
    OWNER_PASSWORD: DEFAULT_TENANT.ownerPassword,
    // Desktop distributors get the full ERP feature set (ERP endpoints are plan-gated).
    TENANT_PLAN: 'enterprise',
  };
  if (packaged) env.ELECTRON_RUN_AS_NODE = '1';

  const entry = path.join(parentRoot(), 'dist', 'provision-cli.js');
  // Plain spawn with an absolute executable — Electron's patched fork/execPath is
  // unreliable (see backend.ts).
  const exe = packaged ? process.execPath : systemNodeExe();

  await new Promise<void>((resolve, reject) => {
    const child = spawn(exe, [entry], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.stdout?.on('data', (d) => process.stdout.write(`[provision] ${d}`));
    child.stderr?.on('data', (d) => process.stderr.write(`[provision] ${d}`));
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`provisioning exited with ${code}`))));
  });

  fs.mkdirSync(path.dirname(stateFile(MARKER)), { recursive: true });
  fs.writeFileSync(stateFile(MARKER), new Date().toISOString());
}

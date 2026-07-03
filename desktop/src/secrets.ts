import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { stateFile } from './paths';

export interface DesktopSecrets {
  /** Encrypts Meta tokens at rest (PlatformConfigService requires 32+ chars, stable). */
  tokenEncryptionKey: string;
  /** Signs the local session cookies. */
  sessionSecret: string;
  /** Authorises the desktop relay's calls to the local backend's /sync endpoints. */
  syncLocalKey: string;
}

let cached: DesktopSecrets | null = null;

/**
 * Per-install secrets, generated once on first run and persisted in appData. The
 * desktop must be env-self-sufficient — the backend requires these and there is no
 * .env on a distributor's machine. tokenEncryptionKey MUST remain stable across
 * restarts (values encrypted with it live in the local DB).
 */
export function getSecrets(): DesktopSecrets {
  if (cached) return cached;
  const file = stateFile('secrets.json');
  try {
    const loaded = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<DesktopSecrets>;
    if (loaded.tokenEncryptionKey && loaded.sessionSecret && loaded.syncLocalKey) {
      cached = loaded as DesktopSecrets;
      return cached;
    }
  } catch {
    /* first run */
  }
  const fresh: DesktopSecrets = {
    tokenEncryptionKey: randomBytes(32).toString('hex'),
    sessionSecret: randomBytes(32).toString('hex'),
    syncLocalKey: randomBytes(24).toString('hex'),
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(fresh, null, 2));
  cached = fresh;
  return fresh;
}

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Baileys auth state persisted in Postgres (public.whatsapp_personal_sessions),
 * encrypted at rest. These creds/keys are LOGIN-EQUIVALENT for the tenant's
 * WhatsApp — a leak = account takeover — so both blobs are AES-256-GCM encrypted
 * with a key derived from the app secret. Unlike useMultiFileAuthState (node-local
 * files that die on restart / break multi-node), this survives restarts and is
 * visible to every node.
 *
 * Baileys is loaded dynamically (ESM-only) so the app compiles/boots even if the
 * dependency is absent — the caller degrades gracefully.
 */

// ── AES-256-GCM at rest ──────────────────────────────────────────────────────
function encKey(secret: string): Buffer {
  return createHash('sha256').update(String(secret || 'insecure-dev-key')).digest();
}

export function encryptBlob(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encKey(secret), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptBlob(payload: string, secret: string): string {
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', encKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

// ── Auth store ───────────────────────────────────────────────────────────────
export interface StoredAuth {
  creds: string; // encrypted JSON (BufferJSON)
  keys: string;  // encrypted JSON (BufferJSON) of the signal key map
}

/** Persist callback signature the session manager provides (DB upsert). */
export type SaveAuth = (auth: StoredAuth) => Promise<void>;

/**
 * Build a Baileys AuthenticationState backed by the DB. `baileys` is the
 * dynamically-imported module; `stored` is the decrypted-then-loaded blobs or null.
 */
export function makeDbAuthState(baileys: any, stored: StoredAuth | null, secret: string, save: SaveAuth) {
  const { initAuthCreds, BufferJSON, proto } = baileys;

  const creds = stored?.creds
    ? JSON.parse(decryptBlob(stored.creds, secret), BufferJSON.reviver)
    : initAuthCreds();

  // keys map: `${type}-${id}` → value
  const keys: Record<string, any> = stored?.keys
    ? JSON.parse(decryptBlob(stored.keys, secret), BufferJSON.reviver)
    : {};

  const persist = () =>
    save({
      creds: encryptBlob(JSON.stringify(creds, BufferJSON.replacer), secret),
      keys: encryptBlob(JSON.stringify(keys, BufferJSON.replacer), secret),
    });

  const state = {
    creds,
    keys: {
      get: (type: string, ids: string[]) => {
        const data: Record<string, any> = {};
        for (const id of ids) {
          let value = keys[`${type}-${id}`];
          if (type === 'app-state-sync-key' && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(value);
          }
          data[id] = value;
        }
        return data;
      },
      set: (data: Record<string, Record<string, any>>) => {
        for (const type in data) {
          for (const id in data[type]) {
            const value = data[type][id];
            const k = `${type}-${id}`;
            if (value) keys[k] = value;
            else delete keys[k];
          }
        }
        // Fire-and-forget; creds.update/saveCreds also persists.
        void persist();
      },
    },
  };

  return { state, saveCreds: persist };
}

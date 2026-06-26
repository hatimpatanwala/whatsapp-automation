// One-off: re-subscribe staging WABA(s) with a per-WABA override_callback_uri so
// their webhooks route to staging (the shared Meta app's app-level callback
// points at prod). Run INSIDE the staging backend container:
//   docker exec -i wa-staging-backend node < deploy/resubscribe-staging-webhook.js
const { Client } = require('pg');
const crypto = require('crypto');

(async () => {
  const encKeyRaw = process.env.TOKEN_ENCRYPTION_KEY;
  const callback = process.env.WEBHOOK_CALLBACK_URL;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const ver = process.env.META_GRAPH_API_VERSION || 'v21.0';
  if (!encKeyRaw || !callback) {
    console.log('Missing TOKEN_ENCRYPTION_KEY or WEBHOOK_CALLBACK_URL'); process.exit(1);
  }
  const key = crypto.createHash('sha256').update(encKeyRaw).digest();

  const c = new Client({
    host: process.env.DB_HOST, port: +(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await c.connect();

  // Every WABA that has an active token + at least one phone number.
  const rows = (await c.query(
    `SELECT DISTINCT w.waba_id, t.encrypted_token
       FROM public.waba_accounts w
       JOIN public.meta_tokens t ON t.waba_account_id = w.id AND t.is_active = true
      WHERE EXISTS (SELECT 1 FROM public.phone_numbers p WHERE p.waba_account_id = w.id)
      ORDER BY w.waba_id`,
  )).rows;

  if (!rows.length) { console.log('No WABAs with tokens + phones found.'); await c.end(); return; }

  for (const { waba_id, encrypted_token } of rows) {
    try {
      const [ivH, tagH, enc] = encrypted_token.split(':');
      const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivH, 'hex'));
      d.setAuthTag(Buffer.from(tagH, 'hex'));
      let tok = d.update(enc, 'hex', 'utf8'); tok += d.final('utf8');

      const res = await fetch(`https://graph.facebook.com/${ver}/${waba_id}/subscribed_apps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ override_callback_uri: callback, verify_token: verifyToken }),
      });
      const data = await res.json().catch(() => ({}));
      console.log(`WABA ${waba_id} -> HTTP ${res.status} ${JSON.stringify(data)}`);
    } catch (e) {
      console.log(`WABA ${waba_id} -> ERROR ${e.message}`);
    }
  }
  await c.end();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });

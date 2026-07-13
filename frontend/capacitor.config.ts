import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Two shippable app variants from the same codebase, selected by the WA_VARIANT
 * env var at `cap` time:
 *   - WA_VARIANT=full (default) → "WA Commerce"     (WhatsApp Commerce + ERP + SFA)
 *   - WA_VARIANT=erp            → "WA Commerce ERP"  (ERP + Salesman app, no WhatsApp)
 *
 * The web assets are built separately per variant (`ng build -c mobile` /
 * `-c mobile-erp`), which bakes the `environment.whatsapp` flag + the absolute
 * cloud apiUrl into the bundle. See MOBILE.md.
 */
const variant = (process.env.WA_VARIANT || 'full').toLowerCase();
const erp = variant === 'erp';

/**
 * Live auto-update: when WA_LIVE_URL is set, the app loads the SPA straight from
 * the server, so every server deploy updates the app UI/logic with no re-install
 * (the Capacitor native bridge — push, notifications — still works over the
 * remote page). Leave it unset to ship a fully-bundled offline build instead.
 */
const liveUrl = process.env.WA_LIVE_URL || 'https://staging-whatsappdemo.duckdns.org';

const config: CapacitorConfig = {
  appId: erp ? 'com.wacommerce.erp' : 'com.wacommerce.app',
  appName: erp ? 'WA Commerce ERP' : 'WA Commerce',
  webDir: 'dist/wa-commerce/browser',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    ...(liveUrl ? { url: liveUrl } : {}),
  },
  plugins: {
    // Splash/keyboard defaults are fine; add plugin config here as needed.
  },
};

export default config;

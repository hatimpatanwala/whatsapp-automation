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

const config: CapacitorConfig = {
  appId: erp ? 'com.wacommerce.erp' : 'com.wacommerce.app',
  appName: erp ? 'WA Commerce ERP' : 'WA Commerce',
  webDir: 'dist/wa-commerce/browser',
  // Bundle the SPA and hit the cloud API over https (apiUrl in the mobile env).
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
  plugins: {
    // Splash/keyboard defaults are fine; add plugin config here as needed.
  },
};

export default config;

/**
 * Headless-Chromium page fetcher — OPT-IN, OFF BY DEFAULT, never a hard dependency.
 *
 * Why this exists and why it is disabled by default:
 *   Prod runs on a RAM-constrained (2 GB) box. A headless Chromium tab can eat
 *   150–400 MB, so leaving this on could OOM-kill the whole Node process and take
 *   the app down. Enabling browser fetching is therefore an OPS DECISION, not a
 *   code default. It turns on ONLY when BOTH are true:
 *     1. config MARKET_BROWSER_ENABLED === 'true', AND
 *     2. playwright (or playwright-core) + a Chromium binary are present in the image.
 *
 * Safety guarantees baked in here:
 *   - DYNAMIC import: if playwright isn't installed the module still compiles and the
 *     app still boots. It simply reports isEnabled() === false and fetchHtml() → null.
 *   - LAZY SINGLETON browser: launched on first fetch, reused, closed on close().
 *   - CONCURRENCY GUARD: at most ONE page/tab open at a time (internal promise chain),
 *     because the box can afford exactly one Chromium tab.
 *   - Every fetch opens a fresh incognito context and ALWAYS closes it in a finally
 *     (memory guard — no leaked contexts).
 *   - NEVER throws: any failure is swallowed, logged once with a [browser-fetch] tag,
 *     and returns null.
 *
 * This file intentionally does NOT list playwright in package.json — installing the
 * dependency + Chromium into the image is handled at deploy time.
 */

// playwright is an optional/absent dependency, so we type it as `any` and load it
// dynamically. This keeps the file compiling with no @types/playwright present.
type AnyBrowser = any;
type AnyModule = any;

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--single-process',
  '--no-zygote',
];

const REALISTIC_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

export interface FetchOpts {
  waitForSelector?: string;
  timeoutMs?: number;
}

export class BrowserFetcher {
  private readonly enabled: boolean;

  /** Flips to false permanently if playwright can't be loaded / a launch fails hard. */
  private available = true;

  /** Lazily launched, reused across fetches, closed on close(). */
  private browser: AnyBrowser | null = null;

  /** Cached dynamic-import result so we import at most once. null once we've decided it's absent. */
  private pw: AnyModule | undefined;

  /**
   * Serialises every fetch into a single promise chain so at most ONE page/tab is
   * ever open at a time. The box can afford exactly one Chromium tab.
   */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(enabled: boolean) {
    // enabled reflects MARKET_BROWSER_ENABLED === 'true' (decided by the caller).
    this.enabled = enabled === true;
  }

  /** false if disabled by config OR playwright is not installable in this image. */
  isEnabled(): boolean {
    return this.enabled && this.available;
  }

  /**
   * Fetch fully-rendered HTML for a URL, or null on any failure / when disabled.
   * Concurrency-guarded: runs serially, never more than one tab at a time.
   */
  async fetchHtml(url: string, opts?: FetchOpts): Promise<string | null> {
    if (!this.isEnabled()) return null;

    // Queue behind whatever is currently running so only one page exists at a time.
    const run = this.chain.then(() => this.doFetch(url, opts));
    // Keep the chain alive even if this fetch rejects (it won't — doFetch never throws).
    this.chain = run.catch(() => undefined);
    return run;
  }

  /** Actual fetch. Never throws — returns null on any error. */
  private async doFetch(url: string, opts?: FetchOpts): Promise<string | null> {
    if (!this.isEnabled()) return null;

    const timeoutMs = opts?.timeoutMs || 15000;

    let context: any = null;
    try {
      const browser = await this.ensureBrowser();
      if (!browser) return null;

      context = await browser.newContext({
        userAgent: REALISTIC_UA,
        locale: 'en-IN',
        viewport: { width: 1366, height: 768 },
      });

      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

      if (opts?.waitForSelector) {
        // Best-effort: don't fail the whole fetch if the selector never appears.
        await page.waitForSelector(opts.waitForSelector, { timeout: 6000 }).catch(() => {});
      }

      const html = await page.content();
      return typeof html === 'string' ? html : null;
    } catch (err) {
      console.warn(`[browser-fetch] fetch failed for ${url}: ${(err as Error)?.message || err}`);
      return null;
    } finally {
      // MEMORY GUARD: always tear down the context so nothing leaks.
      if (context) {
        try {
          await context.close();
        } catch (err) {
          console.warn(`[browser-fetch] context close failed: ${(err as Error)?.message || err}`);
        }
      }
    }
  }

  /** Lazily load playwright and launch the singleton browser. Returns null if unavailable. */
  private async ensureBrowser(): Promise<AnyBrowser | null> {
    if (!this.available) return null;
    if (this.browser) return this.browser;

    const pw = await this.loadPlaywright();
    if (!pw || !pw.chromium) {
      this.available = false;
      console.warn('[browser-fetch] playwright/chromium not available — disabling browser fetch');
      return null;
    }

    try {
      // On Alpine the system Chromium is used (Playwright's bundled build is glibc-only);
      // PLAYWRIGHT_CHROMIUM_PATH points at it. Elsewhere, let Playwright find its own.
      const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
      this.browser = await pw.chromium.launch({ headless: true, args: LAUNCH_ARGS, executablePath });
      // If the browser dies underneath us, drop the reference so the next fetch relaunches.
      this.browser.on?.('disconnected', () => {
        this.browser = null;
      });
      return this.browser;
    } catch (err) {
      this.available = false;
      console.warn(`[browser-fetch] chromium launch failed — disabling: ${(err as Error)?.message || err}`);
      return null;
    }
  }

  /**
   * Dynamic, catch-guarded import so the app compiles + boots even with playwright absent.
   * Tries 'playwright' first, then 'playwright-core'. Caches the result (including null).
   */
  private async loadPlaywright(): Promise<AnyModule | null> {
    if (this.pw !== undefined) return this.pw;

    const mod: AnyModule = await import('playwright').catch(() =>
      import('playwright-core').catch(() => null),
    );

    // Some bundlers wrap CJS default exports; unwrap chromium if it hides under .default.
    const resolved = mod && !mod.chromium && mod.default ? mod.default : mod;
    this.pw = resolved || null;
    return this.pw;
  }

  /** Close the singleton browser if it was launched. Idempotent, never throws. */
  async close(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    if (!browser) return;
    try {
      await browser.close();
    } catch (err) {
      console.warn(`[browser-fetch] browser close failed: ${(err as Error)?.message || err}`);
    }
  }
}

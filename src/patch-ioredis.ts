/**
 * Desktop offline mode has no Redis; BullMQ/ioredis retry localhost:6379 and dump an
 * AggregateError [ECONNREFUSED] stack on every attempt, drowning the console. In
 * DESKTOP_MODE we drop exactly those messages (queue-backed features are cloud-only).
 * Imported BEFORE any other module in main.ts / provision-cli.ts.
 */
if (process.env.DESKTOP_MODE === '1') {
  const isRedisConnRefused = (arg: unknown): boolean => {
    // ioredis logs both raw AggregateErrors and pre-formatted strings
    // ("[ioredis] Unhandled error event: …"); the desktop has no Redis at all, so any
    // ECONNREFUSED console noise here is by definition the absent Redis.
    if (typeof arg === 'string') return arg.includes('ECONNREFUSED') || arg.includes('[ioredis]');
    if (!arg || typeof arg !== 'object') return false;
    const err = arg as { code?: string; stack?: string };
    if (err.code === 'ECONNREFUSED') return true;
    return typeof err.stack === 'string' && err.stack.includes('ECONNREFUSED');
  };

  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (args.some(isRedisConnRefused)) return;
    originalError(...args);
  };
}

export {};

// @ts-nocheck — OpenTelemetry packages are optional dependencies
/**
 * OpenTelemetry initialization.
 * Must be imported BEFORE any other module in main.ts:
 *   import './telemetry';
 *
 * Env vars:
 *   OTEL_ENABLED=true          — enable tracing
 *   OTEL_ENDPOINT=http://...   — OTLP collector endpoint
 *   OTEL_SERVICE_NAME=whatsapp-commerce-api
 */

const isEnabled = process.env.OTEL_ENABLED === 'true';

if (isEnabled) {
  // Dynamic import to avoid loading SDK when disabled
  (async () => {
    try {
      const { NodeSDK } = await import('@opentelemetry/sdk-node');
      const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');
      const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');

      const sdk = new NodeSDK({
        traceExporter: new OTLPTraceExporter({
          url: process.env.OTEL_ENDPOINT || 'http://localhost:4318/v1/traces',
        }),
        instrumentations: [
          getNodeAutoInstrumentations({
            '@opentelemetry/instrumentation-http': { enabled: true },
            '@opentelemetry/instrumentation-express': { enabled: true },
            '@opentelemetry/instrumentation-pg': { enabled: true },
            '@opentelemetry/instrumentation-ioredis': { enabled: true },
          }),
        ],
        serviceName: process.env.OTEL_SERVICE_NAME || 'whatsapp-commerce-api',
      });

      sdk.start();
      console.log('OpenTelemetry tracing initialized');

      process.on('SIGTERM', () => sdk.shutdown());
    } catch (err) {
      console.warn('OpenTelemetry initialization failed (optional dependency):', (err as Error).message);
    }
  })();
}

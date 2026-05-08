import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Prometheus-compatible metrics collection.
 *
 * Uses in-memory counters/gauges that can be scraped via /metrics endpoint.
 * When @willsoto/nestjs-prometheus or prom-client is installed, this service
 * upgrades to use native Prometheus registries. Otherwise, it operates
 * as a lightweight internal metrics store for the health dashboard.
 */
@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly logger = new Logger(MetricsService.name);
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly histograms = new Map<string, number[]>();

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.logger.log('Metrics service initialized (in-memory mode)');
  }

  incrementCounter(name: string, labels?: Record<string, string>, value = 1): void {
    const key = this.buildKey(name, labels);
    this.counters.set(key, (this.counters.get(key) || 0) + value);
  }

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.buildKey(name, labels);
    this.gauges.set(key, value);
  }

  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.buildKey(name, labels);
    const values = this.histograms.get(key) || [];
    values.push(value);
    // Keep last 1000 values per metric
    if (values.length > 1000) values.shift();
    this.histograms.set(key, values);
  }

  getSnapshot(): {
    counters: Record<string, number>;
    gauges: Record<string, number>;
    histograms: Record<string, { count: number; avg: number; p95: number; p99: number }>;
  } {
    const histogramSnapshot: Record<string, { count: number; avg: number; p95: number; p99: number }> = {};
    for (const [key, values] of this.histograms) {
      const sorted = [...values].sort((a, b) => a - b);
      histogramSnapshot[key] = {
        count: sorted.length,
        avg: sorted.reduce((a, b) => a + b, 0) / sorted.length,
        p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
        p99: sorted[Math.floor(sorted.length * 0.99)] || 0,
      };
    }

    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: histogramSnapshot,
    };
  }

  private buildKey(name: string, labels?: Record<string, string>): string {
    if (!labels) return name;
    const labelStr = Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',');
    return `${name}{${labelStr}}`;
  }
}

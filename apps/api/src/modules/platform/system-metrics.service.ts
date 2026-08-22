import { Injectable } from '@nestjs/common';

/**
 * What this process has been asked to do lately (§2.17).
 *
 * Request rate, latency and error rate are the three numbers that say whether
 * the API is healthy, and none of them are visible from outside: CloudWatch can
 * see the machine but not what the application did, and the database can see
 * neither. So the process measures itself.
 *
 * Held in memory on purpose. These are operational vitals with a fifteen-minute
 * horizon, not an audit trail — the audit log already covers what must survive
 * a restart. Writing a row per request to Postgres to answer "what is the p95
 * right now" would make the platform slower in exactly the conditions the
 * question gets asked in.
 *
 * The consequence, which the console states rather than hides: a restart resets
 * the window, and with more than one API instance each reports only its own
 * traffic.
 */

/** How far back the window reaches. */
const WINDOW_MS = 15 * 60_000;

/**
 * Hard cap on retained samples, so a burst cannot grow this without bound.
 * At 4,000 requests/minute the window self-trims to roughly the last five
 * minutes rather than the full fifteen — degrading the range, never the
 * memory. Each sample is three numbers and a short string.
 */
const MAX_SAMPLES = 20_000;

interface Sample {
  at: number;
  ms: number;
  status: number;
}

export interface ApiMetrics {
  windowMinutes: number;
  /** True once the cap has been hit, i.e. the window is shorter than it says. */
  truncated: boolean;
  since: string | null;
  requests: number;
  requestsPerMinute: number;
  errors: { total: number; client: number; server: number; rate: number };
  responseTime: { p50: number; p95: number; p99: number; max: number } | null;
  /** Status families present in the window, e.g. { '2xx': 412, '4xx': 3 }. */
  byStatusFamily: Record<string, number>;
  /** Uptime of this process, which bounds how much history can exist. */
  processUptimeSeconds: number;
}

@Injectable()
export class SystemMetricsService {
  private samples: Sample[] = [];
  /** Set once the cap forces the oldest samples out. */
  private trimmed = false;

  record(ms: number, status: number): void {
    const at = Date.now();
    this.samples.push({ at, ms, status });
    if (this.samples.length > MAX_SAMPLES) {
      this.samples.splice(0, this.samples.length - MAX_SAMPLES);
      this.trimmed = true;
    }
  }

  snapshot(): ApiMetrics {
    const cutoff = Date.now() - WINDOW_MS;
    // Samples are appended in time order, so the expired ones are a prefix.
    const firstLive = this.samples.findIndex((s) => s.at >= cutoff);
    this.samples =
      firstLive <= 0 ? this.samples : this.samples.slice(firstLive);
    const live = this.samples.filter((s) => s.at >= cutoff);

    const uptime = Math.round(process.uptime());
    if (live.length === 0) {
      return {
        windowMinutes: WINDOW_MS / 60_000,
        truncated: false,
        since: null,
        requests: 0,
        requestsPerMinute: 0,
        errors: { total: 0, client: 0, server: 0, rate: 0 },
        responseTime: null,
        byStatusFamily: {},
        processUptimeSeconds: uptime,
      };
    }

    const durations = live.map((s) => s.ms).sort((a, b) => a - b);
    const client = live.filter((s) => s.status >= 400 && s.status < 500).length;
    const server = live.filter((s) => s.status >= 500).length;

    const byStatusFamily: Record<string, number> = {};
    for (const s of live) {
      const family = `${Math.floor(s.status / 100)}xx`;
      byStatusFamily[family] = (byStatusFamily[family] ?? 0) + 1;
    }

    // The window is only as old as the oldest sample or the process, whichever
    // is younger — a two-minute-old process cannot have fifteen minutes of data,
    // and dividing by fifteen would understate the rate fivefold.
    const oldest = live[0].at;
    const spanMinutes = Math.max(
      (Date.now() - oldest) / 60_000,
      1 / 60, // never divide by ~zero on a burst inside one second
    );

    return {
      windowMinutes: WINDOW_MS / 60_000,
      truncated: this.trimmed,
      since: new Date(oldest).toISOString(),
      requests: live.length,
      requestsPerMinute: round(live.length / spanMinutes),
      errors: {
        total: client + server,
        client,
        server,
        rate: round(((client + server) / live.length) * 100),
      },
      responseTime: {
        p50: percentile(durations, 50),
        p95: percentile(durations, 95),
        p99: percentile(durations, 99),
        max: durations[durations.length - 1],
      },
      byStatusFamily,
      processUptimeSeconds: uptime,
    };
  }
}

/** Nearest-rank percentile over an ascending array. */
function percentile(sorted: number[], p: number): number {
  const rank = Math.ceil((p / 100) * sorted.length);
  return round(sorted[Math.min(Math.max(rank, 1) - 1, sorted.length - 1)]);
}

const round = (n: number) => Math.round(n * 10) / 10;

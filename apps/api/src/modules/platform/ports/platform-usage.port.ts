/** One point on a usage chart. */
export interface UsagePoint {
  /** ISO date (day granularity). */
  date: string;
  value: number;
}

export interface UsageMetric {
  key: string;
  label: string;
  /** Current value, in `unit`. */
  value: number;
  unit: 'bytes' | 'count' | 'ms' | 'percent';
  /** Daily history for the chart, oldest first. Empty when unavailable. */
  series: UsagePoint[];
  /** Where the number came from, shown in the console so it is never guessed at. */
  origin: string;
}

export interface UsageSnapshot {
  /** Backend name, surfaced in the UI ('database' or 'cloudwatch'). */
  source: string;
  /** Human-readable note about what these numbers are and are not. */
  note: string;
  metrics: UsageMetric[];
}

/**
 * Infrastructure usage port (§2.6 pattern).
 *
 * Adapters:
 *   - DatabaseUsageAdapter — the default. Reports what the platform can measure
 *     about itself: database size, media bytes, exam and request volume. These
 *     are real numbers, not estimates.
 *   - CloudWatchUsageAdapter — activates once AWS is provisioned and credentials
 *     exist, adding the infrastructure-side metrics the database cannot see.
 *
 * Infrastructure is the client's responsibility (§4/§14), so the platform has to
 * report something truthful before any AWS account exists.
 */
export abstract class PlatformUsagePort {
  abstract readonly name: string;
  abstract snapshot(days: number): Promise<UsageSnapshot>;
}

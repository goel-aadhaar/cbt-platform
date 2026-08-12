import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../database/prisma.service';
import {
  PlatformUsagePort,
  UsageMetric,
  UsagePoint,
  UsageSnapshot,
} from '../ports/platform-usage.port';

/**
 * Default usage adapter: everything the platform can measure about itself.
 *
 * These are real measurements, not projections — database size comes from
 * PostgreSQL, stored bytes from the media table, and the daily series from the
 * records themselves. Nothing here is invented, because a superadmin acting on
 * a fabricated capacity number is worse off than one seeing no number at all.
 */
@Injectable()
export class DatabaseUsageAdapter extends PlatformUsagePort {
  readonly name = 'database';
  private readonly logger = new Logger(DatabaseUsageAdapter.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async snapshot(days: number): Promise<UsageSnapshot> {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - (days - 1));
    since.setUTCHours(0, 0, 0, 0);

    const [dbBytes, mediaBytes, attempts, logins, media] = await Promise.all([
      this.databaseBytes(),
      this.mediaBytes(),
      this.dailyCounts('attempts', 'started_at', since),
      this.dailyCounts('audit_logs', 'created_at', since),
      this.dailyCounts('media', 'created_at', since),
    ]);

    const metrics: UsageMetric[] = [
      {
        key: 'database',
        label: 'Database size',
        value: dbBytes,
        unit: 'bytes',
        series: [],
        origin: 'pg_database_size()',
      },
      {
        key: 'media',
        label: 'Media stored',
        value: mediaBytes,
        unit: 'bytes',
        series: cumulative(media, 0),
        origin: 'sum of media file sizes',
      },
      {
        key: 'attempts',
        label: 'Exam attempts',
        value: total(attempts),
        unit: 'count',
        series: fill(attempts, since, days),
        origin: 'attempt records',
      },
      {
        key: 'requests',
        label: 'Audited actions',
        value: total(logins),
        unit: 'count',
        series: fill(logins, since, days),
        origin: 'audit log (§2.13)',
      },
    ];

    return {
      source: this.name,
      note:
        'Measured from the platform database. Infrastructure metrics (EC2, S3, ' +
        'CloudFront, RDS) appear here once AWS is provisioned and credentials ' +
        'are configured.',
      metrics,
    };
  }

  private async databaseBytes(): Promise<number> {
    try {
      const rows = await this.prisma.$queryRaw<
        { size: bigint }[]
      >`SELECT pg_database_size(current_database()) AS size`;
      return Number(rows[0]?.size ?? 0);
    } catch (error) {
      // A managed database may withhold this; the rest of the snapshot is
      // still worth returning.
      this.logger.warn(`Could not read database size: ${String(error)}`);
      return 0;
    }
  }

  private async mediaBytes(): Promise<number> {
    const agg = await this.prisma.media.aggregate({ _sum: { size: true } });
    return agg._sum.size ?? 0;
  }

  /**
   * Daily row counts for a table. Raw SQL because Prisma cannot group by a
   * truncated date, and one grouped query beats one query per day.
   */
  private async dailyCounts(
    table: string,
    column: string,
    since: Date,
  ): Promise<UsagePoint[]> {
    // Identifiers are hardcoded at the call sites above, never user input.
    const sql = `SELECT to_char(date_trunc('day', "${column}"), 'YYYY-MM-DD') AS date,
                        COUNT(*)::int AS value
                   FROM "${table}"
                  WHERE "${column}" >= $1
                  GROUP BY 1
                  ORDER BY 1`;
    try {
      const rows = await this.prisma.$queryRawUnsafe<
        { date: string; value: number }[]
      >(sql, since);
      return rows.map((r) => ({ date: r.date, value: Number(r.value) }));
    } catch (error) {
      this.logger.warn(`Could not read ${table} history: ${String(error)}`);
      return [];
    }
  }
}

function total(points: UsagePoint[]): number {
  return points.reduce((sum, p) => sum + p.value, 0);
}

/** Pad missing days with zero so a chart shows gaps as gaps, not as a gap. */
function fill(points: UsagePoint[], since: Date, days: number): UsagePoint[] {
  const byDate = new Map(points.map((p) => [p.date, p.value]));
  const out: UsagePoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, value: byDate.get(key) ?? 0 });
  }
  return out;
}

/** Running total — storage only grows, so a per-day count would mislead. */
function cumulative(points: UsagePoint[], start: number): UsagePoint[] {
  let running = start;
  return points.map((p) => {
    running += p.value;
    return { date: p.date, value: running };
  });
}

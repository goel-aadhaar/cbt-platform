import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DatabaseUsageAdapter } from './database-usage.adapter';
import {
  PlatformUsagePort,
  UsageMetric,
  UsagePoint,
  UsageSnapshot,
} from '../ports/platform-usage.port';

/** CloudWatch metrics worth showing a superadmin, kept small on purpose. */
const METRICS: {
  key: string;
  label: string;
  namespace: string;
  metricName: string;
  unit: UsageMetric['unit'];
  statistic: 'Average' | 'Sum' | 'Maximum';
}[] = [
  {
    key: 'cpu',
    label: 'EC2 CPU utilisation',
    namespace: 'AWS/EC2',
    metricName: 'CPUUtilization',
    unit: 'percent',
    statistic: 'Average',
  },
  {
    key: 's3-bytes',
    label: 'S3 bucket size',
    namespace: 'AWS/S3',
    metricName: 'BucketSizeBytes',
    unit: 'bytes',
    statistic: 'Maximum',
  },
  {
    key: 'cdn-requests',
    label: 'CloudFront requests',
    namespace: 'AWS/CloudFront',
    metricName: 'Requests',
    unit: 'count',
    statistic: 'Sum',
  },
  {
    key: 'rds-connections',
    label: 'RDS connections',
    namespace: 'AWS/RDS',
    metricName: 'DatabaseConnections',
    unit: 'count',
    statistic: 'Average',
  },
];

/**
 * AWS usage adapter — active once CloudWatch is reachable.
 *
 * Layers infrastructure metrics on top of the database ones rather than
 * replacing them: a superadmin wants tenant volume and machine load side by
 * side. Any metric CloudWatch cannot answer is dropped rather than zero-filled,
 * so a missing metric never reads as an idle one.
 *
 * The SDK is loaded lazily through an indirect specifier so the package stays
 * an optional dependency (same approach as S3MediaAdapter). Install
 * `@aws-sdk/client-cloudwatch` and set AWS_REGION + credentials to activate.
 */
@Injectable()
export class CloudWatchUsageAdapter extends PlatformUsagePort {
  readonly name = 'cloudwatch';
  private readonly logger = new Logger(CloudWatchUsageAdapter.name);
  private client: unknown = null;

  constructor(
    private readonly config: ConfigService,
    private readonly database: DatabaseUsageAdapter,
  ) {
    super();
  }

  async snapshot(days: number): Promise<UsageSnapshot> {
    const base = await this.database.snapshot(days);
    const aws = await this.awsMetrics(days);

    if (aws.length === 0) {
      return {
        ...base,
        note:
          'AWS is configured but CloudWatch returned no metrics. Showing ' +
          'database measurements only — check the region and IAM permissions.',
      };
    }

    return {
      source: this.name,
      note: 'Infrastructure metrics from CloudWatch, alongside platform measurements.',
      metrics: [...aws, ...base.metrics],
    };
  }

  private async awsMetrics(days: number): Promise<UsageMetric[]> {
    const sdk = await this.load();
    if (!sdk) return [];

    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - days);

    const out: UsageMetric[] = [];
    for (const m of METRICS) {
      try {
        const { GetMetricStatisticsCommand } = sdk as {
          GetMetricStatisticsCommand: new (input: unknown) => unknown;
        };
        const command = new GetMetricStatisticsCommand({
          Namespace: m.namespace,
          MetricName: m.metricName,
          StartTime: start,
          EndTime: end,
          Period: 86400,
          Statistics: [m.statistic],
        });
        const client = this.client as {
          send: (c: unknown) => Promise<{
            Datapoints?: { Timestamp?: Date; [k: string]: unknown }[];
          }>;
        };
        const res = await client.send(command);
        const points: UsagePoint[] = (res.Datapoints ?? [])
          .map((d) => ({
            date: (d.Timestamp ?? new Date()).toISOString().slice(0, 10),
            value: Number(d[m.statistic] ?? 0),
          }))
          .sort((a, b) => a.date.localeCompare(b.date));

        // No datapoints means CloudWatch has nothing for this metric; showing
        // it as zero would claim the resource is idle rather than unmonitored.
        if (points.length === 0) continue;

        out.push({
          key: m.key,
          label: m.label,
          value: points[points.length - 1].value,
          unit: m.unit,
          series: points,
          origin: `CloudWatch ${m.namespace}/${m.metricName}`,
        });
      } catch (error) {
        this.logger.warn(`CloudWatch ${m.metricName} failed: ${String(error)}`);
      }
    }
    return out;
  }

  private async load(): Promise<Record<string, unknown> | null> {
    if (this.client) return this.cached;
    try {
      // Indirect specifier: keeps the bundler/compiler from requiring the
      // optional package at build time.
      const specifier = '@aws-sdk/client-cloudwatch';
      const sdk = (await import(specifier)) as Record<string, unknown>;
      const CloudWatchClient = sdk.CloudWatchClient as new (
        cfg: unknown,
      ) => unknown;
      this.client = new CloudWatchClient({
        region: this.config.get<string>('AWS_REGION') ?? 'ap-south-1',
      });
      this.cached = sdk;
      return sdk;
    } catch {
      this.logger.warn(
        'AWS usage requested but @aws-sdk/client-cloudwatch is not installed.',
      );
      return null;
    }
  }

  private cached: Record<string, unknown> | null = null;
}

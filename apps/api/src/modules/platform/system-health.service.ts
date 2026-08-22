import { statfs } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { Injectable, Logger } from '@nestjs/common';

import { ApiMetrics, SystemMetricsService } from './system-metrics.service';

/**
 * The box this API is running on, measured from inside it.
 *
 * A deliberate choice of source. CloudWatch reports EC2 CPU without any agent,
 * but memory and disk are NOT in the default EC2 metric set — they need the
 * CloudWatch agent installed and publishing to a custom namespace, which is
 * infrastructure the client owns and may not have. Reading them from the host
 * needs nothing, works on any machine, and is the same number the agent would
 * publish. So the host is the primary source, and CloudWatch stays where it is
 * genuinely better: aggregate views across instances, S3, and CloudFront, which
 * a single process cannot see.
 *
 * Everything that cannot be measured comes back null. Nothing here is
 * estimated, and an unavailable metric never renders as a zero.
 */

/** How long to watch the CPU for. Long enough to be meaningful, short enough
 *  that a monitoring page still feels instant. */
const CPU_SAMPLE_MS = 200;

export interface SystemHealth {
  host: {
    platform: string;
    release: string;
    hostname: string;
    uptimeSeconds: number;
    cpu: {
      cores: number;
      model: string | null;
      /** Percent busy across all cores over the sample window. */
      utilisationPercent: number;
      /** Unix load averages; all zero on Windows, which reports none. */
      loadAverage: [number, number, number] | null;
    };
    memory: {
      totalBytes: number;
      freeBytes: number;
      usedBytes: number;
      usedPercent: number;
    };
    /** Null where the platform cannot answer statfs. */
    disk: {
      path: string;
      totalBytes: number;
      freeBytes: number;
      usedBytes: number;
      usedPercent: number;
    } | null;
  };
  process: {
    pid: number;
    nodeVersion: string;
    uptimeSeconds: number;
    memory: { rssBytes: number; heapUsedBytes: number; heapTotalBytes: number };
  };
  api: ApiMetrics;
}

@Injectable()
export class SystemHealthService {
  private readonly logger = new Logger(SystemHealthService.name);

  constructor(private readonly metrics: SystemMetricsService) {}

  async snapshot(): Promise<SystemHealth> {
    const [cpu, disk] = await Promise.all([this.cpu(), this.disk()]);

    const totalBytes = os.totalmem();
    const freeBytes = os.freemem();
    const mem = process.memoryUsage();

    return {
      host: {
        platform: os.platform(),
        release: os.release(),
        hostname: os.hostname(),
        uptimeSeconds: Math.round(os.uptime()),
        cpu,
        memory: {
          totalBytes,
          freeBytes,
          usedBytes: totalBytes - freeBytes,
          usedPercent: pct(totalBytes - freeBytes, totalBytes),
        },
        disk,
      },
      process: {
        pid: process.pid,
        nodeVersion: process.version,
        uptimeSeconds: Math.round(process.uptime()),
        memory: {
          rssBytes: mem.rss,
          heapUsedBytes: mem.heapUsed,
          heapTotalBytes: mem.heapTotal,
        },
      },
      api: this.metrics.snapshot(),
    };
  }

  /**
   * CPU busy-percentage from two readings of the kernel's cumulative counters.
   *
   * `os.loadavg()` would be cheaper but means nothing on Windows (always zero)
   * and is a queue length rather than a percentage anywhere else, so it is
   * reported alongside rather than instead.
   */
  private async cpu(): Promise<SystemHealth['host']['cpu']> {
    const before = os.cpus();
    await new Promise((r) => setTimeout(r, CPU_SAMPLE_MS));
    const after = os.cpus();

    let idle = 0;
    let total = 0;
    for (let i = 0; i < Math.min(before.length, after.length); i++) {
      const a = before[i].times;
      const b = after[i].times;
      idle += b.idle - a.idle;
      total +=
        b.user -
        a.user +
        (b.nice - a.nice) +
        (b.sys - a.sys) +
        (b.irq - a.irq) +
        (b.idle - a.idle);
    }

    const load = os.loadavg();
    return {
      cores: after.length,
      model: after[0]?.model?.trim() ?? null,
      utilisationPercent: total > 0 ? pct(total - idle, total) : 0,
      // A platform that reports no load average reports zeros, which would read
      // as a genuinely idle machine. Say "unavailable" instead.
      loadAverage:
        load[0] === 0 && load[1] === 0 && load[2] === 0
          ? null
          : [round(load[0]), round(load[1]), round(load[2])],
    };
  }

  /** Free space on the volume holding the app, or null if unsupported. */
  private async disk(): Promise<SystemHealth['host']['disk']> {
    const target = path.parse(process.cwd()).root || process.cwd();
    try {
      const fs = await statfs(target);
      const totalBytes = fs.blocks * fs.bsize;
      // `bavail` (available to an unprivileged user) rather than `bfree`, which
      // includes the reserved blocks this process cannot actually write to.
      const freeBytes = fs.bavail * fs.bsize;
      if (totalBytes <= 0) return null;
      return {
        path: target,
        totalBytes,
        freeBytes,
        usedBytes: totalBytes - freeBytes,
        usedPercent: pct(totalBytes - freeBytes, totalBytes),
      };
    } catch (err) {
      this.logger.debug(
        `Disk usage unavailable for ${target}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      return null;
    }
  }
}

const round = (n: number) => Math.round(n * 100) / 100;
const pct = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;

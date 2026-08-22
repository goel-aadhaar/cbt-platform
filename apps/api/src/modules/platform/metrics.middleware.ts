import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { SystemMetricsService } from './system-metrics.service';

/**
 * Times every request and hands the result to SystemMetricsService.
 *
 * Middleware rather than an interceptor, because Nest runs guards *after*
 * middleware but *before* interceptors: an interceptor never sees a request the
 * auth or throttle guard rejected, so 401s, 403s and 429s — the failures most
 * worth watching — would be invisible in the error rate. `res.on('finish')`
 * fires for all of them, and for 404s that never reach a controller at all.
 *
 * The health checks exclude themselves. A load balancer polling `/health` every
 * few seconds would otherwise dominate the window and flatter every number in
 * it: thousands of trivial requests that always succeed, drowning out the real
 * traffic the page exists to show.
 */
@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: SystemMetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    if (req.path.startsWith('/api/health')) return next();

    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      this.metrics.record(Math.round(ms * 10) / 10, res.statusCode);
    });
    next();
  }
}

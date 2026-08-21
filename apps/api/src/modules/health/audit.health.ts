import { Injectable } from '@nestjs/common';
import {
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';

import { AuditService } from '../audit/audit.service';

/**
 * Readiness probe for the audit trail's integrity.
 *
 * Audit writes are deliberately best-effort — a failure there must never fail a
 * candidate's submission — but that made a hole in the trail invisible: the
 * action succeeded, no row was written, and nothing said so. An audited action
 * that leaves no record is indistinguishable from one that never happened,
 * which is precisely what an audit trail exists to prevent.
 *
 * Reporting the failure count here turns that into something a monitor can see.
 * It reports **down** once any write has failed, because a partially-written
 * trail is a compliance problem even while the rest of the app is fine — this
 * is `/health/ready`, not liveness, so it does not take the process out of
 * service.
 */
@Injectable()
export class AuditHealthIndicator {
  constructor(
    private readonly audit: AuditService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  isHealthy(key: string): HealthIndicatorResult {
    const indicator = this.healthIndicatorService.check(key);
    const { count, last } = this.audit.getWriteFailures();
    if (count === 0) return indicator.up({ writeFailures: 0 });
    return indicator.down({
      writeFailures: count,
      lastFailure: last,
      message: `${count} audit write(s) have failed since boot — the trail has gaps`,
    });
  }
}

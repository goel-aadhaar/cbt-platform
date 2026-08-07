import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate limiting keyed by CALLER, not by IP address.
 *
 * The stock ThrottlerGuard buckets requests by `req.ip`. That is actively wrong
 * for this platform: in a real examination every candidate in a computer lab
 * sits behind the institute's single NAT address, so a 200-seat hall looks like
 * ONE client. The whole hall would share a single 120/min budget and be mass-429'd
 * the instant the exam opens (200 simultaneous `POST /attempts`), and again on
 * every auto-save. Bucketing authenticated traffic by the bearer token instead
 * gives each candidate their own budget, which is what the limit is actually for.
 *
 * Anonymous traffic (login, accept-invite) still buckets by IP — that is exactly
 * where per-IP limiting earns its keep, against credential brute-forcing.
 *
 * Note this is application-level abuse control, not DDoS protection: volumetric
 * attacks belong behind the load balancer / WAF. An attacker rotating fake
 * bearer tokens gets a fresh bucket per token, but every one of those requests
 * is rejected by JwtAuthGuard anyway.
 */
@Injectable()
export class CandidateThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const headers = req.headers as Record<string, unknown> | undefined;
    const authorization = headers?.authorization;

    if (
      typeof authorization === 'string' &&
      authorization.startsWith('Bearer ')
    ) {
      // Hash the token so raw credentials never become cache keys.
      const digest = createHash('sha256')
        .update(authorization.slice('Bearer '.length))
        .digest('hex');
      return Promise.resolve(`user:${digest}`);
    }

    const ip = typeof req.ip === 'string' ? req.ip : 'unknown';
    return Promise.resolve(`ip:${ip}`);
  }
}

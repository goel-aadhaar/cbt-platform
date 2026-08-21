import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService } from '@nestjs/terminus';

import { AuditHealthIndicator } from './audit.health';
import { DatabaseHealthIndicator } from './database.health';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  const healthCheckService = { check: jest.fn() };
  const database = { isHealthy: jest.fn() };
  const auditTrail = { isHealthy: jest.fn() };

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheckService },
        { provide: DatabaseHealthIndicator, useValue: database },
        { provide: AuditHealthIndicator, useValue: auditTrail },
      ],
    }).compile();

    controller = moduleRef.get(HealthController);
    jest.clearAllMocks();
  });

  it('liveness runs an empty check set', () => {
    void controller.liveness();
    expect(healthCheckService.check).toHaveBeenCalledWith([]);
  });

  /**
   * Readiness covers the database *and* the audit trail.
   *
   * The audit indicator is here because audit writes are deliberately
   * best-effort — a failure must never fail a candidate's submission — which
   * previously meant a hole in the trail was completely silent. Reporting the
   * failure count in readiness is what makes it observable.
   */
  it('readiness checks both the database and the audit trail', () => {
    void controller.readiness();
    expect(healthCheckService.check).toHaveBeenCalledTimes(1);
    const indicators = healthCheckService.check.mock
      .calls[0][0] as (() => unknown)[];
    expect(Array.isArray(indicators)).toBe(true);
    expect(indicators).toHaveLength(2);

    // Run them to prove each is wired to its own indicator rather than the
    // same one twice — a length check alone would not catch that.
    indicators.forEach((fn) => fn());
    expect(database.isHealthy).toHaveBeenCalledWith('database');
    expect(auditTrail.isHealthy).toHaveBeenCalledWith('auditTrail');
  });
});

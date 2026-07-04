import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService } from '@nestjs/terminus';

import { DatabaseHealthIndicator } from './database.health';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  const healthCheckService = { check: jest.fn() };
  const database = { isHealthy: jest.fn() };

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheckService },
        { provide: DatabaseHealthIndicator, useValue: database },
      ],
    }).compile();

    controller = moduleRef.get(HealthController);
    jest.clearAllMocks();
  });

  it('liveness runs an empty check set', () => {
    controller.liveness();
    expect(healthCheckService.check).toHaveBeenCalledWith([]);
  });

  it('readiness includes exactly one (database) indicator', () => {
    controller.readiness();
    expect(healthCheckService.check).toHaveBeenCalledTimes(1);
    const indicators = healthCheckService.check.mock.calls[0][0] as unknown[];
    expect(Array.isArray(indicators)).toBe(true);
    expect(indicators).toHaveLength(1);
  });
});

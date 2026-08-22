import { SystemMetricsService } from './system-metrics.service';

/**
 * The numbers an operator would act on: how much traffic, how slow, how much of
 * it failed. Each of these is easy to get quietly wrong in a way that reads as
 * "healthy" — a percentile off by one bucket, an error rate that forgets 5xx,
 * a rate divided by the nominal window instead of the elapsed one.
 */
describe('SystemMetricsService', () => {
  let metrics: SystemMetricsService;

  beforeEach(() => {
    metrics = new SystemMetricsService();
  });

  it('reports nothing rather than zeroes before any traffic', () => {
    const snap = metrics.snapshot();

    expect(snap.requests).toBe(0);
    // Null, not 0 — a p95 of zero would read as an impossibly fast API.
    expect(snap.responseTime).toBeNull();
    expect(snap.since).toBeNull();
  });

  it('separates client faults from server faults', () => {
    metrics.record(10, 200);
    metrics.record(10, 404);
    metrics.record(10, 403);
    metrics.record(10, 500);

    const { errors } = metrics.snapshot();

    expect(errors.client).toBe(2);
    expect(errors.server).toBe(1);
    expect(errors.total).toBe(3);
    expect(errors.rate).toBe(75);
  });

  it('counts a rejected request, not just a handled one', () => {
    // The whole reason this is middleware rather than an interceptor: a 401
    // from the auth guard never reaches a controller, and an error rate that
    // cannot see them is the one that looks best during an outage.
    metrics.record(2, 401);
    metrics.record(2, 429);

    expect(metrics.snapshot().errors.total).toBe(2);
  });

  it('puts percentiles on the right samples', () => {
    // 1..100ms: the 50th value is 50, the 95th is 95, the 99th is 99.
    for (let i = 1; i <= 100; i++) metrics.record(i, 200);

    const rt = metrics.snapshot().responseTime!;

    expect(rt.p50).toBe(50);
    expect(rt.p95).toBe(95);
    expect(rt.p99).toBe(99);
    expect(rt.max).toBe(100);
  });

  it('is not skewed by the order requests arrived in', () => {
    for (const ms of [900, 5, 40, 12, 3]) metrics.record(ms, 200);

    const rt = metrics.snapshot().responseTime!;

    expect(rt.max).toBe(900);
    // One slow request out of five must not drag the median up with it.
    expect(rt.p50).toBe(12);
  });

  it('groups statuses by family', () => {
    metrics.record(1, 201);
    metrics.record(1, 204);
    metrics.record(1, 404);
    metrics.record(1, 503);

    expect(metrics.snapshot().byStatusFamily).toEqual({
      '2xx': 2,
      '4xx': 1,
      '5xx': 1,
    });
  });

  it('rates traffic against elapsed time, not the nominal window', () => {
    // Sixty requests that all arrived just now are 60/min-ish, not 4/min
    // (60 spread over a fifteen-minute window) — which is what dividing by the
    // window length would claim, understating a live spike by 15x.
    for (let i = 0; i < 60; i++) metrics.record(5, 200);

    expect(metrics.snapshot().requestsPerMinute).toBeGreaterThan(60);
  });

  it('drops samples that have aged out of the window', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    metrics.record(10, 500);

    jest.setSystemTime(new Date('2026-01-01T00:20:00Z'));
    metrics.record(10, 200);

    const snap = metrics.snapshot();
    expect(snap.requests).toBe(1);
    // The old failure must not still be inflating the error rate 20 minutes on.
    expect(snap.errors.total).toBe(0);

    jest.useRealTimers();
  });
});

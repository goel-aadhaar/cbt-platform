/**
 * Performance test (§2.17): "Approximately 50–200 concurrent users."
 *
 * Boots the real application and drives N concurrent candidates through the
 * heaviest realistic path — start the attempt, poll the exam state, auto-save
 * every answer, then submit — measuring per-request latency and error rate.
 *
 * Usage:
 *   pnpm --filter @drsk/api build
 *   CONCURRENCY=50 pnpm --filter @drsk/api test:load
 */
import globalSetup from '../support/global-setup';
import globalTeardown from '../support/global-teardown';
import { BASE_URL } from '../support/paths';
import {
  api,
  countInviteTokens,
  createApprovedQuestion,
  createPublishedExam,
  PASSWORD,
  setupTenant,
  waitForInviteTokens,
} from '../support/client';

const CONCURRENCY = Number(process.env.CONCURRENCY ?? 50);
const QUESTIONS = Number(process.env.QUESTIONS ?? 5);
/** In-flight cap while seeding candidates (argon2 is intentionally expensive). */
const SEED_CONCURRENCY = Number(process.env.SEED_CONCURRENCY ?? 8);
/** Roster rows per CSV import request while seeding (keeps each call bounded). */
const IMPORT_CHUNK = Number(process.env.IMPORT_CHUNK ?? 50);
/**
 * Optional latency gate. Left unset by default ON PURPOSE: absolute latency here
 * is dominated by the round-trip between wherever this runs and the database
 * (see the measured baseline in the report), so a fixed millisecond budget is
 * meaningless across environments. The hard gate is ZERO ERRORS. Set an explicit
 * budget when running against a production-like, co-located deployment.
 */
const P95_BUDGET_MS = process.env.P95_BUDGET_MS
  ? Number(process.env.P95_BUDGET_MS)
  : undefined;

interface Sample {
  label: string;
  ms: number;
  ok: boolean;
}

const samples: Sample[] = [];

async function timed<T>(
  label: string,
  fn: () => Promise<{ status: number; body: T }>,
): Promise<{ status: number; body: T }> {
  const startedAt = performance.now();
  const res = await fn();
  samples.push({
    label,
    ms: performance.now() - startedAt,
    ok: res.status >= 200 && res.status < 300,
  });
  return res;
}

/**
 * Runs `fn` over `items` with a bounded number in flight.
 *
 * Used for the SEEDING phase only. Accepting an invite and logging in both run
 * argon2id, which by design costs ~19 MiB and real CPU per call — firing all N
 * at once would stampede the hasher and measure nothing useful. The contract's
 * "50–200 concurrent users" (§2.17) means candidates *sitting the exam*, and the
 * exam path does no password hashing, so the measured phase stays unbounded.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

/** Prints the status-code spread of a concurrent batch, for diagnosis. */
function summarise(
  label: string,
  responses: { status: number; body: unknown }[],
): void {
  const counts = new Map<number, number>();
  for (const r of responses) {
    counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  }
  const spread = [...counts.entries()]
    .map(([status, n]) => `${status}×${n}`)
    .join(' ');
  console.log(`  ${label.padEnd(24)} ${spread}`);

  const failure = responses.find((r) => r.status >= 300);
  if (failure) {
    console.log(
      `    first failure: ${JSON.stringify(failure.body).slice(0, 200)}`,
    );
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  );
  return sorted[index];
}

/**
 * Median latency of the readiness probe, which performs exactly one trivial
 * database query. It is therefore a direct measure of the app→database
 * round-trip, and every figure in the report carries a multiple of it: a request
 * issuing N queries pays at least N × this. Reporting it makes the numbers
 * interpretable instead of environment-specific noise.
 */
async function measureDbRoundTrip(): Promise<number> {
  const samples: number[] = [];
  for (let i = 0; i < 7; i++) {
    const startedAt = performance.now();
    await fetch(`${BASE_URL}/api/health/ready`);
    samples.push(performance.now() - startedAt);
  }
  return percentile(samples, 50);
}

/** One virtual candidate sitting the whole exam. */
async function candidate(
  token: string,
  examId: string,
  questionIds: string[],
): Promise<void> {
  const start = await timed('POST /attempts', () =>
    api<{ id: string }>('/attempts', {
      method: 'POST',
      token,
      body: { examId },
    }),
  );
  const attemptId = start.body.id;
  if (!attemptId) return;

  // The client refreshes state on load / reconnection.
  await timed('GET /attempts/:id', () =>
    api(`/attempts/${attemptId}`, { token }),
  );

  // Auto-save: one write per answered question.
  for (const questionId of questionIds) {
    await timed('PUT /responses/:qid', () =>
      api(`/attempts/${attemptId}/responses/${questionId}`, {
        method: 'PUT',
        token,
        body: { answer: 'A' },
      }),
    );
  }

  await timed('GET /summary', () =>
    api(`/attempts/${attemptId}/summary`, { token }),
  );

  await timed('POST /submit', () =>
    api(`/attempts/${attemptId}/submit`, { method: 'POST', token }),
  );
}

async function main(): Promise<void> {
  console.log(
    `\nLoad test — ${CONCURRENCY} concurrent candidates, ${QUESTIONS} questions each\n`,
  );

  // The rate limiter is per-IP abuse protection (120 req/min by default). Every
  // virtual candidate here shares 127.0.0.1, so it would throttle the load test
  // itself — telling us nothing about real capacity, where candidates arrive
  // from distinct IPs. Raise it for this run; everything else is production
  // configuration. (Must be set before the app is spawned.)
  process.env.THROTTLE_LIMIT ??= '1000000';

  await globalSetup();

  try {
    console.log('Seeding fixture (institute, exam, students)…');
    const tenant = await setupTenant('load');

    const questionIds: string[] = [];
    for (let i = 0; i < QUESTIONS; i++) {
      questionIds.push(
        await createApprovedQuestion(tenant, {
          statement: `Load question ${i + 1}?`,
        }),
      );
    }

    const { examId } = await createPublishedExam(tenant, {
      title: 'Load Test Exam',
      durationMinutes: 180,
      questionIds,
    });

    // Bulk-create the candidates in ONE request (the CSV importer, §2.10),
    // then accept + log them all in concurrently — otherwise seeding N students
    // one-by-one would dwarf the measured phase.
    const rolls = Array.from(
      { length: CONCURRENCY },
      (_, i) => `LOAD${String(i + 1).padStart(4, '0')}`,
    );
    // The importer creates each student through the normal invitation flow, so a
    // roster costs O(rows) sequential database round-trips. That is fine in
    // production (~1ms per query) but at this RTT a single 200-row request would
    // exceed the HTTP timeout, so seed in chunks.
    const before = countInviteTokens();
    let importedCount = 0;

    for (let i = 0; i < rolls.length; i += IMPORT_CHUNK) {
      const chunk = rolls.slice(i, i + IMPORT_CHUNK);
      const csv = [
        'name,email,rollNumber',
        ...chunk.map(
          (roll) =>
            `Cand ${roll},${roll.toLowerCase()}-${tenant.suffix}@load.local,${roll}`,
        ),
      ].join('\n');

      const form = new FormData();
      form.append(
        'file',
        new Blob([csv], { type: 'text/csv' }),
        'students.csv',
      );
      const imported = await api<{ imported: unknown[]; failed: unknown[] }>(
        '/students/import',
        {
          method: 'POST',
          token: tenant.adminToken,
          query: { batchId: tenant.batchId },
          form,
        },
      );
      if (imported.status !== 201) {
        throw new Error(
          `Bulk import failed: ${imported.status} ${JSON.stringify(imported.body).slice(0, 300)}`,
        );
      }
      importedCount += imported.body.imported.length;
      console.log(`  seeded ${importedCount}/${CONCURRENCY} candidates`);
    }

    if (importedCount !== CONCURRENCY) {
      throw new Error(
        `Imported only ${importedCount}/${CONCURRENCY} candidates`,
      );
    }

    const inviteTokens = await waitForInviteTokens(before, CONCURRENCY);
    const accepts = await mapWithConcurrency(
      inviteTokens,
      SEED_CONCURRENCY,
      (token) =>
        api('/invitations/accept', {
          method: 'POST',
          body: { token, password: PASSWORD },
        }),
    );
    summarise('invitations/accept', accepts);

    const logins = await mapWithConcurrency(
      rolls,
      SEED_CONCURRENCY,
      (rollNumber) =>
        api<{ accessToken: string }>('/auth/student/login', {
          method: 'POST',
          body: {
            instituteSlug: tenant.slug,
            rollNumber,
            password: PASSWORD,
          },
        }),
    );
    summarise('auth/student/login', logins);

    const tokens = logins.map((r) => r.body?.accessToken).filter(Boolean);
    if (tokens.length !== CONCURRENCY) {
      throw new Error(
        `Only ${tokens.length}/${CONCURRENCY} candidates could log in`,
      );
    }

    const dbRoundTripMs = await measureDbRoundTrip();

    // ---- Measured phase: every candidate sits the exam at the same time ----
    console.log(`Running ${CONCURRENCY} candidates concurrently…\n`);
    const startedAt = performance.now();
    await Promise.all(
      tokens.map((token) => candidate(token, examId, questionIds)),
    );
    const wallMs = performance.now() - startedAt;

    report(wallMs, dbRoundTripMs);
  } finally {
    globalTeardown();
  }
}

function report(wallMs: number, dbRoundTripMs: number): void {
  const durations = samples.map((s) => s.ms);
  const failures = samples.filter((s) => !s.ok);

  const byLabel = new Map<string, number[]>();
  for (const s of samples) {
    byLabel.set(s.label, [...(byLabel.get(s.label) ?? []), s.ms]);
  }

  console.log('─'.repeat(72));
  console.log(
    `Concurrency        ${CONCURRENCY} candidates × ${QUESTIONS} questions`,
  );
  console.log(`Requests           ${samples.length}`);
  console.log(`Wall time          ${(wallMs / 1000).toFixed(1)}s`);
  console.log(
    `Throughput         ${(samples.length / (wallMs / 1000)).toFixed(1)} req/s`,
  );
  console.log(`Errors             ${failures.length}`);
  console.log(
    `DB round-trip      ${Math.round(dbRoundTripMs)} ms  ← every query pays this`,
  );
  if (dbRoundTripMs > 20) {
    console.log(
      `                   (app is remote from the database; co-located in\n` +
        `                    production this is ~1ms, so the latencies below are\n` +
        `                    dominated by network, not by the application)`,
    );
  }
  console.log('');
  console.log('Latency (ms)       p50      p95      p99      max');
  for (const [label, values] of byLabel) {
    console.log(
      `  ${label.padEnd(18)}${String(Math.round(percentile(values, 50))).padStart(5)}    ${String(
        Math.round(percentile(values, 95)),
      ).padStart(
        5,
      )}    ${String(Math.round(percentile(values, 99))).padStart(5)}    ${String(
        Math.round(Math.max(...values)),
      ).padStart(5)}`,
    );
  }
  const p95 = percentile(durations, 95);
  console.log(
    `  ${'ALL'.padEnd(18)}${String(Math.round(percentile(durations, 50))).padStart(5)}    ${String(
      Math.round(p95),
    ).padStart(
      5,
    )}    ${String(Math.round(percentile(durations, 99))).padStart(5)}    ${String(
      Math.round(Math.max(...durations)),
    ).padStart(5)}`,
  );
  console.log('─'.repeat(72));

  // The hard gate: the platform must not drop a single candidate request under
  // the contracted concurrency. Latency is only gated when a budget is supplied
  // (see P95_BUDGET_MS) because it is environment-dependent.
  const problems: string[] = [];
  if (failures.length > 0) {
    problems.push(`${failures.length} request(s) failed`);
    for (const f of failures.slice(0, 5)) {
      console.log(`  ✗ ${f.label}`);
    }
  }
  if (P95_BUDGET_MS !== undefined && p95 > P95_BUDGET_MS) {
    problems.push(
      `p95 ${Math.round(p95)}ms exceeds the ${P95_BUDGET_MS}ms budget`,
    );
  }

  if (problems.length > 0) {
    console.log(`\nFAIL — ${problems.join('; ')}\n`);
    process.exitCode = 1;
  } else {
    console.log(
      `\nPASS — ${CONCURRENCY} concurrent candidates, 0 errors ` +
        `(p95 ${Math.round(p95)}ms at a ${Math.round(dbRoundTripMs)}ms DB round-trip)\n`,
    );
  }
}

main().catch((err: unknown) => {
  console.error(err);
  globalTeardown();
  process.exit(1);
});

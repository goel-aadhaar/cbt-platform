import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { API_LOG_FILE, API_PID_FILE, API_PORT, TMP_DIR } from './paths';

/**
 * Real mail credentials in .env would otherwise reach the spawned API via
 * `dotenv-expand` (see app.module.ts's ENV_FILE_PATH comment) regardless of
 * what this process's own env sets, sending real mail through a live
 * Resend/SES account instead of logging OTP codes where the suite reads
 * them. Strip those three keys into a sanitized copy the child reads instead.
 */
function writeSanitizedEnvFile(packageRoot: string): {
  sanitizedPath: string;
  databaseUrl?: string;
} {
  const source = path.join(packageRoot, '.env');
  const sanitizedPath = path.join(TMP_DIR, 'api.env');
  const strippedKeys = [
    'RESEND_API_KEY',
    'RESEND_FROM_EMAIL',
    'AWS_SES_FROM_EMAIL',
  ];
  const lines = existsSync(source)
    ? readFileSync(source, 'utf8')
        .split('\n')
        .filter(
          (line) =>
            !strippedKeys.some((key) => line.trim().startsWith(`${key}=`)),
        )
    : [];
  writeFileSync(sanitizedPath, lines.join('\n'));

  const urlLine = lines.find((line) => line.trim().startsWith('DATABASE_URL='));
  const databaseUrl = urlLine
    ?.slice(urlLine.indexOf('=') + 1)
    .trim()
    .replace(/^["']|["']$/g, '');
  return { sanitizedPath, databaseUrl: databaseUrl || undefined };
}

/**
 * Wake the database before handing it to the app.
 *
 * Dev runs against serverless Postgres (Neon), whose compute suspends when
 * idle. Its proxy accepts the TCP connection immediately and only then stalls
 * while the compute wakes, so the driver's `connectionTimeoutMillis` — which
 * bounds *establishing* the connection, not the startup handshake that
 * follows — never fires. The app therefore hangs inside PrismaService's
 * onModuleInit `$connect()`, which sits before `bufferLogs` is flushed, so it
 * emits NOTHING and the suite fails with an empty api.log and an unexplained
 * health timeout (observed three times).
 *
 * Absorbing the wake-up here, against a connection the suite owns and can put
 * a real deadline on, means the app's own connect is always against warm
 * compute. Best-effort: a failure here is left for the app to report properly.
 */
async function warmDatabase(databaseUrl?: string): Promise<void> {
  if (!databaseUrl) return;
  const { Client } = await import('pg');
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 90_000,
  });
  try {
    await client.connect();
    await client.query('select 1');
  } catch {
    // Intentionally swallowed — see above.
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * Boots the REAL compiled application (dist/main.js) as a child process against
 * the real database, so the API suites exercise genuine end-to-end behaviour.
 *
 * Why a child process instead of Nest's in-process TestingModule: Prisma 7's
 * WASM query compiler cannot run inside Jest's CommonJS VM, which is why the
 * legacy e2e spec has to mock PrismaService entirely (and therefore tests
 * nothing real). Running the app out-of-process means Jest never imports Prisma
 * — it only speaks HTTP — so we get true integration coverage (§2.17).
 *
 * The app's stdout is teed to a log file because the dev mail adapter prints
 * invitation links there; the suites read the newest token to complete the
 * invite → set-password flow exactly as a real user would.
 */
export default async function globalSetup(): Promise<void> {
  const packageRoot = path.resolve(__dirname, '../..');
  const entry = path.join(packageRoot, 'dist', 'main.js');

  if (!existsSync(entry)) {
    throw new Error(
      `Cannot find ${entry}.\nBuild the app before running the API suite: pnpm --filter @drsk/api build`,
    );
  }

  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(API_LOG_FILE, '');
  const log = openSync(API_LOG_FILE, 'a');
  const { sanitizedPath: sanitizedEnvPath, databaseUrl } =
    writeSanitizedEnvFile(packageRoot);
  await warmDatabase(databaseUrl);

  const child = spawn(process.execPath, [entry], {
    cwd: packageRoot,
    env: {
      ...process.env,
      PORT: String(API_PORT),
      LOG_LEVEL: 'info',
      ENV_FILE_PATH: sanitizedEnvPath,
    },
    stdio: ['ignore', log, log],
    detached: false,
  });
  child.unref();

  if (child.pid === undefined) {
    throw new Error('Failed to spawn the API process');
  }
  writeFileSync(API_PID_FILE, String(child.pid));

  await waitForHealthy();
}

async function waitForHealthy(): Promise<void> {
  // Generous because the app still has its own Prisma connect, migrations
  // check and route registration to get through after warmDatabase().
  const deadline = Date.now() + 120_000;
  let lastError = 'no response';

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${API_PORT}/api/health`);
      if (res.ok) return;
      lastError = `status ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error(
    `API did not become healthy on port ${API_PORT} (last error: ${lastError}). See ${API_LOG_FILE}`,
  );
}

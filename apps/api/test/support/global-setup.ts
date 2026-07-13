import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { API_LOG_FILE, API_PID_FILE, API_PORT, TMP_DIR } from './paths';

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

  const child = spawn(process.execPath, [entry], {
    cwd: packageRoot,
    env: { ...process.env, PORT: String(API_PORT), LOG_LEVEL: 'info' },
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
  const deadline = Date.now() + 60_000;
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

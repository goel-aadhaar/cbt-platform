import { existsSync, readFileSync, rmSync } from 'node:fs';

import { API_PID_FILE } from './paths';

/** Stops the API process booted by global-setup. */
export default function globalTeardown(): void {
  if (!existsSync(API_PID_FILE)) return;

  const pid = Number(readFileSync(API_PID_FILE, 'utf8').trim());
  if (Number.isFinite(pid)) {
    try {
      process.kill(pid);
    } catch {
      // Already exited — nothing to clean up.
    }
  }
  rmSync(API_PID_FILE, { force: true });
}

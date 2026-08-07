/**
 * CI smoke test for the Postman collection: boots the app, then runs the whole
 * collection with newman end-to-end.
 *
 * In normal use the three "Accept Invite" steps need a token pasted from the API
 * console. To automate that here — and ONLY here — the runner:
 *   1. stands up a tiny broker that returns the latest invite token from the app
 *      log, and
 *   2. patches the three Accept steps IN MEMORY with a pre-request that fetches
 *      the token from the broker (pm.sendRequest, which newman's sandbox honors).
 * The shipped collection file is never modified; it stays manual-paste for
 * humans.
 *
 *   pnpm --filter @drsk/api build && node postman/smoke-run.js
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const newman = require('newman');

const PORT = 3056;
const BROKER_PORT = 3057;
const LOG = path.join(__dirname, 'smoke.log');
const collection = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'DRSK-CBT.postman_collection.json'),
    'utf8',
  ),
);

const TOKEN_STEP = {
  'Accept Admin Invite  ⟵ paste token first': 'adminInviteToken',
  'Accept Teacher Invite  ⟵ paste token first': 'teacherInviteToken',
  'Accept Student Invite  ⟵ paste token first': 'studentInviteToken',
};

const latestToken = () => {
  const text = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8') : '';
  const all = [...text.matchAll(/token=([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
  return all[all.length - 1] ?? '';
};

/** Patch the Accept steps to pull their token from the broker. */
function patchAcceptSteps(item) {
  for (const node of item) {
    if (node.item) patchAcceptSteps(node.item);
    const varName = TOKEN_STEP[node.name];
    if (varName) {
      node.event = node.event ?? [];
      node.event.push({
        listen: 'prerequest',
        script: {
          type: 'text/javascript',
          exec: [
            `pm.sendRequest('http://127.0.0.1:${BROKER_PORT}/token', function (err, res) {`,
            `  if (!err && res.code === 200) pm.variables.set('${varName}', res.json().token);`,
            `});`,
          ],
        },
      });
    }
  }
}
patchAcceptSteps(collection.item);

async function waitForHealth() {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok) return;
    } catch {
      /* not up */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('app did not become healthy');
}

async function main() {
  fs.writeFileSync(LOG, '');
  const app = spawn(
    process.execPath,
    [path.join(__dirname, '..', 'dist', 'main.js')],
    {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PORT: String(PORT), THROTTLE_LIMIT: '100000' },
      stdio: ['ignore', fs.openSync(LOG, 'a'), fs.openSync(LOG, 'a')],
    },
  );

  const broker = http
    .createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ token: latestToken() }));
    })
    .listen(BROKER_PORT);

  const shutdown = () => {
    app.kill();
    broker.close();
  };

  try {
    await waitForHealth();

    newman.run(
      {
        collection,
        environment: {
          values: [
            { key: 'baseUrl', value: `http://127.0.0.1:${PORT}` },
            { key: 'superEmail', value: 'superadmin@drsk.local' },
            { key: 'superPassword', value: 'ChangeMe123!' },
            { key: 'password', value: 'TestPass1234' },
            {
              key: 'studentRoll',
              value: 'PM' + Date.now().toString().slice(-6),
            },
          ],
        },
        reporters: ['cli'],
        reporterOptions: { cli: { noConsole: true, noBanner: true } },
        // Total-run budget: 90 requests over a ~230ms/query dev link to Neon,
        // plus the inter-request delay.
        timeout: 900000,
        timeoutRequest: 30000,
        // Let the app flush its log (where invite tokens appear) between steps.
        delayRequest: 350,
      },
      (err, summary) => {
        shutdown();
        if (err) {
          console.error(err);
          process.exit(1);
        }
        const s = summary.run.stats;
        const failures = summary.run.failures;
        console.log(
          `\nRequests ${s.requests.total}  ·  ` +
            `Assertions ${s.assertions.total - s.assertions.failed}/${s.assertions.total} passed  ·  ` +
            `Failures ${failures.length}`,
        );
        for (const f of failures) {
          console.log(
            `  ✗ [${f.source?.name ?? '?'}] ${f.error.test ?? f.error.message}`,
          );
        }
        process.exit(failures.length ? 1 : 0);
      },
    );
  } catch (e) {
    shutdown();
    throw e;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

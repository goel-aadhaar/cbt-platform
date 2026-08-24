/**
 * Production environment audit.
 *
 *     node apps/api/scripts/check-env.mjs
 *
 * Answers "is this deployment's configuration complete?" on the machine it runs
 * on, which is the only place that can answer it — the .env files are
 * gitignored and never leave the server.
 *
 * Two things it does that reading the files by eye does not:
 *
 *   1. It runs the API's OWN validator (dist/config/env.schema.js) rather than
 *      a second copy of the rules, so this cannot drift from what the app
 *      actually refuses to boot without.
 *   2. It checks the settings the schema deliberately treats as OPTIONAL but
 *      which quietly break a real deployment — an unset SES sender means every
 *      OTP goes to a log file nobody reads and no candidate can sign in, and a
 *      missing NEXT_PUBLIC_API_URL does not fail the build, it bakes
 *      "http://localhost:4000" into the bundle every visitor downloads.
 *
 * It prints key NAMES and verdicts only. No value is ever echoed, so the output
 * is safe to paste into an issue or a chat.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const errors = [];
const warnings = [];
const notes = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

/**
 * Minimal dotenv parse. Deliberately not a dependency: this has to run on a box
 * where `pnpm install` may be the very thing that is broken.
 */
function parseEnvFile(file) {
  if (!existsSync(file)) return null;
  const out = {};
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line
      .slice(0, eq)
      .trim()
      .replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

/** A host that is a raw IP literal rather than a name. */
const isIpLiteral = (host) =>
  /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[');

const urlOf = (value) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

console.log('='.repeat(72));
console.log('  Codonmind Nexus - environment audit');
console.log('='.repeat(72));

/* ============================== API ============================== */

const apiFile = parseEnvFile(join(ROOT, 'apps', 'api', '.env'));
if (!apiFile)
  fail('apps/api/.env does not exist - the API cannot start without it.');

// process.env wins over the file, matching @nestjs/config's own precedence.
const api = { ...(apiFile ?? {}), ...process.env };
const isProd = api.NODE_ENV === 'production';

console.log(
  `\napps/api/.env  ${apiFile ? `${Object.keys(apiFile).length} keys` : 'MISSING'}`,
);
console.log(`NODE_ENV       ${api.NODE_ENV ?? '(unset -> development)'}`);

/* The app's own validator - the authoritative required-key list. */
const schemaPath = join(ROOT, 'apps', 'api', 'dist', 'config', 'env.schema.js');
if (!existsSync(schemaPath)) {
  warn(
    'apps/api/dist is not built, so the required-key check was SKIPPED. Run ' +
      '`pnpm --filter @drsk/api build` and re-run this for a complete answer.',
  );
} else if (apiFile) {
  const { validateEnv } = await import(pathToFileURL(schemaPath).href);
  try {
    validateEnv(api);
    notes.push('every variable the API requires to boot is present and valid');
  } catch (err) {
    // The validator's message already names each offending key and why.
    const lines = String(err.message)
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('•'));
    if (lines.length) {
      for (const l of lines) fail(`apps/api/.env ${l.slice(1).trim()}`);
    } else {
      fail(String(err.message).trim());
    }
  }
}

/* ---- settings the schema allows to be absent but a deployment cannot ---- */

const frontendUrl = api.FRONTEND_URL;
if (!frontendUrl) {
  if (isProd) {
    fail(
      'FRONTEND_URL is unset, so it defaults to http://localhost:3000 and every ' +
        "invite and password-reset email links to the recipient's own machine.",
    );
  }
} else {
  const u = urlOf(frontendUrl);
  if (u && isIpLiteral(u.hostname)) {
    fail(
      `FRONTEND_URL points at the raw IP ${u.hostname}. Email links built from it ` +
        'read as phishing, cannot be served over TLS, and stop working the moment ' +
        'the instance is replaced. Set it to the public domain.',
    );
  } else if (u && u.protocol === 'http:' && isProd) {
    fail(
      'FRONTEND_URL is http://. Invite and reset links carry a single-use ' +
        'credential in the URL; over cleartext anyone on the path can spend it first.',
    );
  }
}

if (isProd && !api.AWS_SES_FROM_EMAIL) {
  fail(
    'AWS_SES_FROM_EMAIL is unset. MailService falls back to the console adapter, ' +
      'so OTP codes and invite links are written to the API log and never sent - ' +
      'nobody can sign in or accept an invitation.',
  );
}

if (isProd && !api.AWS_S3_BUCKET) {
  warn(
    "AWS_S3_BUCKET is unset, so uploaded media sits on this instance's local " +
      'disk. Question diagrams survive a restart but not a redeploy onto a fresh ' +
      'instance, and a second instance could not serve them.',
  );
}

if (isProd && !api.CORS_ORIGINS) {
  warn(
    'CORS_ORIGINS is empty, so the API rejects every cross-origin browser ' +
      'request. Harmless while nginx serves the app and the API on ONE origin; ' +
      'fatal the moment the app moves to its own hostname.',
  );
}

if (isProd && api.ENABLE_API_DOCS === 'true') {
  warn(
    'ENABLE_API_DOCS=true publishes unauthenticated Swagger UI in production - ' +
      'the complete route list, every DTO and every validation rule.',
  );
}

if (isProd && (api.LOG_LEVEL === 'debug' || api.LOG_LEVEL === 'trace')) {
  warn(
    `LOG_LEVEL=${api.LOG_LEVEL} in production is noisy and logs request detail.`,
  );
}

const dbUrl = api.DATABASE_URL ? urlOf(api.DATABASE_URL) : null;
if (isProd && dbUrl && /^(localhost|127\.0\.0\.1)$/.test(dbUrl.hostname)) {
  warn(
    'DATABASE_URL points at localhost - confirm that is really intended here.',
  );
}

/* ============================== WEB ============================== */

/**
 * Next's own precedence for a production build, highest first. Every file that
 * exists contributes; the first to define a key wins.
 */
const webFiles = [
  '.env.production.local',
  '.env.local',
  '.env.production',
  '.env',
].map((name) => ({
  name,
  values: parseEnvFile(join(ROOT, 'apps', 'web', name)),
}));
const present = webFiles.filter((f) => f.values);
const web = {};
for (const f of present) {
  for (const [k, v] of Object.entries(f.values)) if (!(k in web)) web[k] = v;
}

console.log(
  `apps/web       ${present.length ? present.map((f) => f.name).join(', ') : 'NO env file'}`,
);

if (!present.length) {
  fail(
    'apps/web has no .env file. NEXT_PUBLIC_API_URL then falls back to ' +
      'http://localhost:4000/api/v1, which is baked into the bundle and points ' +
      "every visitor's browser at their own machine. The build will NOT fail.",
  );
}

const apiUrlRaw = web.NEXT_PUBLIC_API_URL;
if (present.length && !apiUrlRaw) {
  fail(
    'NEXT_PUBLIC_API_URL is not set. It falls back to http://localhost:4000/api/v1 ' +
      'at BUILD time and ships that to every browser without failing the build.',
  );
} else if (apiUrlRaw) {
  const u = urlOf(apiUrlRaw);
  if (!u) {
    fail('NEXT_PUBLIC_API_URL is not a valid URL.');
  } else {
    if (!u.pathname.replace(/\/$/, '').endsWith('/api/v1')) {
      fail(
        'NEXT_PUBLIC_API_URL must include the /api/v1 suffix - the client appends ' +
          'bare paths to it, so without the prefix every call 404s.',
      );
    }
    // http is correct and expected for a localhost dev box; only a deployed
    // origin carrying real credentials over cleartext is a defect.
    if (u.protocol === 'http:' && isProd) {
      fail(
        'NEXT_PUBLIC_API_URL is http://. Passwords, OTP codes and session tokens ' +
          'all travel to this origin.',
      );
    }
    if (isIpLiteral(u.hostname)) {
      fail(
        `NEXT_PUBLIC_API_URL points at the raw IP ${u.hostname}; TLS cannot be issued for it.`,
      );
    }

    /*
     * The two halves have to agree, or the app loads and then fails every call.
     * Production only: outside it `enableCors` allows every origin, so a
     * split-origin dev setup is fine and flagging it would be noise.
     */
    const fe = frontendUrl ? urlOf(frontendUrl) : null;
    if (isProd && fe && fe.host !== u.host) {
      const allowed = (api.CORS_ORIGINS ?? '')
        .split(',')
        .map((s) => s.trim().replace(/\/$/, ''))
        .filter(Boolean);
      if (!allowed.includes(fe.origin)) {
        fail(
          `The app is served from ${fe.origin} but calls the API at ${u.origin}, and ` +
            "CORS_ORIGINS does not allow-list the app's origin. Every request the " +
            'browser makes will be blocked.',
        );
      }
    }
  }
}

/* NEXT_PUBLIC_* is compiled into the bundle: anything secret here is published. */
for (const key of Object.keys(web)) {
  if (!key.startsWith('NEXT_PUBLIC_')) continue;
  if (/SECRET|PASSWORD|PRIVATE|_KEY$|TOKEN|CREDENTIAL/i.test(key) && web[key]) {
    fail(
      `${key} is a NEXT_PUBLIC_ variable, so its value is compiled into the ` +
        'JavaScript every visitor downloads. Treat it as disclosed and rotate it.',
    );
  }
}

/* ============================ verdict ============================ */

const bullet = (list, mark) =>
  list.forEach((m) => console.log(`\n  ${mark} ${m}`));

if (errors.length) {
  console.log(`\n${'-'.repeat(72)}\nMISSING / WRONG (${errors.length})`);
  bullet(errors, 'x');
}
if (warnings.length) {
  console.log(`\n${'-'.repeat(72)}\nWORKS, BUT (${warnings.length})`);
  bullet(warnings, '!');
}
if (notes.length) {
  console.log(`\n${'-'.repeat(72)}\nOK`);
  bullet(notes, 'v');
}

console.log(`\n${'='.repeat(72)}`);
console.log(
  errors.length
    ? `VERDICT: incomplete - ${errors.length} must be fixed, ${warnings.length} worth fixing.`
    : warnings.length
      ? `VERDICT: complete enough to run - ${warnings.length} worth fixing.`
      : 'VERDICT: complete.',
);
console.log('='.repeat(72));

process.exit(errors.length ? 1 : 0);

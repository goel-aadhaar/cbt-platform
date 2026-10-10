#!/usr/bin/env bash
# Deploy or update DRSK CBT on a single instance (see DEPLOYMENT.md).
#
# Safe to re-run: pulls latest, rebuilds both apps, applies pending
# migrations, and does a zero-downtime pm2 reload (or a first start if the
# processes don't exist yet).
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f apps/api/.env ]; then
  echo "Missing apps/api/.env — see .env.example and DEPLOYMENT.md, then re-run." >&2
  exit 1
fi
if [ ! -f apps/web/.env ]; then
  echo "Missing apps/web/.env — see .env.example and DEPLOYMENT.md, then re-run." >&2
  exit 1
fi

echo "==> Pulling latest..."
git pull --ff-only origin main

echo "==> Installing dependencies..."
pnpm install --frozen-lockfile

echo "==> Building API..."
pnpm --filter @drsk/api build

# Audit the environment now that dist/ exists — the check runs the API's own
# validator. Deliberately BEFORE migrations and the restart: a half-configured
# box should be caught while the running version is still serving, not after
# the schema has moved and pm2 is looping on a boot failure.
if [ "${SKIP_ENV_CHECK:-}" = "1" ]; then
  echo "==> Skipping environment audit (SKIP_ENV_CHECK=1)."
else
  echo "==> Auditing environment..."
  if ! node apps/api/scripts/check-env.mjs; then
    echo "" >&2
    echo "Deploy stopped: the environment above is incomplete." >&2
    echo "Fix the entries marked 'x', or re-run with SKIP_ENV_CHECK=1 to override." >&2
    exit 1
  fi
fi

echo "==> Applying database migrations..."
# DEF-001: once RLS is FORCE-enforced, apps/api/.env's DATABASE_URL is a
# least-privilege role (DML only, granted no table ownership) so RLS
# actually binds for it — but that role also can't run DDL, which
# `prisma migrate deploy` needs. `.env.migrate` is a server-local,
# never-committed file holding just the table-owning role's connection
# string, for this one step only; absent on any environment that hasn't
# made this split (the plain DATABASE_URL from .env is used instead, same
# as before this existed).
if [ -f .env.migrate ]; then
  # Read the one value instead of `source`-ing the file: a connection string
  # holds `&` (sslmode=...&sslrootcert=...), which the shell reads as
  # "run in the background" when unquoted, so DATABASE_URL was silently never
  # set and the migration ran as the restricted app role.
  MIGRATE_URL="$(sed -n 's/^DATABASE_URL=//p' .env.migrate | head -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/")"
  if [ -z "$MIGRATE_URL" ]; then
    echo "Deploy stopped: .env.migrate exists but has no DATABASE_URL." >&2
    exit 1
  fi
  export DATABASE_URL="$MIGRATE_URL"
fi
pnpm --filter @drsk/api exec prisma migrate deploy

echo "==> Building web (bakes in apps/web/.env's NEXT_PUBLIC_* values)..."
pnpm --filter @drsk/web build

echo "==> Starting/reloading pm2 processes..."
pm2 startOrReload ecosystem.config.js --update-env
pm2 save

echo "==> Done."
pm2 status

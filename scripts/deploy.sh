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

echo "==> Applying database migrations..."
pnpm --filter @drsk/api exec prisma migrate deploy

echo "==> Building web (bakes in apps/web/.env's NEXT_PUBLIC_* values)..."
pnpm --filter @drsk/web build

echo "==> Starting/reloading pm2 processes..."
pm2 startOrReload ecosystem.config.js --update-env
pm2 save

echo "==> Done."
pm2 status

# Deployment — single instance (e.g. EC2 t3.small)

Both apps run as plain Node processes under pm2, behind nginx for TLS and
domain routing. The database is Neon (managed Postgres) — nothing to install
for it on the instance itself.

## Before you start

- An Elastic IP, associated with the instance (so it survives stop/start).
- Two DNS records pointed at it: `app.yourdomain.com` (frontend),
  `api.yourdomain.com` (backend).
- Security group: `22` (SSH, restricted to your IP), `80`, `443` open. Do
  **not** open `3000`/`4000` — nginx is the only public entry point.
- A **separate** Neon database (or branch) for production. Reusing the dev
  database mixes real users with test/demo data.

## One-time instance setup

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx git certbot python3-certbot-nginx
sudo npm install -g pnpm pm2

# 2 GiB RAM is tight for `next build` — add swap.
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

git clone https://github.com/goel-aadhaar/cbt-platform.git
cd cbt-platform
```

## Configure

Create `apps/api/.env` (copy `apps/api/.env.example` as a starting point) with
real production values:

- `DATABASE_URL` — the **production** Neon connection string.
- `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` — generate a fresh pair with the
  command in `.env.example`; don't reuse a dev keypair.
- `NODE_ENV=production`
- `CORS_ORIGINS=https://app.yourdomain.com` — required in production; the API
  refuses all cross-origin requests if this is empty (`main.ts`'s CORS setup
  is fail-closed, not fail-open).
- `FRONTEND_URL=https://app.yourdomain.com` — used to build invite-accept
  links in emails.
- `AWS_SES_FROM_EMAIL` / `AWS_SES_FROM_NAME` / `AWS_REGION`, plus
  `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` if not using an IAM role — see
  the "Email delivery" section of `.env.example`.
- `SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD` — set these _before_
  seeding (next section), so you choose the password instead of digging a
  generated one out of logs.

Create `apps/web/.env`:

```bash
echo "NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1" > apps/web/.env
```

`NEXT_PUBLIC_*` vars are baked into the client bundle at `next build` time,
not read at runtime — this must be set correctly _before_ the first build,
and before any rebuild that should pick up a changed value.

## First deploy

```bash
pnpm install --frozen-lockfile
pnpm --filter @drsk/api build
pnpm --filter @drsk/api exec prisma migrate deploy
pnpm --filter @drsk/api db:seed   # creates the superadmin
pnpm --filter @drsk/web build

pm2 start ecosystem.config.js
pm2 save
pm2 startup   # run the printed command so pm2 survives a reboot
```

## nginx + TLS

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/drsk
sudo nano /etc/nginx/sites-available/drsk   # replace yourdomain.com with the real domain
sudo ln -s /etc/nginx/sites-available/drsk /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d app.yourdomain.com -d api.yourdomain.com
```

## Verify

```bash
curl https://api.yourdomain.com/api/health
```

Then open `https://app.yourdomain.com` and sign in as the superadmin.

## Subsequent deploys

```bash
./scripts/deploy.sh
```

Pulls latest, reinstalls, rebuilds both apps, applies any new migrations, and
reloads both pm2 processes (zero-downtime for the API; `next start` briefly
drops connections during its own reload, same as any `next start` restart).

## Known, deliberately deferred gaps

- Media (question diagrams) is stored on the instance's local disk. Fine for
  a single persistent instance (survives reboots via the EBS root volume),
  not fine if you ever replace the instance or scale to more than one — see
  the "Media storage" section of `.env.example` for the S3 config that
  activates the moment `AWS_S3_BUCKET` is set.
- Row-Level Security is staged in migrations but not enforced (the app
  connects as the table owner, which Postgres always exempts from RLS) — see
  `FEATURES.md`'s Known Gaps for what enforcing it needs.
- `/api/docs` (Swagger) is public. That's API documentation, not data, but if
  you'd rather not expose your endpoint list publicly, gate or remove the
  `SwaggerModule.setup(...)` call in `apps/api/src/main.ts`.

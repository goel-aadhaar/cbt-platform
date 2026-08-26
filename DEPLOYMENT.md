# Deployment — single instance (e.g. EC2 t3.small)

Both apps run as plain Node processes under pm2, behind nginx for TLS and
domain routing. The database is Neon (managed Postgres) — nothing to install
for it on the instance itself.

## No domain yet? Start here

If you don't have a domain pointed at the instance, use the IP-only path
instead of "Configure" below:

- Ready-to-copy env files: `deploy/.env.api.production` and
  `deploy/.env.web.production` (gitignored — never committed, copy them to
  the instance directly, e.g. `scp deploy/.env.api.production
ec2-user@<ip>:~/cbt-platform/apps/api/.env`). Replace `EC2_PUBLIC_IP` with
  the instance's real address in both first.
- Use `deploy/nginx.no-domain.conf.example` instead of
  `deploy/nginx.conf.example` — single origin, path-based (`/api/*` →
  backend, everything else → frontend), so only port 80 needs to be open.
- Skip the `certbot` step — this is plain HTTP. **Real user credentials,
  session tokens, and OTP codes travel in cleartext** until you add a domain
  and TLS; treat this as a working test deployment, not one for real
  students, until then.
- The env file reuses your local dev database rather than a fresh one — see
  the comment in `deploy/.env.api.production` for the tradeoff and how to
  switch later.

Everything else below (build, seed, pm2, verify) is the same either way.

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
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL` (primary email transport) and/or
  `AWS_SES_FROM_EMAIL` / `AWS_SES_FROM_NAME` / `AWS_REGION` plus
  `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` if not using an IAM role
  (secondary — used alone if Resend isn't set, or as a live fallback if a
  Resend send fails) — see the "Email delivery" section of `.env.example`.
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

### Check the configuration before you trust it

```bash
pnpm --filter @drsk/api build   # the audit reads the compiled schema
node apps/api/scripts/check-env.mjs
```

This runs the API's **own** validator (`src/config/env.schema.ts`) against the
real `.env` files, so it cannot drift from what the app refuses to boot
without, and then checks the settings the schema deliberately allows to be
absent but a deployment cannot survive:

| Left unset                                     | What actually happens                                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY` + `AWS_SES_FROM_EMAIL` (both) | `MailService` silently falls back to the console adapter. OTP codes and invite links go to the API log and are never sent — **nobody can sign in.**     |
| `NEXT_PUBLIC_API_URL`                          | Falls back to `http://localhost:4000/api/v1` and is compiled into the bundle. The build succeeds; every visitor's browser then calls their own machine. |
| `AWS_S3_BUCKET`                                | Uploaded media lands on the instance's local disk — it survives a restart but not a replacement instance.                                               |
| `CORS_ORIGINS`                                 | The API rejects every cross-origin request. Invisible while nginx serves both on one origin; fatal the day the app gets its own hostname.               |

It also rejects a `FRONTEND_URL` pointing at a raw IP — email links built from
one read as phishing, cannot be served over TLS, and break when the instance is
replaced — and any `NEXT_PUBLIC_`-prefixed variable whose name looks like a
secret, since those are published to every browser.

It prints key **names** and verdicts only, never a value, so its output is safe
to paste into an issue. `scripts/deploy.sh` runs it automatically after the
build and stops the deploy if anything is wrong (`SKIP_ENV_CHECK=1` overrides).

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

### Never deploy the frontend ahead of the API

`deploy.sh` reloads both together, which is the safe order. If you ever deploy
them separately, **the API goes first.**

Request validation runs with `forbidNonWhitelisted`, so an older API rejects a
field a newer client sends — with a `400`, not a warning. The autosave payload
is where this bites: `PUT /attempts/:id/responses/:questionId` gained
`timeSpentMs`, and an API that predates it answers

```
400  {"message":["property timeSpentMs should not exist"]}
```

Autosave is fire-and-forget, so a candidate sees nothing wrong while **none of
their answers are being saved**. This is not hypothetical — it was observed
against the live instance during UAT (BUG-124 in `qa/uat/defect-log.md`), where
the deployed API was one release behind the working tree.

To check what is actually deployed before shipping a frontend, sit one question
through the deployed API:

```bash
python qa/uat/prod-smoke.py http://<host> /tmp/engfixture.json
```

`S24-P0-08c1` fails if the deployment cannot accept the payload the current
client sends.

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

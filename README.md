# DRSK CBT Examination Platform

[![CI](https://github.com/goel-aadhaar/cbt-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/goel-aadhaar/cbt-platform/actions/workflows/ci.yml)

Multi-tenant, NTA-style Computer-Based Test (CBT) examination platform.

## Tech stack

| Layer    | Technology                            |
| -------- | ------------------------------------- |
| Backend  | NestJS + TypeScript                   |
| Database | PostgreSQL (via Prisma ORM)           |
| Frontend | Next.js + TypeScript                  |
| Storage  | AWS S3                                |
| Hosting  | AWS Amplify (web) + AWS EC2/RDS (api) |

## Repository layout (pnpm monorepo)

```
drsk-cbt/
├── apps/
│   ├── api/          # NestJS backend
│   └── web/          # Next.js frontend
├── scripts/
│   └── dev.ps1       # frees the ports, then starts both servers
├── pnpm-workspace.yaml
└── package.json      # workspace root
```

## Prerequisites

- Node.js `>=22` (see `.nvmrc`)
- pnpm `>=11` (`npm install -g pnpm`)
- Docker (for local PostgreSQL)

## Getting started

```bash
pnpm install
cp apps/api/.env.example apps/api/.env      # fill in DATABASE_URL + JWT keys
cp apps/web/.env.example apps/web/.env.local

pnpm --filter @drsk/api build
pnpm --filter @drsk/api db:migrate:deploy
pnpm --filter @drsk/api db:seed            # the first SUPERADMIN
pnpm --filter @drsk/api db:seed:dev        # demo institute, staff, students, questions

pnpm dev                                    # frees the ports, starts api + web
```

`pnpm dev` reads the ports from the env files, refuses to start if the web app
and the API disagree about where the API lives, and health-checks both before
reporting success. `pnpm dev:ports` just frees the ports without starting
anything.

| Service  | URL                            |
| -------- | ------------------------------ |
| Web      | http://localhost:3000          |
| API      | http://localhost:4000/api/v1   |
| API docs | http://localhost:4000/api/docs |

## Demo accounts

> [!WARNING]
> These are the **development seed** credentials, hardcoded in
> `apps/api/src/database/dev-seed.ts` and `seed.ts` — they are not secrets, and
> they must never exist on a deployed instance. Before any public deployment,
> set `SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD` and do not run
> `db:seed:dev` at all.

Everyone signs in from **http://localhost:3000/login** except the platform
owner, who has a separate door. Staff are never asked to pick a role — the
backend determines role and tenant from the account.

| Role              | Sign-in route      | Credentials                                               |
| ----------------- | ------------------ | --------------------------------------------------------- |
| **Student**       | `/login` → Student | Institute `demo` · Candidate `2400183920` · `Student@123` |
| **Teacher**       | `/login` → Staff   | `anil@demo.local` · `Teacher@123`                         |
| **Administrator** | `/login` → Staff   | `admin@demo.local` · `Admin@123`                          |
| **Super Admin**   | `/platform/login`  | `superadmin@drsk.local` · `ChangeMe123!`                  |

Additional seeded accounts:

- **Teachers** — `sunita@demo.local`, `rahul@demo.local` (same password).
- **Students** — roll numbers run consecutively from `2400183920`; all share
  `Student@123` and the institute code `demo`.

Where each role lands after signing in:

| Role          | Console                                                               |
| ------------- | --------------------------------------------------------------------- |
| Student       | `/student` — exams, practice library, results, evaluations            |
| Teacher       | `/teacher/dashboard` — question bank, exam authoring, student reports |
| Administrator | `/admin/dashboard` — students, exams, approvals, results, monitoring  |
| Super Admin   | `/superadmin/dashboard` — institutes, platform usage, audit log       |

### Staff sign-in with Google (optional)

Off by default. To enable, set the **same** OAuth 2.0 Web client ID in both
places and register your origin in the Google Cloud Console:

```bash
apps/api/.env       GOOGLE_OAUTH_CLIENT_ID=<client-id>
apps/web/.env.local NEXT_PUBLIC_GOOGLE_CLIENT_ID=<client-id>
```

Signing in with Google never creates an account: the verified email must
already belong to an invited, active teacher or administrator. Left blank, the
button is hidden and the endpoint refuses every credential.

## Testing

```bash
pnpm --filter @drsk/api test        # unit specs (fast)
pnpm --filter @drsk/api test:api    # real-DB suite — takes ~11 minutes
```

`test:api` boots the compiled app as a child process on port 3099 and drives it
over HTTP. It needs `build` and the superadmin seed first. **Do not put a
timeout under ~12 minutes on it** — killing it mid-run surfaces as
`ECONNRESET`/`ECONNREFUSED` failures that look like tenant-isolation bugs but
are only the harness being torn down.

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
owner, who has a separate door. Staff never declare a role — the backend
determines role and tenant from the account.

Every door except Student is **two steps**: a correct password only earns a
mailed one-time code, which is what actually redeems for a session (see
[Email OTP](#email-otp-second-factor-non-student-logins) below). Students are
exempt — an exam hall cannot depend on inbox access, and a student session
has no administrative reach.

| Role              | Sign-in route      | Credentials                                                     |
| ----------------- | ------------------ | --------------------------------------------------------------- |
| **Student**       | `/login` → Student | Institute `demo` · Candidate `2400183920` · `Student@123`       |
| **Teacher**       | `/login` → Staff   | `anil@demo.local` · `Teacher@123` · then a mailed code          |
| **Administrator** | `/login` → Staff   | `admin@demo.local` · `Admin@123` · then a mailed code           |
| **Super Admin**   | `/platform/login`  | `superadmin@codonmind.in` · `ChangeMe123!` · then a mailed code |

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

### Accounts with more than one role

An account holds a **set** of roles (`users.roles`), while a session acts as
exactly **one** of them (`sessions.active_role`). A senior teacher who also
administers is one account, not two.

When an account holds several roles for the door being used, sign-in returns
`selectableRoles` and issues a session that **can do nothing at all** — every
route answers `401 ROLE_NOT_SELECTED` — until `POST /auth/session/role` commits
it to one. The pick is validated against the account's own roles, so naming a
role it does not hold is refused.

Only the chosen role is in force: a teacher-administrator working as a teacher
is refused administrator routes, and vice versa. Switching means signing in
again, deliberately.

```bash
# grant or revoke a role on an existing account
node --env-file=.env scripts/grant-role.js anil@demo.local add ADMIN
node --env-file=.env scripts/grant-role.js anil@demo.local remove ADMIN
```

`anil@demo.local` is seeded as TEACHER; grant it ADMIN with the command above
to see the role-choice screen.

### Email OTP, second factor (non-student logins)

`POST /auth/login` and `POST /auth/platform/login` no longer return a session
on a correct password — they email a 6-digit code and return a `challengeId`.
The session itself is issued by `POST /auth/login/verify`, which redeems the
code. The roles a redeemed code may act as come from the _challenge_ (i.e.
which door issued it), not from anything the client sends — a code minted at
the institute login cannot be spent for a platform session.

Without a mail provider configured, the dev adapter (`ConsoleMailService`)
**prints the code to the API's terminal window** instead of sending it:

```
🔐 Login code → Anil Kumar <anil@demo.local> | code: 482913 (expires in 10 min)
```

Copy that into the "Verification code" field on the login screen. Setting
`AWS_SES_FROM_EMAIL` switches `MailService` to the SES adapter, which sends
the code for real and logs nothing — the code never touches a log file (see
`.env.example`'s "Email delivery" section). The code is single-use, expires
in 10 minutes, is capped at 5 wrong guesses, and issuance itself is
rate-limited (30 codes per 15 minutes per account) to bound inbox spam.

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

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for a single-instance deployment (pm2 +
nginx). `ecosystem.config.js` and `deploy/nginx.conf.example` are the checked-in
process/proxy definitions it walks through; `scripts/deploy.sh` re-runs the
whole build-and-reload cycle for subsequent updates.

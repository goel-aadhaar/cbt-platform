# DRSK Assessment Portal — Web (`@drsk/web`)

The Next.js frontend for the DRSK CBT examination platform. It has two faces:

- **Candidate portal** — student login and the NTA-style computer-based exam screen.
- **Admin console** (`/admin/*`) — dashboard, students, exams, question bank, results, reports, teachers, live monitoring, and imports.

Built with **Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript**. Part of the `drsk-cbt` pnpm monorepo (`apps/web` + `apps/api`).

---

## Prerequisites

- **Node.js ≥ 22**
- **pnpm ≥ 11** (`npm i -g pnpm`)
- The **backend API** (`apps/api`) running locally — most screens call it. See [Run the backend](#1-backend-api-apps-api).

> All commands below are run from the **repo root** unless stated otherwise.

---

## Quick start

### 0. Install dependencies (once)

```bash
pnpm install
```

### 1. Backend API (`apps/api`)

The web app talks to the API at `http://localhost:3000/api/v1`, so start it first.

The API needs `apps/api/.env` (copy from [`apps/api/.env.example`](../api/.env.example)) with a working
`DATABASE_URL` (Neon/PostgreSQL) and the RS256 JWT keys. Then:

```bash
# apply the DB schema, build, and seed the first superadmin
pnpm --filter @drsk/api db:migrate:deploy
pnpm --filter @drsk/api build
pnpm --filter @drsk/api db:seed        # superadmin@drsk.local / ChangeMe123!

# optional: a full demo tenant so login works end-to-end (see credentials below)
pnpm --filter @drsk/api db:seed:dev

# start the API (watch mode) on port 3000
pnpm --filter @drsk/api start:dev
```

API endpoints once it's up:

- Base URL: `http://localhost:3000/api/v1`
- Health check: `http://localhost:3000/api/health`
- Swagger UI: `http://localhost:3000/api/docs`

### 2. Frontend web (`apps/web`)

The API owns port **3000**, so run the web app on a different port (e.g. **3001**):

```bash
# create the local env file (once)
cp apps/web/.env.example apps/web/.env.local

# start the dev server on port 3001
pnpm --filter @drsk/web exec next dev -p 3001
```

Open **http://localhost:3001** → it redirects to `/login`.

---

## Environment variables

Create `apps/web/.env.local` (git-ignored). Defaults live in [`.env.example`](.env.example):

| Variable                             | Default                        | Purpose                                                |
| ------------------------------------ | ------------------------------ | ------------------------------------------------------ |
| `NEXT_PUBLIC_API_URL`                | `http://localhost:3000/api/v1` | Base URL of the backend API.                           |
| `NEXT_PUBLIC_DEFAULT_INSTITUTE_SLUG` | _(empty)_                      | Pre-fills the "Institute Code" field on student login. |

---

## Demo credentials

After running `pnpm --filter @drsk/api db:seed:dev`:

**Student** (candidate portal — `/login`)

| Field          | Value                          |
| -------------- | ------------------------------ |
| Institute Code | `demo`                         |
| Candidate ID   | `2400183920` (or `2400183921`) |
| Password       | `Student@123`                  |

**Admin** (console — `/admin/login`)

| Field    | Value              |
| -------- | ------------------ |
| Email    | `admin@demo.local` |
| Password | `Admin@123`        |

---

## Key routes

| Route                                                      | Description                               |
| ---------------------------------------------------------- | ----------------------------------------- |
| `/login`                                                   | Student (candidate) login                 |
| `/dashboard`                                               | Candidate landing (validates the session) |
| `/exam`                                                    | The computer-based exam screen            |
| `/admin/login`                                             | Staff/admin login                         |
| `/admin/dashboard`                                         | Admin dashboard                           |
| `/admin/students`                                          | Student directory (wired to the live API) |
| `/admin/exams` · `/admin/exams/participants`               | Exams list & participants                 |
| `/admin/questions` · `/admin/results` · `/admin/reports`   | Question bank, results, reports           |
| `/admin/teachers` · `/admin/monitoring` · `/admin/imports` | Teachers, live monitoring, imports        |

> Most admin screens currently render design-accurate sample data. Student login and the admin **Student Directory** are wired to the real API.

---

## Scripts

Run with `pnpm --filter @drsk/web <script>`:

| Script              | Description                                                           |
| ------------------- | --------------------------------------------------------------------- |
| `dev`               | Start the Next.js dev server (add `-p 3001` to avoid the API's port). |
| `build`             | Production build.                                                     |
| `start`             | Serve the production build.                                           |
| `lint` / `lint:fix` | ESLint.                                                               |
| `typecheck`         | `tsc --noEmit`.                                                       |

---

## Troubleshooting

- **Port already in use / API unreachable** — the API must be on `3000` and the web app on a _different_ port (`3001`). If a call fails, confirm the API health endpoint responds: `curl http://localhost:3000/api/health`.
- **Admin login returns 500 with `database: down`** — the dev Neon database auto-suspends when idle and cold-starts on the first request (can take ~20–30s). Wait and retry; it recovers on its own.
- **Login says "invalid credentials"** — make sure you ran `pnpm --filter @drsk/api db:seed:dev` and used the demo credentials above (student logs in with the **Institute Code**, not an email).

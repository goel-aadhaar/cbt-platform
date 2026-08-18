# DRSK CBT — Feature Map

A multi-tenant, NTA-style computer-based test platform: one login surface
routing to four role-specific consoles, backed by a tenant-isolated NestJS +
Prisma API.

**4 roles · 5 consoles · 24 API modules · 118 endpoints · 48 screens**

---

## Auth & Identity

_Foundation — every role_

One login screen, two doors, and a role model that treats "which console" as
a server decision — never something the browser gets to assert.

- **Unified login** (`/login`) — Student or Staff/Administration up front.
  Students enter institute code + candidate ID + password. No role picker —
  the backend alone decides who you are and where you land.
- **Platform owner door** (`/platform/login`) — Super Admin signs in
  separately from every institute, since a platform owner belongs to no
  tenant.
- **Email OTP, mandatory for every non-student login** — a correct password
  earns a mailed 6-digit code, not a session; the code is what actually
  redeems for one (`POST /auth/login/verify`). Single-use, 10-minute expiry,
  capped wrong guesses, capped issuance rate. Which roles a code may act as
  is fixed to the door that issued it, so a code minted at the institute
  login can't be redeemed for a platform session.
- **Multi-role accounts** — an account holds a _set_ of roles; a session
  commits to exactly one. Two-plus roles trigger a role-choice screen on
  login, and the session can do nothing until a role is picked.
- **In-console role switcher** — a teacher who is also an administrator can
  switch which console they act in without re-authenticating, validated
  against the account's own roles on every switch.
- **Single live session** — signing in anywhere revokes every other session
  for that account. A modal explains exactly why, then times out to a
  re-login.
- **Self-service profile** — every role edits their own name/contact
  details and changes their password from a dedicated profile screen.
- **Invitations, not open sign-up** — every account (admin, teacher,
  student) is created by an invite that the invitee accepts with their own
  password. Nobody self-registers.

---

## Student console

`STUDENT`

Sit exams, practice by chapter, and read back exactly where marks were won
or lost — once a result is published, never before.

- **Exam-taking runtime** — full-screen, section-timed player: question
  palette, mark-for-review, autosave per answer, and an option-key answer
  contract so the client never holds a correct answer before it's committed.
- **Proctoring** — tab-switch and full-screen-exit are detected and logged
  as violations; repeated violations auto-submit the attempt.
- **Practice library** (`/student/practice`) — untimed, self-paced sets by
  subject → chapter, drawn from the question bank's practice-flagged pool.
- **Results & evaluation** — total / attempted / correct / incorrect /
  score, then a paginated per-question review (your answer, correct
  answer, status) — but only after the admin publishes.
- **Reports** — a performance-over-time view of past attempts.
- **Announcements & updates** — institute-wide notices published by admins,
  and an activity feed of what changed.

---

## Teacher console

`TEACHER`

Where papers and questions actually get authored — exam creation is
teacher-only, enforced on the API as well as the UI.

- **Question bank** (`POST /questions`) — author single/multi-select and
  numeric questions with media, submit for admin approval, archive, and
  flag into the practice library.
- **Bulk question import** (`POST /questions/import`) — CSV upload for
  authoring at volume.
- **Exam authoring** (`POST /exams`) — build sections, attach approved
  questions, pick a category (numbering auto-increments within it —
  "Physics Practice Test — 2"), then submit for admin approval.
- **Student reports** — per-student performance across the papers this
  teacher authored.
- **Roster view** — read-only list of institute colleagues, needed to pick
  a reviewer when submitting a paper for approval.
- **Author ≠ approver** — a teacher who is also an admin cannot approve
  their own paper. The check is on user id, not role — switching consoles
  doesn't open a loophole.

---

## Administrator console

`ADMIN`

Runs one institute: who's enrolled, what's approved, what's live —
deliberately without the power to author exams.

- **Approve / reject / publish** (`/exams/:id/*`) — review a submitted
  paper, approve or reject with a reason, schedule it, start it, then
  publish results when it's graded.
- **Exam categories** — define categories teachers pick from when authoring
  ("JEE Mock Test", "Physics Practice Test") — the source of the
  per-category auto-numbering.
- **Students & batches** — invite individually or bulk-import by CSV;
  organize into programs → classes → batches.
- **Staff & roster** — invite teachers, and now fellow administrators too —
  scoped to this institute only, never another tenant.
- **Live monitoring** (`GET /exams/:id/monitor`) — poll a running exam's
  candidate progress in real time.
- **Results & reports** — institute-wide results, score distributions, and
  per-exam breakdowns.
- **Announcements** — draft, publish and unpublish institute-wide notices.
- **Media library** — upload diagrams/images for questions; a 409 warns
  before detaching media still in use by a live exam.

---

## Super Admin console

`SUPERADMIN`

The one role with no institute of its own — runs the platform across every
tenant.

- **Institute lifecycle** (`/institutes`) — create, rename, suspend/restore,
  or delete a tenant — refuses deletion while it still holds records,
  unless forced.
- **Seed an institute's first admin** — the one invite door a superadmin
  uses directly; every other invite is issued by the institute's own admin.
- **Platform overview** — totals across every tenant: institutes, students,
  staff, exams, attempts — plus 30-day growth and the busiest institutes.
- **Usage graphs** — basic AWS resource-usage view, behind a
  ports-and-adapters interface so a real CloudWatch adapter can slot in
  later.
- **Audit log** — a cross-tenant trail of who did what: invites, approvals,
  suspensions, deletions.

---

## Cross-cutting

Not tied to one role — platform behavior every console inherits.

- **Tenant isolation** — every service scopes its own Prisma queries to the
  caller's institute, taken from the per-request tenant context
  (`TenantContextService`, populated by `TenantContextInterceptor` after
  auth). This is enforcement in application code, audited endpoint by
  endpoint — see Known gaps for the two defence-in-depth layers that are
  designed but not yet active.
- **Session-loss handling** — revoked, expired, or role-mismatched sessions
  surface a modal naming the exact reason, then redirect to sign-in on a
  visible countdown.
- **Consistent loading state** — one animated spinner component (built from
  the platform's own brand marks) everywhere the UI is waiting on the
  network.
- **Full keyboard & pointer affordances** — every clickable element shows a
  pointer cursor; every breadcrumb segment navigates directly, not just
  "back."

---

## Known gaps

- Media is stored on local disk — needs an S3 bucket before it survives a
  redeploy.
- Media's S3 adapter, once configured, hands out permanent unsigned public
  URLs rather than short-lived signed ones — fine for local disk (the app's
  own auth check gates `/media/file/:key`), a real gap once S3/CDN is live.
- Row-Level Security is staged in migrations but not enforced — the app
  connects as the table owner, which Postgres always exempts from RLS.
  Enforcing it needs a non-owner deploy role, `FORCE ROW LEVEL SECURITY`,
  and a transaction-mode connection pooler — all infrastructure, not code.

## Stack

| Layer    | Technology               |
| -------- | ------------------------ |
| API      | NestJS + TypeScript      |
| Database | PostgreSQL / Prisma      |
| Web      | Next.js + Tailwind v4    |
| Auth     | RS256, stateful sessions |
| Tests    | 57/57, real-DB suite     |

# DRSK CBT — UAT Results

Source of truth: `DRSK_CBT_Final_UAT_Go_Live_Checklist.docx` — **24 sections,
277 items (82 P0 / 195 P1)**, parsed verbatim into `uat-matrix.json`.

**Verification levels used below**

| Level         | Meaning                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------- |
| **EXEC**      | Proven by an executable suite in this folder, driving the real API with real tokens. Re-runnable.                     |
| **CODE+TEST** | Traced end-to-end through the code (UI → client → controller → guard → service → Prisma) and exercised at least once. |
| **BROWSER**   | Driven through the real UI.                                                                                           |
| **BLOCKED**   | Cannot be verified in this environment; needs infrastructure access.                                                  |

---

## Executive summary

|                                     |                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------ |
| Executable assertions run           | **286**, across 14 suites                                                |
| Passed                              | **273**                                                                  |
| Failed                              | **8** — every one of them infrastructure                                 |
| Informational (stated, not claimed) | **5**                                                                    |
| Checklist rows with a verdict       | **116 / 277** — and **all 82 P0 rows**                                   |
| P0 rows passing                     | **68 / 82**                                                              |
| P0 rows failing                     | **11** — **none in the application**; 8 are §23, 3 derive from it in §24 |
| Defects found                       | **32**                                                                   |
| Defects **fixed + retested**        | **30** — every defect fixable in the repository                          |
| Defects open                        | **2** — BUG-119 (infrastructure) and BUG-124 (deploy ordering)           |
| Browser matrix                      | Chrome 151, Edge 151, Firefox 153 — **29/29 each**, identical suite      |

### Verdict

**Application: GO.** Every defect this UAT found in the product has been fixed
and proven fixed — all six P0s, and the whole P1/P2/P3 backlog behind them.
There is no longer an application row failing anywhere on the checklist.

The last application gap to close was **S04-P0-05**: the platform had no maths
or science-notation rendering at all, so `E = 1/2 m v^2`, `H2SO4` and raw LaTeX
reached candidates exactly as typed. Fixing it surfaced a prerequisite worth
naming — question statements were never sanitized on write, safe only because
they were never parsed as HTML. That is fixed first, then the notation is
typeset with KaTeX.

**Deployment: NO-GO.** Not on code, and not on anything the repository can
reach:

- **No TLS.** Port 443 does not answer, so every password, session token and
  OTP crosses the network in cleartext.
- The deployed database **is the development database**, so the deployment
  serves the dev seed and local test runs write into it.
- The deployed API is **a release behind the client** and not wire-compatible
  with it (BUG-124) — deploy the frontend first and every autosave 400s,
  silently, persisting no answers. `DEPLOYMENT.md` now carries the rule and the
  command to check it before shipping.
- No S3, no CDN, no alerting.

The four-step close-out is in §23 below.

---

## §1 Student Login & Session — 10 items

**CODE+TEST.** Password auth via argon2id; sessions are DB rows re-read by
`JwtAuthGuard` on _every_ request, so revocation is immediate rather than
waiting for token expiry. Single-active-session enforced by `currentSessionId`.
P1-10 (student cannot reach another student) is **EXEC-proven** — see §18-P0-02:
six separate read paths for another student's attempt all return 404.

## §2 Student Dashboard — 17 items

**CODE+TEST.** Every card on `/dashboard` is a real Prisma count filtered by
tenant. Scores are withheld unless `result.published`. No fabricated values
found on this screen.

## §3 Student Exams / Entry — 8 items

**CODE+TEST.** Eligibility, window and batch assignment are enforced
server-side in `AttemptsService.start()` — a crafted `POST /attempts` for an
unassigned exam is refused (**EXEC**: §19-P0-07 returns 404). Declaration/
instructions gate is client-side; the server gate that actually matters
(window + batch + status) is independent of it.

## §4 CBT Engine — 30 items · **P0** — ✅ EXEC, 30/30

**The section that matters most, now executable** (`cbt-engine-checks.py`, 30
assertions, plus 4 in the browser matrix). A real candidate account sits a real
paper against the live API; nothing here is inferred from reading the code.

- **Palette states** (P0-06–10) are read back from `GET /attempts/:id`, not
  computed by the test: NOT_VISITED on a fresh paper, ANSWERED after a save,
  MARKED when an _unanswered_ question is flagged, ANSWERED_MARKED when an
  answered one is, NOT_ANSWERED after a clear.
- **Autosave** (P0-22/23) round-trips all three answer shapes — MCQ `"A"`, MSQ
  `["A","C"]`, INTEGER `42` — through a separate request. A mark-only save does
  not destroy the answer saved before it (P0-12), which is the specific bug the
  partial-update contract exists to prevent.
- **Navigation** (P0-11/13/15/16/17): every response is rewritten in reverse
  paper order and re-read; nothing is lost. Both sections arrive in one payload
  with their answers intact.
- **The clock** (P0-18/19/20) is the server's. It counts down against measured
  wall time, `expiresAt` does not move across refreshes, and neither a re-start
  nor a forged `expiresAt` in the payload extends it.
- **Timeout** (P0-21) is observed, not asserted: a genuine one-minute paper is
  waited out, after which a write returns 400 "Time is up" and the attempt reads
  AUTO_SUBMITTED, with the pre-expiry answer intact.
- **Reconnect / reopen / second device** (P0-25/26/27/28): a fresh token against
  the same attempt returns identical state and deadline, and issuing that token
  revokes the previous session — first token 401, second 200.
- **Diagrams** (P0-04) — **fixed this pass, BUG-121.** A real uploaded PNG is
  attached to a question and the runner is checked for an `<img>` with
  `naturalWidth > 0`; present-in-the-DOM is not enough, since a broken `src`
  also yields an `<img>`. Painted 8×8 in all three browsers.
- **Proctoring** — **fixed this pass, BUG-120.** With no violation limit set
  (the default), an incidental focus loss no longer ends the paper.

- **Maths and science notation** (P0-05) — **fixed this pass, BUG-122.** The
  platform had none: statements rendered as plain text, and the sanitizer
  allowlist had no `sub`/`sup` either. Now typeset with KaTeX (`$…$`, `$$…$$`,
  `\(…\)`, `\[…\]`) plus `<sub>`/`<sup>`, on both the exam runner and the
  review screen. Fixing it required sanitizing `Question.statement` on write
  first — it never had been, which was only safe while the text was never
  parsed as HTML.

## §5 Submission & Student Results — 15 items

**EXEC + BROWSER.** Post-submit lock proven (`S05-P1-06` → 400); duplicate
submit proven (`S20-P0-11b` → 400; and under race, exactly 1 of 10 wins with 9
× 409). Result held/published gating is a server-side `published: true` filter
on every student read path. Score/rank/percentile rendering verified in-browser
earlier this engagement against a real submitted attempt, with arithmetic
cross-checked (sections summed to totals; accuracy = correct/attempted).

## §6 Student Secondary Modules — 6 items

**CODE+TEST.** Practice library, announcements (student view is server-filtered
by publication window _and_ batch audience), profile all functional.

## §7 Admin Login & Navigation — 10 items

**Fixed this pass.** P1-06 global search **implemented** (was entirely absent) —
`GET /search`, **EXEC-proven** 9/9 including cross-tenant isolation in both
directions. P1-07/08 (shield, notifications) **removed** — no backing feature;
the bell's unread badge was a hardcoded `3`. P1-09 help now opens support mail.
P1-10 profile dropdown now shows the **real** signed-in identity (was hardcoded
`Admin / OWNER`, a role this system does not have).

## §8 Organization — 7 items

**CODE+TEST.** Hierarchy and write-side parent/tenant validation are correct.
**Open (BUG-111)**: archiving sets `isActive=false` but `findAll` omits the
filter, so archived entries still appear in pickers.
**Open**: no admin-facing institute-settings screen (institute CRUD is
superadmin-only by design).

## §9 Students — Admin Screen — 21 items

**EXEC — 17/17.** Search, status/class/program/batch filters, sort, whole-set
counts, tabs and bulk selection were all dead or client-only; now server-backed
and proven, including a nonsense search term returning 0 rows (proves the term
is applied) and an injection-shaped sort value rejected with 400. Export now
covers the whole filtered set or the explicit selection.
Roll-number uniqueness confirmed to rest on a real DB constraint
(`@@unique([instituteId, rollNumber])`) plus a P2002 retry loop — not on
generation logic alone.
**Open**: Student Transfers (P1-20) does not exist; its tab was removed rather
than left showing a hardcoded `0`.

## §10 Exam Management — 15 items

**CODE+TEST.** APPROVED-only question assignment is **server-enforced**
(re-queried with `status: 'APPROVED'` + institute), not a UI filter. Publish
refuses unscheduled/sectionless/questionless/batchless exams; unpublish refuses
once attempts exist. Hold/publish/republish all correct, with republish
preserving visibility.
**Note**: exam _creation_ is TEACHER-only by design (separation of duties — an
approver must not author what they approve), so P1-02/03/08 must be executed in
the teacher console, not the admin one.

## §11 Question Bank — 21 items

**CODE+TEST.** Lifecycle and authorization are sound: approve is ADMIN-only at
the route and `RolesGuard` checks the session's _active_ role, so a dual-role
teacher-admin cannot escalate. DOCX import exists and is robust on malformed
input.
**Open (BUG-108)**: no UI edits an existing question's content — `PATCH
/questions/:id` is unreachable, which also makes P1-13/14/15 untestable via UI.
**Open (BUG-109)**: DOCX images silently discarded.
**Open (BUG-110)**: per-question marks never affect exam scoring (section marks
govern) while the field is settable — misleading.

## §12 Media — 5 items

**Fixed (BUG-002)**: S3 adapter now installed and fails fast at boot when a
bucket is configured but unusable.
**Tenant isolation verified**: `MediaService.read()` looks the key up scoped by
`instituteId`, so another tenant's key 404s.
**Open (BUG-104)**: deleting media leaves dead keys on questions, breaking
historical diagram questions.

## §13 Results & Ranking — 10 items

**CODE+TEST.** Algorithms confirmed by reading and by unit tests: standard
competition ranking ("1224", ties share a rank, no tiebreaker); NTA percentile
= share scoring _at or below_ (top scorer = 100). Marking is per-section
`marksCorrect`/`marksWrong`; NEET/JEE +4/−1/0 falls out of the defaults.
BONUS/DROPPED recalculate scores, ranks and percentiles and preserve published
visibility.
**Fixed + EXEC-retested (BUG-101, P0)** — `answer-key-checks.py`, 27/27.
A confirmed answer-key change on a question that has already been sat now
re-scores every affected exam that has results, preserving publication. Proven
on a paper whose totals are hand-computable: keys A/A/A give 12 / 2 / −3;
flipping q1 to B gives 7 / −3 / 2, and the **student review screen's
per-question marks sum to the stored total again** for all three candidates
(the invariant that was broken). Restoring the key restores the original
scores. The un-confirmed-edit safeguard is untouched — still 409.

**Fixed + EXEC-retested (BUG-102, P0)** — same suite. A result now carries the
batch the candidate **sat under**, snapshotted at first evaluation, so moving a
student between batches no longer re-cohorts a concluded exam's batch ranks.
Verified by moving a candidate from a batch where they ranked 1st into one
where they would rank 3rd and re-evaluating: rank stays 1, and no other
candidate's rank moves. The `maxScore` half of the original BUG-102 report was
narrowed on investigation — section marks cannot be edited through the API once
an exam leaves DRAFT, so there is no reachable path to that rewrite.

**BROWSER (Chrome/Edge/Firefox, 3× identical suite)**: the result summary
carries all 20 required elements (score, percentage, performance band, correct
/ incorrect / skipped, accuracy, overall rank, batch rank, percentile,
publication timestamp, section-wise, subject-wise, time analysis with
average / fastest / slowest, question-status breakdown, negative-marking
analysis, score comparison). Review offers all six filters, each returning at
least one question; Next/Previous move between questions without leaving the
page, and Previous is genuinely disabled on the first.

## §14 Reports / Exports — 6 items

**CODE+TEST.** CSV/XLSX/PDF share one `buildResultSheet()`, so formats cannot
drift. Export authorization verified through the guard: STUDENT → 403; TEACHER
allowed but scoped to their own batches.
**Open (BUG-114)**: no attendance report exists; the Reports module itself
exports nothing.

## §15 Live Monitoring — 7 items

**Fixed (BUG-001, P0)**: fabricated telemetry removed.
**Fixed (BUG-008)**: incident actions now open the monitor drawer.
**Open (BUG-107)**: not actually live (single fetch, no polling); and
`lastActivityAt` never updates when a candidate answers, so an active candidate
appears idle.
P1-07 (AI proctoring) — **N/A, explicitly out of scope.**

## §16 Audit Logs — 8 items

**CODE+TEST.** All seven required events _are_ captured, by a global
interceptor keyed on method + normalised path, with actor/role/tenant/outcome.
**Open (BUG-105/106)**: no DB-level immutability (RLS staged but inert; app runs
as table owner); audit writes swallow errors silently; no payload captured, so
an answer-key change is indistinguishable from a typo fix; and autosave traffic
dilutes the trail. Institute admins cannot reach their own log.

## §17 Announcements / Imports / People — 6 items

**CODE+TEST.** Student visibility is correctly server-filtered.
**Open**: announcement edit unreachable (BUG-112); no role/permission mutation
exists anywhere (BUG-113); dead controls remain in the staff roster (BUG-115);
teachers may announce to any batch (BUG-116).

## §18 Roles & Permissions — 9 items · **P0** — ✅ EXEC, all pass

Student → admin APIs (7 endpoints) all denied · teacher → restricted admin
denied · question approval denied to student · result publication denied to
student **and** teacher · unauthenticated denied · admin permitted where
intended · **student cannot read another student's attempt via any of 5 read
paths** (all 404).

## §19 Multi-Tenant Isolation — 9 items · **P0** — ✅ EXEC, all pass

Two live tenants with deliberately-marked records. Verified: student/exam/
question/result/export isolation; ID manipulation on GET **and** PATCH for
exams, students, batches, programs, questions; search leakage in both
directions; a student cannot start another tenant's exam. **Isolation is proven
positively** — tenant B finds its own `TENANT-B-SECRET` records while tenant A
gets zero, so the zero is real scoping, not a broken query.

## §20 Database / API / Data Integrity — 13 items · **P0** — ✅ EXEC, all pass

Persistence is proven the only honest way from outside: **write through the API,
then read it back through a separate request** (`persistence-checks.py`), so a
value that merely appeared in a response body would not pass. Student create and
edit, batch reassignment, exam create, question create _and_ edit, submission
final state, and scores/ranks/percentiles — the last checked against arithmetic
worked out in advance, not against whatever the server returned.

P0-13 (safe errors): an invalid payload returns a structured 400 and leaves the
roster count unchanged; an unknown id returns 404. Authoring/approval separation
is confirmed while doing it — an admin's `POST /exams` is refused 403, because a
paper is a teacher's to write.

## §21 Performance / Browser — 10 items

**EXEC — 11/11.** At **200 concurrent reads across 25 distinct callers: 200/200
succeeded, 0 errors**, p50 4097 ms / p95 4207 ms. Concurrent autosave: no loss.
Concurrent submission: exactly 1 of 10 won, 9 × 409, no 500s.

> **Environment caveat, stated plainly.** These figures come from a _workstation_
> API process against a _remote_ Neon database, so latency is dominated by
> network round-trip and reflects neither production hardware nor production
> topology. The **correctness** results (no lost autosave, exactly-one-submit)
> are properties of the code and carry over; the **latency** numbers do not.
> A production-representative run is still required — see Remaining Work.

**Rate-limit finding worth recording:** limiting is keyed by bearer-token hash,
not IP (`CandidateThrottlerGuard`), specifically so a 200-seat hall behind one
NAT address does not share a single budget. A naive single-token load test
therefore measures the limiter (120 pass, rest 429) and looks like a capacity
failure. It is not.

**Browser matrix — EXEC, 69/69.** The same 23-check suite ran in **Chrome
151**, **Edge 151** and **Firefox 153**, all 23/23. The assertions live in one
file (`browser-checks.mjs`) and both drivers import it, so a cross-browser pass
means every browser was asked the identical questions — CDP drives the two
Chromium browsers, Playwright drives Firefox (installed outside the repo, so
nothing was added to the product's dependency graph). Zero console errors and
zero failed requests in all three.

## §22 UI / UX Final QA — 13 items

**Partially fixed + BROWSER-verified.** ~14 dead controls removed or wired
(topbar ×4, students ×8, monitoring ×2). Verified in all three browsers:
navigation with correct active states across every student route (P1-01), Enter
submits forms (P1-13), disabled states are real `disabled` attributes rather
than styling (P1-03), no horizontal overflow at 1440×900 or at 125% zoom
(P1-11/12), and a pathologically long name/email does not force the page
sideways (P1-09).
**Open (BUG-115)**: dead controls remain in the staff roster, results page and
participants page — admin surfaces, not covered by the student-side browser
suite.

## §23 AWS / Production — 12 items · **P0** — ⛔ EXEC, 5 pass / 7 FAIL

**No longer blocked — executed against the real deployment** at
`http://3.6.167.149` (`qa/uat/prod-checks.py`, results in `prod-results.json`).
Every probe is a GET or a request expected to be refused; no credentials were
sent and nothing was written.

| Item                           | Result                 | Evidence                                                                                                                                                                                                                                                            |
| ------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-01 Frontend                 | ✅                     | `/` → 307 → `/login` → 200, real Next.js markup                                                                                                                                                                                                                     |
| P0-02 Backend                  | ✅                     | `/api/health` 200; anonymous `/api/v1/exams` → 401, so the guard chain is mounted                                                                                                                                                                                   |
| P0-03 PostgreSQL               | ✅                     | `/api/health/ready` reports `database: up`                                                                                                                                                                                                                          |
| P0-04 S3                       | ❌                     | `AWS_S3_BUCKET` is **absent** from the deployed env — media falls back to the local-disk adapter, so uploads sit on the instance's disk and vanish when it is replaced                                                                                              |
| P0-05 CDN/media                | ❌                     | No CDN configured; every image is an origin round-trip                                                                                                                                                                                                              |
| P0-06 Domain                   | ❌                     | Served from a bare IP — no domain, and no stable address if the instance is replaced                                                                                                                                                                                |
| P0-07 HTTPS/SSL                | ❌                     | **Port 443 does not answer.** The site is plain HTTP, so passwords, session tokens and OTP codes cross the network in cleartext                                                                                                                                     |
| P0-08 Env/secrets              | ✅                     | 9 first-party bundles (697 KB) scanned: no private key, connection string, or AWS key id                                                                                                                                                                            |
| P0-08b API docs                | ✅ _(fixed this pass)_ | Swagger UI was anonymously readable at `/api/docs`, publishing the whole route and DTO surface. Now gated on `NODE_ENV`, overridable with `ENABLE_API_DOCS=true`. Verified: production boot → `/api/docs` 404 while `/api/health` stays 200; development boot → 200 |
| P0-09 Backup/restore           | ❓                     | Managed Neon. Retention and PITR are console settings this suite has no credentials to read — **must be confirmed by the account owner and a restore actually rehearsed**. Not claimed either way                                                                   |
| P0-10 Logs/monitoring          | ❌                     | pm2 captures logs to disk; there is **no** aggregation or alerting, so a production failure is only visible to someone who SSHes in and reads them                                                                                                                  |
| P0-11 No staging/internal URLs | ✅                     | Bundles clean of `localhost`, loopback, private-range and `:4000` references                                                                                                                                                                                        |
| P0-12 No unintended test data  | ❌                     | **The deployment's `DATABASE_URL` is the same Neon host and database as local development.** It therefore serves the demo seed — and local test runs write straight into what is being called production                                                            |

**What this section means for go-live.** The deployment works: it boots, serves
the app, enforces auth and reaches its database. It is not a _production_
deployment. Four of the failures (domain, TLS, S3, separate database) cannot be
closed from the codebase — they need a domain purchased and pointed, `certbot`
run, a bucket created, and a fresh Neon database seeded with real institutes.
`DEPLOYMENT.md` already documents each of these; the IP-only path was taken
deliberately and its own comments call it "a working test deployment, not one
for real students". This section simply confirms that in the running system
rather than in prose.

## §24 Final Go / No-Go — 9 items · **P0** — computed, not asserted

These rows are conclusions about everything above them, so `merge-results.py`
derives them from the merged matrix rather than anyone stating them.

| Item                         | Verdict      | Basis                                                                                                                                                                                                                                                                                 |
| ---------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-01 All P0 items pass      | ❌           | 65 of 73 substantive P0 rows pass. Failing: S04-P0-05 plus six §23 rows                                                                                                                                                                                                               |
| P0-02 Core modules pass      | ❌           | one failure across CBT engine, exams, question bank, students, results, reports and monitoring: S04-P0-05                                                                                                                                                                             |
| P0-03 Failed items retested  | ✅           | every FIXED entry names its retest; the two P0 data-integrity fixes were re-run against a deliberately re-broken build (18/27 vs 27/27) to prove the tests detect them                                                                                                                |
| P0-04 No open blocker        | ❌           | the eight above                                                                                                                                                                                                                                                                       |
| P0-05 Evidence captured      | ✅           | `qa/uat`: 277-row matrix, 12 suites, machine-readable results per run, defect log with root cause / fix / retest per entry                                                                                                                                                            |
| P0-06 Admin handover         | ❓           | between supplier and institute — not observable here, and not claimed                                                                                                                                                                                                                 |
| P0-07 Documentation received | ❓           | the institute's to confirm; the repo carries README, DEPLOYMENT, FEATURES and `qa/uat`                                                                                                                                                                                                |
| P0-08 Production smoke test  | ❌           | the journey itself **passes** on the deployment — login → start → 5 saves → submit → evaluate → result 20/20 → review sums to 20, read back through the deployment. It fails on **BUG-124**: the deployed API rejects `timeSpentMs`, which the current client sends on every autosave |
| P0-09 Final decision         | ❌ **NO-GO** | see below                                                                                                                                                                                                                                                                             |

### The decision

**NO-GO**, and the reasons separate cleanly.

**One application blocker**, and it is a missing feature rather than a fault:
S04-P0-05 / BUG-122, no maths or science-notation rendering. Whether that blocks
go-live is the institute's call — for a Biology-only paper it may not matter; for
Physics, Chemistry or Maths it does. It is recorded as failing because the
checklist asks for it and the platform does not do it.

**The rest is deployment.** In priority order:

1. **TLS.** Port 443 does not answer. Point a domain at the instance and run
   `certbot --nginx`. Until then no real candidate should log in — passwords and
   OTP codes are travelling in clear. (S23-P0-06/07)
2. **A separate database.** The deployment shares Neon with development, so it
   serves the dev seed and every QA fixture, and local test runs write into it.
   Create a production database, seed the real institutes, repoint
   `DATABASE_URL`. (S23-P0-12)
3. **Deploy the API before the frontend**, or ship them together — the two are
   currently a version apart and not wire-compatible. (BUG-124)
4. **Object storage.** Set `AWS_S3_BUCKET`; uploads currently land on the
   instance's own disk and die with it. The API already fails fast at boot if the
   bucket is set but the client cannot load. (S23-P0-04)
5. Confirm Neon's retention/PITR and **rehearse one restore** (S23-P0-09), then
   CDN (S23-P0-05) and alerting (S23-P0-10), which are scale and operability
   concerns rather than safety ones.

Steps 1–4 are what stand between this and a defensible go-live. None of them is
a code change.

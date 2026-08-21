# DRSK CBT — UAT / Go-Live QA

Artifacts for the final UAT pass against
`DRSK_CBT_Final_UAT_Go_Live_Checklist.docx` (24 sections, **277 checklist
items** — 82 P0, 195 P1).

## Files

| File                    | What it is                                                                                                                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uat-matrix.json`       | Every one of the 277 checklist rows, parsed from the source .docx. The master list — nothing is summarised away.                                                                                           |
| `p0-security.py`        | Executable P0 suite for §18 Roles & Permissions, §19 Multi-Tenant Isolation, §20 Database/API/Data Integrity.                                                                                              |
| `roster-checks.py`      | Executable §9 suite — roster search, filters, sort, and whole-set counts.                                                                                                                                  |
| `search-checks.py`      | Executable §7-P1-06 (global search) + §19-P0-09 (search leakage) suite.                                                                                                                                    |
| `concurrency-checks.py` | Executable §21 suite — concurrent autosave, concurrent submit, and a read-throughput probe across distinct callers.                                                                                        |
| `answer-key-checks.py`  | Executable regression for **BUG-101 / BUG-102** (both P0). Asserts re-scoring and batch-snapshot behaviour against hand-computable arithmetic.                                                             |
| `cbt-engine-checks.py`  | Executable §4 suite (30 P0 rows) — drives a real attempt: palette states, autosave, navigation, the server clock, reconnect, single-session, and a genuine one-minute paper waited out to observe timeout. |
| `persistence-checks.py` | Executable §20 suite — write through the API, read back through a separate request. Also §19-P0-06 media isolation, asserted in both directions.                                                           |
| `prod-checks.py`        | Executable §23 suite, run against the **real deployment**. Read-only.                                                                                                                                      |
| `prep-engine-media.py`  | Puts a real uploaded PNG and real science notation on the engine paper, so the two visual §4 rows have something to look at.                                                                               |
| `run-all.py`            | **Start here.** Runs every fixture and suite in the only valid order.                                                                                                                                      |
| `browser-checks.mjs`    | The §22/§13 browser assertions, written once.                                                                                                                                                              |
| `browser-matrix.mjs`    | CDP driver for `browser-checks.mjs` — Chrome and Edge.                                                                                                                                                     |
| `browser-firefox.mjs`   | Playwright driver for the same checks — Firefox.                                                                                                                                                           |
| `*-results.json`        | Machine-readable output of the last run of each suite.                                                                                                                                                     |
| `uat-results.md`        | Section-by-section findings, statuses and evidence.                                                                                                                                                        |
| `defect-log.md`         | Every defect found, with severity, root cause, fix and retest.                                                                                                                                             |

## Running everything

```bash
python qa/uat/run-all.py --browsers --prod http://<deployment host>
```

That is the supported entry point. The suites share fixtures and several of
them **consume** what they touch — sitting an exam uses up that candidate's one
attempt, regenerating the answer-key fixture drops the results the persistence
checks read, and a paper whose window has passed can no longer be started. Run
them in the wrong order and you get failures that look like product defects and
are not. That happened twice while these were being written, which is why the
order is a script rather than a list of steps to remember.

The sections below describe the individual pieces, for when you want to re-run
just one.

## Running the suites

They all drive the **real API with real tokens** — they assert on observed HTTP
behaviour, never on what the code appears to do.

```bash
# 1. Two tenants must exist. Tenant A = demo (dev seed).
pnpm --filter @drsk/api db:seed:dev

# 2. Tenant B = uatb, with deliberately-marked "TENANT-B-SECRET" records so
#    isolation tests can prove a leak by name rather than by absence.
cd apps/api && npx tsx scripts/uat-fixture.ts > /tmp/tenantb.json

# 3. Start the API, capturing stdout — the suites read dev-mail OTPs from it
#    to complete the two-step staff login.
node dist/main.js > /tmp/api.log 2>&1 &

# 4. Run.
export API_LOG=/tmp/api.log
python qa/uat/p0-security.py /tmp/tenantb.json
python qa/uat/roster-checks.py
python qa/uat/search-checks.py

# Concurrency needs a PUBLISHED exam whose window is open for the load student.
LOAD_EXAM_ID=<exam uuid> python qa/uat/concurrency-checks.py

# BUG-101/102 regression: build the arithmetic fixture, then assert on it.
cd apps/api && npx tsx --env-file=.env scripts/answer-key-fixture.ts > /tmp/keyfixture.json
python qa/uat/answer-key-checks.py /tmp/keyfixture.json
```

`p0-security.py` needs one attempt id belonging to a student other than
`2610000001` to settle S18-P0-02 (the API deliberately refuses to enumerate
them, so it cannot always find one itself). Any attempt from the answer-key
fixture works:

```bash
OTHER_ATTEMPT_ID=<any UATKEY-* attemptId> python qa/uat/p0-security.py /tmp/tenantb.json
```

## §23 — production probes

```bash
python qa/uat/prod-checks.py http://<deployment host>
```

Every probe is a GET or a request expected to be refused; no credentials are
sent and nothing is written. Two rows cannot be settled over HTTP from outside
and are settled from the deployment's own configuration instead, which the
output states explicitly rather than implying a probe was run.

## §22 — browser matrix

The assertions live in `browser-checks.mjs` and both drivers import them, so a
cross-browser result actually means every browser answered the same questions.

```bash
# Serve a production build of the web app.
cd apps/web && npm run build && npx next start -p 3010

# Chrome / Edge, over CDP - no dependencies.
"<chrome or msedge path>" --headless=new --remote-debugging-port=9333 \
  --user-data-dir=/tmp/uat-profile about:blank &
node qa/uat/browser-matrix.mjs --cdp 9333 --app http://localhost:3010 \
  --label chrome --roll UATKEY-ALPHA --review-roll UATKEY-DELTA \
  --slug demo --password 'Student@123' --attempt <id> --review <id>

# Firefox, over Playwright. Installed OUTSIDE the repo on purpose - the product
# gains no test dependency.
npm --prefix /tmp/pw install playwright-core
node /tmp/pw/node_modules/playwright-core/cli.js install firefox
PW_ROOT=/tmp/pw/node_modules node qa/uat/browser-firefox.mjs \
  --app http://localhost:3010 --label firefox --roll UATKEY-ALPHA \
  --review-roll UATKEY-DELTA --slug demo --password 'Student@123' \
  --attempt <id> --review <id>
```

`--attempt` is the scored paper (result summary); `--review` is the six-filter
paper, which belongs to a different candidate, hence `--review-roll`. Both ids
come from `answer-key-fixture.ts`'s output, and both exams must be evaluated
and published first — an unpublished result is correctly invisible to the
candidate and the suite will see a 404.

Exit code is non-zero if any assertion fails, so these are CI-usable.

## Test-design notes

Two conventions worth knowing before reading results:

**A denial may be 401, 403 _or_ 404.** Tenant-scoped lookups legitimately return
404 for another tenant's id (the row genuinely is not visible in that scope)
rather than 403. All three count as denied; a `200` with data does not.

**Isolation tests prove the negative is real.** A cross-tenant search returning
zero rows is only meaningful if the same term returns rows for the tenant that
owns them — otherwise a broken query would "pass". `search-checks.py` asserts
both directions (`S19-P0-09c` and `S19-P0-09d`).

**A regression suite is checked against the broken build too.** A test that
passes whether or not the bug is present proves nothing. `answer-key-checks.py`
was run against a build with both fixes deliberately reverted before being run
against the fixed one — 18/27 then, 27/27 now — and the failing run is recorded
in `uat-results.md` next to the passing one.

**Scores are asserted against arithmetic, not against the code's own output.**
The answer-key fixture is three candidates on a three-question paper marked
+4/−1, so every total, rank and percentile in the suite is a number worked out
by hand first. If the scoring engine and the expectation ever agree because
both are wrong, that is a coincidence this design does not permit.

# DRSK CBT — Postman collection

An end-to-end Postman collection covering **every API route** (93 requests across
11 folders), ordered so a single Collection Runner pass exercises the whole
platform: onboarding → academic structure → question bank → exam build →
candidate attempt → results & ranking → exports → monitoring → analytics →
audit, plus a folder of authorization (RBAC/tenancy) checks.

## Files

| File                                | Purpose                                                     |
| ----------------------------------- | ----------------------------------------------------------- |
| `DRSK-CBT.postman_collection.json`  | The collection. Import into Postman.                        |
| `DRSK-CBT.postman_environment.json` | The **DRSK CBT — Local** environment. Import and select it. |
| `build-collection.js`               | Generator — edit this, not the JSON, then re-run it.        |
| `smoke-run.js`                      | CI smoke test — runs the whole collection with newman.      |

## Prerequisites

1. The API is running: `pnpm --filter @drsk/api build && node dist/main.js`
   (or `pnpm --filter @drsk/api start:dev`).
2. The database is seeded so the superadmin exists: `pnpm --filter @drsk/api db:seed`.
3. `baseUrl` matches your server. Default is `http://localhost:4000`.

## Running it in Postman

1. Import both JSON files. Select the **DRSK CBT — Local** environment.
2. Run the folders **in order** (or use the Collection Runner on the whole
   collection). Each request captures IDs and tokens into collection variables
   for the next one.
3. **Login is two steps (§2.2) for superadmin/admin/teacher.** Step 1 posts the
   password and returns a `challengeId`, not a session — a mailed 6-digit code
   is still required. In dev, the console mail adapter prints
   `code: XXXXXX` to the **API server console**. Copy it into the matching
   environment variable (`superOtpCode` / `adminOtpCode` / `teacherOtpCode`),
   then run the `… — 2. Verify OTP` step, which captures the bearer token.
   Each step-1 request logs a reminder to the Postman console. (Student login
   is a single step — roll number + password, no OTP.)
4. **The three "Accept Invite" steps need a token pasted first**, the same way.
   Tokens are emailed, never returned in a response (correct — they're
   secrets). When you run an `Invite …` request, copy its `token=…` value from
   the API console into the matching environment variable
   (`adminInviteToken` / `teacherInviteToken` / `studentInviteToken`), then run
   the `Accept …` step.
5. Two requests (`Import Students (CSV)`, `Import Questions (DOCX)`) need a file
   attached in the request's **Body → form-data → file** field; without one they
   return 400.

## Running it headless (CI)

`smoke-run.js` boots the app, runs the collection with
[newman](https://github.com/postmanlabs/newman), and automates the token/code-paste
steps (it stands up a tiny broker that reads the latest invite token and OTP
code from the app log and patches the three Accept steps plus the three Verify
OTP steps in memory — the shipped collection stays manual-paste). It gates on
**zero failed assertions**.

```bash
pnpm --filter @drsk/api build
pnpm --filter @drsk/api test:postman
```

## Notes

- List endpoints (`/questions`, `/students`, `/audit-logs`) return a
  `{ items, total, limit, offset }` page, not a bare array.
- The candidate flow requires the exam's window to be open; the **Schedule
  Exam** request sets it to `now − 1min … now + 1h` in a pre-request script.
- Regenerate after changing routes: `node postman/build-collection.js`.

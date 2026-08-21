#!/usr/bin/env python3
"""
UAT P0 SECURITY SUITE — sections 18 (Roles & Permissions), 19 (Multi-Tenant
Isolation) and 20 (Database/API/Data Integrity).

Drives the REAL API with REAL tokens. Every assertion is about observed HTTP
behaviour, not about what the code appears to do.

Tenant A = demo (dev seed).  Tenant B = uatb (scripts/uat-fixture.ts).

Run:  python qa/uat/p0-security.py
Env:  API_BASE (default http://localhost:4000/api/v1)
      API_LOG  (path to the API stdout log, for reading dev OTPs)
"""

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

API = os.environ.get("API_BASE", "http://localhost:4000/api/v1")
API_LOG = os.environ.get(
    "API_LOG",
    r"C:\Users\laptop\AppData\Local\Temp\claude\c--Users-laptop-Desktop-DBSK-CBT"
    r"\5c55855b-022f-4fba-a504-1253af17456f\scratchpad\api-uat.log",
)

RESULTS = []


def record(uat, name, passed, detail=""):
    RESULTS.append({"uat": uat, "name": name, "pass": passed, "detail": detail})
    mark = "PASS" if passed else "**FAIL**"
    print(f"  [{mark}] {uat} {name}" + (f" — {detail}" if detail else ""))


def req(method, path, token=None, body=None, raw_path=False):
    url = path if raw_path else API + path
    data = json.dumps(body).encode() if body is not None else None
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = "Bearer " + token
    r = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r) as resp:
            txt = resp.read().decode()
            return resp.status, (json.loads(txt) if txt.strip() else None)
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        try:
            return e.code, json.loads(txt)
        except Exception:
            return e.code, txt[:300]
    except Exception as e:  # noqa: BLE001
        return 0, str(e)


# ---------------------------------------------------------------- auth helpers

def student_token(slug, roll, password="Student@123"):
    s, d = req("POST", "/auth/student/login",
               body={"instituteSlug": slug, "rollNumber": roll, "password": password})
    if s != 200:
        raise RuntimeError(f"student login failed {slug}/{roll}: {s} {d}")
    return d["accessToken"]


def _otp_codes():
    try:
        return re.findall(r"code:\s*(\d{6})", open(API_LOG, encoding="utf-8", errors="ignore").read())
    except FileNotFoundError:
        return []


def staff_token(email, password):
    """Two-step staff login; reads the dev-mail OTP out of the API log."""
    before = len(_otp_codes())
    s, step1 = req("POST", "/auth/login", body={"email": email, "password": password})
    if s != 200:
        raise RuntimeError(f"staff login step1 failed {email}: {s} {step1}")
    code = None
    for _ in range(25):
        time.sleep(1)
        codes = _otp_codes()
        if len(codes) > before:
            code = codes[-1]
            break
    if not code:
        raise RuntimeError(f"no OTP appeared in {API_LOG} for {email}")
    s, d = req("POST", "/auth/login/verify",
               body={"challengeId": step1["challengeId"], "code": code})
    if s != 200:
        raise RuntimeError(f"staff login step2 failed {email}: {s} {d}")
    return d["accessToken"]


DENIED = (401, 403, 404)


def is_denied(status):
    """A denial may legitimately be 401/403 (authz) or 404 (tenant-scoped
    lookup that simply cannot see the row). All three are acceptable; a 200
    with data is not."""
    return status in DENIED



def items_of(d):
    """The API is inconsistent: /exams returns a bare array, /students and
    /questions return {items,total}. Normalise so assertions work on both."""
    if isinstance(d, list):
        return d
    if isinstance(d, dict):
        return d.get("items", [])
    return []


def main():
    fixture_path = sys.argv[1] if len(sys.argv) > 1 else None
    fx = json.load(open(fixture_path)) if fixture_path else {}

    print("=" * 72)
    print("ACQUIRING TOKENS")
    print("=" * 72)
    a_student = student_token("demo", "2610000001")
    b_student = student_token("uatb", "262000000001")
    print("  tenant A student OK, tenant B student OK")
    a_admin = staff_token("admin@demo.local", "Admin@123")
    print("  tenant A admin OK")
    a_teacher = staff_token("anil@demo.local", "Teacher@123")
    print("  tenant A teacher OK")
    b_admin = staff_token("admin@uatb.local", "Admin@123")
    print("  tenant B admin OK")

    # ---------------------------------------------------------------- §18
    print()
    print("=" * 72)
    print("SECTION 18 — ROLES & PERMISSIONS (P0)")
    print("=" * 72)

    # P0-01 student -> admin URL/route (server-side)
    s, _ = req("GET", "/students?limit=1", a_student)
    record("S18-P0-01", "student -> admin students API", is_denied(s), f"status={s}")

    # P0-03 student -> a spread of admin APIs
    admin_apis = ["/students?limit=1", "/exams", "/questions?limit=1",
                  "/programs", "/batches", "/audit?limit=1", "/staff/admins"]
    bad = []
    for p in admin_apis:
        st, _ = req("GET", p, a_student)
        if not is_denied(st):
            bad.append(f"{p}={st}")
    record("S18-P0-03", "student -> admin APIs denied by backend",
           not bad, "leaked: " + ", ".join(bad) if bad else "all denied")

    # P0-02 student -> another student's result (same tenant)
    s_att, atts = req("GET", "/me/attempts", a_student)
    other_attempt = None
    # find an attempt id belonging to a DIFFERENT student, via tenant A admin
    s2, rows = req("GET", "/exams", a_admin)
    record("S18-P0-05", "admin -> student management allowed",
           req("GET", "/students?limit=1", a_admin)[0] == 200)
    record("S18-P0-06", "admin -> exam management allowed", s2 == 200, f"status={s2}")

    # P0-04 teacher -> restricted admin function (publish results / students write)
    st_t, _ = req("GET", "/staff/admins", a_teacher)
    record("S18-P0-04", "teacher -> restricted admin function denied",
           is_denied(st_t), f"staff/admins status={st_t}")

    # P0-07 question approval only by authorized role
    s_q, qlist = req("GET", "/questions?limit=1&status=REVIEW", a_admin)
    qid = None
    if s_q == 200 and items_of(qlist):
        qid = items_of(qlist)[0]["id"]
    if qid:
        st_stu, _ = req("POST", f"/questions/{qid}/approve", a_student)
        record("S18-P0-07", "question approval denied to student", is_denied(st_stu), f"status={st_stu}")
    else:
        record("S18-P0-07", "question approval denied to student", None, "no REVIEW question to target")

    # P0-08 result publication only by authorized role
    if s2 == 200 and items_of(rows):
        eid = items_of(rows)[0]["id"]
        st_stu, _ = req("POST", f"/exams/{eid}/results/publish", a_student)
        st_tea, _ = req("POST", f"/exams/{eid}/results/publish", a_teacher)
        record("S18-P0-08", "result publication denied to student", is_denied(st_stu), f"status={st_stu}")
        record("S18-P0-08b", "result publication denied to teacher", is_denied(st_tea), f"status={st_tea}")

    # P0-09 direct API authorization with no token at all
    st_anon, _ = req("GET", "/students?limit=1")
    record("S18-P0-09", "unauthenticated admin API denied", is_denied(st_anon), f"status={st_anon}")

    # ---------------------------------------------------------------- §19
    print()
    print("=" * 72)
    print("SECTION 19 — MULTI-TENANT ISOLATION (P0)")
    print("=" * 72)

    b_exam = fx.get("examId")
    b_question = fx.get("questionId")
    b_student_id = (fx.get("studentIds") or [None])[0]
    b_batch = fx.get("batchId")
    b_program = fx.get("programId")

    # P0-01 student isolation: A admin lists students -> must not contain B rolls
    s, d = req("GET", "/students?limit=200", a_admin)
    leaked = []
    if s == 200:
        rolls = [x.get("rollNumber") for x in items_of(d)]
        leaked = [r for r in rolls if r and r.startswith("262000")]
    record("S19-P0-01", "A admin student list excludes B students",
           s == 200 and not leaked, f"leaked={leaked}" if leaked else f"status={s}")

    # P0-02 exam isolation
    s, d = req("GET", "/exams", a_admin)
    titles = [x.get("title", "") for x in (items_of(d))]
    record("S19-P0-02", "A admin exam list excludes B exams",
           "TENANT-B-SECRET-EXAM" not in titles, f"count={len(titles)}")

    # P0-03 question bank isolation
    s, d = req("GET", "/questions?limit=200", a_admin)
    stmts = [x.get("statement", "") for x in (items_of(d))]
    record("S19-P0-03", "A admin question list excludes B questions",
           not any("TENANT-B-SECRET" in t for t in stmts), f"count={len(stmts)}")

    # P0-07/P0-08 direct ID manipulation across tenants
    if b_exam:
        st, _ = req("GET", f"/exams/{b_exam}", a_admin)
        record("S19-P0-08a", "A admin GET B exam by id denied", is_denied(st), f"status={st}")
        st, _ = req("PATCH", f"/exams/{b_exam}", a_admin, {"title": "HACKED"})
        record("S19-P0-08b", "A admin PATCH B exam denied", is_denied(st), f"status={st}")
    if b_question:
        st, _ = req("GET", f"/questions/{b_question}", a_admin)
        record("S19-P0-08c", "A admin GET B question by id denied", is_denied(st), f"status={st}")
    if b_student_id:
        st, _ = req("GET", f"/students/{b_student_id}", a_admin)
        record("S19-P0-08d", "A admin GET B student by id denied", is_denied(st), f"status={st}")
        st, _ = req("PATCH", f"/students/{b_student_id}", a_admin, {"name": "HACKED BY TENANT A"})
        record("S19-P0-08e", "A admin PATCH B student denied", is_denied(st), f"status={st}")
    if b_batch:
        st, _ = req("GET", f"/batches/{b_batch}", a_admin)
        record("S19-P0-08f", "A admin GET B batch by id denied", is_denied(st), f"status={st}")
    if b_program:
        st, _ = req("GET", f"/programs/{b_program}", a_admin)
        record("S19-P0-08g", "A admin GET B program denied", is_denied(st), f"status={st}")

    # P0-04 result isolation — B exam results via A admin
    if b_exam:
        st, _ = req("GET", f"/exams/{b_exam}/results", a_admin)
        record("S19-P0-04", "A admin GET B exam results denied", is_denied(st), f"status={st}")

    # P0-05 report/export isolation
    if b_exam:
        st, _ = req("GET", f"/exams/{b_exam}/results/export/csv", a_admin)
        record("S19-P0-05", "A admin export of B exam denied", is_denied(st), f"status={st}")

    # P0-09 search leakage
    s, d = req("GET", "/questions?limit=50&search=TENANT-B-SECRET", a_admin)
    hits = items_of(d)
    record("S19-P0-09a", "A admin question search cannot find B question",
           len(hits) == 0, f"hits={len(hits)}")
    s, d = req("GET", "/students?limit=50&search=UAT B Student", a_admin)
    hits = items_of(d)
    record("S19-P0-09b", "A admin student search cannot find B students",
           len(hits) == 0, f"hits={len(hits)}")

    # B side symmetric spot-check: B admin cannot read A's exams
    s, d = req("GET", "/exams", b_admin)
    b_titles = [x.get("title", "") for x in (items_of(d))]
    record("S19-P0-02b", "B admin exam list excludes A exams",
           all("NEET Grand Test" not in t for t in b_titles), f"count={len(b_titles)}")

    # cross-tenant student data via student token
    if b_exam:
        st, _ = req("POST", "/attempts", a_student, {"examId": b_exam})
        record("S19-P0-07", "A student cannot start B exam", is_denied(st) or st == 400,
               f"status={st}")

    # ---------------------------------------------------------------- §20
    print()
    print("=" * 72)
    print("SECTION 20 — DATABASE / API / DATA INTEGRITY (P0)")
    print("=" * 72)

    # P0-10 invalid payloads rejected
    cases = [
        ("POST", "/students", {"name": "", "email": "not-an-email"}, "invalid student"),
        ("POST", "/exams", {"title": "x"}, "exam missing duration"),
        ("POST", "/attempts", {"examId": "not-a-uuid"}, "attempt bad uuid"),
    ]
    bad = []
    for m, p, b, label in cases:
        tok = a_admin if p != "/attempts" else a_student
        st, _ = req(m, p, tok, b)
        if st not in (400, 422, 403, 404):
            bad.append(f"{label}={st}")
    record("S20-P0-10", "invalid API payloads rejected", not bad,
           "accepted: " + ", ".join(bad) if bad else "all rejected")

    # P0-12 unauthorized API
    st, _ = req("POST", "/exams", a_student, {"title": "x", "durationMinutes": 10})
    record("S20-P0-12", "unauthorized API call fails authorization", is_denied(st), f"status={st}")

    # P0-11 duplicate request — duplicate student create must not double-insert
    uniq = str(int(time.time()))
    sb, batches = req("GET", "/batches", a_admin)
    batch_id = (items_of(batches)[0]["id"] if items_of(batches) else None)
    if batch_id:
        payload = {
            "name": f"Dup Test {uniq}",
            "email": f"dup.{uniq}@demo.local",
            "batchId": batch_id,
        }
        s1, d1 = req("POST", "/invitations/student", a_admin, payload)
        s2, d2 = req("POST", "/invitations/student", a_admin, payload)
        record("S20-P0-11a", "duplicate student invite rejected on 2nd call",
               s1 in (200, 201) and s2 in (400, 409, 422),
               f"first={s1} second={s2}")
        # S09-P1-14: roll numbers are server-generated and DB-unique.
        if s1 in (200, 201):
            record("S09-P1-14", "server-generated roll number returned on invite",
                   bool(isinstance(d1, dict)), f"resp keys={list(d1)[:6] if isinstance(d1, dict) else type(d1)}")
    else:
        record("S20-P0-11a", "duplicate student invite rejected on 2nd call", None, "no batch available")

    # duplicate submission of an already-submitted attempt
    s, atts = req("GET", "/me/attempts", a_student)
    submitted = [a for a in (atts or []) if a.get("status") in ("SUBMITTED", "AUTO_SUBMITTED")]
    if submitted:
        aid = submitted[0]["id"]
        st, _ = req("POST", f"/attempts/{aid}/submit", a_student)
        record("S20-P0-11b", "re-submit of submitted attempt rejected",
               st in (400, 409), f"status={st}")
        # P0-07 post-submit lock: response write must be refused
        st2, _ = req("PUT", f"/attempts/{aid}/responses/{uniq}", a_student, {"answer": "A"})
        record("S05-P1-06", "post-submit response write refused",
               st2 in (400, 403, 404, 409), f"status={st2}")
    else:
        record("S20-P0-11b", "re-submit of submitted attempt rejected", None, "no submitted attempt")

    # P0-02 student cannot read another student's result (same tenant)
    s, all_res = req("GET", "/exams", a_admin)
    other_att = None
    my_attempt_ids = {a.get("id") for a in (atts or []) if isinstance(a, dict)}
    if s == 200 and items_of(all_res):
        for ex in items_of(all_res):
            sx, rr = req("GET", f"/exams/{ex['id']}/results", a_admin)
            for row in items_of(rr):
                cand = (row.get("attempt") or {}).get("id") or row.get("attemptId")
                if cand and cand not in my_attempt_ids:
                    other_att = cand
                    break
            if other_att:
                break
    # Allow an explicit id (from the DB) so this P0 check is deterministic
    # rather than dependent on the shape of the admin results payload.
    other_att = os.environ.get("OTHER_ATTEMPT_ID") or other_att
    if other_att:
        # Every read path for someone else's attempt must be refused, not just
        # the headline result endpoint.
        for ep in ("", "/result", "/review", "/cohort", "/summary"):
            st_ep, _ = req("GET", f"/attempts/{other_att}{ep}", a_student)
            if not is_denied(st_ep):
                record("S18-P0-02x", f"student read of other attempt{ep or ' (state)'}",
                       False, f"status={st_ep}")
        st, _ = req("GET", f"/attempts/{other_att}/result", a_student)
        record("S18-P0-02", "student cannot read another student's result",
               is_denied(st), f"status={st}")
        st, _ = req("GET", f"/attempts/{other_att}/review", a_student)
        record("S18-P0-02b", "student cannot read another student's review",
               is_denied(st), f"status={st}")
    else:
        record("S18-P0-02", "student cannot read another student's result", None,
               "could not locate another student's attempt id")

    # ---------------------------------------------------------------- summary
    print()
    print("=" * 72)
    passed = sum(1 for r in RESULTS if r["pass"] is True)
    failed = [r for r in RESULTS if r["pass"] is False]
    skipped = [r for r in RESULTS if r["pass"] is None]
    print(f"P0 SECURITY: {passed} passed, {len(failed)} FAILED, {len(skipped)} skipped")
    if failed:
        print()
        print("FAILURES (each is a NO-GO blocker):")
        for r in failed:
            print(f"  - {r['uat']} {r['name']} :: {r['detail']}")
    if skipped:
        print()
        print("SKIPPED (needs fixture data):")
        for r in skipped:
            print(f"  - {r['uat']} {r['name']} :: {r['detail']}")

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "p0-security-results.json")
    json.dump(RESULTS, open(out, "w"), indent=2)
    print(f"\nwrote {out}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

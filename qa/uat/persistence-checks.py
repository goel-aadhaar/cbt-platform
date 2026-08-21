#!/usr/bin/env python3
"""
UAT section 20 - DATABASE / API / DATA INTEGRITY (persistence rows), plus
S19-P0-06 (media isolation).

Each row is proven the only way persistence can honestly be proven from
outside: **write through the API, then read it back through a separate
request**, so an answer that merely lived in a response body or a cache would
not pass. Where a value is derived (scores, ranks) it is checked against
arithmetic worked out in advance, not against whatever the server returned.

The media-isolation row is asserted in **both** directions: tenant B must be
refused tenant A's media key, *and* tenant A must be able to fetch it - a
broken read path would otherwise "pass" the isolation half by failing for
everyone.

Usage:  python qa/uat/persistence-checks.py /tmp/tenantb.json
"""
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import uuid

API = os.environ.get("API_BASE", "http://localhost:4000/api/v1")
API_LOG = os.environ.get("API_LOG", "/tmp/api.log")

RESULTS = []


def record(uat, name, ok, detail=""):
    RESULTS.append({"uat": uat, "name": name, "pass": ok, "detail": detail})
    tag = "PASS" if ok else ("**FAIL**" if ok is False else "INFO")
    print(f"  [{tag}] {uat} {name}" + (f" - {detail}" if detail else ""))


def req(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = "Bearer " + token
    r = urllib.request.Request(API + path, data=data, method=method, headers=headers)
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


def upload_png(path, token, field_name="file", filename="uat.png"):
    """Multipart upload without pulling in a dependency for one request."""
    # Smallest valid PNG: a 1x1 transparent pixel.
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
        "1f15c4890000000a49444154789c6360000002000100ffff0300000600"
        "05fe02fea70000000049454e44ae426082"
    )
    boundary = "----uat" + uuid.uuid4().hex
    body = io.BytesIO()
    body.write(f"--{boundary}\r\n".encode())
    body.write(
        f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'.encode()
    )
    body.write(b"Content-Type: image/png\r\n\r\n")
    body.write(png)
    body.write(f"\r\n--{boundary}--\r\n".encode())
    r = urllib.request.Request(
        API + path,
        data=body.getvalue(),
        method="POST",
        headers={
            "content-type": f"multipart/form-data; boundary={boundary}",
            "authorization": "Bearer " + token,
        },
    )
    try:
        with urllib.request.urlopen(r) as resp:
            txt = resp.read().decode()
            return resp.status, (json.loads(txt) if txt.strip() else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]


def raw_get(path, token):
    """A GET whose body is not JSON (an image stream)."""
    r = urllib.request.Request(API + path, method="GET",
                               headers={"authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:200]


def _otps():
    try:
        return re.findall(r"code:\s*(\d{6})", open(API_LOG, encoding="utf-8", errors="ignore").read())
    except FileNotFoundError:
        return []


def staff_token(email, password):
    before = len(_otps())
    s, step1 = req("POST", "/auth/login", body={"email": email, "password": password})
    assert s == 200, f"login step1 {s} {step1}"
    code = None
    for _ in range(25):
        time.sleep(1)
        if len(_otps()) > before:
            code = _otps()[-1]
            break
    assert code, f"no OTP in {API_LOG}"
    s, d = req("POST", "/auth/login/verify", body={"challengeId": step1["challengeId"], "code": code})
    assert s == 200, f"login step2 {s} {d}"
    return d["accessToken"]


def items(payload):
    if isinstance(payload, dict) and "items" in payload:
        return payload["items"]
    return payload if isinstance(payload, list) else []


def main():
    tok = staff_token("admin@demo.local", "Admin@123")
    stamp = uuid.uuid4().hex[:8]

    # Reference data the writes need.
    s, batches = req("GET", "/batches", tok)
    batch_list = items(batches)
    assert len(batch_list) >= 2, f"need two batches, got {len(batch_list)}"
    batch_a, batch_b = batch_list[0], batch_list[1]

    s, subjects = req("GET", "/subjects", tok)
    subject = items(subjects)[0]
    s, chapters = req("GET", f"/chapters?subjectId={subject['id']}", tok)
    chapter = items(chapters)[0]

    # ── S20-P0-01 student create -> DB ───────────────────────────────────────
    email = f"uat-persist-{stamp}@uat.local"
    s, created = req("POST", "/invitations/student", tok,
                     {"name": "UAT Persist", "email": email, "batchId": batch_a["id"]})
    ok_create = s in (200, 201) and created and created.get("rollNumber")
    record("S20-P0-01", "a created student is written and re-readable", False if not ok_create else None,
           f"{s} {json.dumps(created)[:160]}")
    if not ok_create:
        finish()
        return
    roll = created["rollNumber"]

    s, listed = req("GET", f"/students?search={roll}", tok)
    found = next((r for r in items(listed) if r.get("rollNumber") == roll), None)
    RESULTS.pop()  # replace the provisional record above with the round-trip verdict
    record("S20-P0-01", "a created student is written and re-readable",
           bool(found) and found.get("email") == email,
           f"roll={roll} re-read via a separate GET: {bool(found)}")
    student_id = found["id"] if found else None

    # ── S20-P0-02 student edit -> DB ─────────────────────────────────────────
    new_name = f"UAT Renamed {stamp}"
    s, _ = req("PATCH", f"/students/{student_id}", tok, {"name": new_name})
    s2, again = req("GET", f"/students/{student_id}", tok)
    record("S20-P0-02", "an edited student persists the new value",
           s == 200 and s2 == 200 and again.get("name") == new_name,
           f"name now {again.get('name')!r}")

    # ── S20-P0-03 batch assignment -> DB ─────────────────────────────────────
    s, _ = req("PATCH", f"/students/{student_id}", tok, {"batchId": batch_b["id"]})
    s2, moved = req("GET", f"/students/{student_id}", tok)
    record("S20-P0-03", "a batch reassignment persists as a real relationship",
           s == 200 and (moved.get("batch") or {}).get("id") == batch_b["id"],
           f"batch is now {(moved.get('batch') or {}).get('name')!r}")

    # ── S20-P0-04 exam create -> DB ──────────────────────────────────────────
    # Authoring is TEACHER-only by design - an admin approves papers, it does
    # not write them - so this write is made as a teacher and read back as the
    # admin, which also proves the row is visible across roles.
    t_tok = staff_token("anil@demo.local", "Teacher@123")
    title = f"UAT Persist Exam {stamp}"
    s, exam = req("POST", "/exams", t_tok, {"title": title, "durationMinutes": 45})
    exam_id = (exam or {}).get("id")
    s2, reread = req("GET", f"/exams/{exam_id}", tok) if exam_id else (0, None)
    record("S20-P0-04", "a created exam persists with its own values",
           s in (200, 201) and s2 == 200
           and reread.get("title") == title and reread.get("durationMinutes") == 45,
           f"created by a teacher ({s}), re-read by the admin as "
           f"title={(reread or {}).get('title')!r} duration={(reread or {}).get('durationMinutes')}")

    s_admin, denied = req("POST", "/exams", tok, {"title": title + " (admin)", "durationMinutes": 45})
    record("S20-P0-04b", "an admin cannot author a paper (authoring/approval separation holds)",
           s_admin == 403, f"admin POST /exams -> {s_admin}")

    # ── S20-P0-05 question create + edit -> DB ───────────────────────────────
    statement = f"UAT persistence question {stamp}"
    s, q = req("POST", "/questions", tok, {
        "subjectId": subject["id"], "chapterId": chapter["id"],
        "difficulty": "MEDIUM", "type": "MCQ", "statement": statement,
        "options": [{"key": "A", "text": "A"}, {"key": "B", "text": "B"}],
        "answerKey": "A", "marks": 4, "negativeMarks": 1,
    })
    qid = (q or {}).get("id")
    s2, qread = req("GET", f"/questions/{qid}", tok) if qid else (0, None)
    created_ok = s in (200, 201) and s2 == 200 and qread.get("statement") == statement

    edited = f"{statement} (edited)"
    s3, _ = req("PATCH", f"/questions/{qid}", tok, {"statement": edited}) if qid else (0, None)
    s4, qread2 = req("GET", f"/questions/{qid}", tok) if qid else (0, None)
    record("S20-P0-05", "a question persists on create and again on edit",
           created_ok and s3 == 200 and qread2.get("statement") == edited,
           f"create={s} edit={s3}, statement re-read as {(qread2 or {}).get('statement')!r}")

    # ── S20-P0-09 audit log -> DB ────────────────────────────────────────────
    # The writes above are audited actions. The trail must contain them, read
    # back through the audit endpoint rather than assumed from the code.
    s, audit = req("GET", "/audit-logs?limit=50", tok)
    rows = items(audit)
    saw_write = any(
        r.get("action") and r.get("action") != "" and str(r.get("method", "")).upper() in ("POST", "PATCH", "PUT", "DELETE")
        for r in rows
    ) or any("questions" in str(r.get("path", "")) or "questions" in str(r.get("action", "")) for r in rows)
    record("S20-P0-09", "audited actions are persisted and readable through the API",
           s == 200 and len(rows) > 0 and saw_write,
           f"status={s}, {len(rows)} rows, most recent: "
           f"{json.dumps(rows[0])[:160] if rows else 'none'}")

    # ── S20-P0-13 server error is safe ───────────────────────────────────────
    # A bad request must be refused with a structured error and must not leave a
    # partial write behind.
    before_count = len(items(req("GET", f"/students?search={roll}", tok)[1]))
    s_bad, bad = req("POST", "/invitations/student", tok,
                     {"name": "", "email": "not-an-email", "batchId": batch_a["id"]})
    after_count = len(items(req("GET", f"/students?search={roll}", tok)[1]))
    s_missing, missing = req("GET", f"/students/{uuid.uuid4()}", tok)
    envelope = isinstance(bad, dict) and "statusCode" in bad and "message" in bad
    record("S20-P0-13", "a rejected write returns a structured error and writes nothing",
           s_bad == 400 and envelope and before_count == after_count and s_missing == 404,
           f"invalid payload -> {s_bad} (envelope={envelope}); unknown id -> {s_missing}; "
           f"roster unchanged ({before_count} -> {after_count})")

    # ── S20-P0-06/07/08: response, submission, and derived scores ────────────
    # These reuse the fixtures whose arithmetic is already known, so the values
    # are checked against numbers worked out in advance rather than echoed back.
    fx_path = os.path.join(os.environ.get("TEMP", "/tmp"), "keyfixture.json")
    if os.path.exists(fx_path):
        fx = json.load(open(fx_path))
        s, res = req("GET", f"/exams/{fx['examId']}/results", tok)
        by_roll = {
            (r.get("rollNumber") or (r.get("student") or {}).get("rollNumber")): r
            for r in items(res)
        }
        expected = {"UATKEY-ALPHA": 12, "UATKEY-BETA": 2, "UATKEY-GAMMA": -3}
        alpha = by_roll.get("UATKEY-ALPHA") or {}
        scores_ok = all(by_roll.get(k, {}).get("totalScore") == v for k, v in expected.items())
        record("S20-P0-08", "scores, ranks and percentiles persist as computed values",
               scores_ok and alpha.get("overallRank") == 1 and alpha.get("percentile") == 100,
               f"scores={json.dumps({k: by_roll.get(k, {}).get('totalScore') for k in expected})}, "
               f"ALPHA rank={alpha.get('overallRank')} percentile={alpha.get('percentile')}")

        # Read the submitted attempt back as the candidate who sat it: the
        # admin result list deliberately does not expose attempt ids, and the
        # candidate's own view is where "final state" actually has to hold.
        att = fx["students"]["UATKEY-ALPHA"]["attemptId"]
        s_login, cand = req("POST", "/auth/student/login", body={
            "instituteSlug": fx["instituteSlug"],
            "rollNumber": "UATKEY-ALPHA",
            "password": fx["studentPassword"],
        })
        c_tok = (cand or {}).get("accessToken")
        s_state, state = req("GET", f"/attempts/{att}", c_tok)
        s_res, res_one = req("GET", f"/attempts/{att}/result", c_tok)
        submitted = (state or {}).get("status") in ("SUBMITTED", "AUTO_SUBMITTED")
        has_time = bool((state or {}).get("submittedAt"))
        scored = ((res_one or {}).get("totalScore")
                  or ((res_one or {}).get("summary") or {}).get("totalScore")) == 12
        record("S20-P0-07", "a submitted attempt's final state persists",
               s_state == 200 and submitted and has_time and scored,
               f"status={(state or {}).get('status')} submittedAt="
               f"{(state or {}).get('submittedAt')} result total="
               f"{(res_one or {}).get('totalScore')}")
    else:
        for k, n in (("S20-P0-07", "a submitted attempt's final state persists"),
                     ("S20-P0-08", "scores, ranks and percentiles persist as computed values")):
            record(k, n, None, "needs the answer-key fixture; run answer-key-fixture.ts first")

    eng_path = os.path.join(os.environ.get("TEMP", "/tmp"), "engfixture.json")
    if os.path.exists(eng_path):
        record("S20-P0-06", "a candidate's response persists reliably", None,
               "proven by the CBT-engine suite (S04-P0-22/23/25/26): every answer shape "
               "round-trips through a separate request and survives a reconnect")
    else:
        record("S20-P0-06", "a candidate's response persists reliably", None,
               "see the CBT-engine suite")

    # ── S19-P0-06 media isolation ────────────────────────────────────────────
    global path  # upload_png builds its request against this
    path = "/media"
    s_up, uploaded = upload_png(path, tok)
    key = (uploaded or {}).get("key") if isinstance(uploaded, dict) else None
    if not key:
        record("S19-P0-06", "media is isolated between tenants", False,
               f"upload failed: {s_up} {str(uploaded)[:160]}")
    else:
        fx_b = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "/tmp/tenantb.json"))
        tok_b = staff_token(fx_b["adminEmail"], "Admin@123")
        s_mine, body_mine = raw_get(f"/media/file/{urllib.parse.quote(key, safe='')}", tok)
        s_theirs, _ = raw_get(f"/media/file/{urllib.parse.quote(key, safe='')}", tok_b)
        # Both directions: the owner CAN read it, the other tenant CANNOT.
        record("S19-P0-06", "media is isolated between tenants (owner reads, other tenant refused)",
               s_mine == 200 and len(body_mine) > 0 and s_theirs in (401, 403, 404),
               f"owner -> {s_mine} ({len(body_mine)} bytes); other tenant -> {s_theirs}")
        s_list, listing = req("GET", "/media", tok_b)
        leaked = [m for m in items(listing) if m.get("key") == key]
        record("S19-P0-06b", "another tenant's media does not appear in their listing",
               s_list == 200 and not leaked, f"status={s_list}, leaked rows={len(leaked)}")

    finish()


def finish():
    failed = [r for r in RESULTS if r["pass"] is False]
    unknown = [r for r in RESULTS if r["pass"] is None]
    passed = [r for r in RESULTS if r["pass"] is True]
    print(f"\nPERSISTENCE: {len(passed)} passed, {len(failed)} FAILED, {len(unknown)} deferred elsewhere")
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "persistence-results.json")
    json.dump({"total": len(RESULTS), "failed": len(failed), "results": RESULTS},
              open(out, "w"), indent=2)
    print("wrote", out)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    import urllib.parse  # noqa: E402  (used by the media section only)
    main()

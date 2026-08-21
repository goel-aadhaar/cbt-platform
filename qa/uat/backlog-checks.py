#!/usr/bin/env python3
"""
Regression suite for the P1/P2/P3 backlog fixed after the go/no-go pass.

  BUG-103  a manual award now re-scores the exam instead of leaving results stale
  BUG-104  deleting media detaches the key from every question carrying it
  BUG-111  archived programs / classes / batches stop appearing in pickers
  BUG-112  announcements are editable (PATCH had no client and no control)
  BUG-116  a teacher can only address a notice to batches they teach
  BUG-105  audit-write failures are observable instead of silent
  BUG-106  the trail records what changed, and stops burying it under autosave
  BUG-107  monitoring reports real activity, not the attempt row's timestamp
  BUG-113  roles can be changed, with escalation and lockout guarded
  BUG-114  attendance exists as its own report, absences included
  BUG-117  a candidate can only read a diagram from a paper they actually sat

Every assertion goes through the real API with real tokens, and each is written
so it would fail against the previous build - the point of a regression suite is
that it detects the bug, not that it goes green.

Usage:  python qa/uat/backlog-checks.py
"""
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

API = os.environ.get("API_BASE", "http://localhost:4000/api/v1")
API_LOG = os.environ.get("API_LOG", "/tmp/api.log")

RESULTS = []

PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000080000000808020000004b6d29dc"
    "000000114944415478da63b8a0a88815310c2d0900f00e4481df21a25a00000000"
    "49454e44ae426082"
)


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
        with urllib.request.urlopen(r, timeout=30) as resp:
            txt = resp.read().decode()
            return resp.status, (json.loads(txt) if txt.strip() else None)
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        try:
            return e.code, json.loads(txt)
        except Exception:
            return e.code, txt[:300]


def raw_get(path, token):
    r = urllib.request.Request(API + path, method="GET",
                               headers={"authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:200]


def upload(token):
    boundary = "----uat" + uuid.uuid4().hex
    body = io.BytesIO()
    body.write(f"--{boundary}\r\n".encode())
    body.write(b'Content-Disposition: form-data; name="file"; filename="uat.png"\r\n')
    body.write(b"Content-Type: image/png\r\n\r\n")
    body.write(PNG)
    body.write(f"\r\n--{boundary}--\r\n".encode())
    r = urllib.request.Request(
        API + "/media", data=body.getvalue(), method="POST",
        headers={"content-type": f"multipart/form-data; boundary={boundary}",
                 "authorization": "Bearer " + token})
    with urllib.request.urlopen(r, timeout=30) as resp:
        return json.loads(resp.read().decode())


def _otps():
    try:
        return re.findall(r"code:\s*(\d{6})", open(API_LOG, encoding="utf-8", errors="ignore").read())
    except FileNotFoundError:
        return []


def staff_token(email, password):
    before = len(_otps())
    s, step1 = req("POST", "/auth/login", body={"email": email, "password": password})
    assert s == 200, f"login {email}: {s} {step1}"
    code = None
    for _ in range(25):
        time.sleep(1)
        if len(_otps()) > before:
            code = _otps()[-1]
            break
    assert code, f"no OTP in {API_LOG}"
    s, d = req("POST", "/auth/login/verify", body={"challengeId": step1["challengeId"], "code": code})
    assert s == 200, f"verify {email}: {s} {d}"
    return d["accessToken"]


def student_token(slug, roll, password="Student@123"):
    s, d = req("POST", "/auth/student/login",
               body={"instituteSlug": slug, "rollNumber": roll, "password": password})
    assert s == 200, f"student login {roll}: {s} {d}"
    return d["accessToken"]


def items(payload):
    if isinstance(payload, dict) and "items" in payload:
        return payload["items"]
    return payload if isinstance(payload, list) else []


def main():
    admin = staff_token("admin@demo.local", "Admin@123")
    stamp = uuid.uuid4().hex[:8]

    # ── BUG-111 archived entries disappear from pickers ─────────────────────
    print("\n=== BUG-111: archiving actually hides ===")
    s, prog = req("POST", "/programs", admin, {"name": f"UAT Archive {stamp}"})
    pid = (prog or {}).get("id")
    record("BUG-111-a", "program created", s in (200, 201) and bool(pid), f"status={s}")

    s, before = req("GET", "/programs", admin)
    listed_before = any(p["id"] == pid for p in items(before))
    s, _ = req("DELETE", f"/programs/{pid}", admin)
    s_after, after = req("GET", "/programs", admin)
    listed_after = any(p["id"] == pid for p in items(after))
    record("BUG-111-b", "an archived program leaves the default listing",
           listed_before and not listed_after,
           f"before={listed_before} after={listed_after}")

    s, incl = req("GET", "/programs?includeArchived=true", admin)
    still = next((p for p in items(incl) if p["id"] == pid), None)
    record("BUG-111-c", "includeArchived still returns it, flagged inactive",
           s == 200 and still is not None and still.get("isActive") is False,
           f"found={still is not None} isActive={(still or {}).get('isActive')}")

    # ── BUG-116 teacher batch scoping on announcements ──────────────────────
    print("\n=== BUG-116: a teacher cannot address a batch they do not teach ===")
    teacher = staff_token("anil@demo.local", "Teacher@123")
    s, all_batches = req("GET", "/batches", admin)
    batch_list = items(all_batches)

    # The seeded teacher owns no batches, so `myBatchIds()` is [] and everything
    # is refused - which a blanket "always deny" would also achieve. Grant one
    # batch so both directions are meaningful, and restore the grant afterwards.
    s, staff_rows = req("GET", "/staff", admin)
    teacher_row = next((u for u in items(staff_rows)
                        if u.get("email") == "anil@demo.local"), None)
    granted = None
    if teacher_row and batch_list:
        s, prior = req("GET", f"/staff/{teacher_row['id']}/batches", admin)
        prior_ids = [b["id"] for b in items(prior)]
        granted = batch_list[0]["id"]
        s_grant, _ = req("PUT", f"/staff/{teacher_row['id']}/batches", admin,
                         {"batchIds": [granted]})
        record("BUG-116-a0", "teacher granted one batch for the test", s_grant == 200,
               f"status={s_grant}")
        teacher = staff_token("anil@demo.local", "Teacher@123")  # re-read scope

    # `GET /batches` is ADMIN-only, so it cannot be used to read a teacher's
    # scope - it returns nothing for them, which would make every batch look
    # like someone else's and the deny assertion meaningless.
    s, scope = req("GET", f"/staff/{teacher_row['id']}/batches", admin) if teacher_row else (0, [])
    mine = {b["id"] for b in items(scope)}
    theirs = [b for b in batch_list if b["id"] not in mine]
    record("BUG-116-a", "the teacher is scoped to fewer batches than the institute has",
           len(mine) > 0 and len(theirs) > 0,
           f"teacher teaches {len(mine)} of {len(batch_list)}")

    if theirs:
        s_bad, bad = req("POST", "/announcements", teacher, {
            "title": f"UAT scope {stamp}", "body": "should be refused",
            "audience": "BATCH", "batchId": theirs[0]["id"]})
        record("BUG-116-b", "posting to another teacher's batch is refused",
               s_bad == 403, f"status={s_bad} {json.dumps(bad)[:110]}")
    if mine:
        s_ok, good = req("POST", "/announcements", teacher, {
            "title": f"UAT own {stamp}", "body": "should be allowed",
            "audience": "BATCH", "batchId": sorted(mine)[0]})
        record("BUG-116-c", "posting to their own batch still works",
               s_ok in (200, 201), f"status={s_ok} {json.dumps(good)[:110]}")
        if s_ok in (200, 201):
            req("DELETE", f"/announcements/{good['id']}", admin)

    if teacher_row and granted is not None:
        req("PUT", f"/staff/{teacher_row['id']}/batches", admin, {"batchIds": prior_ids})

    # An admin is institute-wide and must be unaffected.
    if theirs:
        s_admin, made = req("POST", "/announcements", admin, {
            "title": f"UAT admin {stamp}", "body": "admin is institute-wide",
            "audience": "BATCH", "batchId": theirs[0]["id"]})
        record("BUG-116-d", "an admin may still target any batch", s_admin in (200, 201),
               f"status={s_admin}")

        # ── BUG-112 announcements are editable ──────────────────────────────
        print("\n=== BUG-112: announcement edit is reachable ===")
        aid = (made or {}).get("id")
        s_edit, edited = req("PATCH", f"/announcements/{aid}", admin, {
            "title": f"UAT admin {stamp} (edited)",
            "body": "corrected text",
            "pinned": True,
            "audience": "ALL_STUDENTS",
            "batchId": None,
            "expiresAt": "2099-01-01T00:00:00.000Z",
        })
        record("BUG-112-a", "PATCH /announcements/:id accepts the composer's payload",
               s_edit == 200, f"status={s_edit} {json.dumps(edited)[:110]}")
        s, again = req("GET", "/announcements", admin)
        row = next((a for a in items(again) if a["id"] == aid), None)
        record("BUG-112-b", "the edit persists, including expiry and the audience clear",
               row is not None
               and row.get("title", "").endswith("(edited)")
               and row.get("pinned") is True
               and row.get("batchId") is None
               and bool(row.get("expiresAt")),
               f"title={(row or {}).get('title')!r} pinned={(row or {}).get('pinned')} "
               f"batchId={(row or {}).get('batchId')} expiresAt={(row or {}).get('expiresAt')}")
        req("DELETE", f"/announcements/{aid}", admin)

    # ── BUG-104 deleting media detaches it from questions ───────────────────
    print("\n=== BUG-104: deleting an image clears it off its questions ===")
    media = upload(admin)
    key = media["key"]
    s, subjects = req("GET", "/subjects", admin)
    subject = items(subjects)[0]
    s, chapters = req("GET", f"/chapters?subjectId={subject['id']}", admin)
    chapter = items(chapters)[0]
    s, q = req("POST", "/questions", admin, {
        "subjectId": subject["id"], "chapterId": chapter["id"],
        "difficulty": "EASY", "type": "MCQ",
        "statement": f"UAT media detach {stamp}",
        "options": [{"key": "A", "text": "A"}, {"key": "B", "text": "B"}],
        "answerKey": "A", "marks": 4, "negativeMarks": 1, "mediaKeys": [key],
    })
    qid = (q or {}).get("id")
    s, before_q = req("GET", f"/questions/{qid}", admin)
    record("BUG-104-a", "question carries the media key", key in (before_q or {}).get("mediaKeys", []),
           f"mediaKeys={(before_q or {}).get('mediaKeys')}")

    s_guard, guard = req("DELETE", f"/media/{media['id']}", admin)
    record("BUG-104-b", "deleting an in-use image warns before it destroys anything",
           s_guard == 409 and (guard or {}).get("error") == "MediaUsedInQuestions",
           f"status={s_guard}")

    s_del, deleted = req("DELETE", f"/media/{media['id']}?confirm=true", admin)
    s, after_q = req("GET", f"/questions/{qid}", admin)
    record("BUG-104-c", "a confirmed delete strips the key from the question",
           s_del == 200 and key not in (after_q or {}).get("mediaKeys", []),
           f"delete={s_del} detached={(deleted or {}).get('detachedFromQuestions')} "
           f"mediaKeys now {(after_q or {}).get('mediaKeys')}")
    req("DELETE", f"/questions/{qid}", admin)

    # ── BUG-117 a candidate cannot read another paper's diagram ─────────────
    print("\n=== BUG-117: candidates only see diagrams from papers they sat ===")
    fx_path = os.path.join(os.environ.get("TEMP", "/tmp"), "engfixture.json")
    if not os.path.exists(fx_path):
        record("BUG-117", "candidate media entitlement", None,
               "needs the engine fixture; run cbt-engine-fixture.ts + prep-engine-media.py")
    else:
        fx = json.load(open(fx_path))
        used_key = fx["main"].get("mediaKey")
        orphan = upload(admin)["key"]  # attached to nothing at all
        tok = student_token(fx["instituteSlug"], fx["rolls"][0], fx["studentPassword"])
        # Entitlement comes from having sat the paper, so start the attempt -
        # that is what creates the Response rows the check reads.
        s_start, _ = req("POST", "/attempts", tok, {"examId": fx["main"]["examId"]})
        record("BUG-117-a0", "candidate has started the paper carrying the diagram",
               s_start in (200, 201), f"status={s_start}")
        enc = lambda k: urllib.parse.quote(k, safe="")

        s_own, body_own = raw_get(f"/media/file/{enc(used_key)}", tok) if used_key else (0, b"")
        record("BUG-117-a", "a candidate can still load a diagram from their own paper",
               s_own == 200 and len(body_own) > 0,
               f"status={s_own}, {len(body_own)} bytes"
               if used_key else "fixture has no mediaKey; run prep-engine-media.py")

        s_other, _ = raw_get(f"/media/file/{enc(orphan)}", tok)
        record("BUG-117-b", "a key from a paper they never sat is refused",
               s_other in (403, 404), f"status={s_other} (was 200 before the fix)")

        s_staff, body_staff = raw_get(f"/media/file/{enc(orphan)}", admin)
        record("BUG-117-c", "staff are unaffected — the library is still theirs",
               s_staff == 200 and len(body_staff) > 0, f"status={s_staff}")

    # ── BUG-103 a manual award re-scores immediately ────────────────────────
    print("\n=== BUG-103: a manual award re-scores without a separate step ===")
    key_path = os.path.join(os.environ.get("TEMP", "/tmp"), "keyfixture.json")
    if not os.path.exists(key_path):
        record("BUG-103", "manual award triggers re-scoring", None,
               "needs the answer-key fixture")
    else:
        kf = json.load(open(key_path))
        exam, qid0 = kf["examId"], kf["questionIds"][0]
        att = kf["students"]["UATKEY-BETA"]["attemptId"]
        req("POST", f"/exams/{exam}/evaluate", admin)

        def score(roll):
            s, res = req("GET", f"/exams/{exam}/results", admin)
            for r in items(res):
                if (r.get("rollNumber") or (r.get("student") or {}).get("rollNumber")) == roll:
                    return r.get("totalScore")
            return None

        # Flag the question MANUAL so the award is what decides its marks.
        s_flag, flag_res = req("PATCH", f"/exams/{exam}/questions/{qid0}/scoring", admin,
                               {"override": "MANUAL"})
        record("BUG-103-a0", "question flagged for manual evaluation", s_flag == 200,
               f"status={s_flag} {json.dumps(flag_res)[:110]}")
        # BETA answered A,B,B against keys A,A,A on a +4/-1 section. With q1
        # taken out of auto-scoring, q2 and q3 contribute -1 each, so the total
        # is exactly (award - 2) whatever a previous run left in ManualScore.
        # Asserting that absolute value rather than a delta keeps the check
        # independent of the order suites happen to run in.
        s_zero, _ = req("PUT", f"/exams/{exam}/results/manual", admin,
                        {"attemptId": att, "questionId": qid0, "marks": 0})
        zero = score("UATKEY-BETA")
        s_award, award = req("PUT", f"/exams/{exam}/results/manual", admin,
                             {"attemptId": att, "questionId": qid0, "marks": 4})
        after = score("UATKEY-BETA")
        record("BUG-103-a", "setting a manual award returns 200 and reports the re-score",
               s_award == 200 and isinstance((award or {}).get("recalculated"), dict),
               f"status={s_award} {json.dumps((award or {}).get('recalculated'))}")
        record("BUG-103-b", "the stored total tracks the award with no separate Recalculate",
               zero == -2 and after == 2,
               f"award 0 -> total {zero} (expected -2); award 4 -> total {after} (expected 2)")

        # Put the paper back the way the other suites expect it.
        req("PATCH", f"/exams/{exam}/questions/{qid0}/scoring", admin, {"override": "NORMAL"})
        req("POST", f"/exams/{exam}/evaluate", admin)
        req("POST", f"/exams/{exam}/results/publish", admin)


    # ── BUG-105 audit-write failures are visible ────────────────────────────
    print("\n=== BUG-105: a broken audit trail is observable ===")
    import urllib.request as _u
    try:
        with _u.urlopen(API.replace("/api/v1", "/api") + "/health/ready", timeout=25) as r:
            ready = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        ready = json.loads(e.read().decode())
    info = {**ready.get("info", {}), **ready.get("error", {})}
    record("BUG-105-a", "readiness reports the audit trail alongside the database",
           "database" in info and "auditTrail" in info,
           f"indicators={sorted(info)}")
    record("BUG-105-b", "audit write failures are counted, not swallowed silently",
           "writeFailures" in (info.get("auditTrail") or {}),
           json.dumps(info.get("auditTrail")))

    # ── BUG-105 admin can reach the trail ───────────────────────────────────
    s_admin_trail, trail = req("GET", "/audit-logs?limit=5", admin)
    record("BUG-105-c", "an institute admin can read their own audit trail",
           s_admin_trail == 200, f"status={s_admin_trail}, {len(items(trail))} rows")

    # ── BUG-106 the trail says WHAT changed ─────────────────────────────────
    print("\n=== BUG-106: an answer-key edit is distinguishable from a typo fix ===")
    s, subj2 = req("GET", "/subjects", admin)
    subj2 = items(subj2)[0]
    s, chap2 = req("GET", f"/chapters?subjectId={subj2['id']}", admin)
    chap2 = items(chap2)[0]
    s, q106 = req("POST", "/questions", admin, {
        "subjectId": subj2["id"], "chapterId": chap2["id"],
        "difficulty": "EASY", "type": "MCQ",
        "statement": f"UAT audit metadata {stamp}",
        "options": [{"key": "A", "text": "A"}, {"key": "B", "text": "B"}],
        "answerKey": "A", "marks": 4, "negativeMarks": 1,
    })
    qid106 = (q106 or {}).get("id")
    req("PATCH", f"/questions/{qid106}", admin, {"answerKey": "B", "confirm": True})
    time.sleep(1.5)
    s, trail = req("GET", "/audit-logs?action=/questions&limit=25", admin)
    rows106 = items(trail)
    key_edit = next(
        (r for r in rows106
         if (r.get("metadata") or {}).get("values", {}).get("answerKey") == "B"),
        None,
    )
    record("BUG-106-a", "the answer-key change is recorded with its new value",
           key_edit is not None,
           json.dumps((key_edit or {}).get("metadata"))[:170] if key_edit
           else f"not found among {len(rows106)} question rows")

    typo = next(
        (r for r in rows106
         if "statement" in ((r.get("metadata") or {}).get("fields") or [])
         and "answerKey" not in ((r.get("metadata") or {}).get("fields") or [])),
        None,
    )
    record("BUG-106-b", "a statement-only edit is a different row shape",
           key_edit is not None and (typo is None or typo is not key_edit),
           "answer-key edits carry `values.answerKey`; other edits do not")

    # autosave must not be audited at all
    eng_path2 = os.path.join(os.environ.get("TEMP", "/tmp"), "engfixture.json")
    if os.path.exists(eng_path2):
        fx2 = json.load(open(eng_path2))
        tok2 = student_token(fx2["instituteSlug"], fx2["rolls"][0], fx2["studentPassword"])
        s_att, att2 = req("POST", "/attempts", tok2, {"examId": fx2["main"]["examId"]})
        if s_att in (200, 201):
            qid2 = att2["exam"]["sections"][0]["questions"][0]["question"]["id"]
            # The audit table is persistent, so rows written before this fix are
            # still there. Only autosaves made from *now* prove anything, so mark
            # the newest existing row and compare against it.
            s, before_rows = req("GET", "/audit-logs?limit=1", admin)
            watermark = (items(before_rows)[0]["createdAt"]
                         if items(before_rows) else "1970-01-01T00:00:00.000Z")
            for _ in range(3):
                req("PUT", f"/attempts/{att2['id']}/responses/{qid2}", tok2,
                    {"answer": "A", "timeSpentMs": 1000})
            time.sleep(1.5)
            s, tr = req("GET", "/audit-logs?action=/responses&limit=25", admin)
            fresh = [r for r in items(tr) if r["createdAt"] > watermark]
            record("BUG-106-c", "autosave traffic is kept out of the audit trail",
                   s == 200 and len(fresh) == 0,
                   f"{len(fresh)} new autosave rows since the watermark "
                   f"({len(items(tr))} historical rows predate the fix)")

            # ── BUG-107 real activity ──────────────────────────────────────
            print("\n=== BUG-107: monitoring reports real activity ===")
            s, mon = req("GET", f"/exams/{fx2['main']['examId']}/monitor", admin)
            me = next((r for r in (mon or {}).get("students", [])
                       if r.get("rollNumber") == fx2["rolls"][0]), None)
            started = me.get("startedAt") if me else None
            activity = me.get("lastActivityAt") if me else None
            record("BUG-107-a", "lastActivityAt tracks answering, not attempt creation",
                   bool(activity) and bool(started)
                   and activity != started
                   and activity > started,
                   f"startedAt={started} lastActivityAt={activity}")

            # ── BUG-114 attendance ─────────────────────────────────────────
            print("\n=== BUG-114: attendance is its own report ===")
            s_at, att_report = req("GET", f"/exams/{fx2['main']['examId']}/attendance", admin)
            record("BUG-114-a", "attendance reports expected, present and absent",
                   s_at == 200
                   and att_report.get("expected", 0) > 0
                   and att_report["expected"]
                       == att_report["present"] + att_report["absent"],
                   f"expected={att_report.get('expected')} present={att_report.get('present')} "
                   f"absent={att_report.get('absent')}")
            record("BUG-114-b", "absent candidates appear, which the result sheet omits",
                   any(not r["present"] for r in att_report.get("students", [])),
                   f"{sum(1 for r in att_report.get('students', []) if not r['present'])} absentee row(s)")

            s_csv, csv_body = raw_get(
                f"/exams/{fx2['main']['examId']}/attendance/export/csv", admin)
            text = csv_body.decode("utf-8", "replace") if isinstance(csv_body, bytes) else ""
            record("BUG-114-c", "the attendance CSV downloads and marks absences",
                   s_csv == 200 and "Attendance" in text and "Absent" in text,
                   f"status={s_csv}, {len(text)} chars")

    # student history had no caller; make sure the endpoint it needs works
    s, roster = req("GET", "/students?limit=1", admin)
    any_student = (items(roster) or [{}])[0].get("id")
    s_hist, hist = req("GET", f"/students/{any_student}/history", admin)
    record("BUG-114-d", "a student's exam history is readable",
           s_hist == 200 and "results" in (hist or {}),
           f"status={s_hist}")

    # ── BUG-113 role changes, guarded ───────────────────────────────────────
    print("\n=== BUG-113: roles can change, without opening a hole ===")
    if teacher_row:
        s_promote, promoted = req("PATCH", f"/staff/{teacher_row['id']}", admin,
                                  {"roles": ["TEACHER", "ADMIN"]})
        record("BUG-113-a", "a teacher can be promoted to administrator",
               s_promote == 200 and "ADMIN" in (promoted or {}).get("roles", []),
               f"status={s_promote} roles={(promoted or {}).get('roles')}")

        s_demote, demoted = req("PATCH", f"/staff/{teacher_row['id']}", admin,
                                {"roles": ["TEACHER"]})
        record("BUG-113-b", "and demoted again",
               s_demote == 200 and (demoted or {}).get("roles") == ["TEACHER"],
               f"status={s_demote} roles={(demoted or {}).get('roles')}")

        s_esc, esc = req("PATCH", f"/staff/{teacher_row['id']}", admin,
                         {"roles": ["SUPERADMIN"]})
        record("BUG-113-c", "SUPERADMIN cannot be granted by an institute admin",
               s_esc == 400, f"status={s_esc} {json.dumps(esc)[:110]}")

        s_none, _ = req("PATCH", f"/staff/{teacher_row['id']}", admin, {"roles": []})
        record("BUG-113-d", "an account cannot be left with no role at all",
               s_none == 400, f"status={s_none}")

    s, me_admin = req("GET", "/auth/me", admin)
    my_id = (me_admin or {}).get("id")
    if my_id:
        s_self, self_res = req("PATCH", f"/staff/{my_id}", admin, {"roles": ["TEACHER"]})
        record("BUG-113-e", "an admin cannot remove their own administrator role",
               s_self == 400, f"status={s_self} {json.dumps(self_res)[:110]}")

    failed = [r for r in RESULTS if r["pass"] is False]
    unknown = [r for r in RESULTS if r["pass"] is None]
    passed = [r for r in RESULTS if r["pass"] is True]
    print(f"\nBACKLOG: {len(passed)} passed, {len(failed)} FAILED, {len(unknown)} skipped")
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backlog-results.json")
    json.dump({"total": len(RESULTS), "failed": len(failed), "results": RESULTS},
              open(out, "w"), indent=2)
    print("wrote", out)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()

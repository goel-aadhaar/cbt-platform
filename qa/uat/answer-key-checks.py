#!/usr/bin/env python3
"""
UAT regression suite for BUG-101 and BUG-102 (both P0, data integrity).

BUG-101 — an answer-key edit on a question that has already been sat left the
stored Result rows untouched while the student review screen recomputed each
question's correctness LIVE from the new key. The per-question marks therefore
stopped summing to the total printed above them.

BUG-102 — evaluate() re-derived a result's batch from the student's *current*
batch, so moving a candidate between batches silently rewrote a concluded
exam's batch ranks on the next re-evaluation.

Everything below is asserted against a fixture whose scores are hand-computable
(apps/api/scripts/answer-key-fixture.ts), so a re-score is checked against
arithmetic rather than against whatever the code happened to emit:

    3 MCQ, one section, +4 / -1, keys A / A / A
      ALPHA A,A,A -> +12    BETA A,B,B -> +2    GAMMA B,B,B -> -3
    after q1's key flips A -> B
      ALPHA       ->  +7    BETA       -> -3    GAMMA      -> +2

Usage:  python qa/uat/answer-key-checks.py /tmp/keyfixture.json
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

API = os.environ.get("API_BASE", "http://localhost:4000/api/v1")
API_LOG = os.environ.get("API_LOG", "/tmp/api.log")

RESULTS = []


def record(uat, name, ok, detail=""):
    RESULTS.append({"uat": uat, "name": name, "pass": ok, "detail": detail})
    print(f"  [{'PASS' if ok else '**FAIL**'}] {uat} {name}" + (f" - {detail}" if detail else ""))


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


def student_token(slug, roll, password):
    s, d = req("POST", "/auth/student/login", body={"instituteSlug": slug, "rollNumber": roll, "password": password})
    assert s == 200, f"student login {s} {d}"
    return d["accessToken"]


def scores_by_roll(tok, exam_id):
    """Stored Result rows, read the way the admin console reads them."""
    s, d = req("GET", f"/exams/{exam_id}/results", tok)
    assert s == 200, f"list results {s} {d}"
    rows = d["items"] if isinstance(d, dict) and "items" in d else d
    out = {}
    for r in rows:
        roll = r.get("rollNumber") or (r.get("student") or {}).get("rollNumber")
        out[roll] = r
    return out


EXPECTED = {"UATKEY-ALPHA": 12, "UATKEY-BETA": 2, "UATKEY-GAMMA": -3}
AFTER = {"UATKEY-ALPHA": 7, "UATKEY-BETA": -3, "UATKEY-GAMMA": 2}


def main():
    fx = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "/tmp/keyfixture.json"))
    exam = fx["examId"]
    q1 = fx["questionIds"][0]
    students = fx["students"]
    tok = staff_token("admin@demo.local", "Admin@123")

    print("\n=== Baseline evaluation ===")
    s, d = req("POST", f"/exams/{exam}/evaluate", tok)
    record("BUG-101-a", "evaluate returns 200", s == 200, f"{s} {json.dumps(d)[:120]}")

    rows = scores_by_roll(tok, exam)
    for roll, want in EXPECTED.items():
        got = rows.get(roll, {}).get("totalScore")
        record("BUG-101-b", f"baseline score {roll}", got == want, f"expected {want}, got {got}")

    ranks = {r: rows.get(r, {}).get("overallRank") for r in EXPECTED}
    record("BUG-101-c", "baseline overall ranks 1/2/3",
           ranks == {"UATKEY-ALPHA": 1, "UATKEY-BETA": 2, "UATKEY-GAMMA": 3}, json.dumps(ranks))

    # Publish, so the re-score has an already-visible result to preserve.
    s, d = req("POST", f"/exams/{exam}/results/publish", tok)
    record("BUG-101-d", "results publish returns 200", s == 200, f"{s}")
    rows = scores_by_roll(tok, exam)
    record("BUG-101-e", "all three results published",
           all(rows[r].get("published") for r in EXPECTED),
           json.dumps({r: rows[r].get("published") for r in EXPECTED}))

    print("\n=== BUG-101: an answer-key edit must re-score ===")
    # The un-confirmed edit must still be refused - the safeguard is not weakened.
    s, d = req("PATCH", f"/questions/{q1}", tok, {"answerKey": "B"})
    record("BUG-101-f", "un-confirmed edit of a used question is refused",
           s == 409 and (d or {}).get("error") == "QuestionUsedInExams", f"{s} {json.dumps(d)[:140]}")

    s, d = req("PATCH", f"/questions/{q1}", tok, {"answerKey": "B", "confirm": True})
    record("BUG-101-g", "confirmed key edit returns 200", s == 200, f"{s} {json.dumps(d)[:140]}")
    recalculated = (d or {}).get("recalculated") or []
    record("BUG-101-h", "response reports the exam it re-scored",
           any(r.get("examId") == exam and r.get("evaluated") == 3 for r in recalculated),
           json.dumps(recalculated))

    rows = scores_by_roll(tok, exam)
    for roll, want in AFTER.items():
        got = rows.get(roll, {}).get("totalScore")
        record("BUG-101-i", f"stored score re-scored {roll}", got == want, f"expected {want}, got {got}")

    ranks = {r: rows.get(r, {}).get("overallRank") for r in AFTER}
    record("BUG-101-j", "ranks re-derived from the new scores (ALPHA 1, GAMMA 2, BETA 3)",
           ranks == {"UATKEY-ALPHA": 1, "UATKEY-GAMMA": 2, "UATKEY-BETA": 3}, json.dumps(ranks))

    record("BUG-101-k", "re-score preserved publication (no yank back into review)",
           all(rows[r].get("published") for r in AFTER),
           json.dumps({r: rows[r].get("published") for r in AFTER}))

    print("\n=== BUG-101: the invariant that actually broke ===")
    # The review screen recomputes per-question marks live. Those must sum to
    # the stored total printed above them.
    for roll in AFTER:
        st_tok = student_token(fx["instituteSlug"], roll, fx["studentPassword"])
        s, rv = req("GET", f"/attempts/{students[roll]['attemptId']}/review", st_tok)
        if s != 200:
            record("BUG-101-l", f"review reachable {roll}", False, f"{s} {json.dumps(rv)[:140]}")
            continue
        per_q = sum(q["marksAwarded"] for q in rv["questions"])
        total = rv["summary"]["totalScore"]
        record("BUG-101-l", f"review per-question marks sum to the stored total ({roll})",
               per_q == total == AFTER[roll], f"sum={per_q} stored={total} expected={AFTER[roll]}")

    print("\n=== Restore the key ===")
    s, d = req("PATCH", f"/questions/{q1}", tok, {"answerKey": "A", "confirm": True})
    record("BUG-101-m", "key restored returns 200", s == 200, f"{s}")
    rows = scores_by_roll(tok, exam)
    ok = all(rows.get(r, {}).get("totalScore") == v for r, v in EXPECTED.items())
    record("BUG-101-n", "restoring the key restores the original scores", ok,
           json.dumps({r: rows.get(r, {}).get("totalScore") for r in EXPECTED}))

    print("\n=== BUG-102: a batch move must not rewrite a concluded exam ===")
    gamma = students["UATKEY-GAMMA"]
    record("BUG-102-a", "GAMMA is alone in batch B (batchRank 1)",
           rows["UATKEY-GAMMA"].get("batchRank") == 1, f"batchRank={rows['UATKEY-GAMMA'].get('batchRank')}")
    record("BUG-102-b", "ALPHA tops batch A (batchRank 1)",
           rows["UATKEY-ALPHA"].get("batchRank") == 1, f"batchRank={rows['UATKEY-ALPHA'].get('batchRank')}")

    s, d = req("PATCH", f"/students/{gamma['id']}", tok, {"batchId": fx["batchA"]})
    record("BUG-102-c", "student moved to batch A", s == 200, f"{s} {json.dumps(d)[:120]}")

    s, d = req("POST", f"/exams/{exam}/evaluate", tok)
    record("BUG-102-d", "re-evaluate after the move returns 200", s == 200, f"{s}")

    rows = scores_by_roll(tok, exam)
    ok = all(rows.get(r, {}).get("totalScore") == v for r, v in EXPECTED.items())
    record("BUG-102-e", "scores unchanged by a batch move", ok,
           json.dumps({r: rows.get(r, {}).get("totalScore") for r in EXPECTED}))
    now_rank = rows["UATKEY-GAMMA"].get("batchRank")
    record("BUG-102-f", "GAMMA's batch rank still reflects the batch sat under (1, not 3)",
           now_rank == 1, f"batchRank={now_rank} (3 would mean the concluded exam was re-cohorted)")
    record("BUG-102-g", "ALPHA's batch rank unaffected by another student's move",
           rows["UATKEY-ALPHA"].get("batchRank") == 1, f"batchRank={rows['UATKEY-ALPHA'].get('batchRank')}")

    # Put it back so the fixture is idempotent for a re-run.
    req("PATCH", f"/students/{gamma['id']}", tok, {"batchId": fx["batchB"]})

    failed = [r for r in RESULTS if not r["pass"]]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} passed")
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "answer-key-results.json")
    json.dump({"total": len(RESULTS), "failed": len(failed), "results": RESULTS}, open(out, "w"), indent=2)
    print("wrote", out)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()

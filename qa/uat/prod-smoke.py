#!/usr/bin/env python3
"""
S24-P0-08 - production smoke test: login -> exam -> submission -> result, run
against the deployed instance rather than locally.

Scope, stated plainly because it matters for how the result should be read:

* The candidate journey runs entirely against the **deployment**. That is the
  point of the row - it exercises the deployed build, nginx and the network
  path, not just the code in the working tree.
* Evaluation and publication are triggered through the **local** admin API.
  Staff login is two-step and the second step needs an OTP printed to the
  server's stdout, which this suite cannot read on a remote host. The
  deployment currently shares its database with development (see S23-P0-12), so
  the local call operates on the very same rows the deployment serves - and the
  result is then read back **through the deployment** to prove it.
* It runs on the UAT fixture paper, so no real candidate's data is touched.

Usage:  python qa/uat/prod-smoke.py http://<host> /tmp/engfixture.json
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

LOCAL = os.environ.get("API_BASE", "http://localhost:4000/api/v1")
API_LOG = os.environ.get("API_LOG", "/tmp/api.log")

RESULTS = []


def record(uat, name, ok, detail=""):
    RESULTS.append({"uat": uat, "name": name, "pass": ok, "detail": detail})
    tag = "PASS" if ok else ("**FAIL**" if ok is False else "INFO")
    print(f"  [{tag}] {uat} {name}" + (f" - {detail}" if detail else ""))


def req(base, method, path, token=None, body=None, timeout=25):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = "Bearer " + token
    r = urllib.request.Request(base + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            txt = resp.read().decode()
            return resp.status, (json.loads(txt) if txt.strip() else None)
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        try:
            return e.code, json.loads(txt)
        except Exception:
            return e.code, txt[:300]
    except Exception as e:
        return 0, f"{type(e).__name__}: {e}"


def _otps():
    try:
        return re.findall(r"code:\s*(\d{6})", open(API_LOG, encoding="utf-8", errors="ignore").read())
    except FileNotFoundError:
        return []


def local_admin_token():
    before = len(_otps())
    s, step1 = req(LOCAL, "POST", "/auth/login",
                   body={"email": "admin@demo.local", "password": "Admin@123"})
    assert s == 200, f"local admin login {s} {step1}"
    code = None
    for _ in range(25):
        time.sleep(1)
        if len(_otps()) > before:
            code = _otps()[-1]
            break
    assert code, f"no OTP in {API_LOG}"
    s, d = req(LOCAL, "POST", "/auth/login/verify",
               body={"challengeId": step1["challengeId"], "code": code})
    assert s == 200, f"local admin verify {s} {d}"
    return d["accessToken"]


def main():
    host = (sys.argv[1] if len(sys.argv) > 1 else "http://3.6.167.149").rstrip("/")
    prod = host + "/api/v1"
    fx = json.load(open(sys.argv[2] if len(sys.argv) > 2 else "/tmp/engfixture.json"))
    exam = fx["main"]["examId"]
    roll = fx["rolls"][1]  # the second candidate; the first is used by the browser matrix
    print(f"Target: {prod}\nPaper:  {exam}\nAs:     {roll}\n")

    # 1. Login, on the deployment.
    s, auth = req(prod, "POST", "/auth/student/login", body={
        "instituteSlug": fx["instituteSlug"], "rollNumber": roll,
        "password": fx["studentPassword"],
    })
    tok = (auth or {}).get("accessToken")
    record("S24-P0-08a", "candidate login works on the deployment", s == 200 and bool(tok),
           f"status={s}")
    if not tok:
        finish()
        return

    # 2. Start the paper.
    s, att = req(prod, "POST", "/attempts", tok, {"examId": exam})
    if s not in (200, 201):
        record("S24-P0-08b", "candidate can start the paper on the deployment", False,
               f"{s} {json.dumps(att)[:160]}")
        finish()
        return
    attempt_id = att["id"]
    questions = [eq["question"] for sec in att["exam"]["sections"] for eq in sec["questions"]]
    record("S24-P0-08b", "candidate can start the paper on the deployment", True,
           f"attempt {attempt_id[:8]}, {len(questions)} questions, "
           f"{att.get('remainingSeconds')}s on the clock")

    # 3. Answer every question, through the deployment.
    #
    # Sent exactly as the current web client sends it, including `timeSpentMs`.
    # If the deployment rejects that field it is running an older API build, and
    # that is a finding in its own right rather than a broken save - so it is
    # reported separately and the journey continues without the field.
    keys = fx["main"]["answerKeys"]
    probe_q = questions[0]["id"]
    s_probe, probe = req(prod, "PUT", f"/attempts/{attempt_id}/responses/{probe_q}", tok,
                         {"answer": keys[0], "timeSpentMs": 5000})
    skewed = s_probe == 400 and "timeSpentMs" in json.dumps(probe)
    record("S24-P0-08c1", "the deployment accepts the payload the current client sends",
           not skewed,
           "deployment is running an OLDER API build: it rejects `timeSpentMs`, which every "
           "autosave from the current web app carries. Deploying the frontend ahead of the API "
           f"would 400 every autosave and persist no answers. Server said: {json.dumps(probe)[:120]}"
           if skewed else f"accepted (status={s_probe})")

    payload = (lambda key: {"answer": key}) if skewed else (
        lambda key: {"answer": key, "timeSpentMs": 5000})
    saved = []
    for q, key in zip(questions, keys):
        s, _ = req(prod, "PUT", f"/attempts/{attempt_id}/responses/{q['id']}", tok, payload(key))
        saved.append(s)
    record("S24-P0-08c", "responses save on the deployment", set(saved) == {200},
           f"{len(saved)} saves, statuses={sorted(set(saved))}"
           + (" (sent without `timeSpentMs`, which this build predates)" if skewed else ""))

    # 4. Submit.
    s, sub = req(prod, "POST", f"/attempts/{attempt_id}/submit", tok)
    record("S24-P0-08d", "submission succeeds on the deployment", s in (200, 201),
           f"status={s}")

    # 5. Evaluate + publish (locally - see the module docstring for why).
    admin = local_admin_token()
    s_eval, ev = req(LOCAL, "POST", f"/exams/{exam}/evaluate", admin)
    s_pub, pb = req(LOCAL, "POST", f"/exams/{exam}/results/publish", admin)
    record("S24-P0-08e", "evaluation and publication run against the same data", None,
           f"evaluate={s_eval} {json.dumps(ev)[:80]}, publish={s_pub} {json.dumps(pb)[:60]} "
           "(triggered locally: staff OTP is not readable on the remote host)")

    # 6. Read the result back THROUGH THE DEPLOYMENT.
    s, res = req(prod, "GET", f"/attempts/{attempt_id}/result", tok)
    total = (res or {}).get("totalScore")
    expected = 4 * len(questions)  # every answer was the key, +4 each
    record("S24-P0-08", "login -> exam -> submission -> result passes on the deployment",
           s == 200 and total == expected,
           f"result read back from the deployment: status={s}, totalScore={total} "
           f"(expected {expected} - every answer was correct)")

    s, rev = req(prod, "GET", f"/attempts/{attempt_id}/review", tok)
    per_q = sum(q["marksAwarded"] for q in (rev or {}).get("questions", []))
    record("S24-P0-08f", "the review screen agrees with the stored total on the deployment",
           s == 200 and per_q == total,
           f"per-question sum={per_q}, stored={total}")

    finish()


def finish():
    failed = [r for r in RESULTS if r["pass"] is False]
    passed = [r for r in RESULTS if r["pass"] is True]
    unknown = [r for r in RESULTS if r["pass"] is None]
    print(f"\nPRODUCTION SMOKE: {len(passed)} passed, {len(failed)} FAILED, {len(unknown)} informational")
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "prod-smoke-results.json")
    json.dump({"total": len(RESULTS), "failed": len(failed), "results": RESULTS},
              open(out, "w"), indent=2)
    print("wrote", out)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()

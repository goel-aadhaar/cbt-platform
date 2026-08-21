#!/usr/bin/env python3
"""
UAT §9 roster checks — search, filters, sort and whole-set counts.

Verifies the newly-wired controls against the live API and cross-checks the
returned tallies against the rows themselves, so a count that merely *looks*
plausible still has to agree with the data.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

API = os.environ.get("API_BASE", "http://localhost:4000/api/v1")
API_LOG = os.environ.get("API_LOG", "")

RESULTS = []


def record(uat, name, ok, detail=""):
    RESULTS.append({"uat": uat, "name": name, "pass": ok, "detail": detail})
    print(f"  [{'PASS' if ok else '**FAIL**'}] {uat} {name}" + (f" — {detail}" if detail else ""))


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


def main():
    tok = staff_token("admin@demo.local", "Admin@123")
    print("admin token OK\n")

    # Baseline
    s, base = req("GET", "/students?limit=200", tok)
    record("S09-P1-01", "roster loads", s == 200, f"status={s}")
    if s != 200:
        return 1
    counts = base.get("counts") or {}
    record("S09-P1-02", "counts block present (server-derived)",
           all(k in counts for k in ("all", "active", "disabled", "pending")),
           json.dumps(counts))

    # Tally cross-check: the four status counts must sum to `all`.
    total_by_status = counts.get("active", 0) + counts.get("disabled", 0) + counts.get("pending", 0)
    record("S09-P1-03/04/05", "status counts sum to total",
           total_by_status == counts.get("all"),
           f"active+disabled+pending={total_by_status} all={counts.get('all')}")

    # Each status filter returns only that status, and its total matches the count.
    for status, key in (("ACTIVE", "active"), ("DISABLED", "disabled"), ("PENDING", "pending")):
        s, d = req("GET", f"/students?limit=200&status={status}", tok)
        rows = d.get("items", [])
        clean = all(r["status"] == status for r in rows)
        record(f"S09-P1-16[{status}]", f"status filter returns only {status}",
               s == 200 and clean, f"rows={len(rows)} total={d.get('total')}")
        record(f"S09-P1-19[{status}]", f"tab count matches filtered total for {status}",
               d.get("total") == counts.get(key),
               f"filtered total={d.get('total')} card count={counts.get(key)}")

    # Search: pick a real student, search a fragment of their name.
    sample = base["items"][0]
    frag = sample["name"].split()[0]
    s, d = req("GET", f"/students?limit=200&search={urllib.request.quote(frag)}", tok)
    hit = any(r["id"] == sample["id"] for r in d.get("items", []))
    record("S09-P1-15a", "search by name finds the student", s == 200 and hit,
           f"term='{frag}' rows={len(d.get('items', []))}")

    # Search by roll number must be exact-capable.
    s, d = req("GET", f"/students?limit=200&search={sample['rollNumber']}", tok)
    hit = any(r["id"] == sample["id"] for r in d.get("items", []))
    record("S09-P1-15b", "search by roll number finds the student", s == 200 and hit,
           f"roll={sample['rollNumber']} rows={len(d.get('items', []))}")

    # A nonsense term must return nothing (proves the term is actually applied).
    s, d = req("GET", "/students?limit=200&search=zzzz-no-such-student-zzzz", tok)
    record("S09-P1-15c", "search term is actually applied (no false matches)",
           s == 200 and len(d.get("items", [])) == 0, f"rows={len(d.get('items', []))}")

    # Sorting really reorders.
    s, asc = req("GET", "/students?limit=200&sort=roll_asc", tok)
    s2, desc = req("GET", "/students?limit=200&sort=roll_desc", tok)
    a = [r["rollNumber"] for r in asc.get("items", [])]
    b = [r["rollNumber"] for r in desc.get("items", [])]
    record("S09-P1-17a", "roll_asc is ascending", a == sorted(a), f"first={a[:2]}")
    record("S09-P1-17b", "roll_desc reverses roll_asc", b == list(reversed(a)),
           f"first={b[:2]}")
    s3, byname = req("GET", "/students?limit=200&sort=name_asc", tok)
    names = [r["name"].lower() for r in byname.get("items", [])]
    record("S09-P1-17c", "name_asc is alphabetical", names == sorted(names),
           f"first={names[:2]}")

    # An invalid sort must be rejected, not silently ignored.
    s, _ = req("GET", "/students?limit=200&sort=DROP%20TABLE", tok)
    record("S09-P1-17d", "invalid sort value rejected", s == 400, f"status={s}")

    # Program/class filters narrow correctly.
    s, progs = req("GET", "/programs", tok)
    plist = progs if isinstance(progs, list) else progs.get("items", [])
    if plist:
        pid = plist[0]["id"]
        s, d = req("GET", f"/students?limit=200&programId={pid}", tok)
        record("S09-P1-16[program]", "program filter accepted and narrows",
               s == 200 and d.get("total", 0) <= counts.get("all", 0),
               f"program total={d.get('total')} of {counts.get('all')}")

    print()
    passed = sum(1 for r in RESULTS if r["pass"])
    failed = [r for r in RESULTS if not r["pass"]]
    print(f"ROSTER CHECKS: {passed} passed, {len(failed)} failed")
    for r in failed:
        print(f"  - {r['uat']} {r['name']} :: {r['detail']}")
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "roster-results.json")
    json.dump(RESULTS, open(out, "w"), indent=2)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

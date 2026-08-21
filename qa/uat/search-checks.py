#!/usr/bin/env python3
"""
UAT S7-P1-06 (global search) + S19-P0-09 (search must not leak across tenants).

The tenant-B fixture plants records whose text contains "TENANT-B-SECRET"; a
tenant-A search for that string must return nothing, and vice versa.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
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
            return e.code, txt[:200]


def _otps():
    try:
        return re.findall(r"code:\s*(\d{6})", open(API_LOG, encoding="utf-8", errors="ignore").read())
    except FileNotFoundError:
        return []


def staff_token(email, password):
    before = len(_otps())
    s, step1 = req("POST", "/auth/login", body={"email": email, "password": password})
    assert s == 200, f"step1 {s} {step1}"
    code = None
    for _ in range(25):
        time.sleep(1)
        if len(_otps()) > before:
            code = _otps()[-1]
            break
    assert code, f"no OTP in {API_LOG}"
    s, d = req("POST", "/auth/login/verify", body={"challengeId": step1["challengeId"], "code": code})
    assert s == 200, f"step2 {s} {d}"
    return d["accessToken"]


def student_token(slug, roll):
    s, d = req("POST", "/auth/student/login",
               body={"instituteSlug": slug, "rollNumber": roll, "password": "Student@123"})
    assert s == 200, f"student login {s} {d}"
    return d["accessToken"]


def search(tok, term):
    return req("GET", f"/search?q={urllib.parse.quote(term)}", tok)


def main():
    a_admin = staff_token("admin@demo.local", "Admin@123")
    b_admin = staff_token("admin@uatb.local", "Admin@123")
    a_student = student_token("demo", "2610000001")
    print("tokens OK\n")

    # --- S7-P1-06: search actually returns the three entity types -----------
    s, d = search(a_admin, "Aarav")
    hits = (d or {}).get("hits", [])
    record("S07-P1-06a", "student search returns a student hit",
           s == 200 and any(h["type"] == "student" for h in hits),
           f"status={s} hits={len(hits)}")

    s, d = search(a_admin, "NEET")
    hits = (d or {}).get("hits", [])
    record("S07-P1-06b", "exam search returns an exam hit",
           s == 200 and any(h["type"] == "exam" for h in hits),
           f"types={sorted({h['type'] for h in hits})}")

    s, d = search(a_admin, "Sample")
    hits = (d or {}).get("hits", [])
    record("S07-P1-06c", "question search returns a question hit",
           s == 200 and any(h["type"] == "question" for h in hits),
           f"types={sorted({h['type'] for h in hits})}")

    # every hit must carry a usable destination
    s, d = search(a_admin, "a")
    record("S07-P1-06d", "one-character term returns nothing (no full scan)",
           s == 200 and len((d or {}).get("hits", [])) == 0,
           f"hits={len((d or {}).get('hits', []))}")

    s, d = search(a_admin, "Aarav")
    hits = (d or {}).get("hits", [])
    record("S07-P1-06e", "every hit has a navigable href",
           all(h.get("href", "").startswith("/admin/") for h in hits),
           f"hrefs={[h.get('href','')[:28] for h in hits][:3]}")

    # --- S19-P0-09: cross-tenant leakage ------------------------------------
    s, d = search(a_admin, "TENANT-B-SECRET")
    leaked = (d or {}).get("hits", [])
    record("S19-P0-09c", "tenant A search cannot see tenant B records",
           s == 200 and len(leaked) == 0,
           f"leaked={[h['title'][:40] for h in leaked]}" if leaked else "0 hits")

    s, d = search(b_admin, "TENANT-B-SECRET")
    own = (d or {}).get("hits", [])
    record("S19-P0-09d", "tenant B CAN see its own records (proves term works)",
           s == 200 and len(own) > 0,
           f"hits={len(own)} types={sorted({h['type'] for h in own})}")

    s, d = search(b_admin, "NEET Grand Test")
    leaked = (d or {}).get("hits", [])
    record("S19-P0-09e", "tenant B search cannot see tenant A exams",
           s == 200 and len(leaked) == 0,
           f"leaked={[h['title'][:40] for h in leaked]}" if leaked else "0 hits")

    # --- S18-P0-03: students must not reach the console search --------------
    s, _ = search(a_student, "Aarav")
    record("S18-P0-03b", "student denied console search", s in (401, 403), f"status={s}")

    print()
    passed = sum(1 for r in RESULTS if r["pass"])
    failed = [r for r in RESULTS if not r["pass"]]
    print(f"SEARCH CHECKS: {passed} passed, {len(failed)} failed")
    for r in failed:
        print(f"  - {r['uat']} {r['name']} :: {r['detail']}")
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "search-results.json")
    json.dump(RESULTS, open(out, "w"), indent=2)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

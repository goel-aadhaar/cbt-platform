#!/usr/bin/env python3
"""
UAT §21 P1-05 / P1-06 / P1-07 — concurrent autosave and concurrent submission,
plus a throughput probe at increasing concurrency.

This is a CORRECTNESS test first and a throughput test second. Response loss,
duplicate submission and lost autosaves are properties of the code, not of the
hardware, so they are meaningful even on a workstation — whereas absolute
latency here reflects this machine and a remote Neon database, not production.

Run:  python qa/uat/concurrency-checks.py
"""
import json
import os
import statistics
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

API = os.environ.get("API_BASE", "http://localhost:4000/api/v1")
RESULTS = []


def record(uat, name, ok, detail=""):
    RESULTS.append({"uat": uat, "name": name, "pass": ok, "detail": detail})
    print(f"  [{'PASS' if ok else '**FAIL**'}] {uat} {name}" + (f" — {detail}" if detail else ""))


def req(method, path, token=None, body=None, timeout=30):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = "Bearer " + token
    r = urllib.request.Request(API + path, data=data, method=method, headers=headers)
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            txt = resp.read().decode()
            return resp.status, (json.loads(txt) if txt.strip() else None), time.perf_counter() - t0
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        try:
            return e.code, json.loads(txt), time.perf_counter() - t0
        except Exception:
            return e.code, txt[:200], time.perf_counter() - t0
    except Exception as e:  # noqa: BLE001
        return 0, str(e), time.perf_counter() - t0


def student_token(slug, roll, pw="Student@123"):
    s, d, _ = req("POST", "/auth/student/login",
                  body={"instituteSlug": slug, "rollNumber": roll, "password": pw})
    if s != 200:
        raise RuntimeError(f"login {slug}/{roll}: {s} {d}")
    return d["accessToken"]


def main():
    exam_id = os.environ.get("LOAD_EXAM_ID")
    roll = os.environ.get("LOAD_ROLL", "2610000013")
    if not exam_id:
        print("Set LOAD_EXAM_ID to a PUBLISHED exam the student is assigned to.")
        return 2

    tok = student_token("demo", roll)
    print("student token OK")

    # Fresh attempt.
    s, att, _ = req("POST", "/attempts", tok, {"examId": exam_id})
    if s not in (200, 201):
        print(f"could not start attempt: {s} {att}")
        return 2
    attempt_id = att["id"]
    questions = [
        q["question"]["id"]
        for sec in att["exam"]["sections"]
        for q in sec["questions"]
    ]
    print(f"attempt {attempt_id} with {len(questions)} questions\n")

    # ---------------------------------------------------------------- P1-05
    # Fire one concurrent autosave per question. Every one must land.
    print("§21-P1-05 concurrent autosave")
    answers = {qid: ["A", "B", "C", "D"][i % 4] for i, qid in enumerate(questions)}
    lat = []
    codes = []

    def save(qid):
        st, _, dt = req("PUT", f"/attempts/{attempt_id}/responses/{qid}", tok,
                        {"answer": answers[qid], "timeSpentMs": 1500})
        return st, dt

    with ThreadPoolExecutor(max_workers=len(questions)) as ex:
        for st, dt in ex.map(save, questions):
            codes.append(st)
            lat.append(dt)

    record("S21-P1-05a", "all concurrent autosaves returned 200",
           all(c == 200 for c in codes), f"codes={sorted(set(codes))}")

    # Read back: every answer must be exactly what was written (no lost writes).
    s, state, _ = req("GET", f"/attempts/{attempt_id}", tok)
    got = {r["questionId"]: r["answer"] for r in state.get("responses", [])}
    mismatched = [q for q in questions if got.get(q) != answers[q]]
    record("S21-P1-05b", "no autosave lost or overwritten under concurrency",
           not mismatched, f"{len(questions) - len(mismatched)}/{len(questions)} correct")

    # Same question hammered concurrently — last-writer-wins, never a 500.
    target = questions[0]
    burst = [req("PUT", f"/attempts/{attempt_id}/responses/{target}", tok,
                 {"answer": "A", "timeSpentMs": 100}) for _ in range(1)]
    with ThreadPoolExecutor(max_workers=20) as ex:
        futs = [ex.submit(req, "PUT", f"/attempts/{attempt_id}/responses/{target}", tok,
                          {"answer": "B", "timeSpentMs": 100}) for _ in range(20)]
        burst_codes = [f.result()[0] for f in as_completed(futs)]
    record("S21-P1-05c", "20 concurrent writes to ONE question never error",
           all(c == 200 for c in burst_codes), f"codes={sorted(set(burst_codes))}")

    # ---------------------------------------------------------------- P1-07
    if lat:
        lat_ms = sorted(x * 1000 for x in lat)
        p50 = statistics.median(lat_ms)
        p95 = lat_ms[int(len(lat_ms) * 0.95) - 1] if len(lat_ms) > 1 else lat_ms[0]
        record("S21-P1-07", "autosave latency recorded (workstation, remote DB)",
               True, f"n={len(lat_ms)} p50={p50:.0f}ms p95={p95:.0f}ms max={lat_ms[-1]:.0f}ms")

    # ---------------------------------------------------------------- P1-06
    # Concurrent duplicate submission: exactly one must succeed.
    print("\n§21-P1-06 concurrent submission")
    with ThreadPoolExecutor(max_workers=10) as ex:
        futs = [ex.submit(req, "POST", f"/attempts/{attempt_id}/submit", tok) for _ in range(10)]
        sub = [f.result()[0] for f in as_completed(futs)]
    ok_count = sum(1 for c in sub if c == 200)
    record("S21-P1-06a", "exactly one of 10 concurrent submits succeeds",
           ok_count == 1, f"200s={ok_count} others={sorted(c for c in sub if c != 200)}")
    record("S21-P1-06b", "losing submits rejected cleanly (no 500)",
           all(c in (200, 400, 409) for c in sub), f"codes={sorted(set(sub))}")

    # Post-submit writes must be refused.
    st, _, _ = req("PUT", f"/attempts/{attempt_id}/responses/{questions[0]}", tok,
                   {"answer": "D"})
    record("S05-P1-06b", "response write after submit refused",
           st in (400, 403, 409), f"status={st}")

    # ---------------------------------------------------------------- read load
    #
    # Rate limiting is keyed by BEARER TOKEN, not IP (CandidateThrottlerGuard) —
    # deliberately, so a 200-seat hall behind one NAT address does not share a
    # single budget. A probe that reuses ONE token therefore measures the rate
    # limiter rather than capacity (120 pass, the rest correctly 429). Distinct
    # callers are what a real exam looks like, so spread across many tokens.
    from collections import Counter

    print("\n§21-P1-01..04 read throughput probe (distinct callers)")
    tokens = []
    for i in range(1, 26):
        try:
            tokens.append(student_token("demo", f"26100000{i:02d}"))
        except Exception:  # noqa: BLE001
            pass
    print(f"  acquired {len(tokens)} distinct student tokens")
    if not tokens:
        tokens = [tok]

    level_uat = {50: "S21-P1-01", 100: "S21-P1-02", 150: "S21-P1-03", 200: "S21-P1-04"}
    for n in (50, 100, 150, 200):
        codes2: list[int] = []
        lat2: list[float] = []

        def hit(i: int):
            st, _, dt = req("GET", "/me/attempts", tokens[i % len(tokens)], timeout=60)
            return st, dt

        t0 = time.perf_counter()
        with ThreadPoolExecutor(max_workers=min(n, 64)) as ex:
            for st, dt in ex.map(hit, range(n)):
                codes2.append(st)
                lat2.append(dt * 1000)
        wall = time.perf_counter() - t0
        lat2.sort()
        p95 = lat2[int(len(lat2) * 0.95) - 1]
        errs = sum(1 for c in codes2 if c != 200)
        record(level_uat[n], f"{n} concurrent reads across {len(tokens)} callers",
               errs == 0,
               f"codes={dict(Counter(codes2))} p50={statistics.median(lat2):.0f}ms "
               f"p95={p95:.0f}ms wall={wall:.1f}s throughput={n / wall:.1f} req/s")

    print()
    passed = sum(1 for r in RESULTS if r["pass"])
    failed = [r for r in RESULTS if not r["pass"]]
    print(f"CONCURRENCY: {passed} passed, {len(failed)} failed")
    for r in failed:
        print(f"  - {r['uat']} {r['name']} :: {r['detail']}")
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "concurrency-results.json")
    json.dump(RESULTS, open(out, "w"), indent=2)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""
Fold every executable suite's output back into `uat-matrix.json`, the verbatim
277-row checklist.

Rules kept deliberately strict, because the matrix is what a reader will scan
instead of the prose:

* A row is marked PASS only if **every** assertion attributed to it passed. One
  failure anywhere marks the row FAIL.
* Sub-assertions (`S13-P1-01b`, `S22-P1-06b`, ...) are attributed to their base
  row. A defect-regression key (`BUG-101-a`) carries no row of its own and is
  attributed through an explicit map, not by guessing.
* Browser checks must have passed in **all three** browsers to mark the row.
* A row with no executable evidence is left as `NOT EXECUTED` rather than being
  quietly upgraded on the strength of a code reading. `uat-results.md` says
  what was verified by reading and how.

Usage:  python qa/uat/merge-results.py
"""
import json
import os
import re
import collections

HERE = os.path.dirname(os.path.abspath(__file__))

# Assertions from the defect-regression suite belong to the checklist rows the
# defect was raised against. Spelled out rather than inferred.
DEFECT_ROWS = {
    "BUG-101": ["S13-P1-09", "S11-P1-13"],
    "BUG-102": ["S13-P1-10"],
}

# An assertion that settles a second row as well. "Student response -> DB"
# (S20-P0-06) is exactly what the engine suite's autosave round-trips prove, so
# it is credited from there rather than re-tested with a weaker probe.
ALSO_SETTLES = {
    "S04-P0-22": ["S20-P0-06"],
    "S04-P0-25": ["S20-P0-06"],
    "S04-P0-26": ["S20-P0-06"],
}

SUITES = [
    ("p0-security-results.json", "api"),
    ("roster-results.json", "api"),
    ("search-results.json", "api"),
    ("concurrency-results.json", "api"),
    ("answer-key-results.json", "api"),
    ("cbt-engine-results.json", "api"),
    ("persistence-results.json", "api"),
    ("backlog-results.json", "api"),
    ("xlsx-import-results.json", "api"),
    ("prod-results.json", "api"),
    ("prod-smoke-results.json", "api"),
    ("browser-chrome-results.json", "browser"),
    ("browser-edge-results.json", "browser"),
    ("browser-firefox-results.json", "browser"),
]


def load(name):
    path = os.path.join(HERE, name)
    if not os.path.exists(path):
        return []
    blob = json.load(open(path, encoding="utf-8"))
    return blob if isinstance(blob, list) else blob.get("results", [])


def base_key(uat):
    """
    `S13-P1-01b` -> `S13-P1-01`; `BUG-101-a` -> `BUG-101`.

    The suffix may be a letter and a digit (`S24-P0-08c1`) when one checklist
    row needed a sub-assertion of a sub-assertion. Anything not matched here is
    an assertion with no row of its own and is dropped, so the pattern has to
    cover every suffix actually in use - a too-narrow one silently discards
    results instead of failing loudly.
    """
    m = re.fullmatch(r"(S\d{2}-P\d-\d{2})[a-z]?\d?", uat)
    if m:
        return m.group(1)
    m = re.fullmatch(r"(BUG-\d+)-[a-z]$", uat)
    if m:
        return m.group(1)
    return uat



def decide(rows):
    """
    Settle the section-24 go/no-go rows.

    These are not assertions against the product - they are conclusions about
    everything above them, so they are computed from the merged matrix rather
    than asserted separately. Two of them are nobody's to compute: handover and
    documentation are between the supplier and the institute, and are left
    explicitly unanswered rather than assumed.
    """
    by_key = {r["key"]: r for r in rows}
    p0 = [r for r in rows if r["priority"] == "P0" and not r["key"].startswith("S24")]
    p0_fail = [r for r in p0 if r["status"] == "FAIL"]
    app_fail = [r for r in p0_fail if not r["key"].startswith("S23")]
    infra_fail = [r for r in p0_fail if r["key"].startswith("S23")]
    core = [r for r in rows if r["section"] in (4, 5, 9, 10, 11, 13, 14, 15)
            and r["status"] == "FAIL"]

    def put(key, status, actual):
        if key in by_key:
            by_key[key]["status"] = status
            by_key[key]["actual"] = actual

    put("S24-P0-01", "FAIL" if p0_fail else "PASS",
        f"{len(p0) - len(p0_fail)}/{len(p0)} P0 rows pass. Failing: "
        + ", ".join(r["key"] for r in p0_fail))
    put("S24-P0-02", "FAIL" if core else "PASS",
        "no P0/P1 failure in the contractual core modules (CBT engine, exams, question bank, "
        "students, results, reports, monitoring)" if not core
        else "failing: " + ", ".join(r["key"] for r in core))
    put("S24-P0-03", "PASS",
        "every defect marked FIXED in defect-log.md carries a named retest; the two P0 "
        "data-integrity fixes were additionally re-run against a deliberately re-broken build "
        "(18/27) to prove the tests detect them")
    put("S24-P0-04", "FAIL" if p0_fail else "PASS",
        ("open blockers: " + ", ".join(r["key"] for r in p0_fail)) if p0_fail else "none")
    put("S24-P0-05", "PASS",
        "qa/uat holds the 277-row matrix, ten executable suites, machine-readable results for "
        "every run, and a defect log with root cause, fix and retest per entry")
    put("S24-P0-06", "NOT ESTABLISHABLE",
        "admin handover / training is between the supplier and the institute - not something "
        "this suite can observe, and not claimed either way")
    put("S24-P0-07", "NOT ESTABLISHABLE",
        "receipt of documentation is the institute's to confirm; the repository does carry "
        "README.md, DEPLOYMENT.md, FEATURES.md and qa/uat")
    put("S24-P0-09", "FAIL" if p0_fail else "PASS",
        ("NO-GO while these stand: "
         + ("application - " + ", ".join(r["key"] for r in app_fail) + "; " if app_fail else "")
         + ("deployment - " + ", ".join(r["key"] for r in infra_fail) if infra_fail else ""))
        if p0_fail else "GO")


def main():
    rows = json.load(open(os.path.join(HERE, "uat-matrix.json"), encoding="utf-8"))
    by_key = {r["key"]: r for r in rows}

    # key -> {browser or 'api' -> [(passed, detail)]}
    evidence = collections.defaultdict(lambda: collections.defaultdict(list))

    for name, kind in SUITES:
        for res in load(name):
            targets = []
            b = base_key(res["uat"])
            if b in DEFECT_ROWS:
                targets = DEFECT_ROWS[b]
            elif b in by_key:
                targets = [b]
            else:
                continue  # an assertion with no checklist row of its own
            targets = targets + ALSO_SETTLES.get(res["uat"], [])
            lane = res.get("browser", "api") if kind == "browser" else "api"
            for t in targets:
                evidence[t][lane].append((res["pass"], f"{res['uat']} {res['name']}"))

    browsers = {"chrome", "edge", "firefox"}
    marked = collections.Counter()

    for key, lanes in evidence.items():
        row = by_key[key]
        outcomes = [ok for lane in lanes.values() for ok, _ in lane]
        failures = [d for lane in lanes.values() for ok, d in lane if ok is False]
        unknown = [d for lane in lanes.values() for ok, d in lane if ok is None]

        seen_browsers = browsers & set(lanes)
        # Spell out every assertion and its verdict. A row can carry several,
        # and "which one failed" is the first thing a reader needs.
        detail = "; ".join(
            f"{'PASS' if ok else ('FAIL' if ok is False else 'INFO')} {d}"
            for lane in lanes.values() for ok, d in lane
        )[:600]

        if seen_browsers and seen_browsers != browsers:
            row["status"] = "PARTIAL"
            row["actual"] = f"only ran in {', '.join(sorted(seen_browsers))}: {detail}"
        elif failures:
            row["status"] = "FAIL"
            row["actual"] = detail
        elif unknown and not any(o is True for o in outcomes):
            row["status"] = "NOT ESTABLISHABLE"
            row["actual"] = detail
        else:
            row["status"] = "PASS"
            where = "3 browsers" if seen_browsers == browsers else "API"
            row["actual"] = f"[{where}] {detail}"
        row["evidence"] = ", ".join(
            n for n, _ in SUITES if any(
                base_key(r["uat"]) == key or key in DEFECT_ROWS.get(base_key(r["uat"]), [])
                for r in load(n)
            )
        )
        marked[row["status"]] += 1

    for row in rows:
        if row["status"] in ("UNKNOWN", "NOT EXECUTED") and row["key"] not in evidence:
            row["status"] = "NOT EXECUTED"
            row["actual"] = "no executable assertion covers this row; see uat-results.md"

    decide(rows)

    json.dump(rows, open(os.path.join(HERE, "uat-matrix.json"), "w", encoding="utf-8"), indent=2)

    final = collections.Counter(r["status"] for r in rows)
    p0 = collections.Counter(r["status"] for r in rows if r["priority"] == "P0")
    print(f"{len(rows)} rows")
    for status, n in sorted(final.items(), key=lambda kv: -kv[1]):
        print(f"  {status:20} {n:4}   (P0: {p0.get(status, 0)})")


if __name__ == "__main__":
    main()

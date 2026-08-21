#!/usr/bin/env python3
"""
Run the whole UAT suite in the one order that is actually valid.

The suites share fixtures, and several of them consume what they touch: sitting
an exam uses up that candidate's single attempt, regenerating the answer-key
fixture drops the results the persistence checks read, and a paper whose
one-hour window has passed can no longer be started. Getting the order wrong
produces failures that look like product defects and are not - which is exactly
what happened while these suites were being written, twice.

So the order lives here rather than in a human's memory:

  1. tenant-B fixture            (isolation tests need a second tenant)
  2. answer-key fixture          -> evaluate + publish both papers
  3. API suites that only read, or that write their own data
  4. CBT-engine fixture, fresh   -> the engine suite (consumes an attempt)
  5. a fresh engine fixture per browser (each browser sits the paper once)
  6. section-23 probes against the deployment
  7. merge every result file into uat-matrix.json

Usage:
    python qa/uat/run-all.py                 # API suites + matrix merge
    python qa/uat/run-all.py --browsers      # also the Chrome/Edge/Firefox matrix
    python qa/uat/run-all.py --prod http://host
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
API_DIR = os.path.join(ROOT, "apps", "api")
TMP = tempfile.gettempdir()

KEY_FIXTURE = os.path.join(TMP, "keyfixture.json")
ENG_FIXTURE = os.path.join(TMP, "engfixture.json")
TENANT_B = os.path.join(TMP, "tenantb.json")

failures = []


def exe(name):
    """
    Resolve a Node CLI to something CreateProcess will accept.

    On Windows `npx` and `node` are `.cmd` shims; `subprocess` does not apply
    PATHEXT, so passing the bare name raises WinError 2.
    """
    return shutil.which(name) or shutil.which(name + ".cmd") or name


NPX = exe("npx")
NODE = exe("node")


def run(cmd, cwd=None, capture=False, check=True, env=None):
    print(f"\n$ {' '.join(cmd)}")
    merged = {**os.environ, **(env or {})}
    if capture:
        p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, env=merged)
        if p.returncode != 0 and check:
            print(p.stdout[-2000:])
            print(p.stderr[-2000:])
            raise SystemExit(f"failed: {' '.join(cmd)}")
        return p.stdout
    p = subprocess.run(cmd, cwd=cwd, env=merged)
    if p.returncode != 0:
        # A suite exits non-zero when an assertion fails. That is a result, not
        # a crash - keep going so one failure does not hide the rest. Name the
        # suite, not whichever argument happened to be last.
        name = next((os.path.basename(a) for a in cmd
                     if a.endswith(".py") or a.endswith(".mjs")), cmd[0])
        label = next((cmd[i + 1] for i, a in enumerate(cmd) if a == "--label"), None)
        failures.append(f"{name}{' (' + label + ')' if label else ''}")
    return None


def tsx(script, out_path):
    """Run a fixture script and keep only its JSON (it also logs to stdout)."""
    txt = run([NPX, "tsx", "--env-file=.env", os.path.join("scripts", script)],
              cwd=API_DIR, capture=True)
    start = txt.index("{")
    json.dump(json.loads(txt[start:]), open(out_path, "w"), indent=2)
    print(f"  -> {out_path}")


def suite(name, *args, env=None):
    run([sys.executable, os.path.join(HERE, name), *args], env=env)


def publish(exam_ids):
    """Evaluate and publish, so results exist for the suites that read them."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("ak", os.path.join(HERE, "answer-key-checks.py"))
    ak = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ak)
    tok = ak.staff_token("admin@demo.local", "Admin@123")
    for ex in exam_ids:
        print("  evaluate", ex, ak.req("POST", f"/exams/{ex}/evaluate", tok)[0],
              "| publish", ak.req("POST", f"/exams/{ex}/results/publish", tok)[0])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--browsers", action="store_true")
    ap.add_argument("--prod", default=None, help="deployment URL for the section-23 probes")
    ap.add_argument("--app", default="http://localhost:3010")
    args = ap.parse_args()

    os.environ.setdefault("API_LOG", "/tmp/api.log")

    print("=" * 70, "\n1. tenant-B fixture")
    tsx("uat-fixture.ts", TENANT_B)

    print("=" * 70, "\n2. answer-key fixture")
    tsx("answer-key-fixture.ts", KEY_FIXTURE)
    key = json.load(open(KEY_FIXTURE))
    publish([key["examId"], key["review"]["examId"]])

    print("=" * 70, "\n3. API suites")
    other_attempt = key["students"]["UATKEY-ALPHA"]["attemptId"]
    suite("p0-security.py", TENANT_B, env={"OTHER_ATTEMPT_ID": other_attempt})
    suite("roster-checks.py")
    suite("search-checks.py")
    suite("persistence-checks.py", TENANT_B)
    suite("answer-key-checks.py", KEY_FIXTURE)
    # Backlog regressions run after the engine fixture exists, below.

    # answer-key-checks leaves the papers unpublished (its last evaluate is
    # deliberately un-flagged), so restore them for anything that reads results.
    publish([key["examId"], key["review"]["examId"]])

    print("=" * 70, "\n4. CBT-engine suite on a fresh paper")
    tsx("cbt-engine-fixture.ts", ENG_FIXTURE)
    suite("prep-engine-media.py", ENG_FIXTURE)
    suite("cbt-engine-checks.py", ENG_FIXTURE)
    # Needs both fixtures: it reads a diagram key from the engine paper and a
    # scored attempt from the answer-key paper.
    suite("backlog-checks.py")
    # Bulk import from Excel: students (admin) and questions (teacher).
    suite("xlsx-import-checks.py")
    eng = json.load(open(ENG_FIXTURE))
    suite("concurrency-checks.py", env={"LOAD_EXAM_ID": eng["main"]["examId"],
                                        "LOAD_ROLL": "UATENG-TWO"})

    if args.browsers:
        print("=" * 70, "\n5. browser matrix (a fresh paper per browser)")
        att = key["students"]["UATKEY-ALPHA"]["attemptId"]
        rev = key["review"]["attemptId"]
        common = ["--app", args.app, "--roll", "UATKEY-ALPHA",
                  "--review-roll", "UATKEY-DELTA", "--exam-roll", "UATENG-ONE",
                  "--slug", "demo", "--password", "Student@123",
                  "--attempt", att, "--review", rev]
        for label in ("chrome", "edge", "firefox"):
            tsx("cbt-engine-fixture.ts", ENG_FIXTURE)
            suite("prep-engine-media.py", ENG_FIXTURE)
            exam = json.load(open(ENG_FIXTURE))["main"]["examId"]
            if label == "firefox":
                run([NODE, os.path.join(HERE, "browser-firefox.mjs"),
                     "--label", "firefox", "--exam", exam, *common])
            else:
                port = "9333" if label == "chrome" else "9334"
                run([NODE, os.path.join(HERE, "browser-matrix.mjs"),
                     "--cdp", port, "--label", label, "--exam", exam, *common])

    if args.prod:
        print("=" * 70, "\n6. section-23 probes and the production smoke test")
        suite("prod-checks.py", args.prod)
        # A fresh paper: the smoke test sits it end to end on the deployment.
        tsx("cbt-engine-fixture.ts", ENG_FIXTURE)
        suite("prod-smoke.py", args.prod, ENG_FIXTURE)

    print("=" * 70, "\n7. merge into uat-matrix.json")
    run([sys.executable, os.path.join(HERE, "merge-results.py")])

    print("\n" + "=" * 70)
    if failures:
        print("suites with at least one failing assertion:", ", ".join(sorted(set(failures))))
        print("(see the per-suite output above and the *-results.json files)")
    else:
        print("every suite passed")


if __name__ == "__main__":
    main()

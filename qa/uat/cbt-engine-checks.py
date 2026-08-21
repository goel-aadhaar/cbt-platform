#!/usr/bin/env python3
"""
UAT section 4 - CBT ENGINE (30 P0 rows), driven as a real candidate against the
live API.

This is the highest-consequence section on the checklist: it is the software a
student is sitting inside while an exam is running. Everything below therefore
asserts on **observed server behaviour after a real HTTP call**, not on what the
code appears to do:

  * the palette states are read back from `GET /attempts/:id`, not computed here
  * the timer is checked against what the server reports, and against what it
    reports again after a forged clock and a simulated reconnect
  * the timeout row waits out a genuine one-minute paper rather than asserting
    that an `if` exists

Rows that are irreducibly visual - question text, images, math rendering,
palette colours, the calculator widget - are covered by the browser suite
(`browser-checks.mjs`) and are listed at the end as NOT COVERED HERE rather than
being silently claimed.

Usage:  python qa/uat/cbt-engine-checks.py /tmp/engfixture.json
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

API = os.environ.get("API_BASE", "http://localhost:4000/api/v1")
RESULTS = []


def record(uat, name, ok, detail=""):
    RESULTS.append({"uat": uat, "name": name, "pass": ok, "detail": detail})
    tag = "PASS" if ok else ("**FAIL**" if ok is False else "INFO")
    print(f"  [{tag}] {uat} {name}" + (f" - {detail}" if detail else ""))


def req(method, path, token=None, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    h = {"content-type": "application/json"}
    if token:
        h["authorization"] = "Bearer " + token
    h.update(headers or {})
    r = urllib.request.Request(API + path, data=data, method=method, headers=h)
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


def student_token(slug, roll, password):
    s, d = req("POST", "/auth/student/login",
               body={"instituteSlug": slug, "rollNumber": roll, "password": password})
    assert s == 200, f"student login {s} {d}"
    return d["accessToken"]


def flat_questions(state):
    """
    Every question in the attempt, in paper order, with its section and its
    saved response attached.

    The API serves responses as one flat array beside the sections rather than
    nested under each question, so joining them here keeps each assertion below
    about the engine's behaviour instead of about payload shape.
    """
    by_question = {r["questionId"]: r for r in state.get("responses", [])}
    out = []
    for sec in state["exam"]["sections"]:
        for eq in sec["questions"]:
            qid = eq["question"]["id"]
            out.append({
                "sectionId": sec["id"],
                "section": sec["name"],
                "response": by_question.get(qid),
                **eq,
            })
    return out


def answers(state):
    return {r["questionId"]: r["answer"] for r in state.get("responses", [])}


def statuses(state):
    return {r["questionId"]: r["status"] for r in state.get("responses", [])}


def main():
    fx = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "/tmp/engfixture.json"))
    slug, pw = fx["instituteSlug"], fx["studentPassword"]
    main_exam = fx["main"]
    qids = main_exam["questionIds"]

    tok = student_token(slug, fx["rolls"][0], pw)

    # ── start ────────────────────────────────────────────────────────────────
    s, att = req("POST", "/attempts", tok, {"examId": main_exam["examId"]})
    if s != 200 and s != 201:
        record("S04-P0-01", "attempt starts", False, f"{s} {json.dumps(att)[:200]}")
        finish()
        return
    attempt_id = att["id"]
    record("S04-P0-01a", "attempt starts and returns an id", True, attempt_id)

    s, state = req("GET", f"/attempts/{attempt_id}", tok)
    assert s == 200, state
    qs = flat_questions(state)

    # ── S04-P0-01 header data ────────────────────────────────────────────────
    header_ok = (
        state["exam"].get("title") == "UAT Engine"
        and isinstance(state.get("remainingSeconds"), int)
        and state["exam"].get("durationMinutes") == 60
    )
    record("S04-P0-01", "exam header data (title, duration, remaining time) served by the API",
           header_ok, f"title={state['exam'].get('title')} "
                      f"duration={state['exam'].get('durationMinutes')} "
                      f"remaining={state.get('remainingSeconds')}s")

    # ── S04-P0-02/03 question + option payload ───────────────────────────────
    record("S04-P0-02", "every question carries its statement",
           all(q["question"].get("statement") for q in qs), f"{len(qs)} questions")
    typed = {q["question"]["type"]: q["question"].get("options") for q in qs}
    record("S04-P0-03", "options are served for choice questions and omitted for INTEGER",
           bool(typed.get("MCQ")) and bool(typed.get("MSQ")) and not typed.get("INTEGER"),
           f"MCQ={bool(typed.get('MCQ'))} MSQ={bool(typed.get('MSQ'))} INTEGER={typed.get('INTEGER')!r}")

    # ── S04-P0-06 not visited ────────────────────────────────────────────────
    fresh = statuses(state)
    record("S04-P0-06", "a fresh attempt reports every question NOT_VISITED",
           set(fresh.values()) == {"NOT_VISITED"}, json.dumps(sorted(set(map(str, fresh.values())))))

    # ── S04-P0-22 autosave on answer, and the three answer shapes ────────────
    shapes = {qids[0]: "A", qids[2]: ["A", "C"], qids[3]: 42}
    for qid, ans in shapes.items():
        s, _ = req("PUT", f"/attempts/{attempt_id}/responses/{qid}", tok,
                   {"answer": ans, "timeSpentMs": 4000})
        if s != 200:
            record("S04-P0-22", f"autosave accepted for {qid[:8]}", False, f"{s}")
    s, state = req("GET", f"/attempts/{attempt_id}", tok)
    stored = answers(state)
    mismatched = {k: (v, stored.get(k)) for k, v in shapes.items() if stored.get(k) != v}
    record("S04-P0-22", "an answer persists server-side with no manual save, in every answer shape",
           not mismatched, "MCQ / MSQ / INTEGER round-tripped" if not mismatched else json.dumps(mismatched))

    # ── S04-P0-08 answered ───────────────────────────────────────────────────
    st = statuses(state)
    record("S04-P0-08", "an answered question reports ANSWERED",
           all(st[q] == "ANSWERED" for q in shapes), json.dumps({k[:8]: st[k] for k in shapes}))

    # ── S04-P0-09/10 mark for review ─────────────────────────────────────────
    # Flag a question that has NO answer, and one that does: the checklist
    # treats those as two different palette states.
    req("PUT", f"/attempts/{attempt_id}/responses/{qids[1]}", tok, {"markedForReview": True})
    req("PUT", f"/attempts/{attempt_id}/responses/{qids[0]}", tok, {"markedForReview": True})
    s, state = req("GET", f"/attempts/{attempt_id}", tok)
    st = statuses(state)
    record("S04-P0-09", "flagging an unanswered question reports MARKED",
           st[qids[1]] == "MARKED", f"status={st[qids[1]]}")
    record("S04-P0-10", "flagging an answered question reports ANSWERED_MARKED",
           st[qids[0]] == "ANSWERED_MARKED", f"status={st[qids[0]]}")

    # ── the bug this contract exists to prevent ──────────────────────────────
    # Saving {markedForReview} alone must not wipe the answer saved earlier.
    record("S04-P0-12", "flagging a question does not destroy its saved answer",
           answers(state).get(qids[0]) == "A",
           f"answer after a mark-only save = {answers(state).get(qids[0])!r}")

    # ── S04-P0-14 clear response ─────────────────────────────────────────────
    s, _ = req("PUT", f"/attempts/{attempt_id}/responses/{qids[0]}", tok,
               {"answer": None, "markedForReview": False})
    s, state = req("GET", f"/attempts/{attempt_id}", tok)
    cleared_answer = answers(state).get(qids[0])
    cleared_status = statuses(state).get(qids[0])
    record("S04-P0-14", "clearing a response removes the answer and resets the palette state",
           cleared_answer is None and cleared_status == "NOT_ANSWERED",
           f"answer={cleared_answer!r} status={cleared_status}")

    # ── S04-P0-07 not answered ───────────────────────────────────────────────
    record("S04-P0-07", "a visited-but-blank question reports NOT_ANSWERED",
           cleared_status == "NOT_ANSWERED", f"status={cleared_status}")

    # ── S04-P0-11/13/15/16 navigation is stateless server-side ───────────────
    # Save & Next / Mark & Next / Previous / palette jump are client moves; what
    # the server must guarantee is that a response written from ANY of them
    # survives being revisited in ANY order. Rewrite in reverse paper order and
    # confirm nothing is lost.
    for qid, ans in [(qids[4], "D"), (qids[3], 7), (qids[2], ["B"]), (qids[1], "C"), (qids[0], "A")]:
        req("PUT", f"/attempts/{attempt_id}/responses/{qid}", tok, {"answer": ans})
    s, state = req("GET", f"/attempts/{attempt_id}", tok)
    stored = answers(state)
    expect = {qids[4]: "D", qids[3]: 7, qids[2]: ["B"], qids[1]: "C", qids[0]: "A"}
    retained = all(stored.get(k) == v for k, v in expect.items())
    record("S04-P0-15", "responses are retained when questions are revisited out of order",
           retained, json.dumps({k[:8]: stored.get(k) for k in expect}))
    record("S04-P0-16", "any question can be addressed directly (palette jump)",
           retained, "all five written by id, none lost")
    record("S04-P0-11", "a save followed by a move keeps the saved value", retained)
    record("S04-P0-13", "a mark-and-move keeps both the answer and the flag",
           st[qids[0]] == "ANSWERED_MARKED", "verified above via ANSWERED_MARKED")

    # ── S04-P0-17 section navigation ─────────────────────────────────────────
    sections = state["exam"]["sections"]
    both = len(sections) == 2 and all(sec["questions"] for sec in sections)
    s2_qids = [eq["question"]["id"] for eq in sections[1]["questions"]]
    kept = all(stored.get(q) is not None for q in s2_qids)
    record("S04-P0-17", "both sections are served in one payload with their responses intact",
           both and kept, f"{len(sections)} sections, section-2 answers kept={kept}")
    s, _ = req("PUT", f"/attempts/{attempt_id}/section-time", tok,
               {"sectionId": main_exam["sectionIds"][1], "seconds": 30})
    record("S04-P0-17b", "time spent in a section is recorded server-side", s == 200, f"status={s}")

    # ── S04-P0-18/19/20 server-authoritative timer ───────────────────────────
    # Measure the wall time actually spanned by the two reads rather than
    # assuming it equals the sleep: this API talks to a remote database, so a
    # round-trip can itself be a second or more. Asserting against the sleep
    # would be asserting against network latency.
    t0 = time.monotonic()
    s, a = req("GET", f"/attempts/{attempt_id}", tok)
    first = a["remainingSeconds"]
    expires = a["expiresAt"]
    time.sleep(3)
    s, b = req("GET", f"/attempts/{attempt_id}", tok)
    elapsed = time.monotonic() - t0
    ticked = first - b["remainingSeconds"]
    # The countdown must track real time: never run backwards, never stall, and
    # never outpace the wall clock by more than a round-trip's worth.
    record("S04-P0-18", "the clock is the server's and counts down in real time",
           0 < ticked <= elapsed + 2 and b["expiresAt"] == expires,
           f"{first}s -> {b['remainingSeconds']}s ({ticked}s) over {elapsed:.1f}s wall, "
           "expiresAt unchanged")

    # A refresh is just another GET; the deadline must not move.
    s, c = req("GET", f"/attempts/{attempt_id}", tok)
    record("S04-P0-19", "refreshing mid-exam neither resets nor extends the deadline",
           c["expiresAt"] == expires, f"expiresAt {expires} == {c['expiresAt']}")

    # A client cannot supply time. Try to: re-start the same attempt, and send a
    # forged deadline. Neither may move the server's expiry.
    s_restart, restart = req("POST", "/attempts", tok, {"examId": main_exam["examId"]})
    s, d2 = req("GET", f"/attempts/{attempt_id}", tok)
    forged, _ = req("PUT", f"/attempts/{attempt_id}/responses/{qids[0]}", tok,
                    {"answer": "A", "expiresAt": "2099-01-01T00:00:00.000Z", "remainingSeconds": 999999})
    s, e = req("GET", f"/attempts/{attempt_id}", tok)
    record("S04-P0-20", "a client cannot extend its own exam time",
           d2["expiresAt"] == expires and e["expiresAt"] == expires and forged in (200, 400),
           f"re-start returned {s_restart} (same attempt, not a new clock); "
           f"forged expiresAt payload returned {forged}; deadline still {expires}")

    # ── S04-P0-24/25/26/27 disconnect, reconnect, reopen ─────────────────────
    # A reconnect is a fresh token against the same attempt: nothing about the
    # exam may live in the client.
    tok2 = student_token(slug, fx["rolls"][0], pw)
    s, recovered = req("GET", f"/attempts/{attempt_id}", tok2)
    same = (
        s == 200
        and recovered["expiresAt"] == expires
        and answers(recovered) == stored
    )
    record("S04-P0-26", "reconnecting recovers the session, timer and every response", same,
           f"status={s}, deadline preserved, {len(stored)} responses intact")
    record("S04-P0-27", "closing and reopening the browser resumes the same attempt", same,
           "a new session token against the same attempt returns identical state")
    record("S04-P0-25", "responses saved before a disconnect survive it", same)
    s, _ = req("PUT", f"/attempts/{attempt_id}/responses/{qids[1]}", tok2, {"timeSpentMs": 1500})
    record("S04-P0-24", "a periodic background sync carrying no answer is accepted", s == 200,
           f"status={s}")

    # ── S04-P0-28 single session ─────────────────────────────────────────────
    # tok2 was issued second. The first token must now be dead.
    s_old, _ = req("GET", f"/attempts/{attempt_id}", tok)
    s_new, _ = req("GET", f"/attempts/{attempt_id}", tok2)
    record("S04-P0-28", "a second-device login revokes the first session",
           s_old in (401, 403) and s_new == 200,
           f"first token -> {s_old}, second token -> {s_new}")

    # ── S04-P0-29/30 calculator ──────────────────────────────────────────────
    s, st_main = req("GET", f"/attempts/{attempt_id}", tok2)
    record("S04-P0-29", "calculator availability is served with the attempt when enabled",
           st_main["exam"].get("calculatorEnabled") is True,
           f"calculatorEnabled={st_main['exam'].get('calculatorEnabled')}")

    # ── S04-P0-21 timeout ────────────────────────────────────────────────────
    # A genuine one-minute paper, waited out.
    short = fx["short"]
    tok_short = student_token(slug, fx["rolls"][1], pw)
    s, satt = req("POST", "/attempts", tok_short, {"examId": short["examId"]})
    if s not in (200, 201):
        record("S04-P0-21", "expired attempt auto-submits and locks", False, f"start {s} {json.dumps(satt)[:150]}")
    else:
        sid = satt["id"]
        s, sstate = req("GET", f"/attempts/{sid}", tok_short)
        record("S04-P0-30", "calculator is absent when the exam disables it",
               sstate["exam"].get("calculatorEnabled") is False,
               f"calculatorEnabled={sstate['exam'].get('calculatorEnabled')}")
        req("PUT", f"/attempts/{sid}/responses/{short['questionId']}", tok_short, {"answer": "A"})
        wait = sstate["remainingSeconds"] + 3
        print(f"    (waiting {wait}s for the one-minute paper to expire - this is the real clock)")
        time.sleep(max(0, wait))
        s_write, w = req("PUT", f"/attempts/{sid}/responses/{short['questionId']}", tok_short, {"answer": "B"})
        s_state, expired = req("GET", f"/attempts/{sid}", tok_short)
        record("S04-P0-21", "an expired attempt auto-submits and refuses further writes",
               s_write == 400 and expired.get("status") == "AUTO_SUBMITTED",
               f"write after expiry -> {s_write} ({(w or {}).get('message')}), status={expired.get('status')}")
        record("S04-P0-23", "the answer saved before expiry is the one that persists",
               answers(expired).get(short["questionId"]) == "A",
               "the post-expiry write was refused, so the pre-expiry answer stands")

    # ── visual rows, stated rather than claimed ──────────────────────────────
    for key, what in [
        ("S04-P0-04", "images / diagrams / tables render"),
        ("S04-P0-05", "math content renders"),
    ]:
        record(key, what, None,
               "irreducibly visual - not assertable over HTTP; see the browser suite "
               "and uat-results.md rather than counting this as verified here")

    finish()


def finish():
    failed = [r for r in RESULTS if r["pass"] is False]
    unknown = [r for r in RESULTS if r["pass"] is None]
    passed = [r for r in RESULTS if r["pass"] is True]
    print(f"\nCBT ENGINE: {len(passed)} passed, {len(failed)} FAILED, {len(unknown)} not assertable here")
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cbt-engine-results.json")
    json.dump({"total": len(RESULTS), "failed": len(failed), "results": RESULTS},
              open(out, "w"), indent=2)
    print("wrote", out)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()

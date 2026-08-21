#!/usr/bin/env python3
"""
Prepare the CBT-engine paper for the two visual section-4 rows.

S04-P0-04 (images render) and S04-P0-05 (math renders) cannot be settled over
HTTP - they are about what a candidate actually sees. This script puts real
content in front of the browser suite:

  * uploads a PNG through the media API and attaches it to question 1, so the
    exam runner has a genuine diagram to load (not a placeholder)
  * rewrites question 2's statement to carry notation a science paper needs -
    a superscript, a subscript and a LaTeX fragment - so the browser suite can
    report what the runner does with each

Attaching media to a question that is already in an exam also exercises the
edit safeguard from the other side: `mediaKeys` is not a scoring field, so the
confirmed edit must go through WITHOUT re-scoring anything. That is asserted
here rather than assumed.

Usage:  python qa/uat/prep-engine-media.py /tmp/engfixture.json
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

# A visibly non-blank 8x8 red PNG, so "the image loaded" is distinguishable
# from "a 1x1 transparent pixel technically decoded", generated with real
# zlib data and real chunk CRCs.
#
# The earlier hand-written blob decoded in Chrome but not in Firefox ("Image
# corrupt or truncated"), which looked exactly like a cross-browser rendering
# defect until the chunk CRCs were checked. Fixture bytes must be correct, or
# the suite reports its own bugs as the product's.
PNG_8x8_RED = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000080000000808020000004b6d29dc"
    "000000114944415478da63b8a0a88815310c2d0900f00e4481df21a25a00000000"
    "49454e44ae426082"
)

MATH_STATEMENT = (
    "UAT engine Q2 (math): the kinetic energy is E = 1/2 m v^2, "
    "the acid is H2SO4, and in LaTeX that is $E = \\tfrac{1}{2}mv^{2}$."
)


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


def upload(token):
    boundary = "----uat" + uuid.uuid4().hex
    body = io.BytesIO()
    body.write(f"--{boundary}\r\n".encode())
    body.write(b'Content-Disposition: form-data; name="file"; filename="uat-diagram.png"\r\n')
    body.write(b"Content-Type: image/png\r\n\r\n")
    body.write(PNG_8x8_RED)
    body.write(f"\r\n--{boundary}--\r\n".encode())
    r = urllib.request.Request(
        API + "/media", data=body.getvalue(), method="POST",
        headers={"content-type": f"multipart/form-data; boundary={boundary}",
                 "authorization": "Bearer " + token},
    )
    with urllib.request.urlopen(r) as resp:
        return json.loads(resp.read().decode())


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/engfixture.json"
    fx = json.load(open(path))
    tok = staff_token("admin@demo.local", "Admin@123")

    media = upload(tok)
    key = media["key"]
    print("uploaded media key:", key)

    q_image, q_math = fx["main"]["questionIds"][0], fx["main"]["questionIds"][1]

    s, d = req("PATCH", f"/questions/{q_image}", tok, {"mediaKeys": [key], "confirm": True})
    assert s == 200, f"attach media {s} {json.dumps(d)[:200]}"
    recalculated = (d or {}).get("recalculated")
    assert recalculated == [], (
        "attaching a diagram must not re-score anything - mediaKeys is not a "
        f"scoring field, but the API reported {recalculated!r}"
    )
    print("attached to question 1; re-score correctly NOT triggered")

    s, d = req("PATCH", f"/questions/{q_math}", tok, {"statement": MATH_STATEMENT, "confirm": True})
    assert s == 200, f"set math statement {s} {json.dumps(d)[:200]}"
    print("question 2 now carries superscript / subscript / LaTeX notation")

    fx["main"]["mediaKey"] = key
    fx["main"]["mathQuestionId"] = q_math
    fx["main"]["imageQuestionId"] = q_image
    json.dump(fx, open(path, "w"), indent=2)
    print("updated", path)


if __name__ == "__main__":
    main()

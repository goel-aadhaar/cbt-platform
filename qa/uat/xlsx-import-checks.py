#!/usr/bin/env python3
"""
Bulk import from Excel — students (admin) and questions (teacher).

Every assertion round-trips a **real .xlsx**: the workbook is built here with
`openpyxl` if available, otherwise assembled as a minimal OOXML zip by hand, so
the API is fed the same bytes Excel would produce rather than a CSV wearing an
.xlsx name. Uploading a real workbook is the whole point — a parser that only
ever sees a synthetic file proves nothing about what a school will send.

Usage:  python qa/uat/xlsx-import-checks.py
"""
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import uuid
import zipfile

API = os.environ.get("API_BASE", "http://localhost:4000/api/v1")
API_LOG = os.environ.get("API_LOG", "/tmp/api.log")

RESULTS = []


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
        with urllib.request.urlopen(r, timeout=60) as resp:
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
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:300]


def upload(path, token, buffer, filename):
    boundary = "----uat" + uuid.uuid4().hex
    body = io.BytesIO()
    body.write(f"--{boundary}\r\n".encode())
    body.write(
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode()
    )
    body.write(
        b"Content-Type: application/vnd.openxmlformats-officedocument"
        b".spreadsheetml.sheet\r\n\r\n"
    )
    body.write(buffer)
    body.write(f"\r\n--{boundary}--\r\n".encode())
    r = urllib.request.Request(
        API + path, data=body.getvalue(), method="POST",
        headers={"content-type": f"multipart/form-data; boundary={boundary}",
                 "authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        try:
            return e.code, json.loads(txt)
        except Exception:
            return e.code, txt[:300]


# ── building a real workbook ────────────────────────────────────────────────
def _col(n: int) -> str:
    name = ""
    while n > 0:
        n, rem = divmod(n - 1, 26)
        name = chr(65 + rem) + name
    return name


def build_xlsx(rows) -> bytes:
    """
    A minimal but genuine .xlsx.

    Written by hand rather than with a library so this suite has no dependency
    of its own — and because assembling the OOXML parts is exactly what proves
    the reader copes with a real workbook (shared strings, inline numbers, the
    1-indexed row/column addressing) rather than something CSV-shaped.
    """
    try:
        from openpyxl import Workbook  # noqa: PLC0415

        wb = Workbook()
        ws = wb.active
        for r in rows:
            ws.append(list(r))
        out = io.BytesIO()
        wb.save(out)
        return out.getvalue()
    except ImportError:
        pass

    def esc(v):
        return (
            str(v)
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        )

    sheet_rows = []
    for ri, row in enumerate(rows, start=1):
        cells = []
        for ci, val in enumerate(row, start=1):
            ref = f"{_col(ci)}{ri}"
            if val is None or val == "":
                continue
            if isinstance(val, (int, float)) and not isinstance(val, bool):
                cells.append(f'<c r="{ref}"><v>{val}</v></c>')
            else:
                # Inline strings keep the file self-contained (no sharedStrings
                # part) while still being valid OOXML.
                cells.append(
                    f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">'
                    f"{esc(val)}</t></is></c>"
                )
        sheet_rows.append(f'<row r="{ri}">{"".join(cells)}</row>')

    sheet = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(sheet_rows)}</sheetData></worksheet>'
    )
    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
        ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'
    )
    wb_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"'
        ' Target="worksheets/sheet1.xml"/></Relationships>'
    )
    root_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"'
        ' Target="xl/workbook.xml"/></Relationships>'
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        "</Types>"
    )

    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", root_rels)
        z.writestr("xl/workbook.xml", workbook)
        z.writestr("xl/_rels/workbook.xml.rels", wb_rels)
        z.writestr("xl/worksheets/sheet1.xml", sheet)
    return out.getvalue()


def upload_bytes(path, token, data, filename, ctype="application/octet-stream"):
    """Upload arbitrary bytes — for the wrong-format and oversized cases."""
    boundary = "----uat" + uuid.uuid4().hex
    body = io.BytesIO()
    body.write(f"--{boundary}\r\n".encode())
    body.write(
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode()
    )
    body.write(f"Content-Type: {ctype}\r\n\r\n".encode())
    body.write(data)
    body.write(f"\r\n--{boundary}--\r\n".encode())
    r = urllib.request.Request(
        API + path, data=body.getvalue(), method="POST",
        headers={"content-type": f"multipart/form-data; boundary={boundary}",
                 "authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            return resp.status, json.loads(resp.read().decode())
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
    assert s == 200, f"login {email}: {s} {step1}"
    code = None
    for _ in range(25):
        time.sleep(1)
        if len(_otps()) > before:
            code = _otps()[-1]
            break
    assert code, f"no OTP in {API_LOG}"
    s, d = req("POST", "/auth/login/verify",
               body={"challengeId": step1["challengeId"], "code": code})
    assert s == 200, f"verify {email}: {s} {d}"
    return d["accessToken"]


def items(payload):
    if isinstance(payload, dict) and "items" in payload:
        return payload["items"]
    return payload if isinstance(payload, list) else []


def main():
    admin = staff_token("admin@demo.local", "Admin@123")
    teacher = staff_token("anil@demo.local", "Teacher@123")
    stamp = uuid.uuid4().hex[:6]

    # ── templates ───────────────────────────────────────────────────────────
    print("\n=== Templates ===")
    for who, tok, path, label in (
        ("students", admin, "/students/import/template", "roster"),
        ("questions", teacher, "/questions/import/template", "question bank"),
    ):
        s, body = raw_get(path, tok)
        is_zip = isinstance(body, bytes) and body[:2] == b"PK"
        has_sheet = isinstance(body, bytes) and b"xl/workbook.xml" in body[:8192]
        record(f"XLSX-T-{who}", f"the {label} template downloads as a real workbook",
               s == 200 and is_zip and has_sheet,
               f"status={s}, {len(body) if isinstance(body, bytes) else 0} bytes, "
               f"zip={is_zip}, workbook part={has_sheet}")

    # ── students ────────────────────────────────────────────────────────────
    print("\n=== Students: admin bulk import from Excel ===")
    s, batches = req("GET", "/batches", admin)
    batch = items(batches)[0]

    names = [f"UATXL {stamp} One", f"UATXL {stamp} Two", f"UATXL {stamp} Three"]
    emails = [f"uatxl-{stamp}-{i}@example.com" for i in range(1, 4)]
    book = build_xlsx([
        ["name", "email"],
        [names[0], emails[0]],
        [names[1], emails[1]],
        [names[2], emails[2]],
        # A deliberately bad row: the file must still import the good ones.
        ["", "no-name@example.com"],
        # And a duplicate of a row above.
        [names[0], emails[0]],
    ])
    s, res = upload(f"/students/import?batchId={batch['id']}", admin, book,
                    "roster.xlsx")
    ok = s in (200, 201) and isinstance(res, dict)
    record("XLSX-S-1", "an .xlsx roster uploads and imports", ok,
           f"status={s} " + (json.dumps({k: res[k] for k in ("total", "batch")})
                             if ok else json.dumps(res)[:180]))
    if ok:
        record("XLSX-S-2", "the three valid rows are imported",
               len(res["imported"]) == 3,
               f"{len(res['imported'])} imported: "
               f"{[i['name'] for i in res['imported']]}")
        record("XLSX-S-3", "the blank-name and duplicate rows fail without stopping the file",
               len(res["failed"]) == 2,
               json.dumps(res["failed"]))
        record("XLSX-S-4", "roll numbers are server-generated, never taken from the sheet",
               all(i["rollNumber"] for i in res["imported"]),
               f"rolls={[i['rollNumber'] for i in res['imported']]}")

        s, listed = req("GET", f"/students?search=uatxl-{stamp}", admin)
        found = items(listed)
        record("XLSX-S-5", "the imported students are readable back from the roster",
               len(found) == 3 and all(f["status"] == "PENDING" for f in found),
               f"{len(found)} found, statuses="
               f"{sorted({f['status'] for f in found})}")

    # a sheet without the required columns must say so
    bad = build_xlsx([["roll", "marks"], ["R1", "42"]])
    s_bad, msg = upload(f"/students/import?batchId={batch['id']}", admin, bad,
                        "wrong.xlsx")
    record("XLSX-S-6", "a sheet missing name/email is refused once, not row by row",
           s_bad == 400
           and "missing" in json.dumps(msg).lower()
           and "roll" in json.dumps(msg),
           f"status={s_bad} {json.dumps(msg)[:150]}")

    # ── questions ───────────────────────────────────────────────────────────
    print("\n=== Questions: teacher bulk import from Excel ===")
    s, subjects = req("GET", "/subjects", teacher)
    subject = items(subjects)[0]
    s, chapters = req("GET", f"/chapters?subjectId={subject['id']}", teacher)
    chapter = items(chapters)[0]

    qbook = build_xlsx([
        ["statement", "type", "optionA", "optionB", "optionC", "optionD",
         "answer", "difficulty", "marks", "negativeMarks", "explanation", "tags"],
        [f"UATXL {stamp} MCQ: speed of a body covering 12 m in 4 s?", "MCQ",
         "2 m/s", "3 m/s", "4 m/s", "6 m/s", "B", "EASY", 4, 1,
         "12 / 4 = 3 m/s.", "kinematics, speed"],
        [f"UATXL {stamp} MSQ: which are noble gases?", "MSQ",
         "Helium", "Nitrogen", "Argon", "Oxygen", "A,C", "MEDIUM", 4, 1,
         "Group 18.", "periodic-table"],
        [f"UATXL {stamp} INTEGER: protons in carbon?", "INTEGER",
         "", "", "", "", 6, "EASY", 4, 0, "Atomic number 6.", "atoms"],
        # No answer — must be reported, not silently dropped.
        [f"UATXL {stamp} broken: no answer given", "MCQ",
         "a", "b", "c", "d", "", "EASY", 4, 1, "", ""],
    ])
    qs = f"?subjectId={subject['id']}&chapterId={chapter['id']}"
    s, qres = upload(f"/questions/import{qs}", teacher, qbook, "questions.xlsx")
    ok = s in (200, 201) and isinstance(qres, dict)
    record("XLSX-Q-1", "a teacher can upload an .xlsx question bank", ok,
           f"status={s} " + (f"total={qres.get('total')}" if ok
                             else json.dumps(qres)[:180]))
    if ok:
        record("XLSX-Q-2", "the three well-formed questions import",
               len(qres["imported"]) == 3,
               f"types={[i['type'] for i in qres['imported']]}")
        record("XLSX-Q-3", "each answer shape is honoured (MCQ / MSQ / INTEGER)",
               sorted(i["type"] for i in qres["imported"])
               == ["INTEGER", "MCQ", "MSQ"],
               f"{[i['type'] for i in qres['imported']]}")
        record("XLSX-Q-4", "the answerless row is reported rather than dropped",
               len(qres["failed"]) == 1,
               json.dumps(qres["failed"])[:170])

        s, bank = req("GET", f"/questions?search=UATXL+{stamp}", teacher)
        rows = items(bank)
        by_type = {r["type"]: r for r in rows}
        record("XLSX-Q-5", "the imported questions are in the bank as DRAFT",
               len(rows) == 3 and all(r["status"] == "DRAFT" for r in rows),
               f"{len(rows)} found, statuses={sorted({r['status'] for r in rows})}")

        if "MSQ" in by_type:
            s, detail = req("GET", f"/questions/{by_type['MSQ']['id']}", teacher)
            record("XLSX-Q-6", "an MSQ's comma-separated answer becomes a key array",
                   (detail or {}).get("answerKey") == ["A", "C"],
                   f"answerKey={json.dumps((detail or {}).get('answerKey'))}")
        if "INTEGER" in by_type:
            s, detail = req("GET", f"/questions/{by_type['INTEGER']['id']}", teacher)
            record("XLSX-Q-7", "an INTEGER answer becomes a number, with no options",
                   (detail or {}).get("answerKey") == 6
                   and not (detail or {}).get("options"),
                   f"answerKey={json.dumps((detail or {}).get('answerKey'))} "
                   f"options={json.dumps((detail or {}).get('options'))}")
        if "MCQ" in by_type:
            s, detail = req("GET", f"/questions/{by_type['MCQ']['id']}", teacher)
            opts = (detail or {}).get("options") or []
            record("XLSX-Q-8", "option columns become keyed options in order",
                   [o["key"] for o in opts] == ["A", "B", "C", "D"]
                   and opts[1]["text"] == "3 m/s",
                   f"{json.dumps(opts)[:150]}")

    # the .docx path must still work — one adapter now serves both
    docx_like = b"PK\x03\x04" + b"word/document.xml" + b"\x00" * 32
    s_docx, dmsg = upload(f"/questions/import{qs}", teacher, docx_like, "x.docx")
    record("XLSX-Q-9", "the Word path is still routed (not swallowed by the sheet reader)",
           s_docx == 400 and "questions" in json.dumps(dmsg).lower(),
           f"status={s_docx} {json.dumps(dmsg)[:130]}")

    junk = b"this is not a document at all"
    s_junk, jmsg = upload(f"/questions/import{qs}", teacher, junk, "notes.txt")
    record("XLSX-Q-10", "an unsupported file is refused by content, not by extension",
           s_junk == 400 and "Unsupported" in json.dumps(jmsg),
           f"status={s_junk} {json.dumps(jmsg)[:130]}")


    # ── files people actually build ─────────────────────────────────────────
    print("\n=== Real-world spreadsheet shapes ===")
    stamp2 = uuid.uuid4().hex[:6]

    # A title row above the headers, and the table on a later tab, are the two
    # commonest ways a real roster differs from the template.
    titled = build_xlsx([
        ["Class 12 Physics — student list"], [],
        ["name", "email"],
        [f"UATRW {stamp2} Good", f"uatrw-{stamp2}-ok@example.com"],
        ["", "uatrw-noname@example.com"],
        [f"UATRW {stamp2} Bad", "not-an-email"],
    ])
    s, res = upload(f"/students/import?batchId={batch['id']}", admin, titled,
                    "titled.xlsx")
    ok = s in (200, 201) and isinstance(res, dict)
    record("XLSX-R-1", "a title row above the headers does not break the import",
           ok and len(res.get("imported", [])) == 1,
           f"status={s} " + (json.dumps(res.get("imported")) if ok
                             else json.dumps(res)[:150]))
    if ok:
        # The whole point of a row number is that the user can go to that row.
        record("XLSX-R-2", "reported rows are the real sheet rows, not a running count",
               [i["row"] for i in res["imported"]] == [4]
               and [f["row"] for f in res["failed"]] == [5, 6],
               f"imported={[i['row'] for i in res['imported']]} "
               f"failed={[f['row'] for f in res['failed']]} (expected 4; 5,6)")

    aliased = build_xlsx([
        ["Full Name", "E-Mail"],
        [f"UATRW {stamp2} Alias", f"uatrw-{stamp2}-alias@example.com"],
    ])
    s, res = upload(f"/students/import?batchId={batch['id']}", admin, aliased,
                    "aliased.xlsx")
    record("XLSX-R-3", '"Full Name" / "E-Mail" headers are understood',
           s in (200, 201) and len(res.get("imported", [])) == 1,
           f"status={s} {json.dumps(res)[:130]}")

    # A question sheet with a title row must find its table too.
    qtitled = build_xlsx([
        ["Physics chapter 3 question bank"], [],
        ["statement", "type", "optionA", "optionB", "answer"],
        [f"UATRW {stamp2} good", "MCQ", "x", "y", "A"],
        [f"UATRW {stamp2} no answer", "MCQ", "x", "y", ""],
    ])
    s, qres = upload(f"/questions/import{qs}", teacher, qtitled, "titled.xlsx")
    record("XLSX-R-9", "a question sheet with a title row imports, reporting real rows",
           s in (200, 201)
           and [i["index"] for i in qres.get("imported", [])] == [4]
           and [f["index"] for f in qres.get("failed", [])] == [5],
           f"status={s} imported={[i.get('index') for i in qres.get('imported', [])]} "
           f"failed={[f.get('index') for f in qres.get('failed', [])]} (expected 4; 5)")

    # Wrong file types must say what the file IS, not misreport it as an empty CSV.
    s, msg = upload_bytes(f"/students/import?batchId={batch['id']}", admin,
                          b"PK\x03\x04word/document.xml" + b"\x00" * 40,
                          "paper.docx")
    record("XLSX-R-4", "a Word document sent to the roster import is named as such",
           s == 400 and "Word document" in json.dumps(msg),
           f"status={s} {json.dumps(msg)[:120]}")

    s, msg = upload_bytes(f"/students/import?batchId={batch['id']}", admin,
                          b"%PDF-1.7\n\x00binary", "notes.pdf")
    record("XLSX-R-5", "a binary that is not a spreadsheet is refused clearly",
           s == 400 and "not a spreadsheet" in json.dumps(msg),
           f"status={s} {json.dumps(msg)[:120]}")

    # CSV must keep working, and keep its own row numbering honest.
    csv = (f"name,email\nUATRW {stamp2} CSV,uatrw-{stamp2}-csv@example.com\n"
           "\n,blank-name@example.com\n").encode()
    s, res = upload_bytes(f"/students/import?batchId={batch['id']}", admin, csv,
                          "roster.csv", "text/csv")
    record("XLSX-R-6", "CSV still imports, and a blank line does not shift row numbers",
           s in (200, 201)
           and [i["row"] for i in res.get("imported", [])] == [2]
           and [f["row"] for f in res.get("failed", [])] == [4],
           f"status={s} imported={[i.get('row') for i in res.get('imported', [])]} "
           f"failed={[f.get('row') for f in res.get('failed', [])]} (expected 2; 4)")

    # An oversized upload must be refused by the server, not accepted and lost.
    s, msg = upload_bytes(f"/students/import?batchId={batch['id']}", admin,
                          b"x" * (12 * 1024 * 1024), "big.xlsx")
    record("XLSX-R-7", "an oversized upload is refused with 413",
           s == 413, f"status={s}")

    # And a teacher must not be able to import a roster at all.
    s, msg = upload_bytes(f"/students/import?batchId={batch['id']}", teacher,
                          build_xlsx([["name", "email"], ["X", "x@y.com"]]),
                          "roster.xlsx")
    record("XLSX-R-8", "roster import stays admin-only", s == 403, f"status={s}")

    # A row that contradicts itself must be rejected, not silently narrowed.
    contradictory = build_xlsx([
        ["statement", "type", "optionA", "optionB", "optionC", "answer"],
        [f"UATRW {stamp2} mcq with two answers", "MCQ", "a", "b", "c", "A,C"],
    ])
    s, res = upload(f"/questions/import{qs}", teacher, contradictory, "bad.xlsx")
    reason = json.dumps(res.get("failed", []))
    record("XLSX-R-10",
           "an MCQ given two answers is refused, not imported with one silently dropped",
           s in (200, 201)
           and len(res.get("imported", [])) == 0
           and "MSQ" in reason,
           f"status={s} {reason[:150]}")

    failed = [r for r in RESULTS if r["pass"] is False]
    passed = [r for r in RESULTS if r["pass"] is True]
    print(f"\nXLSX IMPORT: {len(passed)} passed, {len(failed)} FAILED")
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       "xlsx-import-results.json")
    json.dump({"total": len(RESULTS), "failed": len(failed), "results": RESULTS},
              open(out, "w"), indent=2)
    print("wrote", out)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()

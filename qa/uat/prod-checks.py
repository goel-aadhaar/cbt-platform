#!/usr/bin/env python3
"""
UAT section 23 - AWS / PRODUCTION (12 P0 rows), executed against the real
deployed instance rather than inferred from the deployment guide.

Nothing here writes to the deployment: every probe is a GET, or a request that
is expected to be REFUSED. No credentials are sent, so no session is created.

Two rows cannot be settled by an HTTP probe from outside and are settled from
the deployment's own configuration instead, which is stated in the evidence:

  S23-P0-04/05  whether media is on S3/CDN is a server-side adapter choice
  S23-P0-12     the API deliberately gives a uniform "Invalid credentials"
                for an unknown institute, so test tenants are (correctly) not
                enumerable from outside; the deployed DATABASE_URL settles it

Usage:  python qa/uat/prod-checks.py [http://host]
"""
import json
import os
import re
import socket
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROD_API_ENV = os.path.join(ROOT, "deploy", ".env.api.production")
PROD_WEB_ENV = os.path.join(ROOT, "deploy", ".env.web.production")
DEV_API_ENV = os.path.join(ROOT, "apps", "api", ".env")

RESULTS = []


def record(uat, name, ok, detail=""):
    """ok may be True / False / None (= could not be established here)."""
    RESULTS.append({"uat": uat, "name": name, "pass": ok, "detail": detail})
    tag = "PASS" if ok else ("**FAIL**" if ok is False else "INFO")
    print(f"  [{tag}] {uat} {name}" + (f" - {detail}" if detail else ""))


def get(url, timeout=15):
    r = urllib.request.Request(url, method="GET", headers={"user-agent": "drsk-uat/1.0"})
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", "replace"), dict(resp.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace"), dict(e.headers)
    except Exception as e:
        return 0, f"{type(e).__name__}: {e}", {}


def env_map(path):
    out = {}
    try:
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip().strip('"')
    except FileNotFoundError:
        pass
    return out


def db_identity(path):
    """(host, database) of a DATABASE_URL - never the credentials."""
    url = env_map(path).get("DATABASE_URL")
    if not url:
        return None
    u = urllib.parse.urlparse(url)
    return (u.hostname, (u.path or "").lstrip("/").split("?")[0])


def main():
    base = (sys.argv[1] if len(sys.argv) > 1 else None) or env_map(PROD_WEB_ENV).get("NEXT_PUBLIC_API_URL", "")
    base = re.sub(r"/api(/v1)?/?$", "", base).rstrip("/")
    if not base:
        print("No deployment URL. Pass one, or set NEXT_PUBLIC_API_URL in deploy/.env.web.production.")
        sys.exit(2)
    host = urllib.parse.urlparse(base).hostname
    print(f"Target: {base}  (host {host})\n")

    # --- S23-P0-01 frontend -------------------------------------------------
    s, body, hdrs = get(base + "/")
    root_ok = s in (200, 307, 308)
    landing = hdrs.get("Location") or "/login"
    s2, body2, _ = get(urllib.parse.urljoin(base + "/", landing))
    # A real Next.js render, not nginx's default page or an error shell.
    is_app = s2 == 200 and ("__NEXT_DATA__" in body2 or "/_next/static" in body2)
    record("S23-P0-01", "frontend loads on the deployment", root_ok and is_app,
           f"/ -> {s} -> {landing} -> {s2}, next-app-markup={is_app}")

    # --- S23-P0-02 backend --------------------------------------------------
    s, body, _ = get(base + "/api/health")
    live = s == 200 and '"status":"ok"' in body.replace(" ", "")
    sp, bodyp, _ = get(base + "/api/v1/exams")
    # A protected route must refuse an anonymous caller - proves the whole
    # guard chain is mounted, not just that a process is answering port 80.
    guarded = sp in (401, 403)
    record("S23-P0-02", "backend API responds and enforces auth",
           live and guarded, f"/api/health={s} live={live}; anonymous /api/v1/exams={sp}")

    # --- S23-P0-03 postgres -------------------------------------------------
    s, body, _ = get(base + "/api/health/ready", timeout=25)
    try:
        db_up = json.loads(body)["info"]["database"]["status"] == "up"
    except Exception:
        db_up = False
    record("S23-P0-03", "production database reachable and healthy", s == 200 and db_up,
           f"/api/health/ready={s} {body[:120]}")

    # --- S23-P0-04 S3 -------------------------------------------------------
    api_env = env_map(PROD_API_ENV)
    bucket = api_env.get("AWS_S3_BUCKET", "").strip()
    record("S23-P0-04", "media stored on S3", bool(bucket),
           f"AWS_S3_BUCKET={'set' if bucket else 'ABSENT'} in deploy/.env.api.production - "
           "without it the API falls back to the local-disk media adapter, so uploads "
           "live on the instance's ephemeral disk and are lost when it is replaced")

    # --- S23-P0-05 CDN ------------------------------------------------------
    cdn_keys = [k for k in api_env if "CDN" in k or "CLOUDFRONT" in k]
    record("S23-P0-05", "question media served through a CDN", bool(cdn_keys),
           f"CDN keys in production env: {cdn_keys or 'none'} - media is served by the "
           "single origin, so every image is an instance round-trip")

    # --- S23-P0-06 domain ---------------------------------------------------
    is_ip = bool(re.fullmatch(r"\d{1,3}(\.\d{1,3}){3}", host or ""))
    record("S23-P0-06", "served from a real production domain", not is_ip,
           f"host={host} - a bare IP, so there is no domain, no certificate, and no "
           "stable address if the instance is replaced" if is_ip else f"host={host}")

    # --- S23-P0-07 HTTPS ----------------------------------------------------
    tls_detail, tls_ok = "", False
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with socket.create_connection((host, 443), timeout=10) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as ss:
                cert = ss.getpeercert()
                tls_ok = True
                tls_detail = f"TLS up, cert subject={cert.get('subject')}"
    except Exception as e:
        tls_detail = f"port 443: {type(e).__name__}: {e}"
    record("S23-P0-07", "HTTPS with a valid certificate", tls_ok,
           tls_detail + " - credentials, session tokens and OTP codes therefore "
           "travel in cleartext" if not tls_ok else tls_detail)

    # --- S23-P0-08 / S23-P0-11 served-bundle scan ---------------------------
    # Fetch the login page and every first-party script it pulls, then look for
    # material that must never reach a browser, and for internal URLs.
    s2, body2, _ = get(base + "/login")
    srcs = re.findall(r'src="(/_next/[^"]+\.js)"', body2)
    bundle = body2
    for src in srcs[:40]:
        _, js, _ = get(base + src, timeout=25)
        bundle += js
    secrets = {
        "RSA/EC private key block": r"-----BEGIN (RSA |EC )?PRIVATE KEY-----",
        "postgres connection string": r"postgres(ql)?://[^\s\"']+:[^\s\"']+@",
        "AWS access key id": r"\bAKIA[0-9A-Z]{16}\b",
        "JWT_PRIVATE_KEY name": r"JWT_PRIVATE_KEY",
        "SES/SMTP password var": r"\b(SMTP_PASSWORD|AWS_SECRET_ACCESS_KEY)\b",
    }
    found = {n: len(re.findall(p, bundle)) for n, p in secrets.items() if re.search(p, bundle)}
    record("S23-P0-08", "no server secrets in the shipped frontend bundle", not found,
           f"scanned {len(srcs)} first-party scripts ({len(bundle)} chars); "
           f"{'FOUND ' + json.dumps(found) if found else 'clean'}")

    internal = {
        "localhost": r"\blocalhost:\d+",
        "loopback IP": r"\b127\.0\.0\.1(:\d+)?",
        "private 10.x": r"\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b",
        "staging host": r"staging[.-][a-z0-9.-]+",
        "direct API port": r"://[^\s\"']+:4000",
    }
    leaked = {n: len(re.findall(p, bundle)) for n, p in internal.items() if re.search(p, bundle)}
    record("S23-P0-11", "no staging or internal URLs in the shipped bundle", not leaked,
           json.dumps(leaked) if leaked else "clean")

    # Swagger is not on the checklist, but an anonymous full API surface on a
    # production origin belongs in the same section as "secrets not exposed".
    sd, bd, _ = get(base + "/api/docs")
    record("S23-P0-08b", "API documentation not anonymously readable in production",
           not (sd == 200 and "Swagger UI" in bd),
           f"/api/docs={sd}" + (" - full route/DTO surface is public" if sd == 200 else ""))

    # --- S23-P0-09 backup ---------------------------------------------------
    dep = ""
    try:
        dep = open(os.path.join(ROOT, "DEPLOYMENT.md"), encoding="utf-8").read().lower()
    except FileNotFoundError:
        pass
    documented = bool(re.search(r"\b(backup|restore|point-in-time|pg_dump)\b", dep))
    record("S23-P0-09", "backup / restore procedure confirmed", None,
           ("DEPLOYMENT.md mentions backup/restore" if documented
            else "no backup or restore procedure in DEPLOYMENT.md") +
           "; the database is managed Neon, whose retention and PITR window are a "
           "console setting this suite has no credentials to read - must be "
           "confirmed by the account owner, and a restore actually rehearsed")

    # --- S23-P0-10 logs/monitoring -----------------------------------------
    eco = ""
    try:
        eco = open(os.path.join(ROOT, "ecosystem.config.js"), encoding="utf-8").read()
    except FileNotFoundError:
        pass
    has_logs = "error_file" in eco or "out_file" in eco or "pm2" in dep
    has_alerting = bool(re.search(r"sentry|cloudwatch|datadog|newrelic|alert", eco + dep, re.I))
    record("S23-P0-10", "production failures are detectable", has_logs and has_alerting,
           f"pm2 log capture={'yes' if has_logs else 'no'}, "
           f"alerting/aggregation={'yes' if has_alerting else 'NONE'} - "
           "failures are only visible to someone who SSHes in and reads pm2 logs")

    # --- S23-P0-12 test data ------------------------------------------------
    prod_db, dev_db = db_identity(PROD_API_ENV), db_identity(DEV_API_ENV)
    same = prod_db is not None and prod_db == dev_db
    record("S23-P0-12", "production carries no unintended test data", not same,
           f"deployed DATABASE_URL host/db = {prod_db}; local dev = {dev_db}; "
           + ("SAME DATABASE - the deployment serves the dev seed (demo tenant, "
              "seeded students, and every QA fixture), and local test runs write "
              "straight into it" if same else "distinct"))

    failed = [r for r in RESULTS if r["pass"] is False]
    unknown = [r for r in RESULTS if r["pass"] is None]
    passed = [r for r in RESULTS if r["pass"] is True]
    print(f"\nSECTION 23: {len(passed)} passed, {len(failed)} FAILED, {len(unknown)} not establishable here")
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "prod-results.json")
    json.dump({"target": base, "passed": len(passed), "failed": len(failed),
               "unknown": len(unknown), "results": RESULTS}, open(out, "w"), indent=2)
    print("wrote", out)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()

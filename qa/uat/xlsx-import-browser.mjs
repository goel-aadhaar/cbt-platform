/**
 * Browser check for the Excel bulk-import UI (CDP, Chromium-family).
 *
 * The API suite proves the parsers; this proves an actual person can reach
 * them — the file pickers accept `.xlsx`, the template buttons download a real
 * workbook, and the teacher console has a bulk-import entry point at all, which
 * it did not before.
 *
 *   node qa/uat/xlsx-import-browser.mjs --cdp 9333 --app http://localhost:3010 \
 *     --admin admin@demo.local --teacher anil@demo.local --api-log /tmp/api.log
 */
import fs from "node:fs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);
const CDP = `http://127.0.0.1:${args.cdp ?? 9333}`;
const APP = (args.app ?? "http://localhost:3010").replace(/\/$/, "");
const API_LOG = args["api-log"] ?? "/tmp/api.log";

const results = [];
const record = (uat, name, ok, detail = "") => {
  results.push({ uat, name, pass: ok, detail });
  console.log(
    `  [${ok ? "PASS" : "**FAIL**"}] ${uat} ${name}${detail ? " - " + detail : ""}`,
  );
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Latest six-digit OTP the dev mail adapter printed to the API log. */
function latestOtp() {
  try {
    const codes =
      fs.readFileSync(API_LOG, "utf8").match(/code:\s*(\d{6})/g) ?? [];
    return codes.length ? codes[codes.length - 1].match(/(\d{6})/)[1] : null;
  } catch {
    return null;
  }
}

async function main() {
  const { webSocketDebuggerUrl } = await fetch(`${CDP}/json/new?about:blank`, {
    method: "PUT",
  }).then((r) => r.json());
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res);
    ws.addEventListener("error", rej);
  });

  let id = 0;
  const pending = new Map();
  const downloads = [];
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(new Error(JSON.stringify(m.error)));
      else resolve(m.result);
    } else if (m.method === "Browser.downloadWillBegin") {
      downloads.push(m.params.suggestedFilename);
    }
  });
  const send = (method, params = {}) => {
    const i = ++id;
    return new Promise((resolve, reject) => {
      pending.set(i, { resolve, reject });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  };

  await send("Page.enable");
  await send("Runtime.enable");
  // Downloads are what the template buttons produce; without this they are
  // cancelled by headless Chrome and the check could not see them.
  await send("Browser.setDownloadBehavior", {
    behavior: "allowAndName",
    downloadPath: (args["download-dir"] ?? "").replace(/\\/g, "/") || ".",
    eventsEnabled: true,
  }).catch(() => {});

  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (r.exceptionDetails)
      throw new Error(`Eval failed: ${r.exceptionDetails.text}`);
    return r.result?.value;
  };
  const navigate = async (url, settle = 2500) => {
    await send("Page.navigate", { url });
    await sleep(settle);
  };
  const waitFor = async (cond, timeout = 20000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        if (await evaluate(`Boolean(${cond})`)) return true;
      } catch {
        /* mid-navigation */
      }
      await sleep(300);
    }
    return false;
  };
  const typeInto = (sel, value) =>
    evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return false;
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
  const clickText = (text, tag = "button") =>
    evaluate(`(() => {
      const want = ${JSON.stringify(text)}.trim().toLowerCase();
      const els = Array.from(document.querySelectorAll(${JSON.stringify(tag)}));
      const label = (e) => e.textContent.replace(/\\s+/g, ' ').trim().toLowerCase();
      const el = els.find(e => label(e) === want)
        || els.find(e => label(e).startsWith(want))
        || els.find(e => label(e).includes(want));
      if (!el) return false;
      el.click();
      return true;
    })()`);

  /** Two-step staff sign-in, reading the OTP the API printed. */
  async function signIn(email, password) {
    // Navigate first: `localStorage` is not reachable on about:blank, so
    // clearing before the first load throws rather than signing anyone out.
    await navigate(`${APP}/login`, 2000);
    await evaluate(`(() => {
      for (const k of Object.keys(localStorage)) if (k.startsWith('drsk.')) localStorage.removeItem(k);
      return true;
    })()`);
    await navigate(`${APP}/login`);
    await clickText("Staff", "button, a, div[role=button]");
    await sleep(900);
    if (!(await waitFor(`document.querySelector('input[type=email]')`)))
      return false;
    const before = latestOtp();
    await typeInto("input[type=email]", email);
    await typeInto("input[type=password]", password);
    await evaluate(`document.querySelector('form')?.requestSubmit()`);
    // Wait for a NEW code rather than whatever was already in the log.
    let code = null;
    for (let i = 0; i < 25 && !code; i++) {
      await sleep(1000);
      const c = latestOtp();
      if (c && c !== before) code = c;
    }
    if (!code) return false;
    await waitFor(
      `document.querySelector('input[inputmode=numeric], input[maxlength="6"], input[placeholder="000000"]')`,
      10000,
    );
    await typeInto('input[placeholder="000000"], input[maxlength="6"]', code);
    await evaluate(
      `document.querySelectorAll('form')[document.querySelectorAll('form').length-1]?.requestSubmit()`,
    );
    return waitFor(`!location.pathname.startsWith('/login')`, 25000);
  }

  // ── admin: students ──────────────────────────────────────────────────────
  const asAdmin = await signIn(args.admin ?? "admin@demo.local", "Admin@123");
  record("XLSX-UI-1", "admin signs in", asAdmin);

  if (asAdmin) {
    await navigate(`${APP}/admin/students`, 3000);
    const opened = await clickText("Import");
    await sleep(1500);
    record(
      "XLSX-UI-2",
      "the roster import dialog opens from the students page",
      opened &&
        (await evaluate(`/bulk add students/i.test(document.body.innerText)`)),
    );

    const accept = await evaluate(
      `document.querySelector('input[type=file]')?.getAttribute('accept') ?? ''`,
    );
    record(
      "XLSX-UI-3",
      "the roster picker accepts .xlsx",
      accept.includes(".xlsx"),
      `accept="${accept}"`,
    );

    const copy = await evaluate(`/excel/i.test(document.body.innerText)`);
    record("XLSX-UI-4", "the dialog tells the user Excel is accepted", copy);

    downloads.length = 0;
    await clickText("Download template");
    await sleep(3000);
    record(
      "XLSX-UI-5",
      "the roster template downloads as a workbook",
      downloads.some((f) => f.endsWith(".xlsx")),
      downloads.join(", ") || "no download seen",
    );
  }

  // ── teacher: questions ───────────────────────────────────────────────────
  const asTeacher = await signIn(
    args.teacher ?? "anil@demo.local",
    "Teacher@123",
  );
  record("XLSX-UI-6", "teacher signs in", asTeacher);

  if (asTeacher) {
    await navigate(`${APP}/teacher/questions`, 3000);
    const hasButton = await evaluate(
      `/bulk import/i.test(document.body.innerText)`,
    );
    record(
      "XLSX-UI-7",
      "the teacher console has a bulk-import entry point (it had none before)",
      hasButton,
    );

    const opened = await clickText("Bulk Import");
    await sleep(1800);
    const dialog = await evaluate(
      `/upload an excel or word file/i.test(document.body.innerText)`,
    );
    record(
      "XLSX-UI-8",
      "the question import dialog opens for a teacher",
      Boolean(opened) && dialog,
    );

    const accept = await evaluate(
      `document.querySelector('input[type=file]')?.getAttribute('accept') ?? ''`,
    );
    record(
      "XLSX-UI-9",
      "the question picker accepts both .xlsx and .docx",
      accept.includes(".xlsx") && accept.includes(".docx"),
      `accept="${accept}"`,
    );

    downloads.length = 0;
    await clickText("Download Excel template");
    await sleep(3000);
    record(
      "XLSX-UI-10",
      "the question template downloads as a workbook",
      downloads.some((f) => f.endsWith(".xlsx")),
      downloads.join(", ") || "no download seen",
    );
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  fs.writeFileSync(
    new URL("./xlsx-import-browser-results.json", import.meta.url),
    JSON.stringify(
      { total: results.length, failed: failed.length, results },
      null,
      2,
    ),
  );
  ws.close();
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exit(2);
});

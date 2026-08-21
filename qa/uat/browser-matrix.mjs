/**
 * UAT section 22 - cross-browser UI pass, run against a real browser over CDP.
 *
 * Dependency-free: Node's native WebSocket speaks CDP directly, so this drives
 * whichever Chromium-family browser is listening (Chrome, Edge) without adding
 * anything to the repo. Firefox has no CDP and is covered separately.
 *
 *   node qa/uat/browser-matrix.mjs --cdp 9333 --app http://localhost:3010 \
 *        --label edge --roll UATKEY-ALPHA --slug demo --password Student@123 \
 *        --attempt <attemptId>
 *
 * The login goes through the real form (typed via the native value setter so
 * React's controlled inputs actually see it) and is submitted with Enter, which
 * is itself S22-P1-13. Console errors and failed requests are collected for the
 * whole run, so a screen that renders but throws still fails.
 */
import fs from "node:fs";

import { runChecks } from "./browser-checks.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);
const CDP_HTTP = `http://127.0.0.1:${args.cdp ?? 9333}`;
const APP = (args.app ?? "http://localhost:3010").replace(/\/$/, "");
const LABEL = args.label ?? "chromium";

const results = [];
const record = (uat, name, ok, detail = "") => {
  results.push({ browser: LABEL, uat, name, pass: ok, detail });
  console.log(
    `  [${ok ? "PASS" : "**FAIL**"}] ${uat} ${name}${detail ? " - " + detail : ""}`,
  );
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { webSocketDebuggerUrl } = await fetch(
    `${CDP_HTTP}/json/new?about:blank`,
    {
      method: "PUT",
    },
  ).then((r) => r.json());

  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res);
    ws.addEventListener("error", rej);
  });

  let id = 0;
  const pending = new Map();
  const consoleErrors = [];
  const failedRequests = [];
  const requestUrl = new Map();

  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
      return;
    }
    if (
      msg.method === "Runtime.consoleAPICalled" &&
      msg.params.type === "error"
    ) {
      consoleErrors.push(
        (msg.params.args || [])
          .map((a) => a.value ?? a.description ?? "")
          .join(" "),
      );
    } else if (msg.method === "Runtime.exceptionThrown") {
      const ex = msg.params.exceptionDetails;
      consoleErrors.push(
        `[exception] ${ex.text} ${ex.exception?.description ?? ""}`,
      );
    } else if (msg.method === "Network.requestWillBeSent") {
      requestUrl.set(msg.params.requestId, msg.params.request.url);
    } else if (msg.method === "Network.responseReceived") {
      const { status, url } = msg.params.response;
      // 401 on a pre-login probe is expected; only count real breakage.
      if (status >= 400 && status !== 401)
        failedRequests.push(`${status} ${url}`);
    } else if (msg.method === "Network.loadingFailed") {
      const url = requestUrl.get(msg.params.requestId) ?? "?";
      if (!msg.params.canceled)
        failedRequests.push(`${msg.params.errorText} ${url}`);
    }
  });

  const send = (method, params = {}) => {
    const thisId = ++id;
    return new Promise((resolve, reject) => {
      pending.set(thisId, { resolve, reject });
      ws.send(JSON.stringify({ id: thisId, method, params }));
    });
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");

  /**
   * `userGesture` is on for every evaluation.
   *
   * Without it a scripted `el.click()` is not a user activation, so any handler
   * that calls a gesture-gated API - `requestFullscreen()` in the exam runner's
   * start gate, clipboard writes elsewhere - rejects and the UI never advances.
   * Playwright's clicks are real gestures already, so this is what keeps the
   * two drivers running the same suite.
   */
  const evaluate = async (expression, awaitPromise = true) => {
    const r = await send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    });
    if (r.exceptionDetails)
      throw new Error(`Eval failed: ${r.exceptionDetails.text}`);
    return r.result?.value;
  };

  const navigate = async (url, settleMs = 2200) => {
    await send("Page.navigate", { url });
    await sleep(settleMs);
  };

  const waitFor = async (cond, timeoutMs = 20000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        if (await evaluate(`Boolean(${cond})`)) return true;
      } catch {
        /* mid-navigation; retry */
      }
      await sleep(300);
    }
    return false;
  };

  const setViewport = (width, height, scale = 1) =>
    send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: scale,
      mobile: false,
    });

  /**
   * Drop the metrics override entirely.
   *
   * `requestFullscreen()` does not resolve while device metrics are being
   * emulated, and the exam runner's start gate waits on it - so an emulated
   * viewport leaves the gate stuck on "Starting..." forever. A real candidate's
   * browser has no override, so clearing it is what reproduces their case.
   */
  const clearViewport = () => send("Emulation.clearDeviceMetricsOverride");

  /** Horizontal overflow: the page body must never scroll sideways. */
  const overflow = () =>
    evaluate(`(() => {
      const d = document.documentElement;
      const over = d.scrollWidth - d.clientWidth;
      let worst = null;
      if (over > 1) {
        for (const el of document.querySelectorAll('*')) {
          const r = el.getBoundingClientRect();
          if (r.right > d.clientWidth + 1 && r.width > 40) {
            worst = el.tagName + '.' + String(el.className).slice(0, 60) + ' right=' + Math.round(r.right);
            break;
          }
        }
      }
      return { over, worst };
    })()`);

  const typeInto = (selector, value) =>
    evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);

  const pressEnter = async () => {
    for (const type of ["keyDown", "char", "keyUp"]) {
      await send("Input.dispatchKeyEvent", {
        type,
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
        text: "\r",
        unmodifiedText: "\r",
      });
    }
  };

  /**
   * Click the control a human would click for this label.
   *
   * Two traps this avoids:
   *  - `textContent` is the source text, not what is on screen. A button styled
   *    `text-transform: uppercase` reads "START EXAM IN FULL SCREEN" but its
   *    textContent is "Start Exam in Full Screen", so a case-sensitive match
   *    silently finds nothing and the click is a no-op.
   *  - a plain `includes` makes "Correct" match "Incorrect" and click the wrong
   *    filter. Exact match wins, then a prefix match (which tolerates a "(3)"
   *    count suffix), and only then a contains match.
   */
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

  await runChecks(
    {
      evaluate,
      navigate,
      waitFor,
      setViewport,
      clearViewport,
      overflow,
      typeInto,
      pressEnter,
      clickText,
      consoleErrors,
      failedRequests,
    },
    { ...args, app: APP },
    record,
  );

  const failed = results.filter((r) => !r.pass);
  console.log(
    `\n${LABEL}: ${results.length - failed.length}/${results.length} passed`,
  );
  fs.writeFileSync(
    new URL(`./browser-${LABEL}-results.json`, import.meta.url),
    JSON.stringify(
      { browser: LABEL, total: results.length, failed: failed.length, results },
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

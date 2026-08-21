/**
 * UAT section 22 - the same browser suite as browser-matrix.mjs, run in
 * Firefox.
 *
 * Firefox speaks no CDP, so this driver goes through Playwright instead. To
 * keep `playwright-core` out of the product's dependency graph it is resolved
 * from wherever the operator installed it:
 *
 *   npm --prefix <scratch> install playwright-core
 *   PW_ROOT=<scratch>/node_modules FIREFOX_BIN=<path to firefox.exe> \
 *     node qa/uat/browser-firefox.mjs --app http://localhost:3010 ...
 *
 * The assertions themselves are imported from browser-checks.mjs, byte for
 * byte the ones Chrome and Edge ran - a cross-browser pass is only evidence if
 * every browser answered the same questions.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { runChecks, sleep } from "./browser-checks.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);
const LABEL = args.label ?? "firefox";
const APP = (args.app ?? "http://localhost:3010").replace(/\/$/, "");

const results = [];
const record = (uat, name, ok, detail = "") => {
  results.push({ browser: LABEL, uat, name, pass: ok, detail });
  console.log(
    `  [${ok ? "PASS" : "**FAIL**"}] ${uat} ${name}${detail ? " - " + detail : ""}`,
  );
};

async function loadPlaywright() {
  const root = process.env.PW_ROOT;
  if (!root)
    throw new Error("Set PW_ROOT to a node_modules holding playwright-core");
  const entry = path.join(root, "playwright-core", "index.js");
  if (!fs.existsSync(entry))
    throw new Error(`playwright-core not found at ${entry}`);
  return import(pathToFileURL(entry).href);
}

async function main() {
  const pw = await loadPlaywright();
  const firefox = pw.firefox ?? pw.default.firefox;
  const browser = await firefox.launch({
    headless: true,
    ...(process.env.FIREFOX_BIN
      ? { executablePath: process.env.FIREFOX_BIN }
      : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(`[exception] ${e.message}`));
  page.on("response", (r) => {
    // 401 on a pre-login probe is expected; only count real breakage.
    if (r.status() >= 400 && r.status() !== 401)
      failedRequests.push(`${r.status()} ${r.url()}`);
  });
  page.on("requestfailed", (r) => {
    const err = r.failure()?.errorText ?? "failed";
    if (!/ABORTED|NS_BINDING_ABORTED/i.test(err))
      failedRequests.push(`${err} ${r.url()}`);
  });

  /**
   * `page.evaluate` takes a function; the shared suite passes expression
   * strings (that is what CDP's Runtime.evaluate wants). Wrapping in an
   * indirect eval keeps the suite's expressions working unchanged, including
   * the ones that end in a promise.
   */
  const evaluate = (expression) =>
    page.evaluate((src) => Promise.resolve((0, eval)(src)), expression);

  const navigate = async (url, settleMs = 2200) => {
    await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
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

  /**
   * Firefox has no deviceScaleFactor override, so 125% zoom is applied the way
   * a user's zoom actually behaves: the CSS viewport shrinks. Same 1152x720
   * the Chromium drivers emulate.
   */
  const setViewport = (width, height) =>
    page.setViewportSize({ width, height });

  /**
   * No-op: Playwright's viewport is the real window size rather than an
   * emulation layer, so there is nothing to clear and fullscreen already
   * behaves as it would for a candidate.
   */
  const clearViewport = async () => {};

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

  const pressEnter = () => page.keyboard.press("Enter");

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
  await browser.close();
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exit(2);
});

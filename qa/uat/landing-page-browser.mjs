/**
 * The public landing page (`/`).
 *
 * Checks the three things that actually break on a page like this: an asset
 * that 404s (every image here is a file committed to the repo, and a typo in a
 * path renders as nothing), a control that goes nowhere, and a fixed-width
 * desktop artboard transcribed literally enough to scroll sideways on a phone.
 */
const CDP_HTTP = "http://127.0.0.1:9344";
const APP = "http://127.0.0.1:3110";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const record = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(
    `[${ok ? "PASS" : "**FAIL**"}] ${name}${detail ? " - " + detail : ""}`,
  );
};

const { webSocketDebuggerUrl } = await fetch(
  `${CDP_HTTP}/json/new?about:blank`,
  { method: "PUT" },
).then((r) => r.json());
const ws = new WebSocket(webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener("open", res);
  ws.addEventListener("error", rej);
});

let id = 0;
const pending = new Map();
const failedRequests = [];
const pageErrors = [];
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
  if (msg.method === "Network.requestWillBeSent") {
    requestUrl.set(msg.params.requestId, msg.params.request.url);
  } else if (msg.method === "Network.responseReceived") {
    const { status, url } = msg.params.response;
    if (status >= 400) failedRequests.push(`${status} ${url}`);
  } else if (msg.method === "Network.loadingFailed") {
    const url = requestUrl.get(msg.params.requestId) ?? "?";
    if (!msg.params.canceled)
      failedRequests.push(`${msg.params.errorText} ${url}`);
  } else if (msg.method === "Runtime.exceptionThrown") {
    pageErrors.push(
      msg.params.exceptionDetails.exception?.description ??
        msg.params.exceptionDetails.text,
    );
  }
});
const send = (m, p = {}) => {
  const i = ++id;
  return new Promise((resolve, reject) => {
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
};

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");

const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails)
    throw new Error(
      r.exceptionDetails.exception?.description ?? r.exceptionDetails.text,
    );
  return r.result.value;
};

async function waitFor(expression, label, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      if (await evaluate(expression)) return;
    } catch {
      /* mid-navigation */
    }
    if (Date.now() > deadline)
      throw new Error(`timed out waiting for ${label}`);
    await sleep(250);
  }
}

const viewport = async (width, height) =>
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 700,
  });

await viewport(1440, 960);
await send("Page.navigate", { url: APP + "/" });
await waitFor(
  `document.body?.innerText.includes('Start Your Journey')`,
  "the page to render",
);
// Let every lazy image settle before counting broken ones.
await evaluate(`window.scrollTo(0, document.body.scrollHeight); 'ok'`);
await sleep(2500);
await evaluate(`window.scrollTo(0, 0); 'ok'`);
await sleep(1200);

/* ---- every section is present ------------------------------------------ */
for (const [label, needle] of [
  ["hero", "Manage Exams, Students, and Results"],
  ["features", "Empowering Institutions with Advanced Examination"],
  ["ai insights", "AI-Powered Insights for Better Learning Outcomes"],
  ["integrations", "Works With Your Favorite Tools"],
  ["testimonial", "Trusted by"],
  ["closing cta", "Start Your Journey with CodonMind"],
  ["footer", "All rights reserved"],
]) {
  record(
    `${label} section renders`,
    (await evaluate(
      `document.body.innerText.includes(${JSON.stringify(needle)})`,
    )) === true,
  );
}

/* ---- no broken images -------------------------------------------------- */
const imgReport = await evaluate(`(() => {
  const imgs = [...document.querySelectorAll('img')];
  const broken = imgs.filter(i => i.complete && i.naturalWidth === 0)
    .map(i => i.getAttribute('src')?.slice(0, 70));
  return JSON.stringify({ total: imgs.length, broken });
})()`);
const { total, broken } = JSON.parse(imgReport);
record(
  "every image resolves",
  broken.length === 0,
  `${total} images, broken: ${JSON.stringify(broken)}`,
);
record(
  "no failed network requests",
  failedRequests.length === 0,
  failedRequests.slice(0, 3).join(" | "),
);
record(
  "no page exceptions",
  pageErrors.length === 0,
  pageErrors.slice(0, 2).join(" | "),
);

/* ---- the tokens actually resolved -------------------------------------- */
const heroBg = await evaluate(
  `getComputedStyle(document.querySelector('section')).backgroundColor`,
);
record("hero uses the site-ink token", heroBg === "rgb(10, 25, 47)", heroBg);
const displayFont = await evaluate(
  `getComputedStyle(document.querySelector('h1')).fontFamily`,
);
record(
  "headline uses the display face",
  /instrument/i.test(displayFont),
  displayFont.slice(0, 50),
);
const accent = await evaluate(`(() => {
  const el = [...document.querySelectorAll('span')]
    .find(s => s.textContent.trim() === 'PagerDuty');
  return el ? getComputedStyle(el).backgroundColor : 'missing';
})()`);
record(
  "accent badge uses the accent token",
  accent === "rgb(255, 107, 74)",
  accent,
);

/* ---- nothing that looks clickable is dead ------------------------------ */
const deadLinks = await evaluate(`(() => {
  const bad = [...document.querySelectorAll('a')]
    .filter(a => {
      const h = a.getAttribute('href');
      return !h || h === '#' || h === 'javascript:void(0)';
    })
    .map(a => a.textContent.trim().slice(0, 24));
  return JSON.stringify(bad);
})()`);
record("no dead links", deadLinks === "[]", deadLinks);
const deadButtons = await evaluate(
  `document.querySelectorAll('button:not([type=submit])').length`,
);
record(
  "no handler-less buttons",
  deadButtons === 0,
  `${deadButtons} button(s)`,
);

/* ---- Sign In goes to the product --------------------------------------- */
const signIn = await evaluate(`(() => {
  const a = [...document.querySelectorAll('a')]
    .find(x => x.textContent.trim() === 'Sign In');
  return a ? a.getAttribute('href') : 'missing';
})()`);
record("Sign In points at /login", signIn === "/login", signIn);

await evaluate(`(() => {
  [...document.querySelectorAll('a')]
    .find(x => x.textContent.trim() === 'Sign In').click();
  return 'ok';
})()`);
await waitFor(`location.pathname === '/login'`, "the login route");
record("Sign In navigates to the login screen", true, "/login");
record(
  "the login screen actually loaded",
  (await evaluate(`document.body.innerText.length > 40`)) === true,
);

/* ---- responsive: no sideways scroll ------------------------------------ */
for (const w of [1440, 1024, 768, 390]) {
  await viewport(w, 900);
  await send("Page.navigate", { url: APP + "/" });
  await waitFor(
    `document.body?.innerText.includes('Start Your Journey')`,
    `the page at ${w}px`,
  );
  await sleep(900);
  const overflow = await evaluate(
    `document.documentElement.scrollWidth - document.documentElement.clientWidth`,
  );
  record(
    `no horizontal overflow at ${w}px`,
    overflow <= 0,
    `${overflow}px over`,
  );
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
ws.close();
process.exit(failures === 0 ? 0 : 1);

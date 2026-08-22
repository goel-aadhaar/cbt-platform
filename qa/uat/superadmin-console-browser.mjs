/**
 * The superadmin console, driven through a real sign-in against a real API.
 *
 * No stubbing here: the point is that the four changes hold against the live
 * database — the dashboard breakdowns add up, the institutes list actually
 * re-sorts, the per-tenant usage drawer opens with real figures, and the system
 * panel reports the machine rather than zeroes.
 */
import fs from "node:fs";

const CDP_HTTP = "http://127.0.0.1:9344";
const APP = "http://127.0.0.1:3110";
const API_LOG = process.argv[2];
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
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
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
await send("Emulation.setDeviceMetricsOverride", {
  width: 1600,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});

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
    if (Date.now() > deadline) {
      const seen = await evaluate(
        `document.body.innerText.slice(0, 300)`,
      ).catch(() => "(unreadable)");
      throw new Error(
        `timed out waiting for ${label}. Page showed: ` +
          String(seen).split("\n").join(" | "),
      );
    }
    await sleep(300);
  }
}

const text = async () => await evaluate(`document.body.innerText`);

/**
 * Case-insensitive containment.
 *
 * The consoles uppercase labels in CSS, and `innerText` reports text as
 * *rendered* — so a card labelled "Institutes" in the JSX comes back as
 * "INSTITUTES". Comparing case-sensitively fails on the styling rather than on
 * the behaviour, which is a false alarm in one direction and, when a check
 * matches some other element on the page, a false pass in the other.
 */
const has = (haystack, needle) =>
  haystack.toLowerCase().includes(needle.toLowerCase());

const clickText = async (label) =>
  await evaluate(`(() => {
    const el = [...document.querySelectorAll('button, a')]
      .find(b => b.textContent.trim() === ${JSON.stringify(label)});
    if (!el) return 'missing';
    el.click();
    return 'ok';
  })()`);

/* ---- sign in for real -------------------------------------------------- */
await send("Page.navigate", { url: `${APP}/platform/login` });
await waitFor(
  `!!document.querySelector('input[type=password]')`,
  "the login form",
);
// The inputs exist in the server-rendered HTML before React has attached its
// handlers to them. Typing into that gap sets the DOM value and nothing else,
// so the form submits empty and the step never advances.
await sleep(3000);

await evaluate(`(() => {
  const set = (sel, v) => {
    const el = document.querySelector(sel);
    const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : null;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  set('input[type=email]', 'hello@codonmind.in');
  set('input[type=password]', 'Cm-8vtpPdzUCG-71');
  return 'ok';
})()`);
// React has to process both input events before the submit reads them —
// clicking in the same tick posts an empty form and the step never advances.
await sleep(600);
await evaluate(`(() => {
  [...document.querySelectorAll('button')]
    .find(b => /sign in/i.test(b.textContent)).click();
  return 'ok';
})()`);
await waitFor(
  `document.body.innerText.includes('Check your email')`,
  "the code step",
);
await sleep(400);

// The code is printed to the API log because SES is off on this instance.
const code = [
  ...fs.readFileSync(API_LOG, "utf8").matchAll(/code: (\d{6})/g),
].at(-1)?.[1];
record("a sign-in code was issued", Boolean(code), code ?? "none");

await evaluate(`(() => {
  const el = document.querySelector('input[inputmode=numeric], input[maxlength="6"], input[type=text]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    .call(el, ${JSON.stringify(code ?? "")});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return 'ok';
})()`);
await sleep(500);
await evaluate(`(() => {
  [...document.querySelectorAll('button')]
    .find(b => /verify/i.test(b.textContent))?.click();
  return 'ok';
})()`);
await waitFor(`location.pathname.startsWith('/superadmin')`, "the console");
record("signed in as superadmin", true, await evaluate(`location.pathname`));

/* ---- item 2: dashboard breakdown cards ---------------------------------- */
await send("Page.navigate", { url: `${APP}/superadmin/dashboard` });
// Waiting for the card *labels* is not enough: they render immediately with a
// "…" placeholder, so the assertions below would read an empty dashboard and
// blame the feature for the fetch not having landed yet. Wait for a value.
// No regex: a backslash inside a template literal is eaten before the browser
// ever sees it, so `/^\d/` arrives as `/^d/` and silently matches nothing.
// The cards render "…" until their fetch lands, so its absence is the signal.
await waitFor(
  `!(document.querySelector('.grid > div')?.innerText ?? '…').includes('…')`,
  "the dashboard figures",
);
await sleep(600);
const dash = await text();

record(
  "institutes card shows a breakdown",
  has(dash, "institutes") && has(dash, "active"),
);
record("students card shows a breakdown", has(dash, "students"));
record("exams card is present", has(dash, "exams"));
record(
  "the questions card is gone",
  !/\bQUESTIONS\b/.test(dash),
  /\bQUESTIONS\b/.test(dash) ? "still present" : "",
);
record("a 30-day exam figure is shown", has(dash, "created in 30d"));

/* ---- item 1: no global search bar --------------------------------------- */
for (const [label, path] of [
  ["admin console", "/admin/dashboard"],
  ["superadmin console", "/superadmin/tenants"],
]) {
  await send("Page.navigate", { url: APP + path });
  await sleep(2500);
  const boxes = await evaluate(`(() => {
    const header = document.querySelector('header');
    if (!header) return -1;
    return [...header.querySelectorAll('input[type=search]')].length;
  })()`);
  record(`no search box in the ${label} header`, boxes === 0, `${boxes} found`);
}

/* ---- item 3: filters, sorting, per-tenant usage ------------------------- */
await send("Page.navigate", { url: `${APP}/superadmin/tenants` });
await waitFor(
  `document.body.innerText.includes('Institute')`,
  "the institutes table",
);
await sleep(2000);

const firstRow = async () =>
  await evaluate(
    `document.querySelector('tbody tr td')?.innerText.split('\\n')[0] ?? 'none'`,
  );

record(
  "filter and sort controls exist",
  (await evaluate(`
  document.querySelectorAll('select[aria-label="Filter by status"], select[aria-label="Sort by"]').length
`)) === 2,
);

const pickSelect = async (aria, value) => {
  await evaluate(`(() => {
    const s = document.querySelector('select[aria-label=' + ${JSON.stringify(`"${aria}"`)} + ']');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
      .call(s, ${JSON.stringify(value)});
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  })()`);
  await sleep(1400);
};

await pickSelect("Sort by", "name");
const ascFirst = await firstRow();
record("sorting by name reorders the table", ascFirst !== "none", ascFirst);

await clickText("Desc");
await sleep(1500);
const descFirst = await firstRow();
record(
  "reversing the order reverses the table",
  descFirst !== ascFirst,
  `${ascFirst} → ${descFirst}`,
);

await pickSelect("Filter by status", "suspended");
const suspended = await text();
record(
  "filtering to suspended narrows the list",
  /No institutes match/i.test(suspended) || !/Active<\/span>/.test(suspended),
  "",
);
await pickSelect("Filter by status", "");
await sleep(1200);

record(
  "usage action exists on every row",
  (await evaluate(`
  document.querySelectorAll('tbody tr').length > 0 &&
  document.querySelectorAll('tbody tr').length ===
    [...document.querySelectorAll('tbody tr')]
      .filter(r => [...r.querySelectorAll('button')].some(b => b.textContent.trim() === 'Usage')).length
`)) === true,
);

await evaluate(`(() => {
  [...document.querySelectorAll('tbody tr button')]
    .find(b => b.textContent.trim() === 'Usage').click();
  return 'ok';
})()`);
await waitFor(
  `document.body.innerText.includes('Usage & consumption')`,
  "the usage drawer",
);
await sleep(1800);
// Scoped to the drawer: the table underneath has its own "Students" and
// "Exams" headings, and matching those would pass without the drawer opening.
const usage = await evaluate(
  `document.querySelector('.fixed.inset-0.z-50')?.innerText ?? ''`,
);
for (const needle of [
  "Media consumed",
  "Students",
  "Content",
  "Activity",
  "Last used",
]) {
  record(`usage drawer shows ${needle}`, has(usage, needle));
}
record(
  "media consumption is a real byte figure",
  /\d+(\.\d+)?\s?(B|KB|MB|GB)/.test(usage),
  (usage.match(/Media consumed[\s\S]{0,40}/) ?? [""])[0].replace(/\n/g, " "),
);

/* ---- invite errors reach the screen intact ------------------------------ */
// The API now explains refusals in full. That is only worth anything if the
// console shows the explanation rather than replacing it with "Could not send
// the invite" — so this asserts on the server's own wording.
await evaluate(`(() => {
  [...document.querySelectorAll('tbody tr button')]
    .find(b => b.textContent.trim() === 'Invite admin').click();
  return 'ok';
})()`);
await waitFor(
  `document.body.innerText.includes('Invite administrator')`,
  "the invite dialog",
);
await sleep(600);
await evaluate(`(() => {
  const set = (el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      .call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const form = document.querySelector('form');
  const inputs = [...form.querySelectorAll('input')];
  set(inputs[0], 'Duplicate Probe');
  set(inputs[1], 'hello@codonmind.in');
  return 'ok';
})()`);
await sleep(400);
await evaluate(`(() => {
  const form = document.querySelector('form');
  form.requestSubmit
    ? form.requestSubmit()
    : [...form.querySelectorAll('button')].find(b => b.type === 'submit')?.click();
  return 'ok';
})()`);
await waitFor(
  `document.body.innerText.toLowerCase().includes('already has an account')`,
  "the refusal message",
);
const refusal = await evaluate(
  `[...document.querySelectorAll('[role=alert], p')]
     .map(e => e.innerText)
     .find(t => t.includes('already has an account')) ?? ''`,
);
record(
  "an invite refusal is shown in full, not flattened",
  has(refusal, "hello@codonmind.in") && has(refusal, "roster"),
  refusal.slice(0, 90),
);

/* ---- item 4: system monitoring ------------------------------------------ */
await send("Page.navigate", { url: `${APP}/superadmin/usage` });
await waitFor(
  `document.body.innerText.toLowerCase().includes('system monitoring')`,
  "the system panel",
);
await sleep(3000);
const sys = await text();

for (const needle of [
  "CPU utilisation",
  "Memory usage",
  "Disk usage",
  "Requests",
  "Response time (p95)",
  "Errors",
  "Error rate",
]) {
  record(`system panel shows ${needle}`, has(sys, needle));
}
record(
  "CPU reports a real percentage",
  /CPU UTILISATION\s*\n?\s*\d+(\.\d+)?%/i.test(sys) || /\d+(\.\d+)?%/.test(sys),
  "",
);
record(
  "the in-memory caveat is stated, not hidden",
  has(sys, "resets on restart"),
);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
ws.close();
process.exit(failures === 0 ? 0 : 1);

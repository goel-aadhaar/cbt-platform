/**
 * Student top bar: the settings menu, the bell, and the context chips.
 * Dependency-free CDP, same shape as qa/uat/browser-matrix.mjs.
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
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
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
// The chips are `hidden md:flex`. At the default headless width they are not
// in the DOM's rendered text at all, so an assertion about them passes on a
// build that still hardcodes them. Force a desktop viewport first.
await send("Emulation.setDeviceMetricsOverride", {
  width: 1400,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});

const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};

const goto = async (path) => {
  await send("Page.navigate", { url: APP + path });
  await sleep(2500);
};

// A session the shell can read. The token is not valid at the API — that is
// deliberate: the chips must fail closed rather than render something invented,
// and the menu must work regardless.
await goto("/student/profile");
await evaluate(`
  localStorage.setItem('drsk.accessToken', 'not-a-real-token');
  localStorage.setItem('drsk.user', JSON.stringify({
    id: 'u1', name: 'Test Candidate', email: 't@example.com',
    role: 'STUDENT', roles: ['STUDENT'], instituteId: 'i1'
  }));
  'ok'
`);
await goto("/student/profile");

// ---- the bell -------------------------------------------------------------
record(
  "bell links to updates",
  (await evaluate(
    `!!document.querySelector('a[aria-label="Updates and announcements"][href="/student/updates"]')`,
  )) === true,
);
record(
  "no invented unread badge",
  (await evaluate(
    `!document.querySelector('header span[class*="ba1a1a"]')`,
  )) === true,
);

// ---- the chips ------------------------------------------------------------
// Tailwind's `md:flex` needs a backslash-escaped colon in a CSS selector, and a
// template literal eats the backslash. Find the row by className instead.
const chipRowDisplay = await evaluate(
  `(() => {
     const row = [...document.querySelectorAll('header div')]
       .find(d => typeof d.className === 'string' && d.className.includes('md:flex'));
     return row ? getComputedStyle(row).display : 'missing';
   })()`,
);
const header = await evaluate(`document.querySelector('header').innerText`);
record(
  "chip row is visible at desktop width (guards the next assertion)",
  chipRowDisplay === "flex",
  chipRowDisplay,
);
record(
  "no hardcoded NEET / Class 12 / Batch A",
  !/NEET|Batch A/.test(header),
  JSON.stringify(header.replace(/\s+/g, " ").slice(0, 70)),
);

// ---- the settings menu ----------------------------------------------------
record(
  "settings button is a real control",
  (await evaluate(
    `!!document.querySelector('button[aria-label="Settings"][aria-haspopup="menu"]')`,
  )) === true,
);
record(
  "menu starts closed",
  (await evaluate(
    `document.querySelector('button[aria-label="Settings"]').getAttribute('aria-expanded')`,
  )) === "false",
);

await evaluate(
  `document.querySelector('button[aria-label="Settings"]').click(); 'ok'`,
);
await sleep(400);

record(
  "menu opens",
  (await evaluate(
    `document.querySelector('button[aria-label="Settings"]').getAttribute('aria-expanded')`,
  )) === "true",
);

const items = await evaluate(
  `JSON.stringify([...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map(a => [a.textContent, a.getAttribute('href')]))`,
);
record(
  "menu offers exactly Profile and Help & Support",
  items ===
    JSON.stringify([
      ["Profile", "/student/profile"],
      ["Help & Support", "/student/help"],
    ]),
  items,
);

// Escape closes and hands focus back to the button.
await send("Input.dispatchKeyEvent", {
  type: "keyDown",
  key: "Escape",
  code: "Escape",
  windowsVirtualKeyCode: 27,
});
await sleep(300);
record(
  "escape closes it",
  (await evaluate(
    `document.querySelector('button[aria-label="Settings"]').getAttribute('aria-expanded')`,
  )) === "false",
);
record(
  "escape returns focus to the button",
  (await evaluate(`document.activeElement?.getAttribute('aria-label')`)) ===
    "Settings",
);

// ---- it actually navigates ------------------------------------------------
await evaluate(
  `document.querySelector('button[aria-label="Settings"]').click(); 'ok'`,
);
await sleep(400);
await evaluate(
  `[...document.querySelectorAll('[role="menuitem"]')].find(a => a.textContent === 'Help & Support').click(); 'ok'`,
);
await sleep(2000);
record(
  "Help & Support navigates",
  (await evaluate(`location.pathname`)) === "/student/help",
  await evaluate(`location.pathname`),
);
record(
  "menu closed after navigating",
  (await evaluate(
    `document.querySelector('button[aria-label="Settings"]').getAttribute('aria-expanded')`,
  )) === "false",
);

await evaluate(
  `document.querySelector('button[aria-label="Settings"]').click(); 'ok'`,
);
await sleep(400);
await evaluate(
  `[...document.querySelectorAll('[role="menuitem"]')].find(a => a.textContent === 'Profile').click(); 'ok'`,
);
await sleep(2000);
record(
  "Profile navigates",
  (await evaluate(`location.pathname`)) === "/student/profile",
  await evaluate(`location.pathname`),
);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
ws.close();
process.exit(failures === 0 ? 0 : 1);

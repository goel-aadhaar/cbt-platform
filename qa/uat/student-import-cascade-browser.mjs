/**
 * Bulk-import students: the programme -> class -> batch cascade.
 *
 * The academic endpoints are stubbed in the page, so this exercises the
 * component's own logic — narrowing, request scoping, and invalidation — not
 * the server's. Everything else on the page is left to fail as it normally
 * would without a real session; the modal does not depend on it.
 *
 * The fixtures are chosen to be hostile in the way real data is: two different
 * programmes each own a class called "Class 12", and each of those owns a batch
 * called "23b1". A flat list could not tell them apart, which is the whole
 * reason the cascade exists.
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
await send("Emulation.setDeviceMetricsOverride", {
  width: 1500,
  height: 950,
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

// Installed on every document, before any app code runs, so the modal's very
// first request is already stubbed.
const STUB = `
(() => {
  window.__calls = [];
  const P = [
    { id: 'p-neet', name: 'NEET', isActive: true },
    { id: 'p-jee',  name: 'Jee',  isActive: true },
  ];
  const C = {
    'p-neet': [{ id: 'c-n12', name: 'Class 12', programId: 'p-neet', isActive: true }],
    'p-jee':  [{ id: 'c-j12', name: 'Class 12', programId: 'p-jee',  isActive: true },
               { id: 'c-j11', name: 'Class 11', programId: 'p-jee',  isActive: true }],
  };
  const B = {
    'c-n12': [{ id: 'b-n-23b1', name: '23b1', classId: 'c-n12', isActive: true }],
    'c-j12': [{ id: 'b-j-23b1', name: '23b1', classId: 'c-j12', isActive: true },
              { id: 'b-j-24a',  name: '24a',  classId: 'c-j12', isActive: true }],
    'c-j11': [],
  };
  const json = (v) => new Response(JSON.stringify(v), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
  const real = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    window.__calls.push(String(url));
    const u = new URL(url, location.origin);
    if (u.pathname.endsWith('/programs')) return Promise.resolve(json(P));
    if (u.pathname.endsWith('/classes'))
      return Promise.resolve(json(C[u.searchParams.get('programId')] ?? []));
    if (u.pathname.endsWith('/batches'))
      return Promise.resolve(json(B[u.searchParams.get('classId')] ?? []));
    // Anything else the screen loads is answered here rather than being let
    // through to a real API. An unstubbed call 401s, the page redirects to the
    // login screen, and the component under test vanishes mid-assertion —
    // which is what made this suite flaky.
    //
    // Identity is answered with an actual user: handing back an empty list
    // where a user is expected reads as "not signed in" and redirects just the
    // same, which is a slower way to make the same mistake.
    if (u.pathname.includes('/auth/me'))
      return Promise.resolve(json({
        id: 'a1', name: 'Test Admin', email: 'a@example.com', role: 'ADMIN',
        roles: ['ADMIN'], instituteId: 'i1', status: 'ACTIVE',
        phone: null, createdAt: new Date().toISOString(),
        institute: { name: 'Test', slug: 'test' }, student: null,
      }));
    // The roster carries tallies the page reads directly, so an empty page of
    // it is not simply { items: [] } — omitting them throws and the screen
    // becomes an error boundary.
    if (u.pathname.endsWith('/students'))
      return Promise.resolve(json({
        items: [], total: 0,
        counts: { all: 0, active: 0, disabled: 0, pending: 0 },
      }));
    // An array is the right default for everything else here: most list
    // endpoints return one, and code that maps over it survives.
    if (u.pathname.includes('/api/')) return Promise.resolve(json([]));
    return real(input, init);
  };
  localStorage.setItem('drsk.accessToken', 'stub-token');
  localStorage.setItem('drsk.user', JSON.stringify({
    id: 'a1', name: 'Test Admin', email: 'a@example.com',
    role: 'ADMIN', roles: ['ADMIN'], instituteId: 'i1'
  }));
})();
`;
await send("Page.addScriptToEvaluateOnNewDocument", { source: STUB });

await send("Page.navigate", { url: APP + "/admin/students?import=1" });

/**
 * Poll rather than sleep. A fixed wait is a coin toss against Next's
 * first-request compile on a freshly started server: the suite failed
 * intermittently on nothing but a cold cache, which is the worst kind of red.
 */
async function waitFor(expression, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      if (await evaluate(expression)) return;
    } catch {
      // The document can be mid-navigation; try again.
    }
    if (Date.now() > deadline)
      throw new Error(`timed out waiting for ${label}`);
    await sleep(250);
  }
}

await waitFor(
  `[...document.querySelectorAll('label')].some(l => l.textContent.startsWith('Programme'))`,
  "the import modal to render",
);
await sleep(500);

const sel = (label) =>
  `[...document.querySelectorAll('label')].find(l => l.textContent.startsWith(${JSON.stringify(label)}))?.querySelector('select')`;

const state = async (label) =>
  await evaluate(`(() => {
    const s = ${sel(label)};
    if (!s) return 'missing';
    return JSON.stringify({
      disabled: s.disabled,
      value: s.value,
      placeholder: s.options[0]?.textContent,
      options: [...s.options].slice(1).map(o => o.textContent),
    });
  })()`);

const pick = async (label, value) => {
  await evaluate(`(() => {
    const s = ${sel(label)};
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype, 'value').set;
    setter.call(s, ${JSON.stringify(value)});
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  })()`);
  await sleep(600);
};

// ---- all three fields exist ------------------------------------------------
for (const label of ["Programme", "Class", "Batch"]) {
  record(`${label} field exists`, (await state(label)) !== "missing");
}

// ---- children start locked -------------------------------------------------
const p0 = JSON.parse(await state("Programme"));
record(
  "programmes load",
  p0.options.join(",") === "NEET,Jee",
  p0.options.join(","),
);
record("programme is not disabled", p0.disabled === false);

const c0 = JSON.parse(await state("Class"));
record("class locked until a programme is chosen", c0.disabled === true);
record(
  "class says why it is locked",
  c0.placeholder === "Choose a programme first",
  c0.placeholder,
);

const b0 = JSON.parse(await state("Batch"));
record("batch locked until a class is chosen", b0.disabled === true);
record(
  "batch says why it is locked",
  b0.placeholder === "Choose a class first",
  b0.placeholder,
);

// ---- choosing a programme scopes the class request -------------------------
await pick("Programme", "p-jee");
const c1 = JSON.parse(await state("Class"));
record("class unlocks", c1.disabled === false);
record(
  "classes are scoped to the chosen programme",
  c1.options.join(",") === "Class 12,Class 11",
  c1.options.join(","),
);
record(
  "class request carried the programme id",
  (await evaluate(
    `window.__calls.some(u => typeof u === 'string' && u.includes('/classes?programId=p-jee'))`,
  )) === true,
);

// ---- choosing a class scopes the batch request -----------------------------
await pick("Class", "c-j12");
const b1 = JSON.parse(await state("Batch"));
record("batch unlocks", b1.disabled === false);
record(
  "batches are scoped to the chosen class",
  b1.options.join(",") === "23b1,24a",
  b1.options.join(","),
);
record(
  "batch request carried the class id",
  (await evaluate(
    `window.__calls.some(u => typeof u === 'string' && u.includes('/batches?classId=c-j12'))`,
  )) === true,
);

// ---- the submit gate -------------------------------------------------------
const gate = async () =>
  await evaluate(
    `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Import students')?.disabled`,
  );
record("import blocked with no batch and no file", (await gate()) === true);

await pick("Batch", "b-j-23b1");
record("batch selected", JSON.parse(await state("Batch")).value === "b-j-23b1");
record("import still blocked without a file", (await gate()) === true);

// ---- changing the programme invalidates everything under it ----------------
await pick("Programme", "p-neet");
const c2 = JSON.parse(await state("Class"));
const b2 = JSON.parse(await state("Batch"));
record("changing programme clears the class", c2.value === "", c2.value);
record(
  "changing programme clears the batch id",
  b2.value === "",
  b2.value || "(empty)",
);
record("batch re-locks", b2.disabled === true);
record(
  "classes reload for the new programme",
  c2.options.join(",") === "Class 12",
  c2.options.join(","),
);

// ---- an empty level says so ------------------------------------------------
await pick("Programme", "p-jee");
await pick("Class", "c-j11");
const b3 = JSON.parse(await state("Batch"));
record(
  "an empty class says there are no batches",
  b3.placeholder === "No batches in this class",
  b3.placeholder,
);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
ws.close();
process.exit(failures === 0 ? 0 : 1);

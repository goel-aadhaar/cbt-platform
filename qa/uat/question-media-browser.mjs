/**
 * Question media: an image belongs to one question, not to every question.
 *
 * The reported symptom was that a diagram uploaded for one question showed up
 * on all the others. The database was never wrong — the editor opened straight
 * onto the institute's shared library, so every image ever uploaded appeared
 * under every question, and the distinction between "attached here" and
 * "available to attach" was a ring and a tick.
 *
 * These checks pin the behaviour that fixes it: a question with no image shows
 * no image, the library is something you open on purpose, and attaching and
 * removing only ever touches the question in front of you.
 *
 * The media endpoints are stubbed, so this exercises the component rather than
 * the server.
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
const pageErrors = [];
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.method === "Runtime.exceptionThrown") {
    pageErrors.push(
      msg.params.exceptionDetails.exception?.description ??
        msg.params.exceptionDetails.text,
    );
  }
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
  width: 1500,
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

// A 1x1 PNG, so <AuthedImage> resolves to a real object URL rather than its
// "Image unavailable" state.
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const STUB = `
(() => {
  const LIB = [
    { id: 'm1', key: 'inst/one.png', url: '/media/file/inst%2Fone.png',
      fileName: 'diagram-one.png', size: 1024, altText: null },
    { id: 'm2', key: 'inst/two.png', url: '/media/file/inst%2Ftwo.png',
      fileName: 'diagram-two.png', size: 2048, altText: null },
  ];
  const json = (v) => new Response(JSON.stringify(v), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
  const png = () => {
    const bin = atob(${JSON.stringify(PNG)});
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new Response(bytes, { status: 200, headers: { 'content-type': 'image/png' } });
  };
  const real = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = String(typeof input === 'string' ? input : input.url);
    const u = new URL(url, location.origin);
    if (u.pathname.includes('/media/file/')) return Promise.resolve(png());
    if (u.pathname.endsWith('/media')) return Promise.resolve(json({ items: LIB, storage: 's3' }));
    if (u.pathname.endsWith('/subjects')) return Promise.resolve(json([]));
    if (u.pathname.endsWith('/exam-categories')) return Promise.resolve(json({ items: [] }));
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
  localStorage.setItem('drsk.accessToken', 'stub');
  localStorage.setItem('drsk.user', JSON.stringify({
    id: 'a1', name: 'A', email: 'a@b.c', role: 'ADMIN', roles: ['ADMIN'], instituteId: 'i1'
  }));
})();`;
await send("Page.addScriptToEvaluateOnNewDocument", { source: STUB });
await send("Page.navigate", { url: APP + "/admin/questions" });

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
  `!!document.body && document.body.innerText.includes('Add Question')`,
  "the page to render",
);
await sleep(500);

const clickText = async (text) =>
  await evaluate(`(() => {
    const el = [...document.querySelectorAll('button')]
      .find(b => b.textContent.trim() === ${JSON.stringify(text)});
    if (!el) return 'missing';
    el.click();
    return 'ok';
  })()`);

// Count thumbnails inside the media section only, so the page's own imagery
// (avatars, icons) cannot be mistaken for an attached diagram.
// Scoped to the picker's own region, so the page's other imagery (avatars,
// icons) cannot be mistaken for an attached diagram — and so the lookup
// survives the section re-rendering as the library opens and closes.
const mediaScope = `document.querySelector('[role="group"][aria-label="Images and diagrams"]')`;
const thumbs = async () =>
  await evaluate(
    `(() => { const r = ${mediaScope}; return r ? r.querySelectorAll('img').length : -1; })()`,
  );
const headline = async () =>
  await evaluate(
    `(() => { const r = ${mediaScope};
       return r ? r.textContent.replace(/\\s+/g, ' ').slice(0, 60) : 'missing'; })()`,
  );

record(
  "opened the question editor",
  (await clickText("Add Question")) === "ok",
);
await sleep(1500);

record("media section is present", (await thumbs()) !== -1, await headline());
record(
  "a new question starts with no image",
  (await headline()).includes("No image on this question"),
  await headline(),
);
record(
  "the shared library is not shown unprompted",
  (await thumbs()) === 0,
  `${await thumbs()} thumbnail(s)`,
);

// The library is opt-in.
record(
  "library opens on request",
  (await clickText("Choose from library")) === "ok",
);
await sleep(1200);
record(
  "library shows every image once opened",
  (await thumbs()) === 2,
  `${await thumbs()} thumbnail(s)`,
);

// Attaching touches only this question.
await evaluate(`(() => {
  const r = ${mediaScope};
  const btn = [...r.querySelectorAll('button[aria-pressed]')][0];
  btn.click();
  return 'ok';
})()`);
await sleep(800);
record(
  "attaching one image says one is attached",
  (await headline()).includes("1 attached"),
  await headline(),
);

record("library closes again", (await clickText("Hide library")) === "ok");
await sleep(800);
record(
  "only the attached image remains on screen",
  (await thumbs()) === 1,
  `${await thumbs()} thumbnail(s)`,
);

// And removing it takes the question back to having none.
await evaluate(`(() => {
  const r = ${mediaScope};
  const x = [...r.querySelectorAll('button')]
    .find(b => (b.getAttribute('aria-label') ?? '').startsWith('Remove '));
  if (!x) return 'missing';
  x.click();
  return 'ok';
})()`);
await sleep(800);
record(
  "removing it leaves the question with no image",
  (await headline()).includes("No image on this question"),
  await headline(),
);
record("and nothing is shown", (await thumbs()) === 0, `${await thumbs()}`);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
ws.close();
process.exit(failures === 0 ? 0 : 1);

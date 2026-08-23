/**
 * The exam calendar and live monitoring.
 *
 * Both were reported as not showing anything. Neither was broken in the sense
 * of throwing — the calendar marked exam days with a six-pixel dot and opened
 * on the current month regardless of where the exams were, and monitoring built
 * its roster and incident feed only from exams that were *currently* live, so
 * the moment a paper finished both emptied. These checks pin the fixes.
 *
 * The API is stubbed: what changed is the screens' own logic, and stubbing lets
 * the fixtures be deliberately awkward — an exam in a month that is not this
 * one, and a concluded exam carrying violations.
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
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  }
});
const send = (me, pa = {}) => {
  const i = ++id;
  return new Promise((resolve, reject) => {
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method: me, params: pa }));
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
const ev = async (x) => {
  const r = await send("Runtime.evaluate", {
    expression: x,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails)
    throw new Error(
      r.exceptionDetails.exception?.description ?? r.exceptionDetails.text,
    );
  return r.result.value;
};
async function waitFor(x, label, ms = 40000) {
  const end = Date.now() + ms;
  for (;;) {
    try {
      if (await ev(x)) return;
    } catch {
      /* navigating */
    }
    if (Date.now() > end) {
      const seen = await ev("document.body.innerText.slice(0,700)").catch(
        () => "?",
      );
      throw new Error(
        `timed out waiting for ${label}. Saw: ` +
          String(seen).split("\n").join(" | "),
      );
    }
    await sleep(300);
  }
}
const has = (h, n) => h.toLowerCase().includes(n.toLowerCase());

/* Fixtures: one concluded exam with violations, one scheduled two months out
   (so "opens on the current month" would show an empty grid), one unscheduled. */
const STUB = `
(() => {
  const now = Date.now();
  const hoursAgo = (h) => new Date(now - h * 3600e3).toISOString();
  const monthsOn = (m) => {
    const d = new Date(); d.setMonth(d.getMonth() + m, 12); d.setHours(10, 0, 0, 0);
    return d.toISOString();
  };
  const exam = (over) => ({
    id: 'e-' + Math.random().toString(36).slice(2, 8),
    title: 'Untitled', durationMinutes: 60, status: 'PUBLISHED',
    resultPolicy: 'IMMEDIATE', programId: null,
    startAt: null, endAt: null, createdAt: hoursAgo(200),
    submittedAt: null, approvedAt: null, rejectionReason: null,
    createdBy: null, reviewer: null, approvedBy: null,
    _count: { sections: 1, questions: 3, batches: 2 },
    ...over,
  });
  const CONCLUDED = exam({
    id: 'e-done', title: 'JEE MOCK - Concluded',
    startAt: hoursAgo(5), endAt: hoursAgo(4),
  });
  const FUTURE = exam({
    id: 'e-future', title: 'NEET Grand Test', startAt: monthsOn(2),
    endAt: monthsOn(2),
  });
  const UNSCHEDULED = exam({ id: 'e-none', title: 'Chemistry Unit Test' });
  const EXAMS = [CONCLUDED, FUTURE, UNSCHEDULED];

  const MONITOR = {
    examId: 'e-done', title: 'JEE MOCK - Concluded', examStatus: 'PUBLISHED',
    window: { startAt: CONCLUDED.startAt, endAt: CONCLUDED.endAt },
    totalStudents: 2,
    counts: { notStarted: 0, inProgress: 0, submitted: 2, autoSubmitted: 0 },
    students: [
      { studentId: 's1', rollNumber: '2601000001', name: 'Asha Rao',
        batch: { id: 'b1', name: '23b1' }, totalQuestions: 3, status: 'SUBMITTED',
        startedAt: hoursAgo(5), submittedAt: hoursAgo(4), remainingSeconds: null,
        timeUp: false, answered: 3, violations: 2, flagged: true,
        lastActivityAt: hoursAgo(4) },
      { studentId: 's2', rollNumber: '2601000002', name: 'Vikram Iyer',
        batch: { id: 'b1', name: '23b1' }, totalQuestions: 3, status: 'SUBMITTED',
        startedAt: hoursAgo(5), submittedAt: hoursAgo(4), remainingSeconds: null,
        timeUp: false, answered: 2, violations: 0, flagged: false,
        lastActivityAt: hoursAgo(4) },
    ],
  };

  const json = (v) => new Response(JSON.stringify(v), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
  const real = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = String(typeof input === 'string' ? input : input.url);
    const u = new URL(url, location.origin);
    if (/\\/exams\\/[^/]+\\/monitor$/.test(u.pathname)) return Promise.resolve(json(MONITOR));
    if (u.pathname.endsWith('/exams')) return Promise.resolve(json(EXAMS));
    if (u.pathname.includes('/auth/me'))
      return Promise.resolve(json({ id: 'a1', name: 'Test Admin',
        email: 'a@example.com', role: 'ADMIN', roles: ['ADMIN'],
        instituteId: 'i1', status: 'ACTIVE', phone: null,
        createdAt: new Date().toISOString(),
        institute: { name: 'Test', slug: 'test' }, student: null }));
    if (u.pathname.endsWith('/students'))
      return Promise.resolve(json({ items: [], total: 0,
        counts: { all: 0, active: 0, disabled: 0, pending: 0 } }));
    if (u.pathname.includes('/api/')) return Promise.resolve(json([]));
    return real(input, init);
  };
  localStorage.setItem('drsk.accessToken', 'stub');
  localStorage.setItem('drsk.user', JSON.stringify({ id: 'a1', name: 'A',
    email: 'a@b.c', role: 'ADMIN', roles: ['ADMIN'], instituteId: 'i1' }));
})();`;
await send("Page.addScriptToEvaluateOnNewDocument", { source: STUB });

/* ---- item 5: the calendar ---------------------------------------------- */
await send("Page.navigate", { url: `${APP}/admin/exams` });
await waitFor(
  `document.body.innerText.toLowerCase().includes('exam calendar')`,
  "the exams page",
);
await sleep(1500);
const clicked = await ev(
  `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Exam Calendar'); if (!b) return 'missing'; b.click(); return 'ok'; })()`,
);
record("the calendar opens", clicked === "ok", clicked);
await waitFor(
  `document.body.innerText.toLowerCase().includes('legend')`,
  "the calendar",
);
await sleep(1000);

const calText = await ev("document.body.innerText");
record(
  "exam titles are on the grid, not just dots",
  has(calText, "JEE MOCK - Concluded"),
);
record(
  "days holding exams are tinted",
  (await ev(
    `document.querySelectorAll('[class*="bg-admin-mint/25"]').length`,
  )) > 0,
);
record(
  "a day cell announces how many exams it holds",
  (await ev(
    `[...document.querySelectorAll('button[aria-label]')].some(b => /\\d+ exam/.test(b.getAttribute('aria-label')))`,
  )) === true,
);
record("a legend explains the colours", has(calText, "Legend"));
record(
  "exams with no date are listed rather than dropped",
  has(calText, "Not scheduled yet") && has(calText, "Chemistry Unit Test"),
);

// The month it opens on: an exam two months out must not leave an empty grid.
await ev(
  `[...document.querySelectorAll('button[aria-label="Next month"]')][0]?.click()`,
);
await sleep(400);
await ev(
  `[...document.querySelectorAll('button[aria-label="Next month"]')][0]?.click()`,
);
await sleep(600);
record(
  "paging forward reaches the future exam",
  has(await ev("document.body.innerText"), "NEET Grand Test"),
);

/* ---- item 8: monitoring ------------------------------------------------- */
await send("Page.navigate", { url: `${APP}/admin/monitoring` });
await waitFor(
  `document.body.innerText.toLowerCase().includes('incident feed')`,
  "the monitoring page",
);
await sleep(3000);
const monText = await ev("document.body.innerText");

record("the concluded exam is listed", has(monText, "JEE MOCK - Concluded"));
record(
  "its incidents appear in the feed",
  has(monText, "Asha Rao"),
  "a violation on a finished exam used to vanish with the window",
);
record(
  "a clean candidate is not reported as an incident",
  !has(monText, "Vikram Iyer"),
);

const rows = JSON.parse(
  await ev(`(() => {
    const b = [...document.querySelectorAll('button')]
      .filter(x => (x.getAttribute('title') ?? '').includes('participant roster'));
    return JSON.stringify({ count: b.length, enabled: b.filter(x => !x.disabled).length });
  })()`),
);
record(
  "a concluded exam is a real destination",
  rows.count > 0 && rows.enabled > 0,
  `${rows.count} row(s), ${rows.enabled} openable`,
);

await ev(`(() => {
  [...document.querySelectorAll('button')]
    .find(x => (x.getAttribute('title') ?? '').includes('participant roster') && !x.disabled)
    .click();
  return 'ok';
})()`);
await sleep(1800);
const drawer = await ev("document.body.innerText");
record(
  "the roster lists every participant",
  has(drawer, "Asha Rao") && has(drawer, "Vikram Iyer"),
);
record("including their roll numbers", has(drawer, "2601000001"));

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
ws.close();
process.exit(failures === 0 ? 0 : 1);

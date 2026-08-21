/**
 * UAT section 22 / 13 browser checks, expressed once and run by both drivers
 * (CDP for Chrome and Edge, Playwright for Firefox). Keeping the assertions in
 * one file is the point: a cross-browser result only means something if every
 * browser was asked exactly the same questions.
 *
 * `d` is the driver surface: evaluate, navigate, waitFor, setViewport,
 * overflow, typeInto, pressEnter, clickText - all promise-returning.
 */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runChecks(d, args, record) {
  const APP = (args.app ?? "http://localhost:3010").replace(/\/$/, "");
  const {
    evaluate,
    navigate,
    waitFor,
    setViewport,
    clearViewport,
    overflow,
    typeInto,
    pressEnter,
    clickText,
  } = d;
  // Diagnostics are gathered by whichever driver is in charge; the suite
  // only reads them at the end.
  const { consoleErrors, failedRequests } = d;

  // ── S22-P1-11 desktop layout ────────────────────────────────────────────
  await setViewport(1440, 900);
  await navigate(`${APP}/login`);

  const loginLoaded = await waitFor(
    `document.body.innerText.includes('Sign in')`,
  );
  record(
    "S01-P1-01a",
    "login screen renders",
    loginLoaded,
    loginLoaded
      ? ""
      : (await evaluate("document.body.innerText")).slice(0, 160),
  );

  /**
   * Drives the real credential form: pick the audience, fill the three fields
   * through the native value setter (React ignores a plain `.value =`), then
   * submit with Enter. Returns whether it landed off /login.
   */
  async function loginAs(roll) {
    await evaluate(`(() => {
      for (const k of Object.keys(localStorage)) if (k.startsWith('drsk.')) localStorage.removeItem(k);
    })()`);
    await navigate(`${APP}/login`, 2000);
    await waitFor(`document.body.innerText.includes('Sign in')`);
    await clickText("Student", "button, a, div[role=button]");
    await sleep(900);
    const up = await waitFor(
      `document.querySelector('#instituteSlug') && document.querySelector('#rollNumber')`,
    );
    if (!up) return false;
    await typeInto("#instituteSlug", args.slug ?? "demo");
    await typeInto("#rollNumber", roll);
    await typeInto("input[type=password]", args.password ?? "Student@123");
    await evaluate(`document.querySelector('input[type=password]')?.focus()`);
    await pressEnter();
    return waitFor(`!location.pathname.startsWith('/login')`, 25000);
  }

  // The first step asks who you are; the credential form is behind "Student".
  record(
    "S22-P1-02a",
    "audience choice is a real control",
    await clickText("Student", "button, a, div[role=button]"),
    "clicked the Student card",
  );
  await sleep(900);

  const fieldsUp = await waitFor(
    `document.querySelector('#instituteSlug') && document.querySelector('#rollNumber')`,
  );
  record("S01-P1-01b", "candidate credential form renders", fieldsUp);

  await typeInto("#instituteSlug", args.slug ?? "demo");
  await typeInto("#rollNumber", args.roll ?? "UATKEY-ALPHA");
  await typeInto("input[type=password]", args.password ?? "Student@123");
  // Focus the last field, then submit with Enter rather than clicking.
  await evaluate(`document.querySelector('input[type=password]')?.focus()`);
  await pressEnter();

  const loggedIn = await waitFor(
    `!location.pathname.startsWith('/login')`,
    25000,
  );
  record(
    "S22-P1-13",
    "Enter submits the login form (no click needed)",
    loggedIn,
    `landed on ${await evaluate("location.pathname")}`,
  );

  if (!loggedIn) {
    record(
      "S22-P1-06",
      "login error is legible",
      false,
      (await evaluate("document.body.innerText")).slice(0, 200),
    );
  }

  // ── S22-P1-01 navigation ────────────────────────────────────────────────
  await sleep(1200);
  const navHrefs = await evaluate(`(() => {
    const seen = new Set();
    for (const a of document.querySelectorAll('nav a[href^="/"], aside a[href^="/"]')) {
      seen.add(a.getAttribute('href'));
    }
    return [...seen];
  })()`);
  record(
    "S22-P1-01a",
    "sidebar exposes navigation links",
    (navHrefs || []).length > 0,
    `${(navHrefs || []).length} links: ${(navHrefs || []).join(", ").slice(0, 160)}`,
  );

  const broken = [];
  for (const href of navHrefs || []) {
    await navigate(`${APP}${href}`, 1800);
    const ok = await evaluate(`(() => {
      const t = document.body.innerText;
      return !/404|This page could not be found|Application error/i.test(t) && t.trim().length > 40;
    })()`);
    const active = await evaluate(`(() => {
      const a = document.querySelector('nav a[href="' + ${JSON.stringify(href)} + '"], aside a[href="' + ${JSON.stringify(href)} + '"]');
      if (!a) return null;
      return a.getAttribute('aria-current') === 'page' ||
             /bg-|text-brand|font-semibold|active/.test(a.className);
    })()`);
    if (!ok) broken.push(href);
    if (active === false) broken.push(`${href} (no active state)`);
  }
  record(
    "S22-P1-01b",
    "every nav destination renders with an active state",
    broken.length === 0,
    broken.length
      ? broken.join("; ")
      : `${(navHrefs || []).length} routes checked`,
  );

  // -- Result + review screens ------------------------------------------
  const RESULT_MARKER =
    "/TOTAL SCORE|OVERALL RANK|ACCURACY/i.test(document.body.innerText)";
  const attempt = args.attempt;
  if (attempt) {
    await navigate(`${APP}/student/results/${attempt}`, 1500);
    const resultUp = await waitFor(RESULT_MARKER, 25000);
    record(
      "S13-P1-01",
      "result summary renders",
      resultUp,
      (await evaluate("document.body.innerText"))
        .replace(/\s+/g, " ")
        .slice(-140),
    );

    // Every element the checklist requires the result summary to carry.
    const missing = await evaluate(`(() => {
      const t = document.body.innerText;
      const want = {
        'total score': /TOTAL SCORE/i,
        percentage: /\\d+%/,
        'performance band': /EXCELLENT|GOOD|NEEDS IMPROVEMENT/i,
        correct: /CORRECT/i, incorrect: /INCORRECT/i, skipped: /SKIPPED/i,
        accuracy: /ACCURACY/i, rank: /OVERALL RANK/i, 'batch rank': /BATCH RANK/i,
        percentile: /PERCENTILE/i, 'published at': /Result published on/i,
        'section-wise': /Section-wise performance/i,
        'subject-wise': /Subject-wise performance/i,
        'time analysis': /Time analysis/i, 'avg per question': /AVG . QUESTION/i,
        fastest: /FASTEST/i, slowest: /SLOWEST/i,
        'status breakdown': /Question status/i,
        'negative marking': /Negative marking/i,
        'score comparison': /Score comparison/i,
      };
      return Object.entries(want).filter(([, re]) => !re.test(t)).map(([k]) => k);
    })()`);
    record(
      "S13-P1-01b",
      "every required result element is present",
      (missing || []).length === 0,
      (missing || []).length
        ? "missing: " + missing.join(", ")
        : "all 20 present",
    );

    const o1 = await overflow();
    record(
      "S22-P1-11",
      "result page has no horizontal overflow at 1440x900",
      o1.over <= 1,
      `overflow=${o1.over}px ${o1.worst ?? ""}`,
    );

    // -- S22-P1-12: 125% zoom is the same window showing a 1152x720 viewport.
    await setViewport(1152, 720, 1.25);
    await navigate(`${APP}/student/results/${attempt}`, 1500);
    const usable = await waitFor(RESULT_MARKER, 25000);
    const o3 = await overflow();
    record(
      "S22-P1-12",
      "result page usable at 125% zoom",
      o3.over <= 1 && usable,
      `overflow=${o3.over}px ${o3.worst ?? ""}, content=${usable}`,
    );
    await setViewport(1440, 900);
  }

  // A filter is only offered when it would return something, so the filters are
  // exercised on the paper built to land a question in each of the six.
  const reviewAttempt = args.review ?? attempt;
  if (reviewAttempt) {
    if (args["review-roll"] && args["review-roll"] !== args.roll) {
      const swapped = await loginAs(args["review-roll"]);
      record(
        "S01-P1-05",
        "sign out and sign in as another candidate",
        swapped,
        `now ${args["review-roll"]}`,
      );
    }
    await navigate(`${APP}/student/results/${reviewAttempt}/review`, 1500);
    const reviewUp = await waitFor(
      `/Correct|Incorrect|Skipped/i.test(document.body.innerText)`,
      25000,
    );
    record("S13-P1-02", "question review renders", reviewUp);

    const absent = await evaluate(`(() => {
      const wanted = ['All','Incorrect','Correct','Skipped','Marked for review','Slow questions'];
      const btns = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim());
      return wanted.filter(w => !btns.some(b => b.startsWith(w)));
    })()`);
    record(
      "S13-P1-03",
      "all six review filters offered",
      (absent || []).length === 0,
      (absent || []).length
        ? "missing: " + absent.join(", ")
        : "All / Incorrect / Correct / Skipped / Marked for review / Slow questions",
    );

    const probe = [];
    for (const f of [
      "Incorrect",
      "Skipped",
      "Marked for review",
      "Slow questions",
      "Correct",
    ]) {
      // A filter that was never clicked cannot be reported as "returns rows" -
      // an absent control and an empty result are different failures.
      const clicked = await clickText(f);
      await sleep(700);
      const empty = await evaluate(
        `/No questions match this filter/i.test(document.body.innerText)`,
      );
      probe.push(`${f}=${!clicked ? "NO CONTROL" : empty ? "EMPTY" : "ok"}`);
    }
    record(
      "S13-P1-03b",
      "every offered filter returns at least one question",
      probe.every((x) => x.endsWith("=ok")),
      probe.join(", "),
    );

    await clickText("All");
    await sleep(800);

    // Previous/Next live in the focused single-question reader, so open one.
    await evaluate(`(() => {
      const els = Array.from(document.querySelectorAll('button, [role=button]'));
      const el = els.find(e => /UAT review-filter question/i.test(e.textContent));
      if (el) el.click();
      return Boolean(el);
    })()`);
    await sleep(1000);
    const readerOpen = await waitFor(
      `/\\d+ of \\d+/.test(document.body.innerText)`,
      8000,
    );
    record(
      "S13-P1-04a",
      "clicking a question opens the single-question reader",
      readerOpen,
    );

    const pos = () =>
      evaluate(`(document.body.innerText.match(/(\\d+) of \\d+/) || [])[1]`);
    const before = await pos();
    const advanced = await clickText("Next");
    await sleep(900);
    const after = await pos();
    const samePage = (await evaluate("location.pathname")).includes("review");
    record(
      "S13-P1-04",
      "Next advances without leaving the page",
      Boolean(advanced) && before !== after && samePage,
      `position ${before} -> ${after}, still on review=${samePage}`,
    );

    const back = await clickText("Previous");
    await sleep(900);
    const restored = await pos();
    record(
      "S13-P1-05",
      "Previous returns to the prior question",
      Boolean(back) && restored === before,
      `position ${after} -> ${restored} (expected ${before})`,
    );

    // S22-P1-03: at the first question Previous must be genuinely disabled.
    const disabled = await evaluate(`(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim().startsWith('Previous'));
      return b ? b.disabled : null;
    })()`);
    record(
      "S22-P1-03",
      "Previous is truly disabled on the first question",
      disabled === true,
      `disabled=${disabled}`,
    );

    const detailMissing = await evaluate(`(() => {
      const t = document.body.innerText;
      const want = {
        'your answer': /Your answer/i, 'correct answer': /Correct answer/i,
        marks: /marks/i, explanation: /Explanation/i, 'time spent': /time/i,
        difficulty: /Easy|Medium|Hard/i, subject: /Physics/i,
      };
      return Object.entries(want).filter(([, re]) => !re.test(t)).map(([k]) => k);
    })()`);
    record(
      "S13-P1-06",
      "question detail carries answer, key, marks, explanation, time, difficulty and subject",
      (detailMissing || []).length === 0,
      (detailMissing || []).length
        ? "missing: " + detailMissing.join(", ")
        : "all present",
    );

    const o2 = await overflow();
    record(
      "S22-P1-11b",
      "review page has no horizontal overflow at 1440x900",
      o2.over <= 1,
      `overflow=${o2.over}px ${o2.worst ?? ""}`,
    );
  }

  // -- Section 4: the exam runner itself ---------------------------------
  // The two rows that cannot be settled over HTTP - does a diagram actually
  // paint, and does science notation come out readable - need the real runner
  // in front of a real browser.
  if (args.exam && args["exam-roll"]) {
    // Sit the paper in an un-emulated viewport: the runner gates entry behind
    // requestFullscreen(), which never resolves under a metrics override.
    await clearViewport();
    const inExam = await loginAs(args["exam-roll"]);
    record("S04-P0-01b", "candidate can sign in to sit the paper", inExam);

    await navigate(`${APP}/exam?examId=${args.exam}`, 2500);
    /**
     * The runner opens on its own full-screen gate before the paper is shown.
     *
     * Clicking once is not enough: the button's text is server-rendered, so it
     * is on screen a beat before React hydrates and attaches the handler, and a
     * synthetic click in that window is swallowed silently. Retry until the
     * gate is actually gone rather than assuming the first click took.
     */
    await waitFor(`/START EXAM/i.test(document.body.innerText)`, 15000);
    let gateCleared = false;
    for (let i = 0; i < 10 && !gateCleared; i++) {
      await clickText("START EXAM");
      await sleep(1200);
      gateCleared = await evaluate(
        `!/Please read the instructions before starting/i.test(document.body.innerText)`,
      );
    }
    const runnerUp =
      gateCleared &&
      (await waitFor(
        `/Question\\s*1|Save\\s*&\\s*Next|Mark for Review/i.test(document.body.innerText)`,
        30000,
      ));
    record(
      "S04-P0-01c",
      "the exam runner loads and renders the first question",
      runnerUp,
      runnerUp
        ? ""
        : `at ${await evaluate("location.pathname + location.search")}: ` +
            (await evaluate("document.body.innerText"))
              .replace(/\s+/g, " ")
              .slice(0, 300),
    );

    if (runnerUp) {
      const header = await evaluate(`(() => {
        const t = document.body.innerText;
        return {
          roll: new RegExp(${JSON.stringify(args["exam-roll"])}, 'i').test(t),
          exam: /UAT Engine/i.test(t),
          // A live countdown, in any of the shapes a timer is written.
          timer: /\\d{1,2}:\\d{2}(:\\d{2})?/.test(t),
        };
      })()`);
      record(
        "S04-P0-01",
        "exam header carries the candidate, the paper and a running clock",
        header.roll && header.exam && header.timer,
        JSON.stringify(header),
      );

      // S04-P0-04: present in the DOM is not enough - a broken src also yields
      // an <img>. `naturalWidth` is only non-zero once the bytes decoded.
      // Present in the DOM is not enough - a broken src still yields an <img>.
      // `naturalWidth` is non-zero only once the bytes actually decoded. Match
      // the runner's own diagram alt: the account avatar is an <img> too, and
      // its alt is the candidate's name, so excluding "avatar" misses it.
      const img = await evaluate(`(async () => {
        const start = Date.now();
        const diagrams = () => Array.from(document.querySelectorAll('img'))
          .filter(i => /question diagram/i.test(i.alt || ''));
        while (Date.now() - start < 15000) {
          const painted = diagrams().find(i => i.naturalWidth > 0);
          if (painted) return { ok: true, w: painted.naturalWidth, h: painted.naturalHeight };
          await new Promise(r => setTimeout(r, 400));
        }
        // Say why, not just "no". The three ways this fails look identical in a
        // pass/fail line and are completely different bugs.
        return {
          ok: false, w: 0, h: 0,
          diagramImgs: diagrams().length,
          allImgAlts: Array.from(document.querySelectorAll('img')).map(i => i.alt || '(no alt)'),
          unavailablePlaceholder: /image unavailable/i.test(document.body.innerText),
          stillLoading: Boolean(document.querySelector('.animate-pulse')),
          questionOnScreen: (document.body.innerText.match(/UAT engine Q\\d[^\\n]*/) || [])[0] || null,
        };
      })()`);
      record(
        "S04-P0-04",
        "a question diagram actually decodes and paints",
        img.ok,
        img.ok
          ? `painted ${img.w}x${img.h}`
          : `no painted diagram: diagram<img>=${img.diagramImgs}, ` +
              `all alts=[${(img.allImgAlts || []).join(", ")}], ` +
              `"Image unavailable"=${img.unavailablePlaceholder}, ` +
              `still-loading placeholder=${img.stillLoading}, on=${img.questionOnScreen}`,
      );

      /**
       * BUG-120: with no violation limit configured - the default for every
       * exam - a single incidental focus loss must NOT end the paper.
       *
       * Driven by firing the same events the browser fires when a candidate
       * alt-tabs, then checking the attempt is still live. Before the fix this
       * auto-submitted immediately, because `next >= 0` is true on violation
       * one.
       */
      await evaluate(`(() => {
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('blur'));
        document.dispatchEvent(new Event('fullscreenchange'));
        return true;
      })()`);
      await sleep(2500);
      const survived = await evaluate(`(() => {
        const t = document.body.innerText;
        return {
          stillSitting: /Save\\s*&\\s*Next|Mark for Review/i.test(t),
          submittedScreen: /submitted|being submitted automatically/i.test(t),
          banner: (t.match(/\\d+ Violations? Recorded|Warning \\d+\\/\\d+ Violation/i) || [])[0] || null,
        };
      })()`);
      record(
        "S04-P0-31",
        "an incidental violation does not end a paper with no violation limit set",
        survived.stillSitting && !survived.submittedScreen,
        `still sitting=${survived.stillSitting}, submitted=${survived.submittedScreen}, ` +
          `banner=${survived.banner ?? "none"}`,
      );

      // S04-P0-05: navigate to the question carrying science notation and see
      // what the runner does with it.
      // Advance to the notation question. Retried, because the same hydration
      // race that swallows the start-gate click applies to the runner's own
      // controls, and reported if it never lands rather than silently checking
      // the wrong question.
      let onMath = false;
      for (let i = 0; i < 6 && !onMath; i++) {
        await clickText("Save & Next");
        await sleep(1500);
        onMath = await evaluate(
          `/kinetic energy/i.test(document.body.innerText)`,
        );
      }
      if (!onMath) {
        record(
          "S04-P0-05a",
          "could reach the notation question",
          false,
          "buttons on screen: " +
            (await evaluate(
              `Array.from(document.querySelectorAll('button')).map(b => b.textContent.replace(/\\s+/g,' ').trim()).filter(Boolean).slice(0, 12).join(' | ')`,
            )),
        );
      }
      const math = await evaluate(`(() => {
        const t = document.body.innerText;
        return {
          onMathQuestion: /kinetic energy/i.test(t),
          rawCaret: /v\\^2/.test(t),
          rawLatex: /\\\\tfrac|\\$E =/.test(t),
          rawSubscript: /H2SO4/.test(t),
          renderedKatex: Boolean(document.querySelector('.katex, mjx-container, math')),
          renderedSupSub: Boolean(document.querySelector('main sup, main sub, article sup, article sub')),
        };
      })()`);
      const rendersMath = math.renderedKatex || math.renderedSupSub;
      record(
        "S04-P0-05",
        "math and science notation render as notation, not as source",
        rendersMath,
        rendersMath
          ? "a math renderer is present"
          : `no renderer: statements print verbatim (caret=${math.rawCaret}, ` +
              `LaTeX=${math.rawLatex}, subscript-as-digits=${math.rawSubscript}, ` +
              `KaTeX/MathML nodes=${math.renderedKatex}, sup/sub nodes=${math.renderedSupSub}) ` +
              `[on the math question=${math.onMathQuestion}]`,
      );
    }
  }

  // ── S22-P1-09 long values ───────────────────────────────────────────────
  await navigate(`${APP}/student/profile`, 2500);
  const longName = await evaluate(`(() => {
    const d = document.documentElement;
    const el = document.body;
    const probe = document.createElement('div');
    probe.textContent = 'Bhattacharyya-Venkataraghavan Sathyanarayanan'.repeat(2) + '@averyveryverylongdomainname.example.edu';
    probe.style.cssText = 'max-width:100%';
    el.appendChild(probe);
    const over = d.scrollWidth - d.clientWidth;
    probe.remove();
    return over;
  })()`);
  record(
    "S22-P1-09",
    "a very long name/email does not force the page sideways",
    longName <= 1,
    `overflow=${longName}px`,
  );

  // ── Whole-run console + network health ──────────────────────────────────
  const realErrors = consoleErrors.filter(
    (e) => !/favicon|Download the React DevTools/i.test(e),
  );
  record(
    "S22-P1-04",
    "no uncaught console errors across the run",
    realErrors.length === 0,
    realErrors.slice(0, 3).join(" | ").slice(0, 300) || "clean",
  );
  const realFailures = failedRequests.filter((f) => !/favicon/i.test(f));
  record(
    "S22-P1-06b",
    "no failed network requests across the run",
    realFailures.length === 0,
    realFailures.slice(0, 4).join(" | ").slice(0, 300) || "clean",
  );
}

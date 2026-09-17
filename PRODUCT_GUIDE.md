# Codonmind Nexus — Exams & Practice Guide

A short, plain-language guide to the three exam types your institute uses, one
shared Question Bank, and how to create and run each one.

---

## The three categories, at a glance

Every student sees exactly three sections — no sub-menus, no old "Mock
Test" or "Assessment" naming.

| Category                       | What it is                   | Timed?                        | Proctored?                                 | When results show                                       |
| ------------------------------ | ---------------------------- | ----------------------------- | ------------------------------------------ | ------------------------------------------------------- |
| **CBT** (Computer Based Test)  | A strict, formal exam        | Yes, fixed duration           | Yes — fullscreen lock, tab-switch tracking | After admin/teacher publishes                           |
| **DPP** (Daily Practice Paper) | Quick daily practice         | No                            | No                                         | Instantly, question by question                         |
| **Practice Test**              | A flexible, teacher-run test | Yes, but flexible (see below) | No                                         | Instantly on submit; leaderboard once the window closes |

All three draw their questions from the **same Question Bank** — there is
no separate practice question set to maintain.

---

## The Question Bank

**Admin → Question Bank** (teachers have their own view of the same bank).

- Filter by Subject, Class, Chapter, Topic, difficulty, tags, or status.
- Tick individual questions, or use the header checkbox to select every
  question matching your current filter.
- Once you've selected questions, a bar appears at the top with two actions:

### Export (Admin only)

1. Click **Export selected**.
2. Choose a format: **PDF** or **Word (DOCX)**.
3. Choose content: **Questions + Answers**, or **Questions Only** (a clean
   answer key never appears in a Questions-Only export — safe to hand to
   students).
4. Download starts automatically.

### Create DPP (Admin or Teacher)

See below.

---

## Creating a DPP

DPPs are created **directly from the Question Bank** — there is no separate
curation step.

1. In the Question Bank, filter and tick the questions you want.
2. Click **Create DPP**.
3. Give it a title (and optionally a subject/chapter for filing).
4. Choose which batch(es) it goes to. A teacher can only choose batches they
   teach; an admin can choose any batch.
5. Click **Create**.

The DPP appears immediately for every student in the selected batch(es), on
their **DPP** tab. Students can:

- Attempt it with no timer and no restrictions.
- Check each answer as they go.
- Re-attempt a completed DPP any time (their most recent attempt counts for
  progress tracking).

**Managing existing DPPs:** Teacher → **DPP** (or Admin → **DPP**) lists
everything shared. From there you can **Edit sharing** (change which batches
see it) or **Delete** it (students stop seeing it immediately; the
questions themselves stay in the Question Bank, untouched).

---

## Creating a CBT

This is the strict, formal exam path — unchanged from before, just renamed.

1. **Admin/Teacher → Exams → New Exam.**
2. Add sections and pull questions in from the Question Bank.
3. Set duration, marking scheme, and proctoring options (fullscreen
   required, max tab-switch violations, etc.).
4. Assign the batch(es) that will sit the exam.
5. Set the schedule (opens-at / closes-at).
6. Submit for approval, get it approved, then **Publish**.

Students see it on their **CBT** tab. It behaves exactly as a formal exam
should: locked-down, timed, and results are only visible once
published/evaluated.

---

## Creating a Practice Test

Same builder as CBT, but pick **Practice Test** as the type. Two things
work differently on purpose:

### 1. No proctoring, mobile-friendly

No fullscreen lock, no tab-switch tracking, no violation warnings. Students
can take it comfortably on a phone.

### 2. Availability Window ≠ Exam Duration

This is the most important rule to understand:

> **The availability window only controls _when a student can start_. Once
> they start, they always get the _full_ duration you configured — even if
> the window closes a minute later.**

**Example:** You set a Practice Test's window to open at 6:00 PM and close
at 6:15 PM, with a 60-minute duration.

- A student who starts at 6:10 PM still gets the full 60 minutes (until
  7:10 PM) — they are **not** cut off at 6:15 PM just because the window
  closed.
- A student who tries to start at 6:16 PM is refused entry — the window has
  closed.

### Results and leaderboard timing

- **Individual result:** shown to the student the instant they submit — no
  waiting for a teacher or admin to publish anything.
- **Leaderboard/ranking:** only becomes available once the availability
  window closes (so early finishers can't see how they stack up against
  students who haven't attempted it yet).

Students see all of this on their **Practice Test** tab.

---

## Quick reference

|                              | CBT                   | DPP                        | Practice Test                         |
| ---------------------------- | --------------------- | -------------------------- | ------------------------------------- |
| Timer                        | Fixed, strict         | None                       | Full configured duration, per student |
| Fullscreen / tab-switch lock | Yes                   | No                         | No                                    |
| Retry allowed                | No                    | Yes, anytime               | No                                    |
| Individual result            | On publish/evaluation | Instantly, per question    | Instantly, on submit                  |
| Leaderboard                  | With result           | N/A                        | After the window closes               |
| Created from                 | Exam builder          | Question Bank → Create DPP | Exam builder                          |

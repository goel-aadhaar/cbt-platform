/**
 * Fixture for the BUG-101 / BUG-102 regression suite (qa/uat/answer-key-checks.py).
 *
 * Builds a small, fully-deterministic exam in the demo tenant whose scores are
 * hand-computable, so a re-score can be asserted against arithmetic rather than
 * against whatever the code happened to produce:
 *
 *   3 MCQ questions, one section, +4 correct / -1 wrong, keys A / A / A
 *   ALPHA answers A,A,A  ->  +12
 *   BETA  answers A,B,B  ->  +4 -1 -1 = 2
 *   GAMMA answers B,B,B  ->  -1 -1 -1 = -3
 *
 * ALPHA/BETA sit in one batch, GAMMA in another, so batch-rank cohorts are
 * distinguishable. Re-runnable: everything it creates is torn down first.
 *
 * Prints JSON on stdout for the Python suite to consume.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const TITLE = 'UAT Answer-Key Regression';
const REVIEW_TITLE = 'UAT Review Filters';
const ROLLS = ['UATKEY-ALPHA', 'UATKEY-BETA', 'UATKEY-GAMMA'];
/**
 * A fourth candidate who sits a SEPARATE paper. Kept out of the scored exam
 * on purpose: the three above exist so their totals and ranks can be checked
 * by hand, and a fourth row would move every rank in that arithmetic. DELTA
 * instead answers a six-question paper in a way that lands at least one
 * question in each of the review screen's six filters.
 */
const REVIEW_ROLL = 'UATKEY-DELTA';
const ANSWERS: Record<string, string[]> = {
  'UATKEY-ALPHA': ['A', 'A', 'A'],
  'UATKEY-BETA': ['A', 'B', 'B'],
  'UATKEY-GAMMA': ['B', 'B', 'B'],
};

async function main() {
  const inst = await prisma.institute.findFirstOrThrow({
    where: { slug: 'demo' },
  });
  const admin = await prisma.user.findFirstOrThrow({
    where: { instituteId: inst.id, roles: { has: 'ADMIN' } },
  });
  /**
   * Reuse a seeded student's argon2 hash rather than minting one: these rows
   * must be able to log in (the suite asserts the *student-facing* review
   * endpoint, which is where the BUG-101 mismatch was visible), and copying
   * the seed hash keeps the shared dev password `Student@123` without pulling
   * the whole Nest container in just to call PasswordService.
   */
  const seededStudent = await prisma.user.findFirstOrThrow({
    where: {
      instituteId: inst.id,
      roles: { has: 'STUDENT' },
      passwordHash: { not: null },
      student: { rollNumber: { startsWith: '26' } },
    },
    select: { passwordHash: true },
  });

  // --- teardown of any prior run -------------------------------------------
  const old = await prisma.exam.findMany({
    where: { instituteId: inst.id, title: { in: [TITLE, REVIEW_TITLE] } },
    select: { id: true },
  });
  for (const e of old) await prisma.exam.delete({ where: { id: e.id } }); // cascades attempts/results
  await prisma.question.deleteMany({
    where: { instituteId: inst.id, tags: { has: 'uat-answer-key' } },
  });
  const oldStudents = await prisma.student.findMany({
    where: {
      instituteId: inst.id,
      rollNumber: { in: [...ROLLS, REVIEW_ROLL] },
    },
    select: { userId: true },
  });
  await prisma.student.deleteMany({
    where: {
      instituteId: inst.id,
      rollNumber: { in: [...ROLLS, REVIEW_ROLL] },
    },
  });
  await prisma.user.deleteMany({
    where: { id: { in: oldStudents.map((s) => s.userId) } },
  });

  // --- two batches ----------------------------------------------------------
  const batches = await prisma.batch.findMany({
    where: { instituteId: inst.id },
    take: 2,
    orderBy: { createdAt: 'asc' },
  });
  if (batches.length < 2)
    throw new Error('demo tenant needs at least two batches');
  const [batchA, batchB] = batches;

  // --- three students -------------------------------------------------------
  const students: Record<
    string,
    { id: string; userId: string; batchId: string }
  > = {};
  for (const [i, roll] of [...ROLLS, REVIEW_ROLL].entries()) {
    const user = await prisma.user.create({
      data: {
        instituteId: inst.id,
        email: `${roll.toLowerCase()}@uat.local`,
        name: roll,
        roles: ['STUDENT'],
        status: 'ACTIVE',
        passwordHash: seededStudent.passwordHash,
      },
    });
    const batchId = i < 2 ? batchA.id : batchB.id;
    const st = await prisma.student.create({
      data: {
        instituteId: inst.id,
        userId: user.id,
        batchId,
        rollNumber: roll,
      },
    });
    students[roll] = { id: st.id, userId: user.id, batchId };
  }

  // --- three questions, keys A / A / A --------------------------------------
  const subject = await prisma.subject.findFirstOrThrow({
    where: { instituteId: inst.id },
  });
  const chapter = await prisma.chapter.findFirstOrThrow({
    where: { instituteId: inst.id, subjectId: subject.id },
  });
  const options = [
    { key: 'A', text: 'Option A' },
    { key: 'B', text: 'Option B' },
    { key: 'C', text: 'Option C' },
    { key: 'D', text: 'Option D' },
  ];
  const questionIds: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const q = await prisma.question.create({
      data: {
        instituteId: inst.id,
        subject: subject.name,
        chapter: chapter.name,
        subjectId: subject.id,
        chapterId: chapter.id,
        difficulty: 'MEDIUM',
        type: 'MCQ',
        language: 'en',
        tags: ['uat-answer-key'],
        statement: `UAT answer-key regression question ${i}`,
        options,
        answerKey: 'A',
        marks: 4,
        negativeMarks: 1,
        mediaKeys: [],
        status: 'APPROVED',
        createdById: admin.id,
        approvedById: admin.id,
        approvedAt: new Date(),
      },
    });
    questionIds.push(q.id);
  }

  // --- the exam -------------------------------------------------------------
  const now = new Date();
  const exam = await prisma.exam.create({
    data: {
      instituteId: inst.id,
      title: TITLE,
      durationMinutes: 30,
      startAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      endAt: new Date(now.getTime() - 60 * 60 * 1000),
      status: 'PUBLISHED',
      resultPolicy: 'ON_PUBLISH',
      createdById: admin.id,
      approvedById: admin.id,
      approvedAt: now,
      sections: {
        create: [
          {
            instituteId: inst.id,
            name: 'Physics',
            order: 1,
            marksCorrect: 4,
            marksWrong: 1,
          },
        ],
      },
      batches: {
        create: [
          { instituteId: inst.id, batchId: batchA.id },
          { instituteId: inst.id, batchId: batchB.id },
        ],
      },
    },
    include: { sections: true },
  });
  const section = exam.sections[0];
  for (const [i, qid] of questionIds.entries()) {
    await prisma.examQuestion.create({
      data: {
        examId: exam.id,
        sectionId: section.id,
        instituteId: inst.id,
        questionId: qid,
        order: i + 1,
      },
    });
  }

  // --- submitted attempts ---------------------------------------------------
  const attempts: Record<string, string> = {};
  for (const roll of ROLLS) {
    const att = await prisma.attempt.create({
      data: {
        instituteId: inst.id,
        examId: exam.id,
        studentId: students[roll].id,
        status: 'SUBMITTED',
        startedAt: new Date(now.getTime() - 90 * 60 * 1000),
        expiresAt: new Date(now.getTime() - 60 * 60 * 1000),
        submittedAt: new Date(now.getTime() - 61 * 60 * 1000),
      },
    });
    attempts[roll] = att.id;
    for (const [i, qid] of questionIds.entries()) {
      await prisma.response.create({
        data: {
          attemptId: att.id,
          questionId: qid,
          instituteId: inst.id,
          answer: ANSWERS[roll][i],
          status: 'ANSWERED',
          timeSpentMs: 30_000 + i * 1000,
        },
      });
    }
  }

  // --- a second paper, built purely to exercise the review filters ---------
  const reviewQuestionIds: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const q = await prisma.question.create({
      data: {
        instituteId: inst.id,
        subject: subject.name,
        chapter: chapter.name,
        subjectId: subject.id,
        chapterId: chapter.id,
        difficulty: i % 2 ? 'EASY' : 'HARD',
        type: 'MCQ',
        language: 'en',
        tags: ['uat-answer-key'],
        statement: `UAT review-filter question ${i}`,
        options,
        answerKey: 'A',
        explanation: `Because option A is the only one that satisfies condition ${i}.`,
        marks: 4,
        negativeMarks: 1,
        mediaKeys: [],
        status: 'APPROVED',
        createdById: admin.id,
        approvedById: admin.id,
        approvedAt: new Date(),
      },
    });
    reviewQuestionIds.push(q.id);
  }

  const reviewExam = await prisma.exam.create({
    data: {
      instituteId: inst.id,
      title: REVIEW_TITLE,
      durationMinutes: 30,
      startAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      endAt: new Date(now.getTime() - 60 * 60 * 1000),
      status: 'PUBLISHED',
      resultPolicy: 'ON_PUBLISH',
      createdById: admin.id,
      approvedById: admin.id,
      approvedAt: now,
      sections: {
        create: [
          {
            instituteId: inst.id,
            name: 'Physics',
            order: 1,
            marksCorrect: 4,
            marksWrong: 1,
          },
        ],
      },
      // Both batches: DELTA sits in B, and an exam a candidate cannot be
      // assigned to would not appear on their reports list.
      batches: {
        create: [
          { instituteId: inst.id, batchId: batchA.id },
          { instituteId: inst.id, batchId: batchB.id },
        ],
      },
    },
    include: { sections: true },
  });
  for (const [i, qid] of reviewQuestionIds.entries()) {
    await prisma.examQuestion.create({
      data: {
        examId: reviewExam.id,
        sectionId: reviewExam.sections[0].id,
        instituteId: inst.id,
        questionId: qid,
        order: i + 1,
      },
    });
  }

  const reviewAttempt = await prisma.attempt.create({
    data: {
      instituteId: inst.id,
      examId: reviewExam.id,
      studentId: students[REVIEW_ROLL].id,
      status: 'SUBMITTED',
      startedAt: new Date(now.getTime() - 90 * 60 * 1000),
      expiresAt: new Date(now.getTime() - 60 * 60 * 1000),
      submittedAt: new Date(now.getTime() - 61 * 60 * 1000),
    },
  });
  /**
   * One row per filter the review screen offers:
   *   q1 correct | q2 incorrect | q3 never opened | q4 seen but left blank
   *   q5 correct AND flagged   | q6 correct but far slower than the median
   * The slow threshold is 1.5x the MEDIAN recorded time, so 300s against a
   * median of 25s lands q6 in "Slow questions" without dragging the median up.
   */
  const reviewResponses: {
    answer: string | null;
    status: 'ANSWERED' | 'NOT_ANSWERED' | 'NOT_VISITED' | 'ANSWERED_MARKED';
    timeSpentMs: number | null;
  }[] = [
    { answer: 'A', status: 'ANSWERED', timeSpentMs: 20_000 },
    { answer: 'B', status: 'ANSWERED', timeSpentMs: 25_000 },
    { answer: null, status: 'NOT_VISITED', timeSpentMs: null },
    { answer: null, status: 'NOT_ANSWERED', timeSpentMs: 15_000 },
    { answer: 'A', status: 'ANSWERED_MARKED', timeSpentMs: 30_000 },
    { answer: 'A', status: 'ANSWERED', timeSpentMs: 300_000 },
  ];
  for (const [i, r] of reviewResponses.entries()) {
    await prisma.response.create({
      data: {
        attemptId: reviewAttempt.id,
        questionId: reviewQuestionIds[i],
        instituteId: inst.id,
        answer: r.answer ?? undefined,
        status: r.status,
        timeSpentMs: r.timeSpentMs,
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        instituteId: inst.id,
        examId: exam.id,
        sectionId: section.id,
        questionIds,
        studentPassword: 'Student@123',
        instituteSlug: 'demo',
        batchA: batchA.id,
        batchB: batchB.id,
        students: Object.fromEntries(
          ROLLS.map((r) => [r, { ...students[r], attemptId: attempts[r] }]),
        ),
        /** Separate paper for the review-screen UI checks - see REVIEW_ROLL. */
        review: {
          roll: REVIEW_ROLL,
          examId: reviewExam.id,
          attemptId: reviewAttempt.id,
          questionIds: reviewQuestionIds,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

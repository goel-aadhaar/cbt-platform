/**
 * Fixture for the section-4 CBT-engine suite (qa/uat/cbt-engine-checks.py).
 *
 * Builds two LIVE exams in the demo tenant, each with a window open right now
 * so a real attempt can actually be started through the API:
 *
 *   "UAT Engine"      two sections, 5 questions (MCQ / MSQ / INTEGER), 60 min,
 *                     calculator ENABLED   - the main navigation/autosave paper
 *   "UAT Engine Short" one section, 1 question, duration 1 minute,
 *                     calculator DISABLED  - so timeout auto-submit can be
 *                     observed for real instead of being asserted from the code
 *
 * Two candidates so the single-session rule can be probed without disturbing
 * the paper under test. Re-runnable: everything it creates is torn down first.
 *
 * Prints JSON on stdout for the Python suite to consume.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const MAIN_TITLE = 'UAT Engine';
const SHORT_TITLE = 'UAT Engine Short';
const ROLLS = ['UATENG-ONE', 'UATENG-TWO'];
const TAG = 'uat-engine';

async function main() {
  const inst = await prisma.institute.findFirstOrThrow({
    where: { slug: 'demo' },
  });
  const admin = await prisma.user.findFirstOrThrow({
    where: { instituteId: inst.id, roles: { has: 'ADMIN' } },
  });
  const seeded = await prisma.user.findFirstOrThrow({
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
    where: { instituteId: inst.id, title: { in: [MAIN_TITLE, SHORT_TITLE] } },
    select: { id: true },
  });
  for (const e of old) await prisma.exam.delete({ where: { id: e.id } });
  await prisma.question.deleteMany({
    where: { instituteId: inst.id, tags: { has: TAG } },
  });
  const oldStudents = await prisma.student.findMany({
    where: { instituteId: inst.id, rollNumber: { in: ROLLS } },
    select: { userId: true },
  });
  await prisma.student.deleteMany({
    where: { instituteId: inst.id, rollNumber: { in: ROLLS } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: oldStudents.map((s) => s.userId) } },
  });

  const batch = await prisma.batch.findFirstOrThrow({
    where: { instituteId: inst.id },
    orderBy: { createdAt: 'asc' },
  });

  const students: Record<string, { id: string; userId: string }> = {};
  for (const roll of ROLLS) {
    const user = await prisma.user.create({
      data: {
        instituteId: inst.id,
        email: `${roll.toLowerCase()}@uat.local`,
        name: roll,
        roles: ['STUDENT'],
        status: 'ACTIVE',
        passwordHash: seeded.passwordHash,
      },
    });
    const st = await prisma.student.create({
      data: {
        instituteId: inst.id,
        userId: user.id,
        batchId: batch.id,
        rollNumber: roll,
      },
    });
    students[roll] = { id: st.id, userId: user.id };
  }

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

  /**
   * One question per answer shape the engine has to round-trip. INTEGER carries
   * no options; MSQ's key is an array. If autosave mangles a shape, the suite
   * sees it as a wrong stored value rather than as a generic 500.
   */
  const spec: {
    type: 'MCQ' | 'MSQ' | 'INTEGER';
    key: unknown;
    statement: string;
  }[] = [
    { type: 'MCQ', key: 'A', statement: 'UAT engine Q1 (MCQ)' },
    { type: 'MCQ', key: 'B', statement: 'UAT engine Q2 (MCQ)' },
    { type: 'MSQ', key: ['A', 'C'], statement: 'UAT engine Q3 (MSQ)' },
    { type: 'INTEGER', key: 42, statement: 'UAT engine Q4 (INTEGER)' },
    { type: 'MCQ', key: 'D', statement: 'UAT engine Q5 (MCQ)' },
  ];

  const questionIds: string[] = [];
  for (const q of spec) {
    const created = await prisma.question.create({
      data: {
        instituteId: inst.id,
        subject: subject.name,
        chapter: chapter.name,
        subjectId: subject.id,
        chapterId: chapter.id,
        difficulty: 'MEDIUM',
        type: q.type,
        language: 'en',
        tags: [TAG],
        statement: q.statement,
        options: q.type === 'INTEGER' ? undefined : options,
        answerKey: q.key as never,
        marks: 4,
        negativeMarks: 1,
        mediaKeys: [],
        status: 'APPROVED',
        createdById: admin.id,
        approvedById: admin.id,
        approvedAt: new Date(),
      },
    });
    questionIds.push(created.id);
  }

  const now = new Date();
  const openedAt = new Date(now.getTime() - 5 * 60 * 1000);
  const closesAt = new Date(now.getTime() + 6 * 60 * 60 * 1000);

  // --- main paper: two sections, so section navigation is real --------------
  const main = await prisma.exam.create({
    data: {
      instituteId: inst.id,
      title: MAIN_TITLE,
      durationMinutes: 60,
      startAt: openedAt,
      endAt: closesAt,
      status: 'PUBLISHED',
      resultPolicy: 'ON_PUBLISH',
      calculatorEnabled: true,
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
          {
            instituteId: inst.id,
            name: 'Chemistry',
            order: 2,
            marksCorrect: 4,
            marksWrong: 1,
          },
        ],
      },
      batches: { create: [{ instituteId: inst.id, batchId: batch.id }] },
    },
    include: { sections: { orderBy: { order: 'asc' } } },
  });
  // 3 questions in section 1, 2 in section 2.
  for (const [i, qid] of questionIds.entries()) {
    const section = i < 3 ? main.sections[0] : main.sections[1];
    await prisma.examQuestion.create({
      data: {
        examId: main.id,
        sectionId: section.id,
        instituteId: inst.id,
        questionId: qid,
        order: (i < 3 ? i : i - 3) + 1,
      },
    });
  }

  // --- short paper: one minute, so a real timeout can be observed -----------
  const shortQuestion = await prisma.question.create({
    data: {
      instituteId: inst.id,
      subject: subject.name,
      chapter: chapter.name,
      subjectId: subject.id,
      chapterId: chapter.id,
      difficulty: 'EASY',
      type: 'MCQ',
      language: 'en',
      tags: [TAG],
      statement: 'UAT engine timeout question',
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
  const short = await prisma.exam.create({
    data: {
      instituteId: inst.id,
      title: SHORT_TITLE,
      durationMinutes: 1,
      startAt: openedAt,
      endAt: closesAt,
      status: 'PUBLISHED',
      resultPolicy: 'ON_PUBLISH',
      calculatorEnabled: false,
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
      batches: { create: [{ instituteId: inst.id, batchId: batch.id }] },
    },
    include: { sections: true },
  });
  await prisma.examQuestion.create({
    data: {
      examId: short.id,
      sectionId: short.sections[0].id,
      instituteId: inst.id,
      questionId: shortQuestion.id,
      order: 1,
    },
  });

  console.log(
    JSON.stringify(
      {
        instituteSlug: 'demo',
        studentPassword: 'Student@123',
        rolls: ROLLS,
        batchId: batch.id,
        main: {
          examId: main.id,
          durationMinutes: 60,
          calculatorEnabled: true,
          sectionIds: main.sections.map((s) => s.id),
          questionIds,
          /** Answer key per question, so the suite can assert scoring too. */
          answerKeys: spec.map((q) => q.key),
          types: spec.map((q) => q.type),
        },
        short: {
          examId: short.id,
          durationMinutes: 1,
          calculatorEnabled: false,
          questionId: shortQuestion.id,
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

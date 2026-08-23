/**
 * Fixture for verifying manual evaluation (§2.5) end to end.
 *
 * Builds a deterministic 2-question exam in the `uatb` tenant with three
 * submitted attempts whose auto-scores are hand-computable, so a manual award
 * can be checked as arithmetic rather than against whatever the code produced:
 *
 *   Section: +4 correct / -1 wrong. Keys A / A.
 *   ALPHA-1 (batch Alpha) answers A,A  ->  +8
 *   ALPHA-2 (batch Alpha) answers A,B  ->  +4 -1 = 3
 *   BETA-1  (batch Beta)  answers B,B  ->  -1 -1 = -2
 *
 * Q2 is the one to set to MANUAL: dropping it from auto-scoring leaves
 * 4 / 4 / -1, and awarding 4/2/0 by hand must then land 8 / 6 / -1.
 *
 * Re-runnable: it tears down its own exam first. Touches nothing outside
 * `uatb`, which is a throwaway tenant created by `uat-fixture.ts`.
 */
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';

const TITLE = 'UAT Manual Grading';

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  const inst = await prisma.institute.findUniqueOrThrow({
    where: { slug: 'uatb' },
  });
  const admin = await prisma.user.findFirstOrThrow({
    where: { instituteId: inst.id, roles: { has: 'ADMIN' } },
  });
  const teacher = await prisma.user.findFirstOrThrow({
    where: { instituteId: inst.id, roles: { has: 'TEACHER' } },
  });
  const subject = await prisma.subject.findFirstOrThrow({
    where: { instituteId: inst.id, name: 'Physics' },
  });
  const chapter = await prisma.chapter.findFirstOrThrow({
    where: { instituteId: inst.id, subjectId: subject.id },
  });
  const alpha = await prisma.batch.findFirstOrThrow({
    where: { instituteId: inst.id, name: 'Alpha' },
  });
  const beta = await prisma.batch.findFirstOrThrow({
    where: { instituteId: inst.id, name: 'Beta' },
  });

  // Teardown first so the script can be re-run without piling up papers.
  await prisma.exam.deleteMany({
    where: { instituteId: inst.id, title: TITLE },
  });
  await prisma.question.deleteMany({
    where: { instituteId: inst.id, tags: { has: 'uat-manual' } },
  });

  const questions = [];
  for (const n of [1, 2]) {
    questions.push(
      await prisma.question.create({
        data: {
          instituteId: inst.id,
          subject: subject.name,
          chapter: chapter.name,
          subjectId: subject.id,
          chapterId: chapter.id,
          difficulty: 'EASY',
          type: 'MCQ',
          language: 'EN',
          statement: `MANUAL-FIXTURE Q${n}: pick the correct option.`,
          options: [
            { key: 'A', text: 'Correct' },
            { key: 'B', text: 'Wrong' },
          ],
          answerKey: 'A',
          marks: 4,
          negativeMarks: 1,
          status: 'APPROVED',
          tags: ['uat-manual'],
          createdById: teacher.id,
          approvedById: admin.id,
          approvedAt: new Date(),
        },
      }),
    );
  }

  const exam = await prisma.exam.create({
    data: {
      instituteId: inst.id,
      title: TITLE,
      durationMinutes: 30,
      status: 'PUBLISHED',
      startAt: new Date(Date.now() - 2 * 60 * 60_000),
      endAt: new Date(Date.now() - 60 * 60_000),
      createdById: teacher.id,
    },
  });
  const section = await prisma.examSection.create({
    data: {
      examId: exam.id,
      instituteId: inst.id,
      name: 'Physics',
      order: 0,
      marksCorrect: 4,
      marksWrong: 1,
    },
  });
  for (const [i, q] of questions.entries()) {
    await prisma.examQuestion.create({
      data: {
        examId: exam.id,
        sectionId: section.id,
        questionId: q.id,
        instituteId: inst.id,
        order: i,
      },
    });
  }
  for (const b of [alpha, beta]) {
    await prisma.examBatch.create({
      data: { examId: exam.id, batchId: b.id, instituteId: inst.id },
    });
  }

  /** Answers per candidate, in question order. */
  const plan: { roll: string; answers: string[] }[] = [
    { roll: '262000000001', answers: ['A', 'A'] },
    { roll: '262000000002', answers: ['A', 'B'] },
    { roll: '262000000003', answers: ['B', 'B'] },
  ];

  const attempts = [];
  for (const p of plan) {
    const student = await prisma.student.findFirstOrThrow({
      where: { instituteId: inst.id, rollNumber: p.roll },
      select: { id: true, rollNumber: true, user: { select: { name: true } } },
    });
    const attempt = await prisma.attempt.create({
      data: {
        instituteId: inst.id,
        examId: exam.id,
        studentId: student.id,
        status: 'SUBMITTED',
        startedAt: new Date(Date.now() - 90 * 60_000),
        expiresAt: new Date(Date.now() - 60 * 60_000),
        submittedAt: new Date(Date.now() - 70 * 60_000),
      },
    });
    for (const [i, q] of questions.entries()) {
      await prisma.response.create({
        data: {
          attemptId: attempt.id,
          questionId: q.id,
          instituteId: inst.id,
          answer: p.answers[i],
          status: 'ANSWERED',
        },
      });
    }
    attempts.push({
      attemptId: attempt.id,
      roll: student.rollNumber,
      name: student.user.name,
      answers: p.answers,
    });
  }

  console.log(
    JSON.stringify(
      {
        examId: exam.id,
        sectionId: section.id,
        questionIds: questions.map((q) => q.id),
        attempts,
        expectedAutoScores: {
          '262000000001': 8,
          '262000000002': 3,
          '262000000003': -2,
        },
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

void main();

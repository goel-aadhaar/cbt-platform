/**
 * Fixture for verifying the student Leaderboard screen.
 *
 * Nine candidates across two batches and three sections, with scores chosen so
 * every claim the screen makes is checkable by hand rather than against
 * whatever the code happened to produce:
 *
 *   Sections: Physics / Chemistry / Biology, 2 questions each, +4 / -1.
 *   Per-section outcomes are therefore 8 (both right), 4 (one right, one
 *   blank), 3 (one right, one wrong), 0 (both blank) and -2 (both wrong).
 *
 *   Batch   Student   Phy  Chem  Bio  Total
 *   Alpha   Ishaan      8     3    3     14
 *   Alpha   Priya       3     8    4     15
 *   Alpha   Akash       4     4    8     16
 *   Alpha   Neha        3     3    4     10
 *   Alpha   Anjali      0     3    3      6
 *   Alpha   Sneha       3     0    0      3
 *   Beta    Rohan       8     4    0     12
 *   Beta    Kavya       3     3    3      9
 *   Beta    Manish      4     0   -2      2
 *
 * Deliberately:
 *  - every total is distinct, so no rank tie has to be explained away;
 *  - each subject's best score belongs to a DIFFERENT Alpha candidate —
 *    Ishaan Physics, Priya Chemistry, Akash Biology — so "subject-wise topper"
 *    cannot pass by reading the overall winner three times;
 *  - Alpha (6) clears the five-candidate suppression floor while Beta (3) does
 *    not, so a Beta candidate's batch-scoped board must be withheld;
 *  - the two batches differ in size, which is what makes a batch percentile
 *    numerically distinguishable from the stored institute-wide one. Alpha's
 *    ascending scores are 3, 6, 10, 14, 15, 16 and the whole cohort's are
 *    2, 3, 6, 9, 10, 12, 14, 15, 16 — so Priya is 5/6 = 83.3% in her batch and
 *    8/9 = 88.9% overall.
 *
 * Re-runnable, and touches nothing outside the throwaway `uatb` tenant.
 */
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';

const TITLE = 'UAT Leaderboard';
const PRIOR_TITLE = 'UAT Leaderboard (Prior Paper)';
const SUBJECTS = ['Physics', 'Chemistry', 'Biology'] as const;

/** One section's outcome for one candidate. */
type Outcome = 'CC' | 'CB' | 'CW' | 'BB' | 'WW';

const ANSWERS: Record<Outcome, (string | null)[]> = {
  CC: ['A', 'A'],
  CB: ['A', null],
  CW: ['A', 'B'],
  BB: [null, null],
  WW: ['B', 'B'],
};

/**
 * Alpha carries six candidates, Beta three.
 *
 * Two batches on purpose: with everyone in one batch, a batch-scoped board and
 * an institute-wide board are the SAME cohort, so a batch percentile computed
 * from the batch's own scores would be numerically identical to the stored
 * institute-wide one — and a test could not tell a correct implementation from
 * one that ignored the scope entirely. Beta is also deliberately below the
 * five-candidate floor, so a Beta candidate's batch board must be suppressed.
 */
const PLAN: {
  roll: string;
  name: string;
  batch: 'Alpha' | 'Beta';
  outcomes: Outcome[];
}[] = [
  {
    roll: '263000000001',
    name: 'Ishaan Physics',
    batch: 'Alpha',
    outcomes: ['CC', 'CW', 'CW'],
  },
  {
    roll: '263000000002',
    name: 'Priya Sharma',
    batch: 'Alpha',
    outcomes: ['CW', 'CC', 'CB'],
  },
  {
    roll: '263000000003',
    name: 'Akash Verma',
    batch: 'Alpha',
    outcomes: ['CB', 'CB', 'CC'],
  },
  {
    roll: '263000000004',
    name: 'Neha Mishra',
    batch: 'Alpha',
    outcomes: ['CW', 'CW', 'CB'],
  },
  {
    roll: '263000000005',
    name: 'Anjali Tandon',
    batch: 'Alpha',
    outcomes: ['BB', 'CW', 'CW'],
  },
  {
    roll: '263000000006',
    name: 'Sneha Joshi',
    batch: 'Alpha',
    outcomes: ['CW', 'BB', 'BB'],
  },
  // Beta — totals 12 / 9 / 2, all distinct from Alpha's so no rank ties blur
  // the comparison between the two cohorts.
  {
    roll: '263000000101',
    name: 'Rohan Beta',
    batch: 'Beta',
    outcomes: ['CC', 'CB', 'BB'],
  },
  {
    roll: '263000000102',
    name: 'Kavya Beta',
    batch: 'Beta',
    outcomes: ['CW', 'CW', 'CW'],
  },
  {
    roll: '263000000103',
    name: 'Manish Beta',
    batch: 'Beta',
    outcomes: ['CB', 'BB', 'WW'],
  },
];

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
  const alpha = await prisma.batch.findFirstOrThrow({
    where: { instituteId: inst.id, name: 'Alpha' },
  });
  const beta = await prisma.batch.findFirstOrThrow({
    where: { instituteId: inst.id, name: 'Beta' },
  });
  const batches = { Alpha: alpha, Beta: beta };

  // Teardown first, so the script can be re-run without stacking papers.
  await prisma.exam.deleteMany({
    where: { instituteId: inst.id, title: { in: [TITLE, PRIOR_TITLE] } },
  });
  await prisma.question.deleteMany({
    where: { instituteId: inst.id, tags: { has: 'uat-leaderboard' } },
  });

  // Subjects, created only if this institute lacks them.
  const subjectRows = [];
  for (const name of SUBJECTS) {
    subjectRows.push(
      (await prisma.subject.findFirst({
        where: { instituteId: inst.id, name },
      })) ??
        (await prisma.subject.create({
          data: { instituteId: inst.id, name },
        })),
    );
  }

  const exam = await prisma.exam.create({
    data: {
      instituteId: inst.id,
      title: TITLE,
      durationMinutes: 60,
      status: 'PUBLISHED',
      startAt: new Date(Date.now() - 3 * 60 * 60_000),
      endAt: new Date(Date.now() - 2 * 60 * 60_000),
      createdById: teacher.id,
    },
  });
  for (const b of [alpha, beta]) {
    await prisma.examBatch.create({
      data: { examId: exam.id, batchId: b.id, instituteId: inst.id },
    });
  }

  /** questionIds[sectionIndex][questionIndex] */
  const questionIds: string[][] = [];
  for (const [i, subject] of subjectRows.entries()) {
    const chapter =
      (await prisma.chapter.findFirst({
        where: { instituteId: inst.id, subjectId: subject.id },
      })) ??
      (await prisma.chapter.create({
        data: {
          instituteId: inst.id,
          subjectId: subject.id,
          name: `${subject.name} Basics`,
        },
      }));

    const section = await prisma.examSection.create({
      data: {
        examId: exam.id,
        instituteId: inst.id,
        name: subject.name,
        order: i,
        marksCorrect: 4,
        marksWrong: 1,
      },
    });

    const ids: string[] = [];
    for (let q = 0; q < 2; q++) {
      const question = await prisma.question.create({
        data: {
          instituteId: inst.id,
          subject: subject.name,
          chapter: chapter.name,
          subjectId: subject.id,
          chapterId: chapter.id,
          difficulty: 'EASY',
          type: 'MCQ',
          language: 'EN',
          statement: `LEADERBOARD-FIXTURE ${subject.name} Q${q + 1}`,
          options: [
            { key: 'A', text: 'Correct' },
            { key: 'B', text: 'Wrong' },
          ],
          answerKey: 'A',
          marks: 4,
          negativeMarks: 1,
          status: 'APPROVED',
          tags: ['uat-leaderboard'],
          createdById: teacher.id,
          approvedById: admin.id,
          approvedAt: new Date(),
        },
      });
      await prisma.examQuestion.create({
        data: {
          examId: exam.id,
          sectionId: section.id,
          questionId: question.id,
          instituteId: inst.id,
          order: q,
        },
      });
      ids.push(question.id);
    }
    questionIds.push(ids);
  }

  const studentPassword = await hash('Student@123');
  const created = [];

  for (const p of PLAN) {
    // Reuse a candidate across runs so their login keeps working.
    let student = await prisma.student.findFirst({
      where: { instituteId: inst.id, rollNumber: p.roll },
      select: { id: true, userId: true },
    });
    if (!student) {
      const user = await prisma.user.create({
        data: {
          instituteId: inst.id,
          name: p.name,
          email: `${p.roll}@uatb.local`,
          roles: ['STUDENT'],
          status: 'ACTIVE',
          passwordHash: studentPassword,
        },
      });
      student = await prisma.student.create({
        data: {
          userId: user.id,
          instituteId: inst.id,
          batchId: batches[p.batch].id,
          rollNumber: p.roll,
        },
        select: { id: true, userId: true },
      });
    }

    const attempt = await prisma.attempt.create({
      data: {
        instituteId: inst.id,
        examId: exam.id,
        studentId: student.id,
        status: 'SUBMITTED',
        startedAt: new Date(Date.now() - 150 * 60_000),
        expiresAt: new Date(Date.now() - 120 * 60_000),
        submittedAt: new Date(Date.now() - 130 * 60_000),
      },
    });

    let expected = 0;
    for (const [si, outcome] of p.outcomes.entries()) {
      const answers = ANSWERS[outcome];
      for (const [qi, answer] of answers.entries()) {
        if (answer === null) continue; // unattempted: no Response row at all
        await prisma.response.create({
          data: {
            attemptId: attempt.id,
            questionId: questionIds[si][qi],
            instituteId: inst.id,
            answer,
            status: 'ANSWERED',
          },
        });
      }
      expected += { CC: 8, CB: 4, CW: 3, BB: 0, WW: -2 }[outcome];
    }

    created.push({
      roll: p.roll,
      name: p.name,
      batch: p.batch,
      attemptId: attempt.id,
      outcomes: p.outcomes,
      expectedTotal: expected,
    });
  }

  /**
   * A second paper, so "the leaderboard opened on the right exam" is a real
   * assertion.
   *
   * With one published paper per candidate, a deep link that ignored its
   * argument and always defaulted to the newest result would still land on the
   * right board — the test could not tell the two apart. This gives the Alpha
   * candidates a prior paper to be wrongly sent to.
   */
  const priorExam = await prisma.exam.create({
    data: {
      instituteId: inst.id,
      title: PRIOR_TITLE,
      durationMinutes: 30,
      status: 'PUBLISHED',
      startAt: new Date(Date.now() - 30 * 24 * 60 * 60_000),
      endAt: new Date(Date.now() - 30 * 24 * 60 * 60_000 + 30 * 60_000),
      createdById: teacher.id,
    },
  });
  await prisma.examBatch.create({
    data: { examId: priorExam.id, batchId: alpha.id, instituteId: inst.id },
  });
  const priorSection = await prisma.examSection.create({
    data: {
      examId: priorExam.id,
      instituteId: inst.id,
      name: subjectRows[0].name,
      order: 0,
      marksCorrect: 4,
      marksWrong: 1,
    },
  });
  const priorChapter = await prisma.chapter.findFirstOrThrow({
    where: { instituteId: inst.id, subjectId: subjectRows[0].id },
  });
  const priorQuestion = await prisma.question.create({
    data: {
      instituteId: inst.id,
      subject: subjectRows[0].name,
      chapter: priorChapter.name,
      subjectId: subjectRows[0].id,
      chapterId: priorChapter.id,
      difficulty: 'EASY',
      type: 'MCQ',
      language: 'EN',
      statement: 'LEADERBOARD-FIXTURE prior paper Q1',
      options: [
        { key: 'A', text: 'Correct' },
        { key: 'B', text: 'Wrong' },
      ],
      answerKey: 'A',
      marks: 4,
      negativeMarks: 1,
      status: 'APPROVED',
      tags: ['uat-leaderboard'],
      createdById: teacher.id,
      approvedById: admin.id,
      approvedAt: new Date(),
    },
  });
  await prisma.examQuestion.create({
    data: {
      examId: priorExam.id,
      sectionId: priorSection.id,
      questionId: priorQuestion.id,
      instituteId: inst.id,
      order: 0,
    },
  });
  for (const c of created.filter((x) => x.batch === 'Alpha')) {
    const student = await prisma.student.findFirstOrThrow({
      where: { instituteId: inst.id, rollNumber: c.roll },
      select: { id: true },
    });
    const priorAttempt = await prisma.attempt.create({
      data: {
        instituteId: inst.id,
        examId: priorExam.id,
        studentId: student.id,
        status: 'SUBMITTED',
        startedAt: new Date(Date.now() - 30 * 24 * 60 * 60_000),
        expiresAt: new Date(Date.now() - 30 * 24 * 60 * 60_000 + 30 * 60_000),
        submittedAt: new Date(Date.now() - 30 * 24 * 60 * 60_000 + 20 * 60_000),
      },
    });
    await prisma.response.create({
      data: {
        attemptId: priorAttempt.id,
        questionId: priorQuestion.id,
        instituteId: inst.id,
        answer: 'A',
        status: 'ANSWERED',
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        examId: exam.id,
        priorExamId: priorExam.id,
        batchIds: { Alpha: alpha.id, Beta: beta.id },
        sections: SUBJECTS,
        maxScore: 24,
        candidates: created,
        expectedRanks: [...created]
          .sort((a, b) => b.expectedTotal - a.expectedTotal)
          .map((c, i) => ({
            rank: i + 1,
            roll: c.roll,
            total: c.expectedTotal,
          })),
        expectedSubjectToppers: {
          Physics: '263000000001',
          Chemistry: '263000000002',
          Biology: '263000000003',
        },
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

void main();

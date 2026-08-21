import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const EXAM_ID = 'd9d553b9-5639-4ff8-9475-eff552b8720b';
  const ROLL = '2610000013';
  const NOW = new Date();
  const inOneSec = new Date(NOW.getTime() + 1000);
  const inThreeHours = new Date(NOW.getTime() + 3 * 60 * 60 * 1000);

  // 1. Widen the window and set passingMarks
  await prisma.exam.update({
    where: { id: EXAM_ID },
    data: {
      passingMarks: 40,
      startAt: inOneSec,
      endAt: inThreeHours,
    },
  });
  console.log('# Updated exam window + passingMarks');

  // 2. Drop any leftover attempts/responses for this exam+student so we start clean
  const student = await prisma.student.findFirstOrThrow({
    where: { rollNumber: ROLL, institute: { slug: 'demo' } },
  });
  await prisma.manualScore.deleteMany({
    where: { examId: EXAM_ID, attempt: { studentId: student.id } },
  });
  await prisma.response.deleteMany({
    where: { attempt: { examId: EXAM_ID, studentId: student.id } },
  });
  await prisma.attemptSectionTime.deleteMany({
    where: { attempt: { examId: EXAM_ID, studentId: student.id } },
  });
  await prisma.attempt.deleteMany({
    where: { examId: EXAM_ID, studentId: student.id },
  });
  console.log('# Cleared prior attempts for', ROLL);

  // 3. Drop any leftover result rows for the same (so the cohort re-tallies)
  await prisma.result.updateMany({
    where: { examId: EXAM_ID, published: false },
    data: { publishedAt: null },
  });
  console.log('# OK');

  console.log('# EXAM_ID=', EXAM_ID);
  console.log('# STUDENT_ROLL=', ROLL);
  console.log('# STUDENT_INSTITUTE= demo');
  console.log('# STUDENT_PASSWORD= Student@123');
}

main().finally(() => prisma.$disconnect());

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const EXAM_ID = 'd9d553b9-5639-4ff8-9475-eff552b8720b';
  const ROLL = '2610000013';
  const student = await prisma.student.findFirstOrThrow({
    where: { rollNumber: ROLL, institute: { slug: 'demo' } },
  });
  console.log('STUDENT batchId:', student.batchId);
  // Idempotent — many other batches are already attached.
  const existing = await prisma.examBatch.findFirst({
    where: { examId: EXAM_ID, batchId: student.batchId },
  });
  if (existing) {
    console.log('Already assigned.');
  } else {
    await prisma.examBatch.create({
      data: {
        examId: EXAM_ID,
        batchId: student.batchId,
        instituteId: student.instituteId,
      },
    });
    console.log('Assigned.');
  }
}

main().finally(() => prisma.$disconnect());

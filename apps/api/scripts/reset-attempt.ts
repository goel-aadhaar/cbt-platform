import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  // Reset any prior attempts by the target student on the target exam.
  const student = await prisma.student.findFirstOrThrow({
    where: { rollNumber: '2610000013', institute: { slug: 'demo' } },
  });
  const exam = await prisma.exam.findFirstOrThrow({
    where: { title: 'NEET Grand Test 03', instituteId: student.instituteId },
  });
  const del = await prisma.attempt.deleteMany({
    where: { examId: exam.id, studentId: student.id },
  });
  console.log('Deleted', del.count, 'prior attempts');
}

main().finally(() => prisma.$disconnect());

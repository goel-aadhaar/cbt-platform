import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
async function main() {
  const mine = await prisma.student.findFirstOrThrow({
    where: { rollNumber: '2610000001', institute: { slug: 'demo' } },
  });
  const other = await prisma.attempt.findFirst({
    where: {
      studentId: { not: mine.id },
      status: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
    },
    select: {
      id: true,
      studentId: true,
      student: { select: { rollNumber: true } },
      result: { select: { published: true } },
    },
  });
  console.log(JSON.stringify({ myStudentId: mine.id, other }, null, 2));
}
main().finally(() => prisma.$disconnect());

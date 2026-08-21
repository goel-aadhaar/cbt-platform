import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const inst = await prisma.institute.findFirstOrThrow({
    where: { slug: 'demo' },
  });
  const exam = await prisma.exam.findFirstOrThrow({
    where: { instituteId: inst.id, title: 'NEET Grand Test 03' },
    include: {
      sections: {
        select: {
          id: true,
          name: true,
          _count: { select: { questions: true } },
        },
      },
    },
  });
  const used = new Set(
    (
      await prisma.attempt.findMany({
        where: { examId: exam.id },
        select: { student: { select: { rollNumber: true } } },
      })
    ).map((a) => a.student.rollNumber),
  );
  const all = await prisma.student.findMany({
    where: { instituteId: inst.id },
    orderBy: { rollNumber: 'asc' },
    select: {
      rollNumber: true,
      batchId: true,
      user: { select: { name: true } },
    },
  });
  const free = all.filter((s) => !used.has(s.rollNumber));
  console.log(
    '# Exam:',
    exam.id,
    exam.title,
    'status=',
    exam.status,
    'passingMarks=',
    exam.passingMarks,
  );
  console.log(
    '# start/end:',
    exam.startAt?.toISOString(),
    exam.endAt?.toISOString(),
  );
  console.log(
    '# Sections:',
    exam.sections.length,
    '—',
    exam.sections.map((s) => s.name).join(', '),
  );
  console.log('# Used:', used.size, 'Free:', free.length);
  console.log('# First 5 free candidates:');
  for (const s of free.slice(0, 5))
    console.log(`  ${s.rollNumber}  ${s.user.name}  batchId=${s.batchId}`);
}

main().finally(() => prisma.$disconnect());

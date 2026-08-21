import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const ATTEMPT_ID = process.argv[2];
  if (!ATTEMPT_ID) {
    console.log('Usage: verify-result-data.ts <ATTEMPT_ID>');
    return;
  }

  const attempt = await prisma.attempt.findUniqueOrThrow({
    where: { id: ATTEMPT_ID },
    include: {
      student: {
        select: { rollNumber: true, user: { select: { name: true } } },
      },
      exam: {
        select: { title: true, passingMarks: true, durationMinutes: true },
      },
      responses: {
        orderBy: { questionId: 'asc' },
      },
      sectionTimes: true,
    },
  });

  console.log('================================================');
  console.log('ATTEMPT', attempt.id);
  console.log(
    '  student',
    attempt.student.rollNumber,
    attempt.student.user.name,
  );
  console.log(
    '  exam',
    attempt.exam.title,
    'passing=' + attempt.exam.passingMarks,
    'dur=' + attempt.exam.durationMinutes + 'min',
  );
  console.log(
    '  status=' + attempt.status,
    'submittedAt=' + (attempt.submittedAt?.toISOString() ?? 'null'),
  );
  console.log('  started=', attempt.startedAt.toISOString());
  console.log(
    '  total wall=',
    ((attempt.submittedAt ?? new Date()).getTime() -
      attempt.startedAt.getTime()) /
      1000,
    's',
  );

  console.log('\n== RESPONSES (per-question timeSpentMs + status) ==');
  const haveTimes = attempt.responses.filter((r) => r.timeSpentMs !== null);
  console.log(
    '  total responses:',
    attempt.responses.length,
    'with timeSpentMs:',
    haveTimes.length,
  );
  for (const r of attempt.responses) {
    console.log(
      `  q=${r.questionId.slice(0, 8)}  status=${r.status.padEnd(20)} timeSpentMs=${r.timeSpentMs ?? 'null'}  answer=${JSON.stringify(r.answer).slice(0, 40)}`,
    );
  }
  if (haveTimes.length > 0) {
    const ms = haveTimes.map((r) => r.timeSpentMs!);
    console.log(
      '  min/median/max ms:',
      Math.min(...ms),
      '/',
      ms.sort((a, b) => a - b)[Math.floor(ms.length / 2)],
      '/',
      Math.max(...ms),
    );
  }

  console.log('\n== ATTEMPT SECTION TIMINGS ==');
  for (const s of attempt.sectionTimes) {
    console.log(`  section=${s.sectionId.slice(0, 8)}  seconds=${s.seconds}`);
  }
}

main().finally(() => prisma.$disconnect());

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const aid = process.argv[2];
  if (!aid) {
    console.log('Usage: tsx scripts/dump-raw.ts <ATTEMPT_ID>');
    return;
  }

  const rows = await prisma.response.findMany({
    where: { attemptId: aid },
    select: { questionId: true, status: true, timeSpentMs: true, answer: true },
  });

  const withTime = rows.filter((r) => r.timeSpentMs !== null);
  const touched = rows.filter((r) => r.status !== 'NOT_VISITED');

  console.log('SUMMARY for', aid);
  console.log('  total responses :', rows.length);
  console.log('  status != NOT_VISITED :', touched.length);
  console.log('  timeSpentMs non-null  :', withTime.length);
  if (withTime.length) {
    const ms = withTime.map((r) => r.timeSpentMs!).sort((a, b) => a - b);
    console.log(
      '  ms min/med/max :',
      ms[0],
      ms[Math.floor(ms.length / 2)],
      ms[ms.length - 1],
    );
  }
  console.log('  ---- touched rows ----');
  for (const r of touched) {
    console.log(
      `   ${r.questionId.slice(0, 8)}  ${r.status.padEnd(16)} ms=${String(r.timeSpentMs).padStart(7)}  ans=${JSON.stringify(r.answer)}`,
    );
  }

  const sec = await prisma.attemptSectionTime.findMany({
    where: { attemptId: aid },
    select: { sectionId: true, seconds: true },
  });
  console.log('  ---- section times ----');
  for (const s of sec)
    console.log(`   ${s.sectionId.slice(0, 8)} = ${s.seconds}s`);

  const result = await prisma.result.findFirst({ where: { attemptId: aid } });
  console.log(
    '  ---- result ----\n   ',
    result
      ? `published=${result.published} publishedAt=${result.publishedAt?.toISOString() ?? 'null'} score=${result.totalScore}/${result.maxScore} sections=${(result.sectionScores as unknown as unknown[])?.length}`
      : 'NONE',
  );
}

main().finally(() => prisma.$disconnect());

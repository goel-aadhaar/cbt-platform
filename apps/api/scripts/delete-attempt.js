/**
 * Dev helper: delete one attempt by id, so a candidate can sit an exam again.
 *
 *   node --env-file=.env scripts/delete-attempt.js <attemptId>
 *
 * Cascades to responses, result, proctoring events, section times and manual
 * scores (prisma/schema/attempt.prisma). Requires `pnpm build` — see
 * reset-biology.js for why this runs against dist/.
 */
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../dist/generated/prisma/client');

(async () => {
  const id = process.argv[2];
  if (!id) throw new Error('Usage: node scripts/delete-attempt.js <attemptId>');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const attempt = await prisma.attempt.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      exam: { select: { title: true } },
      student: {
        select: { rollNumber: true, user: { select: { name: true } } },
      },
    },
  });
  if (!attempt) {
    console.log('No attempt with that id.');
  } else {
    await prisma.attempt.delete({ where: { id } });
    console.log(
      `deleted "${attempt.exam.title}" — ${attempt.student.user.name} (${attempt.student.rollNumber}) [${attempt.status}]`,
    );
  }
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

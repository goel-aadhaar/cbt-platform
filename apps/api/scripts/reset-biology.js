/**
 * Dev helper: clear the Biology attempts, reopen that exam's window, and add a
 * fresh candidate to test with. Not part of the app.
 *
 *   node --env-file=.env scripts/reset-biology.js
 *
 * Plain JS against dist/ because the generated Prisma client uses explicit
 * `.js` specifiers that ts-node will not resolve from source (the same quirk
 * the Jest config works around with a moduleNameMapper). Requires `pnpm build`.
 *
 * Deleting an Attempt cascades to its responses, result, proctoring events,
 * section times and manual scores (prisma/schema/attempt.prisma), so removing
 * the attempt row is enough.
 */
const { PrismaPg } = require('@prisma/adapter-pg');
const { hash } = require('@node-rs/argon2');
const { PrismaClient } = require('../dist/generated/prisma/client');

const INSTITUTE_SLUG = 'demo';
const STUDENT_PASSWORD = 'Student@123';
const TARGET_EXAM = 'Biology Full Syllabus Test';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  const institute = await prisma.institute.findUnique({
    where: { slug: INSTITUTE_SLUG },
    select: { id: true, name: true },
  });
  if (!institute) throw new Error(`Institute "${INSTITUTE_SLUG}" not found`);

  /* 1. clear Biology attempts */
  const exams = await prisma.exam.findMany({
    where: { instituteId: institute.id, title: { contains: 'Biolog' } },
    select: { id: true, title: true, durationMinutes: true },
  });
  const attempts = await prisma.attempt.findMany({
    where: { examId: { in: exams.map((e) => e.id) } },
    select: {
      id: true,
      status: true,
      exam: { select: { title: true } },
      student: {
        select: { rollNumber: true, user: { select: { name: true } } },
      },
    },
  });
  for (const a of attempts) {
    console.log(
      `  removing "${a.exam.title}" — ${a.student.user.name} (${a.student.rollNumber}) [${a.status}]`,
    );
  }
  const removed = await prisma.attempt.deleteMany({
    where: { id: { in: attempts.map((a) => a.id) } },
  });
  console.log(`deleted ${removed.count} attempt(s)`);

  /* 2. reopen the window */
  const target = exams.find((e) => e.title === TARGET_EXAM) || exams[0];
  if (target) {
    const now = new Date();
    // A few minutes in the past so it is unambiguously live, with a generous
    // tail so the window cannot close mid-test.
    const startAt = new Date(now.getTime() - 5 * 60000);
    const endAt = new Date(
      now.getTime() + (target.durationMinutes + 180) * 60000,
    );
    await prisma.exam.update({
      where: { id: target.id },
      data: { startAt, endAt, status: 'PUBLISHED' },
    });
    console.log(`\n"${target.title}" is live now`);
    console.log(`  window: ${startAt.toISOString()} -> ${endAt.toISOString()}`);
    console.log(`  duration: ${target.durationMinutes} min`);
  }

  /* 3. add a candidate */
  // Clean up a placeholder from a previous bad run, so re-running is safe.
  const stale = await prisma.student.findFirst({
    where: { instituteId: institute.id, rollNumber: 'NaN' },
    select: { id: true, userId: true },
  });
  if (stale) {
    await prisma.student.delete({ where: { id: stale.id } });
    await prisma.user.delete({ where: { id: stale.userId } });
    console.log('\nremoved a stale placeholder student');
  }

  const batch = await prisma.batch.findFirst({
    where: { instituteId: institute.id },
    select: { id: true, name: true },
  });
  if (!batch) throw new Error('No batch to place the student in');

  // rollNumber is TEXT, and this tenant also holds load-test rolls that are
  // not numeric, so ordering by it as a string picks the wrong "highest" and
  // yields NaN. Take the max of the numeric rolls only.
  const rolls = await prisma.student.findMany({
    where: { instituteId: institute.id },
    select: { rollNumber: true },
  });
  const numeric = rolls
    .map((r) => r.rollNumber)
    .filter((r) => /^\d+$/.test(r))
    .map(Number);
  const nextRoll = String(Math.max(2400183919, ...numeric) + 1);

  const admin = await prisma.user.findFirst({
    where: { instituteId: institute.id, role: 'ADMIN' },
    select: { id: true },
  });

  const email = `test.candidate.${nextRoll}@demo.local`;
  // Same hasher the app verifies with (PasswordService -> @node-rs/argon2).
  const passwordHash = await hash(STUDENT_PASSWORD);

  const user = await prisma.user.create({
    data: {
      name: 'Test Candidate',
      email,
      role: 'STUDENT',
      status: 'ACTIVE',
      passwordHash,
      instituteId: institute.id,
      invitedById: admin ? admin.id : undefined,
    },
  });
  await prisma.student.create({
    data: {
      userId: user.id,
      instituteId: institute.id,
      batchId: batch.id,
      rollNumber: nextRoll,
    },
  });

  console.log('\n--- new candidate ---');
  console.log('  Institute ID :', INSTITUTE_SLUG);
  console.log('  Candidate ID :', nextRoll);
  console.log('  Password     :', STUDENT_PASSWORD);
  console.log('  Name         :', user.name);
  console.log('  Email        :', email);
  console.log('  Batch        :', batch.name);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

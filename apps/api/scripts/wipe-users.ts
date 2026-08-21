/**
 * Delete every user except one superadmin.
 *
 * ## What this removes, and why it is more than "users"
 *
 * Almost every content table hangs off its author with `onDelete: Cascade`:
 * `Question.createdBy`, `Exam.createdBy`, `Media.uploadedBy`,
 * `Announcement.createdBy`, `ExamCategory.createdBy`,
 * `InstructionTemplate.createdBy`, `ImportRun.createdBy`, and `Student.user`
 * (which cascades on to attempts, responses, results and manual scores).
 *
 * So deleting the users empties the platform's *content* as well. What survives
 * is the organisational scaffolding, which has no author FK: institutes,
 * programs, classes, batches, subjects, chapters and topics — plus the audit
 * log, whose `actorId` is a plain nullable column with no foreign key, so the
 * record of what was done outlives the accounts that did it.
 *
 * ## Safety
 *
 * Runs a preview first and requires `--confirm` to actually delete, because the
 * database this points at is the one the deployment serves and its point-in-time
 * recovery has never been verified. Take a dump first.
 *
 *   npx tsx --env-file=.env scripts/wipe-users.ts --keep superadmin@drsk.local
 *   npx tsx --env-file=.env scripts/wipe-users.ts --keep superadmin@drsk.local --confirm
 */
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function counts() {
  return {
    users: await prisma.user.count(),
    students: await prisma.student.count(),
    questions: await prisma.question.count(),
    exams: await prisma.exam.count(),
    attempts: await prisma.attempt.count(),
    responses: await prisma.response.count(),
    results: await prisma.result.count(),
    media: await prisma.media.count(),
    announcements: await prisma.announcement.count(),
    examCategories: await prisma.examCategory.count(),
    sessions: await prisma.session.count(),
    institutes: await prisma.institute.count(),
    batches: await prisma.batch.count(),
    subjects: await prisma.subject.count(),
    auditLogs: await prisma.auditLog.count(),
  };
}

async function main() {
  const keepEmail = arg('keep');
  const confirmed = process.argv.includes('--confirm');
  if (!keepEmail) {
    throw new Error('Pass --keep <email> naming the superadmin to preserve');
  }

  const keeper = await prisma.user.findFirst({
    where: { email: keepEmail },
    select: { id: true, email: true, name: true, roles: true, status: true },
  });
  if (!keeper) throw new Error(`No user with email ${keepEmail}`);
  if (!keeper.roles.includes('SUPERADMIN')) {
    // Refuse rather than proceed: keeping a non-superadmin would leave nobody
    // able to administer the platform, and that is not recoverable from here.
    throw new Error(
      `${keepEmail} is not a SUPERADMIN (roles: ${keeper.roles.join(', ')}). ` +
        'Keeping it would leave the platform with no administrator.',
    );
  }

  const before = await counts();
  const doomed = await prisma.user.count({ where: { id: { not: keeper.id } } });

  console.log('KEEPING');
  console.log(
    `  ${keeper.email}  "${keeper.name}"  ${keeper.roles.join('+')}  ${keeper.status}\n`,
  );
  console.log(`DELETING ${doomed} user(s), which cascades to:`);
  for (const [k, v] of Object.entries(before)) {
    console.log(`  ${k.padEnd(16)} ${v}`);
  }

  if (!confirmed) {
    console.log('\nPreview only. Re-run with --confirm to delete.');
    return;
  }

  // One statement: the cascade does the rest, and a partial delete would leave
  // the database in a state nobody designed.
  const deleted = await prisma.user.deleteMany({
    where: { id: { not: keeper.id } },
  });

  const after = await counts();
  console.log(`\nDELETED ${deleted.count} user rows.\n`);
  console.log('AFTER');
  for (const [k, v] of Object.entries(after)) {
    const was = before[k as keyof typeof before];
    console.log(`  ${k.padEnd(16)} ${String(v).padStart(5)}   (was ${was})`);
  }

  const survivors = await prisma.user.findMany({
    select: { email: true, roles: true, status: true },
  });
  console.log('\nREMAINING USERS:');
  for (const s of survivors) {
    console.log(`  ${s.email}  ${s.roles.join('+')}  ${s.status}`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

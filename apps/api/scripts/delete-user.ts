import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg('email')?.trim().toLowerCase();
  const confirmed = process.argv.includes('--confirm');
  if (!email) throw new Error('Usage: --email <address> [--confirm]');

  const user = await prisma.user.findFirst({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      roles: true,
      status: true,
      instituteId: true,
      createdAt: true,
      student: { select: { id: true, rollNumber: true } },
    },
  });
  if (!user) {
    console.log(`No user with email ${email}`);
    return;
  }
  if (user.roles.includes('SUPERADMIN')) {
    throw new Error(`${email} is a SUPERADMIN. Refusing to delete it.`);
  }

  const sid = user.student?.id ?? null;
  const counts = await prisma.$transaction(async (tx) => ({
    sessions: await tx.session.count({ where: { userId: user.id } }),
    otpChallenges: await tx.otpChallenge.count({ where: { userId: user.id } }),
    attempts: sid ? await tx.attempt.count({ where: { studentId: sid } }) : 0,
    responses: sid
      ? await tx.response.count({ where: { attempt: { studentId: sid } } })
      : 0,
    results: sid ? await tx.result.count({ where: { studentId: sid } }) : 0,
    questionsAuthored: await tx.question.count({
      where: { createdById: user.id },
    }),
    examsAuthored: await tx.exam.count({ where: { createdById: user.id } }),
    announcementsAuthored: await tx.announcement.count({
      where: { createdById: user.id },
    }),
    mediaUploaded: await tx.media.count({ where: { uploadedById: user.id } }),
  }));

  console.log('TARGET');
  console.log(
    `  ${user.email}  "${user.name}"  ${user.roles.join('+')}  ${user.status}`,
  );
  console.log(`  id=${user.id}  created=${user.createdAt.toISOString()}`);
  if (user.student)
    console.log(
      `  student=${user.student.rollNumber}  (id=${user.student.id})`,
    );
  console.log('\nWILL CASCADE-DELETE:');
  for (const [k, v] of Object.entries(counts))
    console.log(`  ${k.padEnd(22)} ${v}`);

  if (!confirmed) {
    console.log('\nPreview only. Re-run with --confirm to delete.');
    return;
  }

  await prisma.user.delete({ where: { id: user.id } });
  console.log(`\nDeleted user ${user.email} (id=${user.id}).`);

  const gone = await prisma.user.findFirst({
    where: { email },
    select: { id: true },
  });
  console.log(
    gone ? 'VERIFY: still present.' : 'VERIFY: no row matches that email.',
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

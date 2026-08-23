/**
 * Remove the isolated `uatb` test tenant that `uat-fixture.ts` creates.
 *
 * The fixture drops and recreates that tenant every run, but nothing ever
 * removed it afterwards — so a verification run leaves "UAT Tenant B" sitting
 * in the superadmin tenant list. This is the other half of that pair.
 *
 * Deletes ONLY the institute whose slug is `uatb`, and everything that cascades
 * from it. It cannot touch a real tenant: the slug is hardcoded, not an
 * argument.
 */
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';

const SLUG = 'uatb';

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  const inst = await prisma.institute.findUnique({ where: { slug: SLUG } });
  if (!inst) {
    console.log(`No "${SLUG}" tenant to remove.`);
    await prisma.$disconnect();
    return;
  }

  // Audit rows are deliberately not cascaded from the institute, so they are
  // cleared first — same order uat-fixture.ts uses when it recreates.
  await prisma.auditLog.deleteMany({ where: { instituteId: inst.id } });
  await prisma.institute.delete({ where: { id: inst.id } });

  const remaining = await prisma.institute.findMany({
    select: { slug: true, name: true },
    orderBy: { slug: 'asc' },
  });
  console.log(`Removed "${SLUG}" (${inst.id}).`);
  console.log('Institutes remaining:');
  for (const i of remaining) console.log(`  ${i.slug} — ${i.name}`);

  await prisma.$disconnect();
}

void main();

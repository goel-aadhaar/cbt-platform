/**
 * Evaluate + publish the verification exam by calling the real service, so the
 * evaluate() path (section maxScore/questionCount, publishedAt) is exercised
 * exactly as an admin's API call would exercise it.
 */
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { ResultsService } from '../src/modules/results/results.service';
import { TenantContextService } from '../src/modules/auth/tenant/tenant-context.service';
import { PrismaService } from '../src/database/prisma.service';

const EXAM_ID = 'd9d553b9-5639-4ff8-9475-eff552b8720b';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const prisma = app.get(PrismaService);
  const results = app.get(ResultsService);
  const tenant = app.get(TenantContextService);

  const exam = await prisma.exam.findUniqueOrThrow({
    where: { id: EXAM_ID },
    select: { instituteId: true, createdById: true },
  });

  // The services read tenant + actor from AsyncLocalStorage; run inside it.
  await tenant.run(
    {
      instituteId: exam.instituteId,
      userId: exam.createdById,
      role: 'ADMIN' as never,
      isSuperadmin: false,
    },
    async () => {
      const ev = await results.evaluate(EXAM_ID);
      console.log('evaluate ->', JSON.stringify(ev));
      const pub = await results.publish(EXAM_ID);
      console.log('publish  ->', JSON.stringify(pub));
    },
  );

  await app.close();
}

main().catch((e) => {
  console.error('FAIL:', e?.message ?? e);
  process.exit(1);
});

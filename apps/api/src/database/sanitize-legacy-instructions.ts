import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { sanitizeRichText } from '../common/html/sanitize-html';
import { PrismaService } from './prisma.service';

/**
 * One-off backfill: exam instructions predate the Tiptap editor and were
 * stored as unsanitized plain text (§ exam authoring rich-text). The student
 * instructions modal now renders `instructions` via `dangerouslySetInnerHTML`
 * — safe for anything freshly saved (sanitized on write in
 * `ExamsService.create`/`update`), but a legacy row containing a literal `<`
 * or `&` would otherwise be reinterpreted as HTML the first time it's viewed.
 * Idempotent — re-running it after every row is already sanitized is a no-op.
 *
 * Run once, after deploying this change, against each environment:
 *   `pnpm --filter @drsk/api build && node dist/database/sanitize-legacy-instructions.js`
 */
async function run(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);

  const rows = await prisma.exam.findMany({
    where: { instructions: { not: null } },
    select: { id: true, instructions: true },
  });

  let changed = 0;
  for (const row of rows) {
    const sanitized = sanitizeRichText(row.instructions!);
    if (sanitized !== row.instructions) {
      await prisma.exam.update({
        where: { id: row.id },
        data: { instructions: sanitized },
      });
      changed++;
    }
  }

  console.log(
    `Checked ${rows.length} exam(s) with instructions; sanitized ${changed}.`,
  );
  await app.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

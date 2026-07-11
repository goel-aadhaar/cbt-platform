import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { PasswordService } from '../modules/auth/password.service';
import { PrismaService } from './prisma.service';

/**
 * Seeds the first SUPERADMIN. There's no one to invite the initial superadmin,
 * so it's created directly (ACTIVE, with a password). Everyone else is created
 * via the invitation flow.
 *
 * Run: `pnpm --filter @drsk/api db:seed` (build first).
 * Override defaults with SEED_SUPERADMIN_EMAIL / SEED_SUPERADMIN_PASSWORD.
 */
async function seed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const prisma = app.get(PrismaService);
  const passwords = app.get(PasswordService);

  const email = process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@drsk.local';
  const password = process.env.SEED_SUPERADMIN_PASSWORD ?? 'ChangeMe123!';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Superadmin ${email} already exists — skipping.`);
  } else {
    const passwordHash = await passwords.hash(password);
    await prisma.user.create({
      data: {
        name: 'Super Admin',
        email,
        role: 'SUPERADMIN',
        status: 'ACTIVE',
        passwordHash,
      },
    });
    console.log(`Created superadmin ${email} (password: ${password})`);
  }

  await app.close();
}

void seed();

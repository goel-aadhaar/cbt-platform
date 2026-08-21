import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

async function main() {
  const url = process.env.DATABASE_URL!;
  console.log('DB URL host:', url.match(/ep-[^.]+/)?.[0]);
  const p = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  const r: any = await p.$queryRawUnsafe(
    'SELECT current_database() as db, inet_server_addr() as addr',
  );
  console.log('DB info:', r);
  const a = await p.attempt.findUnique({
    where: { id: '66830098-d53d-4064-8913-b56b2acbc116' },
    select: { id: true, status: true },
  });
  console.log('attempt via ORM:', a);
  const raw: any = await p.$queryRawUnsafe(
    "SELECT id, status FROM attempts WHERE id = '66830098-d53d-4064-8913-b56b2acbc116'",
  );
  console.log('attempt via raw:', raw);
  await p.$disconnect();
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});

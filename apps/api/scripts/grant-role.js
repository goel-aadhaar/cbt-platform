/**
 * Dev helper: grant or revoke a role on an existing account.
 *
 *   node --env-file=.env scripts/grant-role.js <email> add|remove <ROLE>
 *
 * Roles are held as a set (users.roles); which one a session ACTS as is chosen
 * at sign-in. Requires `pnpm build` — see reset-biology.js for why this runs
 * against dist/.
 */
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../dist/generated/prisma/client');

(async () => {
  const [email, action, role] = process.argv.slice(2);
  if (!email || !['add', 'remove'].includes(action) || !role) {
    throw new Error('Usage: grant-role.js <email> add|remove <ROLE>');
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, roles: true },
  });
  if (!user) throw new Error(`No user with email ${email}`);

  const next =
    action === 'add'
      ? [...new Set([...user.roles, role])]
      : user.roles.filter((r) => r !== role);

  if (next.length === 0) {
    throw new Error('That would leave the account with no roles at all.');
  }

  await prisma.user.update({ where: { id: user.id }, data: { roles: next } });
  console.log(`${user.name} <${email}>`);
  console.log(`  ${user.roles.join(', ')}  ->  ${next.join(', ')}`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

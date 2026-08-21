/**
 * Change one account's email address.
 *
 * ## Why this exists as a script
 *
 * Nothing in the product can change an account's email — not the platform
 * console, not the admin console, not a self-service profile screen. That is
 * fine for accounts created by invitation, because the address is where the
 * invitation went, so it is correct by construction.
 *
 * It stops being fine for the seeded platform owner. `superadmin@drsk.local`
 * is not a routable address: `.local` is reserved for mDNS and no mail will
 * ever reach it. Staff sign-in is two-factor, so on a deployment with SES
 * configured that account cannot complete a login at all — SES in its sandbox
 * refuses the unverified recipient, and even out of the sandbox the message
 * would simply bounce. The only way out is to point the account at a mailbox
 * someone actually owns.
 *
 * ## What it deliberately does not do
 *
 * It does not verify the new address. SES decides what it will deliver to, and
 * this script has no way to know whether the account is still in the sandbox.
 * Verify the address in SES first, then run this.
 *
 * Live sessions are left alone: a changed email does not invalidate a session,
 * and revoking one here would sign the operator out mid-repair.
 *
 *   npx tsx --env-file=.env scripts/set-user-email.ts \
 *     --from superadmin@drsk.local --to you@your-domain.com
 *   ... --confirm
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

async function main() {
  const from = arg('from');
  const to = arg('to')?.trim().toLowerCase();
  const confirmed = process.argv.includes('--confirm');

  if (!from || !to) {
    throw new Error(
      'Usage: --from <current-email> --to <new-email> [--confirm]',
    );
  }
  // Not a validator, just a guard against the obvious slip of passing a name
  // or a roll number. The mail provider is the real authority on deliverability.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    throw new Error(`"${to}" is not an email address`);
  }
  if (/\.local$/i.test(to)) {
    throw new Error(
      `"${to}" ends in .local, which is reserved for local network discovery ` +
        'and can never receive mail. That is the problem this script fixes, ' +
        'so pointing the account at another one would achieve nothing.',
    );
  }

  const user = await prisma.user.findFirst({
    where: { email: from },
    select: { id: true, email: true, name: true, roles: true, status: true },
  });
  if (!user) throw new Error(`No user with email ${from}`);

  const clash = await prisma.user.findFirst({
    where: { email: to },
    select: { id: true },
  });
  if (clash && clash.id !== user.id) {
    throw new Error(`${to} is already used by another account`);
  }

  console.log(`  ${user.name}  ${user.roles.join('+')}  ${user.status}`);
  console.log(`  ${user.email}  ->  ${to}`);

  if (!confirmed) {
    console.log('\nPreview only. Re-run with --confirm to apply.');
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { email: to } });
  console.log(
    '\nUpdated. Sign in with the new address; the password is unchanged.',
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

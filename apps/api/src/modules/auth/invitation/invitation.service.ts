import { createHash, randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AuthConfig } from '../../../config/auth.config';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { AuthUser } from '../auth.types';
import { Role, UserStatus } from '../auth.types';
import { MailService } from '../mail/mail.service';
import { PasswordService } from '../password.service';

const MAX_ROLL_ATTEMPTS = 5;

/**
 * Ceiling for the invitation transaction, which now spans the email.
 *
 * Prisma's default is five seconds, and a cold SES call can exceed that on its
 * own — the transaction would abort on a message that had actually been sent.
 * Long enough for a slow provider, short enough that a hung one does not hold a
 * connection all day.
 */
const INVITE_TX_TIMEOUT_MS = 20_000;

export interface InvitedUser {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  status: UserStatus;
  /** Present only for a student invite — the server-generated roll number. */
  rollNumber?: string;
}

export interface AcceptInviteResult {
  email: string;
  name: string;
  role: Role;
  /** Absent for a superadmin account. */
  institute: { name: string; slug: string } | null;
  /** Present only for a student account. */
  rollNumber?: string;
}

interface CreateInvitationParams {
  name: string;
  email: string;
  /** An invitation grants exactly one role; extra roles are granted later. */
  roles: Role[];
  instituteId: string;
  instituteName: string;
  invitedById: string;
  student?: { rollNumber: string; batchId: string };
  teacherBatchIds?: string[];
}

@Injectable()
export class InvitationService {
  private readonly logger = new Logger(InvitationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * A SUPERADMIN names the institute explicitly (they have none of their
   * own); an ADMIN's own institute is used instead, regardless of what
   * `params.instituteId` says — an admin cannot invite themselves into
   * another tenant by passing a different id.
   */
  async inviteAdmin(
    actor: Pick<AuthUser, 'userId' | 'role' | 'instituteId'>,
    params: { name: string; email: string; instituteId?: string },
  ): Promise<InvitedUser> {
    const targetInstituteId =
      actor.role === Role.SUPERADMIN ? params.instituteId : actor.instituteId;
    if (!targetInstituteId) {
      throw new BadRequestException(
        actor.role === Role.SUPERADMIN
          ? 'instituteId is required'
          : 'No institute in the current context',
      );
    }

    const institute = await this.prisma.institute.findUnique({
      where: { id: targetInstituteId },
    });
    if (!institute) {
      throw new NotFoundException(
        `No institute with id ${targetInstituteId}. It may have been deleted ` +
          `since this page was loaded.`,
      );
    }

    return this.guard(
      () =>
        this.createInvitation({
          name: params.name,
          email: params.email,
          roles: [Role.ADMIN],
          instituteId: institute.id,
          instituteName: institute.name,
          invitedById: actor.userId,
        }),
      params.email,
    );
  }

  async inviteTeacher(
    inviterInstituteId: string | null,
    invitedById: string,
    params: { name: string; email: string; batchIds?: string[] },
  ): Promise<InvitedUser> {
    const institute = await this.requireInstitute(inviterInstituteId);

    if (params.batchIds?.length) {
      const found = await this.prisma.batch.count({
        where: { id: { in: params.batchIds }, instituteId: institute.id },
      });
      if (found !== params.batchIds.length) {
        throw new BadRequestException(
          `${params.batchIds.length - found} of the ${params.batchIds.length} ` +
            `selected batch(es) do not exist in your institute. Reload the ` +
            `page and choose again.`,
        );
      }
    }

    return this.guard(
      () =>
        this.createInvitation({
          name: params.name,
          email: params.email,
          roles: [Role.TEACHER],
          instituteId: institute.id,
          instituteName: institute.name,
          invitedById,
          teacherBatchIds: params.batchIds,
        }),
      params.email,
    );
  }

  /**
   * The roll number is never caller-supplied — it is always generated as
   * {yy}{institute code}{4-digit sequence}, the sequence resetting every
   * year per institute (§2.10). A resurrected lapsed invite (same email,
   * already has a Student row) keeps its existing roll number rather than
   * being issued a new one — re-sending an invite must not change the
   * candidate's login identifier.
   */
  async inviteStudent(
    inviterInstituteId: string | null,
    invitedById: string,
    params: {
      name: string;
      email: string;
      batchId: string;
    },
  ): Promise<InvitedUser> {
    const institute = await this.requireInstitute(inviterInstituteId);

    const batch = await this.prisma.batch.findFirst({
      where: { id: params.batchId, instituteId: institute.id },
    });
    if (!batch) {
      throw new BadRequestException(
        'That batch does not exist in your institute. It may have been ' +
          'renamed or archived — reload the page and pick it again.',
      );
    }

    const existingStudent = await this.prisma.student.findFirst({
      where: { instituteId: institute.id, user: { email: params.email } },
      select: { rollNumber: true },
    });

    return this.guard(
      () =>
        this.inviteStudentWithRetry(
          institute,
          params,
          invitedById,
          existingStudent,
        ),
      params.email,
    );
  }

  /** The roll-number race retry, kept separate so `guard` wraps only its result. */
  private async inviteStudentWithRetry(
    institute: { id: string; name: string; code: string },
    params: { name: string; email: string; batchId: string },
    invitedById: string,
    existingStudent: { rollNumber: string } | null,
  ): Promise<InvitedUser> {
    for (let attempt = 1; attempt <= MAX_ROLL_ATTEMPTS; attempt++) {
      const rollNumber =
        existingStudent?.rollNumber ??
        (await this.nextRollNumber(institute.id, institute.code));
      try {
        return await this.createInvitation({
          name: params.name,
          email: params.email,
          roles: [Role.STUDENT],
          instituteId: institute.id,
          instituteName: institute.name,
          invitedById,
          student: { rollNumber, batchId: params.batchId },
        });
      } catch (err) {
        // A concurrent invite claimed the same computed roll number first —
        // retry with a freshly-recomputed one. Never applies to a
        // resurrected invite's own existing roll number, which cannot
        // collide with anything but itself.
        const lostRace =
          !existingStudent &&
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002';
        if (!lostRace || attempt === MAX_ROLL_ATTEMPTS) throw err;
      }
    }
    // Unreachable — the loop above always returns or throws.
    throw new Error('Could not allocate a roll number');
  }

  /**
   * Next free roll number for this institute this year:
   * {yy}{code}{sequence}. The sequence is the highest existing suffix for
   * this institute+year plus one, so it stays contiguous even if an earlier
   * student was later deactivated.
   */
  private async nextRollNumber(
    instituteId: string,
    code: string,
  ): Promise<string> {
    const yy = String(new Date().getFullYear() % 100).padStart(2, '0');
    const prefix = `${yy}${code}`;
    const existing = await this.prisma.student.findMany({
      where: { instituteId, rollNumber: { startsWith: prefix } },
      select: { rollNumber: true },
    });
    let max = 0;
    for (const { rollNumber } of existing) {
      const suffix = rollNumber.slice(prefix.length);
      if (/^\d{4}$/.test(suffix)) max = Math.max(max, Number(suffix));
    }
    return `${prefix}${String(max + 1).padStart(4, '0')}`;
  }

  async accept(token: string, password: string): Promise<AcceptInviteResult> {
    const tokenHash = this.hashToken(token);
    const user = await this.prisma.user.findFirst({
      where: { invitationTokenHash: tokenHash },
      include: {
        institute: { select: { name: true, slug: true } },
        student: { select: { rollNumber: true } },
      },
    });
    if (
      !user ||
      user.status !== UserStatus.PENDING ||
      user.invitationExpiresAt === null ||
      user.invitationExpiresAt <= new Date()
    ) {
      throw new BadRequestException(
        'This invitation link is no longer valid. It may have already been ' +
          'used, or it may have expired — ask your administrator to resend it.',
      );
    }

    const passwordHash = await this.passwords.hash(password);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        status: UserStatus.ACTIVE,
        invitationTokenHash: null,
        invitationExpiresAt: null,
      },
    });

    const role = user.roles[0];
    const { frontendUrl } = this.config.getOrThrow<AuthConfig>('auth');
    const loginUrl = `${frontendUrl}/login${role === Role.STUDENT ? '' : '?as=staff'}`;

    // Best-effort: a welcome email failing to send must not undo the
    // account activation that already succeeded above.
    await this.mail
      .sendWelcome({
        to: user.email,
        name: user.name,
        role,
        institute: user.institute?.name,
        // Student-only: it is one of the three things their sign-in form
        // asks for, and the only one they were never told.
        instituteSlug: role === Role.STUDENT ? user.institute?.slug : undefined,
        rollNumber: user.student?.rollNumber,
        loginUrl,
      })
      .catch((err: unknown) =>
        this.logger.warn(
          `Welcome email to ${user.email} failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );

    return {
      email: user.email,
      name: user.name,
      role,
      institute: user.institute
        ? { name: user.institute.name, slug: user.institute.slug }
        : null,
      rollNumber: user.student?.rollNumber,
    };
  }

  /**
   * Re-send the invite email for a still-PENDING account, refreshing the
   * token and its TTL. Unlike createInvitation's implicit resurrection
   * (which only kicks in once the old invite has actually lapsed), this is
   * an explicit admin action and works on a still-live PENDING invite too.
   */
  async resendInvite(
    userId: string,
    instituteId: string,
  ): Promise<{ email: string }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, instituteId },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.status !== UserStatus.PENDING) {
      throw new BadRequestException(
        `${user.email} has already accepted their invitation, so there is ` +
          `nothing to resend. Use a password reset if they cannot sign in.`,
      );
    }

    const institute = await this.requireInstitute(instituteId);
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const { inviteTtlHours, frontendUrl } =
      this.config.getOrThrow<AuthConfig>('auth');
    const expiresAt = new Date(Date.now() + inviteTtlHours * 3_600_000);

    // Same bargain as a first invitation: minting a new token invalidates the
    // old one, so a send that fails after the update would leave the invitee
    // holding a link that no longer works and no replacement for it.
    await this.prisma.$transaction(
      async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            invitationTokenHash: tokenHash,
            invitationExpiresAt: expiresAt,
          },
        });
        await this.sendInvite({
          to: user.email,
          name: user.name,
          role: user.roles[0],
          inviteUrl: `${frontendUrl}/accept-invite?token=${rawToken}`,
          institute: institute.name,
        });
      },
      { timeout: INVITE_TX_TIMEOUT_MS },
    );

    return { email: user.email };
  }

  private async requireInstitute(instituteId: string | null) {
    if (!instituteId) {
      throw new BadRequestException(
        'This session is not attached to an institute, so there is nobody to ' +
          'invite them into. Platform owners must invite through an ' +
          "institute's own admin console.",
      );
    }
    const institute = await this.prisma.institute.findUnique({
      where: { id: instituteId },
    });
    if (!institute) throw new NotFoundException('Institute not found');
    return institute;
  }

  private async createInvitation(
    params: CreateInvitationParams,
  ): Promise<InvitedUser> {
    const existing = await this.prisma.user.findUnique({
      where: { email: params.email },
    });
    // A genuinely active/disabled account, or a PENDING one whose invite
    // hasn't lapsed yet, still blocks — only a lapsed invite is resurrected.
    // Without this, letting a TTL expire locked that email out of ever being
    // invited again, with no self-service recovery.
    if (existing && !this.isResurrectable(existing)) {
      // Which kind of "already registered" this is decides what to do next, so
      // say which one it is rather than leaving the administrator to guess.
      throw new ConflictException(
        existing.status === UserStatus.PENDING
          ? `${params.email} already has an invitation waiting to be accepted. ` +
              `Use "Resend invite" on the roster to send it again — inviting ` +
              `afresh would invalidate the link they already have.`
          : `${params.email} already has an account on this platform. If they ` +
              `need different access, change their roles on the roster instead ` +
              `of inviting them again.`,
      );
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const { inviteTtlHours, frontendUrl } =
      this.config.getOrThrow<AuthConfig>('auth');
    const expiresAt = new Date(Date.now() + inviteTtlHours * 3_600_000);

    /**
     * The account and the email it announces are one operation.
     *
     * The send used to sit after the transaction had committed, so a provider
     * that refused the message — an SES account still in the sandbox refuses
     * every unverified recipient — left a PENDING account holding a token
     * nobody had ever received. The invitee could not accept, because they had
     * no link; and the address could not be invited again, because it was now
     * registered. Both halves of the failure were invisible: the response was
     * a bare 500.
     *
     * Inside the transaction, a refused message rolls the account back, and the
     * administrator is told to fix the mail problem and try again.
     *
     * The tradeoff, deliberately taken this way round: the transaction is held
     * open across a network call, and a commit that failed *after* a successful
     * send would email a link to an account that does not exist. That is rarer
     * than a mail failure — which is currently happening on every attempt — and
     * the invitee sees a dead link rather than the platform silently accruing
     * accounts nobody can use.
     */
    const user = await this.prisma.$transaction(
      async (tx) => {
        const data = {
          name: params.name,
          email: params.email,
          roles: params.roles,
          status: UserStatus.PENDING,
          instituteId: params.instituteId,
          invitedById: params.invitedById,
          invitationTokenHash: tokenHash,
          invitationExpiresAt: expiresAt,
        };
        const created = existing
          ? await tx.user.update({ where: { id: existing.id }, data })
          : await tx.user.create({ data });
        if (params.student) {
          await tx.student.upsert({
            where: { userId: created.id },
            create: {
              userId: created.id,
              instituteId: params.instituteId,
              batchId: params.student.batchId,
              rollNumber: params.student.rollNumber,
            },
            update: {
              batchId: params.student.batchId,
              rollNumber: params.student.rollNumber,
            },
          });
        }
        if (params.teacherBatchIds) {
          // Clear-then-create rather than a diff: keeps a resurrected invite
          // (same email, lapsed PENDING invite reusing `existing.id`) idempotent
          // even if it carries a different batch set than the stale invite did.
          await tx.teacherBatch.deleteMany({
            where: { teacherId: created.id },
          });
          if (params.teacherBatchIds.length) {
            await tx.teacherBatch.createMany({
              data: params.teacherBatchIds.map((batchId) => ({
                teacherId: created.id,
                batchId,
                instituteId: params.instituteId,
              })),
            });
          }
        }
        await this.sendInvite({
          to: created.email,
          name: created.name,
          role: created.roles[0],
          inviteUrl: `${frontendUrl}/accept-invite?token=${rawToken}`,
          institute: params.instituteName,
        });

        return created;
      },
      { timeout: INVITE_TX_TIMEOUT_MS },
    );

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      roles: user.roles,
      status: user.status,
      rollNumber: params.student?.rollNumber,
    };
  }

  /**
   * Send the invitation, or fail with something the administrator can act on.
   *
   * The provider's own words are passed through. "Email address is not
   * verified. The following identities failed the check in region AP-SOUTH-1"
   * names both the problem and where to fix it; replacing it with "internal
   * server error" throws away the only useful part.
   */
  private async sendInvite(email: {
    to: string;
    name: string;
    role: Role;
    inviteUrl: string;
    institute?: string;
  }): Promise<void> {
    try {
      await this.mail.sendInvitation(email);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Invitation to ${email.to} could not be sent, so the account was ` +
          `rolled back. Provider said: ${reason}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw new ServiceUnavailableException(
        `The invitation could not be emailed to ${email.to}, so nothing was ` +
          `created — no account exists and you can try again once mail is ` +
          `working. The mail provider said: ${reason}`,
      );
    }
  }

  /**
   * Turn whatever escaped into a message that names the problem.
   *
   * Anything already carrying a status has been phrased deliberately and is
   * left alone. The rest would otherwise reach the console as a bare 500, which
   * tells an administrator nothing about whether to retry, fix an address, or
   * call someone.
   */
  private describeFailure(err: unknown, email: string): unknown {
    if (err instanceof HttpException) return err;

    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      switch (err.code) {
        case 'P2002':
          return new ConflictException(
            `${email} is already registered. If that invitation has lapsed, ` +
              `it can be re-sent from the roster.`,
          );
        case 'P2003':
          return new BadRequestException(
            'That batch or institute no longer exists. Reload and try again.',
          );
        case 'P2028':
          return new ServiceUnavailableException(
            'The invitation took too long to complete and was rolled back — ' +
              'no account was created. This usually means the mail provider ' +
              'is slow to respond. Try again.',
          );
        default:
          break;
      }
    }

    this.logger.error(
      `Invitation for ${email} failed: ` +
        (err instanceof Error ? err.message : String(err)),
      err instanceof Error ? err.stack : undefined,
    );
    return new ServiceUnavailableException(
      `The invitation for ${email} could not be completed and nothing was ` +
        `saved. ` +
        (err instanceof Error ? err.message : 'An unexpected error occurred.'),
    );
  }

  /**
   * Run an invite and describe anything that escapes.
   *
   * Wrapped at this level rather than inside `createInvitation` on purpose: the
   * student path retries a lost roll-number race by inspecting the raw Prisma
   * error, and rewriting it there would turn a recoverable collision into a
   * hard failure.
   */
  private async guard<T>(run: () => Promise<T>, email: string): Promise<T> {
    try {
      return await run();
    } catch (err) {
      throw this.describeFailure(err, email);
    }
  }

  /** A PENDING account whose invite TTL has already passed — safe to reissue. */
  private isResurrectable(user: {
    status: UserStatus;
    invitationExpiresAt: Date | null;
  }): boolean {
    return (
      user.status === UserStatus.PENDING &&
      (user.invitationExpiresAt === null ||
        user.invitationExpiresAt <= new Date())
    );
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { PrismaService } from '../../database/prisma.service';
import { Role, UserStatus } from './auth.types';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';

/** Roles an institute-facing login may act as. SUPERADMIN is not among them. */
const STAFF_ROLES: Role[] = [Role.ADMIN, Role.TEACHER];

interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

export interface LoginResult {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    /** The role this session is acting as; null until one is chosen. */
    role: Role | null;
    /** What the account may act as — one entry means it was chosen for them. */
    roles: Role[];
    instituteId: string | null;
  };
  /**
   * Roles the user may pick for THIS door. More than one means the client must
   * ask, then call selectRole; the session can do nothing until it does.
   */
  selectableRoles: Role[];
}

/**
 * What a non-student login returns instead of a session: the password was
 * right, but a mailed code is still required (§2.2). No token is issued here,
 * so a correct password alone gets an attacker nothing.
 */
export interface OtpRequired {
  otpRequired: true;
  challengeId: string;
  expiresAt: string;
  /** Masked so the user knows which inbox to check without exposing it. */
  sentTo: string;
}

/** Minimal shape needed to complete a login (a full User row satisfies it). */
interface AuthenticatableUser {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  status: UserStatus;
  instituteId: string | null;
  passwordHash: string | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}

/** Consecutive wrong passwords before the ACCOUNT (not the caller's IP) locks. */
const MAX_FAILED_LOGIN_ATTEMPTS = 8;
const LOCKOUT_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly otp: OtpService,
  ) {}

  /**
   * Institute staff — administrators and teachers.
   *
   * Superadmins are refused here even with correct credentials: the platform
   * owner signs in through its own endpoint, so a tenant-facing login page can
   * never be the way into cross-tenant access. That separation is enforced
   * here, not in the UI, because a login screen is not an authorization
   * boundary.
   */
  async loginStaff(
    email: string,
    password: string,
    meta: SessionMeta,
  ): Promise<OtpRequired> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Students authenticate via the student endpoint, not by email.
    if (!user || user.roles.includes(Role.STUDENT)) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.challengeAfterPassword(user, password, meta, STAFF_ROLES);
  }

  /**
   * Resend the mailed code for an already-issued challenge.
   *
   * Delegates the cooldown + per-account cap to `otp.resend`, and tacks the
   * masked email onto the response so the UI can re-render the
   * "we sent a code to ..." line without another fetch.
   */
  async resendLoginOtp(challengeId: string): Promise<OtpRequired> {
    const result = await this.otp.resend(challengeId);
    // The new row's TTL — `issue()` returns the freshly-issued challenge
    // with its own expiry; that is what the OTP step should now show.
    const fresh = await this.prisma.otpChallenge.findUniqueOrThrow({
      where: { id: result.challengeId },
      select: { expiresAt: true, user: { select: { email: true } } },
    });
    return {
      otpRequired: true,
      // The resend returns the *new* challengeId; the verify() endpoint
      // expects whatever id is currently live. A client that forgot to
      // update would 404 on the consumed first row, which is exactly what
      // "two codes never coexist" was supposed to deliver.
      challengeId: result.challengeId,
      expiresAt: fresh.expiresAt.toISOString(),
      sentTo: maskEmail(fresh.user.email),
    };
  }

  /** Platform owner. Deliberately its own door; nobody else may use it. */
  async loginPlatform(
    email: string,
    password: string,
    meta: SessionMeta,
  ): Promise<OtpRequired> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.roles.includes(Role.SUPERADMIN)) {
      throw new UnauthorizedException('Invalid credentials');
    }
    // Only ever a platform session, even if the account also administers an
    // institute — the cross-tenant role is not something you arrive at by
    // accident from another door.
    return this.challengeAfterPassword(user, password, meta, [Role.SUPERADMIN]);
  }

  /**
   * Second step of a non-student login: redeem the mailed code for a session.
   *
   * The roles this session may act as come from the CHALLENGE, not from the
   * request — a code minted at the institute door cannot be spent for a
   * platform session even if the account holds SUPERADMIN.
   */
  async verifyLoginOtp(
    challengeId: string,
    code: string,
    meta: SessionMeta,
  ): Promise<LoginResult> {
    const { userId, allowedRoles } = await this.otp.verify({
      challengeId,
      code,
    });

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    // Re-checked at redemption, not just at password time: an account
    // disabled (or an institute suspended) in the seconds between the two
    // steps must not still complete the login.
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.assertInstituteActive(user.instituteId);

    return this.issueFor(user, meta, allowedRoles);
  }

  /**
   * Shared first step for every non-student door: verify the password, then
   * mail a code instead of issuing a session.
   *
   * The password is checked in full here (including account status and
   * institute suspension) so a code is never sent to an account that could
   * not have signed in anyway — an unsolicited code is itself a signal worth
   * not leaking.
   */
  private async challengeAfterPassword(
    user: AuthenticatableUser,
    password: string,
    meta: SessionMeta,
    allowedHere: Role[],
  ): Promise<OtpRequired> {
    await this.verifyPasswordWithLockout(user, password);

    await this.assertInstituteActive(user.instituteId);

    // Refuse here rather than after the round-trip through email: an account
    // with no role for this door can never complete the login, so sending a
    // code would only be misleading.
    const selectable = user.roles.filter((r) => allowedHere.includes(r));
    if (selectable.length === 0) {
      throw new ForbiddenException(
        user.roles.includes(Role.SUPERADMIN)
          ? 'Platform accounts sign in through the platform console, not an institute login.'
          : 'This account cannot sign in here.',
      );
    }

    const challenge = await this.otp.issue({
      userId: user.id,
      name: user.name,
      email: user.email,
      allowedRoles: allowedHere,
      userAgent: meta.userAgent,
      ip: meta.ip,
    });

    return {
      otpRequired: true,
      challengeId: challenge.challengeId,
      expiresAt: challenge.expiresAt.toISOString(),
      sentTo: maskEmail(user.email),
    };
  }

  async loginStudent(
    instituteSlug: string,
    rollNumber: string,
    password: string,
    meta: SessionMeta,
  ): Promise<LoginResult> {
    const institute = await this.prisma.institute.findUnique({
      where: { slug: instituteSlug },
    });
    if (!institute) throw new UnauthorizedException('Invalid credentials');

    const student = await this.prisma.student.findUnique({
      where: {
        instituteId_rollNumber: { instituteId: institute.id, rollNumber },
      },
      include: { user: true },
    });
    if (!student) throw new UnauthorizedException('Invalid credentials');

    return this.completeLogin(student.user, password, meta, [Role.STUDENT]);
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  me(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      // Never leak passwordHash / invitation token.
      select: {
        id: true,
        name: true,
        email: true,
        roles: true,
        status: true,
        instituteId: true,
      },
    });
  }

  /**
   * The signed-in user's own profile.
   *
   * One call fills the profile screen: identity, plus the candidate details a
   * student needs (roll number, batch, institute) which live on other tables.
   */
  async myProfile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      // Never leak passwordHash or the invitation token hash.
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        roles: true,
        status: true,
        instituteId: true,
        createdAt: true,
        institute: { select: { name: true, slug: true } },
      },
    });

    const student = user.roles.includes(Role.STUDENT)
      ? await this.prisma.student.findUnique({
          where: { userId },
          select: {
            rollNumber: true,
            createdAt: true,
            batch: {
              select: {
                name: true,
                class: {
                  select: { name: true, program: { select: { name: true } } },
                },
              },
            },
          },
        })
      : null;

    return {
      ...user,
      student: student
        ? {
            rollNumber: student.rollNumber,
            batch: student.batch.name,
            class: student.batch.class.name,
            program: student.batch.class.program.name,
            enrolledAt: student.createdAt,
          }
        : null,
    };
  }

  /** Update the fields a user owns. See UpdateMyProfileDto for what is excluded. */
  async updateMyProfile(
    userId: string,
    dto: { name?: string; phone?: string },
  ) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
        ...(dto.phone === undefined ? {} : { phone: dto.phone.trim() || null }),
      },
    });
    return this.myProfile(userId);
  }

  /**
   * Change your own password.
   *
   * Requires the current one, so a walk-up on an unlocked machine cannot lock
   * the owner out. Other sessions are revoked afterwards — if the reason for
   * changing it is that someone else has your password, leaving their session
   * alive would defeat the point — but the caller's own session survives, so
   * they are not signed out of the screen they just used.
   */
  async changePassword(
    userId: string,
    sessionId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user.passwordHash) {
      throw new BadRequestException(
        'This account has no password yet. Use your invitation link to set one.',
      );
    }

    const ok = await this.passwords.verify(user.passwordHash, currentPassword);
    if (!ok) {
      throw new BadRequestException('Your current password is not correct.');
    }
    if (await this.passwords.verify(user.passwordHash, newPassword)) {
      throw new BadRequestException(
        'The new password must be different from the current one.',
      );
    }

    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null, id: { not: sessionId } },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { changed: true };
  }

  /**
   * Password-only login, issuing a session directly. STUDENTS ONLY — every
   * other door goes through challengeAfterPassword() and a mailed code
   * instead. Candidates are exempt because an exam hall cannot depend on
   * inbox access, and a student session has no administrative reach.
   */
  private async completeLogin(
    user: AuthenticatableUser,
    password: string,
    meta: SessionMeta,
    allowedHere: Role[],
  ): Promise<LoginResult> {
    await this.verifyPasswordWithLockout(user, password);

    // Checked after the password so the reason only reaches someone who owns
    // the account; it is a state they can act on, not a credential hint.
    await this.assertInstituteActive(user.instituteId);

    return this.issueFor(user, meta, allowedHere);
  }

  /**
   * Verify a password with a per-ACCOUNT brute-force lockout — deliberately
   * not per-IP (see CandidateThrottlerGuard and the schema comment on
   * User.lockedUntil: an institute's staff share a network, so an IP-keyed
   * limit here would lock out a whole building over one person's typos).
   *
   * The lock is checked BEFORE verifying the password, so a correct password
   * submitted while locked still fails — otherwise the lock would be exactly
   * as easy to bypass as the thing it exists to slow down.
   */
  private async verifyPasswordWithLockout(
    user: AuthenticatableUser,
    password: string,
  ): Promise<void> {
    if (user.status !== UserStatus.ACTIVE || user.passwordHash === null) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        'Too many failed attempts. Try again in a few minutes.',
      );
    }

    const ok = await this.passwords.verify(user.passwordHash, password);
    if (!ok) {
      const attempts = user.failedLoginAttempts + 1;
      const locked = attempts >= MAX_FAILED_LOGIN_ATTEMPTS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: locked ? 0 : attempts,
          lockedUntil: locked
            ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
            : null,
        },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }
  }

  /**
   * Issue a session for the roles this door allows.
   *
   * One match: chosen for them, and they carry on. Several: the session is
   * created but acts as NOTHING until `selectRole` is called — the guard
   * refuses every other route meanwhile. No match: this is the wrong door, and
   * saying so is more use than a generic refusal to someone who just proved
   * they own the account.
   */
  private async issueFor(
    user: AuthenticatableUser,
    meta: SessionMeta,
    allowedHere: Role[],
  ): Promise<LoginResult> {
    const selectable = user.roles.filter((r) => allowedHere.includes(r));

    if (selectable.length === 0) {
      throw new ForbiddenException(
        user.roles.includes(Role.SUPERADMIN)
          ? 'Platform accounts sign in through the platform console, not an institute login.'
          : 'This account cannot sign in here.',
      );
    }

    const activeRole = selectable.length === 1 ? selectable[0] : null;
    const accessToken = await this.issueSession(user.id, meta, activeRole);

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: activeRole,
        roles: user.roles,
        instituteId: user.instituteId,
      },
      selectableRoles: selectable,
    };
  }

  /**
   * Switch the role this session is acting as, without re-authenticating.
   *
   * Differs from `selectRole` (the login-time choice) in that it never
   * refuses on the grounds of "already signed in" — that is exactly the
   * point of switching. Both still validate against the account's own roles,
   * so neither can be used to escape least privilege.
   *
   * Ending the current session would have been simpler, but it would also
   * discard unsaved exam progress in places like the teacher builder. Live
   * switching keeps the session alive and changes only who it acts as.
   */
  /**
   * Choose which role this session acts as. The pick is validated against the
   * account's OWN roles, so the client naming a role it does not hold changes
   * nothing — this is the point at which "which console do you want" stops
   * being a UI question and becomes an authorization fact.
   *
   * Refuses to switch an already-committed session: that is what
   * `switchRole` is for.
   */
  async switchRoleBody(sessionId: string, role: Role): Promise<{ role: Role }> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        revokedAt: true,
        expiresAt: true,
        user: { select: { roles: true } },
      },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Session is no longer valid');
    }
    if (!session.user.roles.includes(role)) {
      throw new ForbiddenException('Your account does not have that role.');
    }
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { activeRole: role },
    });
    return { role };
  }

  async selectRole(sessionId: string, role: Role): Promise<{ role: Role }> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        revokedAt: true,
        expiresAt: true,
        activeRole: true,
        user: { select: { roles: true } },
      },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Session is no longer valid');
    }
    if (!session.user.roles.includes(role)) {
      throw new ForbiddenException('Your account does not have that role.');
    }
    // A session already acting as a role does not silently become another;
    // switching is a deliberate act, not a side effect of replaying a request.
    if (session.activeRole !== null && session.activeRole !== role) {
      throw new ForbiddenException(
        'This session is already signed in as ' +
          `${session.activeRole}. Sign out to switch roles.`,
      );
    }

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { activeRole: role },
    });
    return { role };
  }

  async switchRole(sessionId: string, role: Role): Promise<{ role: Role }> {
    return this.switchRoleBody(sessionId, role);
  }

  /**
   * A suspended tenant must not be able to sign in — otherwise deactivating an
   * institute would change nothing for the people inside it.
   */
  private async assertInstituteActive(instituteId: string | null) {
    if (!instituteId) return;
    const institute = await this.prisma.institute.findUnique({
      where: { id: instituteId },
      select: { isActive: true, name: true },
    });
    if (!institute?.isActive) {
      throw new ForbiddenException(
        `${institute?.name ?? 'This institute'} has been suspended. ` +
          'Contact your administrator.',
      );
    }
  }

  /** Creates a fresh session, revoking any prior ones (single active session). */
  private async issueSession(
    userId: string,
    meta: SessionMeta,
    activeRole: Role | null,
  ): Promise<string> {
    const sessionId = randomUUID();
    const token = await this.jwt.signAsync({ sub: userId, sid: sessionId });
    const decoded = this.jwt.decode<{ exp: number }>(token);
    const expiresAt = new Date(decoded.exp * 1000);

    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.session.create({
        data: {
          id: sessionId,
          userId,
          expiresAt,
          userAgent: meta.userAgent,
          ip: meta.ip,
          activeRole,
        },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { currentSessionId: sessionId },
      }),
    ]);

    return token;
  }
}

/**
 * `priya.sharma@school.edu` -> `pr•••@school.edu`. Enough for the owner to
 * recognise which inbox to check, not enough to hand an address to someone
 * who only guessed the password.
 */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '•••';
  const head = local.slice(0, 2);
  return `${head}${'•'.repeat(3)}@${domain}`;
}

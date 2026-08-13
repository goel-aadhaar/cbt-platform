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
import { PasswordService } from './password.service';

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
    role: Role;
    instituteId: string | null;
  };
}

/** Minimal shape needed to complete a login (a full User row satisfies it). */
interface AuthenticatableUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  instituteId: string | null;
  passwordHash: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
  ) {}

  async loginStaff(
    email: string,
    password: string,
    meta: SessionMeta,
  ): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Students authenticate via the student endpoint, not by email.
    if (!user || user.role === Role.STUDENT) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.completeLogin(user, password, meta);
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

    return this.completeLogin(student.user, password, meta);
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
        role: true,
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
        role: true,
        status: true,
        instituteId: true,
        createdAt: true,
        institute: { select: { name: true, slug: true } },
      },
    });

    const student =
      user.role === Role.STUDENT
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

  private async completeLogin(
    user: AuthenticatableUser,
    password: string,
    meta: SessionMeta,
  ): Promise<LoginResult> {
    if (user.status !== UserStatus.ACTIVE || user.passwordHash === null) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await this.passwords.verify(user.passwordHash, password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    // A suspended tenant must not be able to sign in — otherwise deactivating
    // an institute would change nothing for the people inside it. Checked after
    // the password so the reason only reaches someone who owns the account;
    // it is a state they can act on, not a credential hint.
    if (user.instituteId) {
      const institute = await this.prisma.institute.findUnique({
        where: { id: user.instituteId },
        select: { isActive: true, name: true },
      });
      if (!institute?.isActive) {
        throw new ForbiddenException(
          `${institute?.name ?? 'This institute'} has been suspended. ` +
            'Contact your administrator.',
        );
      }
    }

    const accessToken = await this.issueSession(user.id, meta);
    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        instituteId: user.instituteId,
      },
    };
  }

  /** Creates a fresh session, revoking any prior ones (single active session). */
  private async issueSession(
    userId: string,
    meta: SessionMeta,
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

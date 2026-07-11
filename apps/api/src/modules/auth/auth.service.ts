import { randomUUID } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
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

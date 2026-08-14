import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { PrismaService } from '../../../database/prisma.service';
import { AuthUser, UserStatus } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface JwtPayload {
  sub: string;
  sid: string;
}

/**
 * Why a session stopped being usable.
 *
 * Sent as a machine-readable code so the client can name the actual cause
 * instead of showing one vague "please sign in again" for four different
 * situations — "someone signed in as you" and "your day ran out" call for
 * different reactions from the person reading it.
 */
export const SESSION_REASON = {
  /** No Authorization header at all. */
  MISSING: 'NO_TOKEN',
  /** Signature failed, or the JWT's own exp has passed. */
  BAD_TOKEN: 'INVALID_TOKEN',
  /** Superseded by a newer login, or logged out. Single active session (§2.2). */
  REVOKED: 'SESSION_REVOKED',
  /** The session row outlived its expiresAt. */
  EXPIRED: 'SESSION_EXPIRED',
  /** Session id is unknown, or does not belong to the token's subject. */
  UNKNOWN: 'SESSION_UNKNOWN',
  /** The account was disabled or is still pending. */
  INACTIVE: 'ACCOUNT_INACTIVE',
  /** Signed in, but holds several roles and has not chosen one yet. */
  NO_ROLE: 'ROLE_NOT_SELECTED',
} as const;

/**
 * 401 body. The code goes in `error` — the envelope field this codebase already
 * uses for machine-readable codes (see InstituteNotEmpty, CategoryInUse) — so
 * it survives AllExceptionsFilter as a top-level field instead of being nested
 * under `details`.
 */
function sessionError(reason: string, message: string) {
  return new UnauthorizedException({ statusCode: 401, error: reason, message });
}

/**
 * Stateful RS256 auth guard. Verifies the token signature, then re-validates the
 * referenced session against the DB every request (existence, ownership, not
 * revoked, not expired) and that the user is ACTIVE — so revocation, logout, and
 * single active session all take effect immediately.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();

    const token = this.extractToken(request);
    if (!token) {
      throw sessionError(
        SESSION_REASON.MISSING,
        'You are not signed in. Please sign in to continue.',
      );
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw sessionError(
        SESSION_REASON.BAD_TOKEN,
        'Your sign-in token is no longer valid. Please sign in again.',
      );
    }

    // This runs on EVERY authenticated request (stateful sessions are required
    // so a new login can kill the old one immediately — §2.2). Select only the
    // four fields actually needed: `include: { user: true }` dragged the whole
    // user row across the wire on every call, password hash and invitation token
    // hash included.
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      select: {
        id: true,
        userId: true,
        revokedAt: true,
        expiresAt: true,
        activeRole: true,
        user: {
          select: {
            id: true,
            roles: true,
            status: true,
            instituteId: true,
          },
        },
      },
    });

    const now = new Date();
    // Distinguish the causes: they are genuinely different events, and the one
    // people hit most (a second login stealing the session) is the one a vague
    // message explains worst.
    if (!session || session.userId !== payload.sub) {
      throw sessionError(
        SESSION_REASON.UNKNOWN,
        'This session no longer exists. Please sign in again.',
      );
    }
    if (session.revokedAt !== null) {
      throw sessionError(
        SESSION_REASON.REVOKED,
        'Your account was signed in on another device or browser. Only one ' +
          'active session is allowed, so this one was ended.',
      );
    }
    if (session.expiresAt <= now) {
      throw sessionError(
        SESSION_REASON.EXPIRED,
        'Your session expired. For security, sign-ins last 24 hours.',
      );
    }
    if (session.user.status !== UserStatus.ACTIVE) {
      throw sessionError(
        SESSION_REASON.INACTIVE,
        session.user.status === UserStatus.PENDING
          ? 'Your account has not been activated yet. Check your invitation email.'
          : 'Your account has been disabled. Contact your administrator.',
      );
    }

    /**
     * A session with several roles available must pick one before it can do
     * anything. Refusing here rather than defaulting to the strongest role is
     * the whole point: an unchosen session has no authority at all.
     *
     * The route that makes the choice is @Public and validates the pick against
     * the user's own roles, so this cannot lock anyone out.
     */
    if (session.activeRole === null) {
      throw sessionError(
        SESSION_REASON.NO_ROLE,
        'Choose which role to continue as.',
      );
    }
    // Defence in depth: a role removed from the account after the session was
    // created must stop working immediately, not at expiry.
    if (!session.user.roles.includes(session.activeRole)) {
      throw sessionError(
        SESSION_REASON.NO_ROLE,
        'That role is no longer available on your account. Sign in again.',
      );
    }

    request.user = {
      userId: session.user.id,
      role: session.activeRole,
      roles: session.user.roles,
      instituteId: session.user.instituteId,
      sessionId: session.id,
    };
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header) return undefined;
    const [scheme, token] = header.split(' ');
    return scheme === 'Bearer' ? token : undefined;
  }
}

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { AuthUser, Role } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * RBAC guard. Runs after JwtAuthGuard: if the route declares @Roles(...), the
 * authenticated user's role must be in the list. No @Roles = any authenticated
 * user allowed.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const user = request.user;

    /**
     * `user.role` is the role this SESSION is acting as, not everything the
     * account could be. Do not widen this to `user.roles`: a teacher-
     * administrator working in the teacher console would then reach
     * administrator routes, and choosing a role would mean nothing.
     */
    if (!user || !requiredRoles.includes(user.role)) {
      /**
       * Name both sides. "Insufficient role" is true and useless: it does not
       * say what this route wanted or what the session is, so someone signed in
       * as a teacher trying an admin screen cannot tell whether they need a
       * different account, a different role on the same account, or help.
       *
       * Safe to disclose — the caller is authenticated, and the route they just
       * called is not a secret from them.
       */
      const acting = user?.role ?? 'no role selected';
      const wanted = requiredRoles.join(' or ');
      throw new ForbiddenException(
        `This action needs the ${wanted} role, but this session is signed in ` +
          `as ${acting}. Switch role, or sign in with an account that has it.`,
      );
    }
    return true;
  }
}

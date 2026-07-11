import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';

import { AuthUser, Role } from '../auth.types';
import { TenantContextService } from './tenant-context.service';

/**
 * Binds the tenant context for the current request (runs after JwtAuthGuard, so
 * request.user is set). Uses AsyncLocalStorage.enterWith so the context persists
 * through the handler and any services/DB calls it makes.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const user = request.user;

    if (user) {
      this.tenantContext.enterWith({
        userId: user.userId,
        role: user.role,
        instituteId: user.instituteId,
        isSuperadmin: user.role === Role.SUPERADMIN,
      });
    }

    return next.handle();
  }
}

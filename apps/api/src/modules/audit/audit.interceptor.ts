import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { AuditOutcome } from '../../generated/prisma/enums';
import { AuditService } from './audit.service';
import { actorFromRequest, describeMutation } from './audit.util';

/**
 * Records an audit entry (§2.13) for every *successful* state-changing request.
 * Failures — including guard rejections (401/403) that never reach an
 * interceptor — are recorded by AllExceptionsFilter instead.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    const descriptor = describeMutation(req);
    if (!descriptor) return next.handle();

    const res = context.switchToHttp().getResponse<Response>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap(() => {
        void this.audit.record({
          action: descriptor.action,
          entityType: descriptor.entityType,
          entityId: descriptor.entityId,
          outcome: AuditOutcome.SUCCESS,
          statusCode: res.statusCode,
          ip: descriptor.ip,
          userAgent: descriptor.userAgent,
          metadata: {
            path: descriptor.rawPath,
            durationMs: Date.now() - startedAt,
          },
          ...actorFromRequest(req),
        });
      }),
    );
  }
}

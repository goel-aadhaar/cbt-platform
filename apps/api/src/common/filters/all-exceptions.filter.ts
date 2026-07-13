import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';

import { AuditOutcome } from '../../generated/prisma/enums';
import { AuditService } from '../../modules/audit/audit.service';
import {
  actorFromRequest,
  describeMutation,
} from '../../modules/audit/audit.util';

interface ErrorEnvelope {
  statusCode: number;
  error: string;
  message: string | string[];
  /** Extra structured fields carried by the exception (e.g. affectedExams). */
  details?: Record<string, unknown>;
  timestamp: string;
  path: string;
  requestId?: string;
}

/**
 * Global exception filter (≈ Spring's @ControllerAdvice).
 *
 * Converts ANY thrown error into one consistent JSON envelope so clients never
 * see stack traces, and logs it: 5xx as `error` (with the exception + stack),
 * 4xx as `warn`. Uses HttpAdapterHost so it stays platform-agnostic.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly logger: PinoLogger,
    private readonly audit: AuditService,
  ) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & { id?: string }>();
    const response = ctx.getResponse<Response>();

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    let error = 'Internal Server Error';
    let message: string | string[] = 'Internal server error';
    let details: Record<string, unknown> | undefined;

    if (isHttpException) {
      error = exception.name;
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
      } else if (payload && typeof payload === 'object') {
        const record = payload as Record<string, unknown>;
        message =
          (record.message as string | string[] | undefined) ??
          exception.message;
        if (typeof record.error === 'string') {
          error = record.error;
        }
        // Preserve any extra structured fields the thrower attached, so callers
        // can act on them (e.g. the §2.5 edit safeguard's affectedExams).
        const envelopeKeys = new Set(['statusCode', 'error', 'message']);
        const rest = Object.fromEntries(
          Object.entries(record).filter(([key]) => !envelopeKeys.has(key)),
        );
        if (Object.keys(rest).length > 0) {
          details = rest;
        }
      }
    }

    const requestId =
      request.id ?? (request.headers['x-request-id'] as string | undefined);
    const path = httpAdapter.getRequestUrl(request) as string;

    const body: ErrorEnvelope = {
      statusCode,
      error,
      message,
      ...(details ? { details } : {}),
      timestamp: new Date().toISOString(),
      path,
      requestId,
    };

    // 5xx = server fault (log with the exception + stack); 4xx = client error (warn).
    if (statusCode >= 500) {
      this.logger.error(
        { err: exception, requestId, path },
        'Unhandled exception',
      );
    } else {
      this.logger.warn(
        { statusCode, requestId, path },
        Array.isArray(message) ? message.join('; ') : message,
      );
    }

    // Audit trail (§2.13): record failed state-changing requests here — this is
    // the only place that also catches guard rejections (401/403/429).
    const mutation = describeMutation(request);
    if (mutation) {
      void this.audit.record({
        action: mutation.action,
        entityType: mutation.entityType,
        entityId: mutation.entityId,
        outcome: AuditOutcome.FAILURE,
        statusCode,
        ip: mutation.ip,
        userAgent: mutation.userAgent,
        metadata: { path: mutation.rawPath },
        ...actorFromRequest(request),
      });
    }

    httpAdapter.reply(response, body, statusCode);
  }
}

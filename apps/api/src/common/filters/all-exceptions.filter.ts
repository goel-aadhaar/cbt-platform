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

interface ErrorEnvelope {
  statusCode: number;
  error: string;
  message: string | string[];
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
      }
    }

    const requestId =
      request.id ?? (request.headers['x-request-id'] as string | undefined);
    const path = httpAdapter.getRequestUrl(request) as string;

    const body: ErrorEnvelope = {
      statusCode,
      error,
      message,
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

    httpAdapter.reply(response, body, statusCode);
  }
}

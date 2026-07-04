import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { Params } from 'nestjs-pino';

import type { NodeEnv } from '../../config/app.config';

/**
 * Builds nestjs-pino options.
 *   - Tests (JEST_WORKER_ID set): silent + no transport, so pino's worker
 *     thread never keeps Jest alive and test output stays clean.
 *   - Development: human-readable, colorized pino-pretty output.
 *   - Production: raw JSON (one line per log) for CloudWatch/Datadog ingestion.
 *
 * Every request gets a correlation id (reused from an inbound `x-request-id`
 * header if present, otherwise generated) and echoed back on the response —
 * so a single request can be traced across all its log lines.
 */
export function buildPinoOptions(config: {
  nodeEnv: NodeEnv;
  logLevel: string;
}): Params {
  if (process.env.JEST_WORKER_ID) {
    return { pinoHttp: { level: 'silent' } };
  }

  const isDev = config.nodeEnv === 'development';

  return {
    pinoHttp: {
      level: config.logLevel,
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const header = req.headers['x-request-id'];
        const id = (Array.isArray(header) ? header[0] : header) ?? randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      // Never log credentials.
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie'],
        remove: true,
      },
      transport: isDev
        ? {
            target: 'pino-pretty',
            options: {
              singleLine: true,
              translateTime: 'SYS:HH:MM:ss.l',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
    },
  };
}

import type { Request } from 'express';

import { AuthUser } from '../auth/auth.types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface MutationDescriptor {
  action: string;
  entityType: string | null;
  entityId: string | null;
  ip: string | null;
  userAgent: string | null;
  rawPath: string;
}

/**
 * Describe a state-changing request for the audit trail (§2.13), or return null
 * for read-only methods. Captures only the method + route (uuids normalized to
 * `:id`) — never the body, so secrets are never logged.
 */
export function describeMutation(req: Request): MutationDescriptor | null {
  const method = req.method.toUpperCase();
  if (!MUTATING.has(method)) return null;

  const rawPath = (req.originalUrl || req.url).split('?')[0];
  const segments = rawPath.split('/');
  const entityId = segments.find((s) => UUID_RE.test(s)) ?? null;
  const versionIdx = segments.findIndex((s) => /^v\d+$/.test(s));
  const entityType =
    versionIdx >= 0 ? (segments[versionIdx + 1] ?? null) : null;
  const normalized = segments
    .map((s) => (UUID_RE.test(s) ? ':id' : s))
    .join('/');

  return {
    action: `${method} ${normalized}`,
    entityType,
    entityId,
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
    rawPath,
  };
}

/**
 * Actor identity from the request. Reads `request.user` (set by JwtAuthGuard),
 * so it works even for guard-level rejections that fail before the tenant
 * context interceptor runs.
 */
export function actorFromRequest(req: Request): {
  actorId: string | null;
  actorRole: string | null;
  instituteId: string | null;
} {
  const user = (req as Request & { user?: AuthUser }).user;
  return {
    actorId: user?.userId ?? null,
    actorRole: user?.role ?? null,
    instituteId: user?.instituteId ?? null,
  };
}

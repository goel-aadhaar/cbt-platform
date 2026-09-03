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
  /** Which fields the request set, and the safe ones' values. See {@link summarizeBody}. */
  changed: BodySummary | null;
}

/**
 * Candidate telemetry that fires continuously during an exam.
 *
 * A single 180-question attempt produces thousands of autosaves, section-time
 * pings and proctoring reports. Auditing each one buried the events the trail
 * exists for — an answer-key edit, a result publication, a role change — under
 * a wall of keystroke noise, which is a failure of the audit trail even though
 * every row in it was accurate.
 *
 * None of this is lost by skipping it: responses are the attempt itself,
 * section times live on `AttemptSectionTime`, and violations are recorded as
 * `ProctoringEvent` rows. They are already durable; they are simply not
 * *audit* events.
 */
const HIGH_FREQUENCY = [
  /\/attempts\/[^/]+\/responses\//,
  /\/attempts\/[^/]+\/section-time$/,
  /\/attempts\/[^/]+\/violations$/,
];

/**
 * Never record these, whatever the route.
 *
 * The audit trail is read by admins and kept for years, so a credential landing
 * in it is a durable leak rather than a transient one.
 */
const SECRET_FIELDS =
  /pass|password|token|secret|otp|code|challenge|key$|privateKey/i;

/**
 * Values worth keeping verbatim, because "which field changed" is not enough to
 * answer the question the trail gets asked.
 *
 * `answerKey` is the reason this exists: a key correction invalidates published
 * results, and it was previously indistinguishable from fixing a typo in the
 * statement. `scoring`, `marks`, `roles`, `status` and `published` are the other
 * changes that move somebody's outcome. Note `answerKey` is deliberately listed
 * before the `key$` secret pattern is applied — see {@link summarizeBody}.
 */
const SIGNIFICANT_FIELDS = new Set([
  'answerKey',
  'scoring',
  'override',
  'marks',
  'negativeMarks',
  'marksCorrect',
  'marksWrong',
  'roles',
  'role',
  'status',
  'published',
  'publish',
  'confirm',
  'batchId',
  // Who a thing was shared with is the outcome-affecting part of a share:
  // "material was edited" does not answer whether another batch gained or
  // lost access to it. Announcements moved from a single `audience` enum to
  // these, and resources address a set of batches the same way (§2.12).
  'batchIds',
  'teacherIds',
  'toStudents',
  'toTeachers',
  'isActive',
]);

export interface BodySummary {
  /** Every field the caller sent, so an edit's shape is visible. */
  fields: string[];
  /** Values for the outcome-affecting fields only. */
  values: Record<string, unknown>;
}

/**
 * Summarize a request body for the trail: all field names, plus the values of
 * the fields that change someone's outcome. Secrets are never included, and
 * long values are truncated so one pasted question statement cannot bloat the
 * table.
 */
export function summarizeBody(body: unknown): BodySummary | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const entries = Object.entries(body as Record<string, unknown>);
  if (entries.length === 0) return null;

  const values: Record<string, unknown> = {};
  for (const [k, v] of entries) {
    // Significant wins over the secret pattern: `answerKey` matches `key$` but
    // is the single most important thing this trail can record.
    if (!SIGNIFICANT_FIELDS.has(k)) continue;
    if (SECRET_FIELDS.test(k) && !SIGNIFICANT_FIELDS.has(k)) continue;
    values[k] =
      typeof v === 'string' && v.length > 120 ? `${v.slice(0, 120)}…` : v;
  }

  return { fields: entries.map(([k]) => k), values };
}

/**
 * Describe a state-changing request for the audit trail (§2.13), or return null
 * for read-only methods and for the candidate telemetry in
 * {@link HIGH_FREQUENCY}. Captures the method + route (uuids normalized to
 * `:id`) and a redacted body summary.
 */
export function describeMutation(req: Request): MutationDescriptor | null {
  const method = req.method.toUpperCase();
  if (!MUTATING.has(method)) return null;

  const rawPath = (req.originalUrl || req.url).split('?')[0];
  if (HIGH_FREQUENCY.some((re) => re.test(rawPath))) return null;

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
    changed: summarizeBody((req as Request & { body?: unknown }).body),
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

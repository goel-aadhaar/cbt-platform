import { AttemptStatus } from '../../generated/prisma/enums';

export {
  AttemptStatus,
  ProctoringEventType,
  ResponseStatus,
} from '../../generated/prisma/enums';

/**
 * Attempt rows in these statuses have no running clock yet (§ exam entry
 * approval) — `startedAt`/`expiresAt` are still null. Every aggregate query
 * across the app that reports "attempts" as activity/attendance/history must
 * exclude them, or a pending or declined entry request reads as if the
 * student were already sitting the exam.
 */
export const PRE_START_ATTEMPT_STATUSES: AttemptStatus[] = [
  AttemptStatus.PENDING_APPROVAL,
  AttemptStatus.APPROVED,
  AttemptStatus.DENIED,
];

import { Role, UserStatus } from '../../generated/prisma/enums';

export { Role, UserStatus };

/** Attached to the request by JwtAuthGuard once a session is validated. */
export interface AuthUser {
  userId: string;
  /**
   * The role this session is ACTING AS. Authorization uses only this, never
   * the full set below — a teacher-administrator working in the teacher
   * console must not reach administrator routes.
   */
  role: Role;
  /** Every role the account may act as, for offering a switch. */
  roles: Role[];
  /** Null for SUPERADMIN (cross-tenant). */
  instituteId: string | null;
  sessionId: string;
}

/** Per-request tenant context, held in AsyncLocalStorage. */
export interface TenantContextData {
  userId: string;
  role: Role;
  instituteId: string | null;
  /** Superadmin bypasses tenant scoping. */
  isSuperadmin: boolean;
}

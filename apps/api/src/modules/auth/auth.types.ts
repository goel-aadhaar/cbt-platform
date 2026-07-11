import { Role, UserStatus } from '../../generated/prisma/enums';

export { Role, UserStatus };

/** Attached to the request by JwtAuthGuard once a session is validated. */
export interface AuthUser {
  userId: string;
  role: Role;
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

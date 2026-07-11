import { SetMetadata } from '@nestjs/common';

import { Role } from '../auth.types';

export const ROLES_KEY = 'roles';

/** Restricts a route to the given roles (RBAC ≈ Spring's @PreAuthorize). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

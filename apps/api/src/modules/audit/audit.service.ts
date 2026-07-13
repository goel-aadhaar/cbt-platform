import { ForbiddenException, Injectable, Logger } from '@nestjs/common';

import { AuditOutcome } from '../../generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../auth/tenant/tenant-context.service';
import { QueryAuditDto } from './dto/query-audit.dto';

/** A single audited event (§2.13). Actor/institute default to the tenant ctx. */
export interface AuditEvent {
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  outcome?: AuditOutcome;
  statusCode?: number | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
  actorId?: string | null;
  actorRole?: string | null;
  instituteId?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  /**
   * Persist an audit entry. Best-effort: a failure here must never break the
   * request that triggered it, so all errors are swallowed (and logged).
   */
  async record(event: AuditEvent): Promise<void> {
    try {
      const ctx = this.tenant.get();
      await this.prisma.auditLog.create({
        data: {
          instituteId:
            event.instituteId !== undefined
              ? event.instituteId
              : (ctx?.instituteId ?? null),
          actorId: event.actorId ?? ctx?.userId ?? null,
          actorRole: event.actorRole ?? ctx?.role ?? null,
          action: event.action,
          entityType: event.entityType ?? null,
          entityId: event.entityId ?? null,
          outcome: event.outcome ?? AuditOutcome.SUCCESS,
          statusCode: event.statusCode ?? null,
          ip: event.ip ?? null,
          userAgent: event.userAgent ?? null,
          metadata: (event.metadata ?? undefined) as
            Prisma.InputJsonValue | undefined,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to write audit log for "${event.action}"`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  /**
   * Query the audit trail (§2.13). Admins are scoped to their institute;
   * superadmins see all (optionally filtered by `instituteId`). Actor names are
   * resolved in a single batched lookup.
   */
  async findMany(query: QueryAuditDto) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.action
        ? { action: { contains: query.action, mode: 'insensitive' } }
        : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.outcome ? { outcome: query.outcome } : {}),
    };

    if (this.tenant.isSuperadmin()) {
      if (query.instituteId) where.instituteId = query.instituteId;
    } else {
      const instituteId = this.tenant.getInstituteId();
      if (!instituteId) {
        throw new ForbiddenException('No institute in the current context');
      }
      where.instituteId = instituteId;
    }

    const take = Math.min(query.limit ?? 50, 200);
    const skip = query.offset ?? 0;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const actorIds = [
      ...new Set(
        items.map((i) => i.actorId).filter((id): id is string => !!id),
      ),
    ];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const actorById = new Map(actors.map((a) => [a.id, a]));

    return {
      total,
      limit: take,
      offset: skip,
      items: items.map((i) => ({
        ...i,
        actor: i.actorId ? (actorById.get(i.actorId) ?? null) : null,
      })),
    };
  }
}

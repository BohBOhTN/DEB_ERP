import { Prisma, type PrismaClient } from "@prisma/client";
import { orderByFor, type SortSpec } from "../../shared/listQuery.js";
import type { SecurityAuditRecorder } from "../auth/auth.service.js";

export interface AuditListParams {
  sort?: SortSpec<"createdAt">;
  actorUserId?: string;
  action?: string;
  entity?: string;
  targetId?: string;
  correlationId?: string;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
}

/// AUD-001: the viewer is read-only. This service exposes no update or delete,
/// so the audit trail stays append-only for every ordinary user.
export class AuditService implements SecurityAuditRecorder {
  public constructor(private readonly prisma: PrismaClient) {}

  public async record(event: {
    actorUserId?: string;
    action: string;
    entity: string;
    targetId?: string;
    reason?: string;
  }): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        actorUserId: event.actorUserId,
        action: event.action,
        entity: event.entity,
        targetId: event.targetId,
        reason: event.reason,
      },
    });
  }

  public async listEvents(params: AuditListParams) {
    const where: Prisma.AuditEventWhereInput = {
      ...(params.actorUserId ? { actorUserId: params.actorUserId } : {}),
      ...(params.entity ? { entity: params.entity } : {}),
      ...(params.targetId ? { targetId: params.targetId } : {}),
      ...(params.correlationId ? { correlationId: params.correlationId } : {}),
      ...(params.action
        ? {
            action: {
              startsWith: params.action,
            },
          }
        : {}),
      ...(params.from || params.to
        ? {
            createdAt: {
              ...(params.from ? { gte: params.from } : {}),
              ...(params.to ? { lte: params.to } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditEvent.findMany({
        where,
        include: {
          actor: {
            select: {
              id: true,
              displayName: true,
              email: true,
            },
          },
        },
        // NFR-005: a stable sort. Time alone is not unique enough under load,
        // so the id breaks ties and keeps pages from repeating or skipping.
        orderBy: orderByFor<
          "createdAt",
          Prisma.AuditEventOrderByWithRelationInput
        >(
          params.sort,
          { createdAt: (direction) => [{ createdAt: direction }] },
          [{ createdAt: "desc" }],
          { id: "desc" },
        ),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.auditEvent.count({ where }),
    ]);

    return {
      items,
      page: params.page,
      pageSize: params.pageSize,
      total,
      pageCount: Math.ceil(total / params.pageSize),
    };
  }

  /// Powers the viewer's filter controls without the client having to know the
  /// action vocabulary in advance.
  public async listFilterOptions() {
    const [actions, entities] = await this.prisma.$transaction([
      this.prisma.auditEvent.findMany({
        distinct: ["action"],
        select: {
          action: true,
        },
        orderBy: {
          action: "asc",
        },
        take: 200,
      }),
      this.prisma.auditEvent.findMany({
        distinct: ["entity"],
        select: {
          entity: true,
        },
        orderBy: {
          entity: "asc",
        },
        take: 100,
      }),
    ]);

    return {
      actions: actions.map((row) => row.action),
      entities: entities.map((row) => row.entity),
    };
  }
}

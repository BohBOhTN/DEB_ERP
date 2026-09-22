import { Prisma, type PrismaClient } from "@prisma/client";
import { AppError } from "../../shared/appError.js";
import { normalizeName } from "../catalog/catalog.service.js";

export interface DistributionActor {
  actorUserId: string;
  correlationId?: string;
}

export interface DistributorListParams {
  search?: string;
  isActive?: boolean;
  page: number;
  pageSize: number;
}

export class DistributionService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async listDistributors(params: DistributorListParams) {
    const normalizedSearch = params.search
      ? normalizeName(params.search)
      : undefined;
    const where = {
      ...(params.isActive === undefined ? {} : { isActive: params.isActive }),
      ...(normalizedSearch
        ? {
            OR: [
              {
                normalizedName: {
                  contains: normalizedSearch,
                  mode: "insensitive" as const,
                },
              },
              {
                phone: {
                  contains: params.search,
                  mode: "insensitive" as const,
                },
              },
              {
                taxIdentifier: {
                  contains: params.search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.distributor.findMany({
        where,
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.distributor.count({ where }),
    ]);

    return paginated(items, total, params);
  }

  public async createDistributor(
    params: {
      name: string;
      phone?: string;
      address?: string;
      taxIdentifier?: string;
      notes?: string;
    },
    actor: DistributionActor,
  ) {
    const normalizedName = normalizeName(params.name);
    await this.assertActiveDistributorNameAvailable(normalizedName);

    const distributor = await this.prisma.distributor.create({
      data: {
        name: params.name.trim(),
        normalizedName,
        phone: emptyToNull(params.phone),
        address: emptyToNull(params.address),
        taxIdentifier: emptyToNull(params.taxIdentifier),
        notes: emptyToNull(params.notes),
        createdByUserId: actor.actorUserId,
        updatedByUserId: actor.actorUserId,
      },
    });

    await this.audit({
      actor,
      action: "distributor.create",
      entity: "distributor",
      targetId: distributor.id,
      after: distributor,
    });

    return distributor;
  }

  public async updateDistributor(
    distributorId: string,
    params: {
      version: number;
      name?: string;
      phone?: string;
      address?: string;
      taxIdentifier?: string;
      notes?: string;
      isActive?: boolean;
    },
    actor: DistributionActor,
  ) {
    const existing = await this.findDistributorOrThrow(distributorId);
    const normalizedName =
      params.name !== undefined ? normalizeName(params.name) : undefined;

    if ((params.isActive ?? existing.isActive) && normalizedName) {
      await this.assertActiveDistributorNameAvailable(
        normalizedName,
        existing.id,
      );
    }

    const result = await this.prisma.distributor.updateMany({
      where: {
        id: distributorId,
        version: params.version,
      },
      data: {
        ...(params.name !== undefined
          ? { name: params.name.trim(), normalizedName }
          : {}),
        ...(params.phone !== undefined
          ? { phone: emptyToNull(params.phone) }
          : {}),
        ...(params.address !== undefined
          ? { address: emptyToNull(params.address) }
          : {}),
        ...(params.taxIdentifier !== undefined
          ? { taxIdentifier: emptyToNull(params.taxIdentifier) }
          : {}),
        ...(params.notes !== undefined
          ? { notes: emptyToNull(params.notes) }
          : {}),
        ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
        version: {
          increment: 1,
        },
        updatedByUserId: actor.actorUserId,
      },
    });

    assertVersionUpdated(result.count);
    const distributor = await this.findDistributorOrThrow(distributorId);

    await this.audit({
      actor,
      action: "distributor.update",
      entity: "distributor",
      targetId: distributor.id,
      before: existing,
      after: distributor,
    });

    return distributor;
  }

  private async findDistributorOrThrow(distributorId: string) {
    const distributor = await this.prisma.distributor.findUnique({
      where: {
        id: distributorId,
      },
    });

    if (!distributor) {
      throw new AppError({
        statusCode: 404,
        code: "DISTRIBUTOR_NOT_FOUND",
        message: "Distributeur introuvable.",
      });
    }

    return distributor;
  }

  private async assertActiveDistributorNameAvailable(
    normalizedName: string,
    excludingDistributorId?: string,
  ) {
    const existing = await this.prisma.distributor.findFirst({
      where: {
        normalizedName,
        isActive: true,
        ...(excludingDistributorId
          ? { id: { not: excludingDistributorId } }
          : {}),
      },
    });

    if (existing) {
      throw new AppError({
        statusCode: 409,
        code: "DISTRIBUTOR_NAME_EXISTS",
        message: "Un distributeur actif avec ce nom existe deja.",
      });
    }
  }

  private async audit(params: {
    actor?: DistributionActor;
    action: string;
    entity: string;
    targetId?: string;
    before?: unknown;
    after?: unknown;
  }) {
    await this.prisma.auditEvent.create({
      data: {
        actorUserId: params.actor?.actorUserId,
        action: params.action,
        entity: params.entity,
        targetId: params.targetId,
        correlationId: params.actor?.correlationId,
        before: params.before === undefined ? undefined : toJson(params.before),
        after: params.after === undefined ? undefined : toJson(params.after),
      },
    });
  }
}

function assertVersionUpdated(count: number) {
  if (count === 0) {
    throw new AppError({
      statusCode: 409,
      code: "CONCURRENT_UPDATE",
      message: "Ce distributeur a ete modifie entre-temps.",
    });
  }
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function paginated<TItem>(
  items: TItem[],
  total: number,
  params: { page: number; pageSize: number },
) {
  return {
    items,
    page: params.page,
    pageSize: params.pageSize,
    total,
    pageCount: Math.ceil(total / params.pageSize),
  };
}

import type { PrismaClient } from "@prisma/client";
import { AppError } from "../../shared/appError.js";
import { normalizeName } from "../catalog/catalog.service.js";

export interface ProcurementActor {
  actorUserId: string;
  correlationId?: string;
}

export interface SupplierListParams {
  search?: string;
  isActive?: boolean;
  page: number;
  pageSize: number;
}

export class ProcurementService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async listSuppliers(params: SupplierListParams) {
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
      this.prisma.supplier.findMany({
        where,
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return paginated(items, total, params);
  }

  public async createSupplier(
    params: {
      name: string;
      phone?: string;
      address?: string;
      taxIdentifier?: string;
      notes?: string;
    },
    actor: ProcurementActor,
  ) {
    const normalizedName = normalizeName(params.name);
    await this.assertActiveSupplierNameAvailable(normalizedName);

    const supplier = await this.prisma.supplier.create({
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
      action: "supplier.create",
      entity: "supplier",
      targetId: supplier.id,
      after: supplier,
    });

    return supplier;
  }

  public async updateSupplier(
    supplierId: string,
    params: {
      version: number;
      name?: string;
      phone?: string;
      address?: string;
      taxIdentifier?: string;
      notes?: string;
      isActive?: boolean;
    },
    actor: ProcurementActor,
  ) {
    const existing = await this.findSupplierOrThrow(supplierId);
    const normalizedName =
      params.name !== undefined ? normalizeName(params.name) : undefined;

    if ((params.isActive ?? existing.isActive) && normalizedName) {
      await this.assertActiveSupplierNameAvailable(normalizedName, existing.id);
    }

    if (params.isActive === true && normalizedName === undefined) {
      await this.assertActiveSupplierNameAvailable(
        existing.normalizedName,
        existing.id,
      );
    }

    const result = await this.prisma.supplier.updateMany({
      where: {
        id: supplierId,
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
    const supplier = await this.findSupplierOrThrow(supplierId);

    await this.audit({
      actor,
      action:
        params.isActive === undefined
          ? "supplier.update"
          : params.isActive
            ? "supplier.activate"
            : "supplier.deactivate",
      entity: "supplier",
      targetId: supplier.id,
      before: existing,
      after: supplier,
    });

    return supplier;
  }

  private async findSupplierOrThrow(supplierId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: {
        id: supplierId,
      },
    });

    if (!supplier) {
      throw new AppError({
        statusCode: 404,
        code: "SUPPLIER_NOT_FOUND",
        message: "Fournisseur introuvable.",
      });
    }

    return supplier;
  }

  private async assertActiveSupplierNameAvailable(
    normalizedName: string,
    exceptId?: string,
  ): Promise<void> {
    const existing = await this.prisma.supplier.findFirst({
      where: {
        normalizedName,
        isActive: true,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });

    if (existing) {
      throw new AppError({
        statusCode: 409,
        code: "ACTIVE_SUPPLIER_NAME_NOT_UNIQUE",
        message: "Un fournisseur actif porte deja ce nom.",
      });
    }
  }

  private async audit(params: {
    actor: ProcurementActor;
    action: string;
    entity: string;
    targetId: string;
    before?: unknown;
    after?: unknown;
  }): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        actorUserId: params.actor.actorUserId,
        action: params.action,
        entity: params.entity,
        targetId: params.targetId,
        correlationId: params.actor.correlationId,
        before: params.before ?? undefined,
        after: params.after ?? undefined,
      },
    });
  }
}

function assertVersionUpdated(count: number): void {
  if (count === 0) {
    throw new AppError({
      statusCode: 409,
      code: "STALE_VERSION",
      message: "Les donnees ont change. Actualisez puis reessayez.",
    });
  }
}

function emptyToNull(value: string | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function paginated<TItem>(
  items: TItem[],
  total: number,
  params: SupplierListParams,
) {
  return {
    items,
    page: params.page,
    pageSize: params.pageSize,
    total,
    pageCount: Math.ceil(total / params.pageSize),
  };
}

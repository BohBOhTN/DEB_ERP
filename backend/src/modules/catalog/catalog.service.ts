import type { PrismaClient } from "@prisma/client";
import { AppError } from "../../shared/appError.js";

export interface CatalogActor {
  actorUserId: string;
  correlationId?: string;
}

export interface ListParams {
  search?: string;
  isActive?: boolean;
  page: number;
  pageSize: number;
}

const defaultUnits = [
  { code: "piece", name: "Piece", symbol: "pc", precision: 0 },
  { code: "kilogram", name: "Kilogramme", symbol: "kg", precision: 3 },
  { code: "gram", name: "Gramme", symbol: "g", precision: 0 },
  { code: "litre", name: "Litre", symbol: "l", precision: 3 },
  { code: "millilitre", name: "Millilitre", symbol: "ml", precision: 0 },
  { code: "tray", name: "Plateau", symbol: "plateau", precision: 0 },
  { code: "box", name: "Boite", symbol: "boite", precision: 0 },
  { code: "bag", name: "Sac", symbol: "sac", precision: 0 },
] as const;

export class CatalogService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async bootstrapCatalogData(): Promise<void> {
    for (const unit of defaultUnits) {
      await this.prisma.unit.upsert({
        where: {
          code: unit.code,
        },
        create: unit,
        update: {
          name: unit.name,
          symbol: unit.symbol,
          precision: unit.precision,
          isActive: true,
        },
      });
    }
  }

  public async listUnits(params: ListParams) {
    const where = {
      ...(params.isActive === undefined ? {} : { isActive: params.isActive }),
      ...(params.search
        ? {
            OR: [
              {
                code: { contains: params.search, mode: "insensitive" as const },
              },
              {
                name: { contains: params.search, mode: "insensitive" as const },
              },
              {
                symbol: {
                  contains: params.search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.unit.findMany({
        where,
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.unit.count({ where }),
    ]);

    return paginated(items, total, params);
  }

  public async createUnit(
    params: {
      code: string;
      name: string;
      symbol: string;
      precision: number;
    },
    actor: CatalogActor,
  ) {
    const unit = await this.prisma.unit.create({
      data: {
        code: normalizeCode(params.code),
        name: params.name.trim(),
        symbol: params.symbol.trim(),
        precision: params.precision,
      },
    });

    await this.audit({
      actor,
      action: "unit.create",
      entity: "unit",
      targetId: unit.id,
      after: unit,
    });

    return unit;
  }

  public async updateUnit(
    unitId: string,
    params: {
      name?: string;
      symbol?: string;
      precision?: number;
      isActive?: boolean;
    },
    actor: CatalogActor,
  ) {
    const existing = await this.findUnitOrThrow(unitId);
    const unit = await this.prisma.unit.update({
      where: {
        id: unitId,
      },
      data: {
        ...(params.name !== undefined ? { name: params.name.trim() } : {}),
        ...(params.symbol !== undefined
          ? { symbol: params.symbol.trim() }
          : {}),
        ...(params.precision !== undefined
          ? { precision: params.precision }
          : {}),
        ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      },
    });

    await this.audit({
      actor,
      action:
        params.isActive === undefined
          ? "unit.update"
          : params.isActive
            ? "unit.activate"
            : "unit.deactivate",
      entity: "unit",
      targetId: unit.id,
      before: existing,
      after: unit,
    });

    return unit;
  }

  public async listCategories(params: ListParams) {
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
                description: {
                  contains: params.search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.productCategory.findMany({
        where,
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.productCategory.count({ where }),
    ]);

    return paginated(items, total, params);
  }

  public async createCategory(
    params: {
      name: string;
      description?: string;
    },
    actor: CatalogActor,
  ) {
    const normalizedName = normalizeName(params.name);
    await this.assertActiveCategoryNameAvailable(normalizedName);

    const category = await this.prisma.productCategory.create({
      data: {
        name: params.name.trim(),
        normalizedName,
        description: emptyToNull(params.description),
        createdByUserId: actor.actorUserId,
        updatedByUserId: actor.actorUserId,
      },
    });

    await this.audit({
      actor,
      action: "product_category.create",
      entity: "product_category",
      targetId: category.id,
      after: category,
    });

    return category;
  }

  public async updateCategory(
    categoryId: string,
    params: {
      name?: string;
      description?: string;
      isActive?: boolean;
    },
    actor: CatalogActor,
  ) {
    const existing = await this.findCategoryOrThrow(categoryId);
    const normalizedName =
      params.name !== undefined ? normalizeName(params.name) : undefined;

    if ((params.isActive ?? existing.isActive) && normalizedName) {
      await this.assertActiveCategoryNameAvailable(normalizedName, existing.id);
    }

    if (params.isActive === true && normalizedName === undefined) {
      await this.assertActiveCategoryNameAvailable(
        existing.normalizedName,
        existing.id,
      );
    }

    const category = await this.prisma.productCategory.update({
      where: {
        id: categoryId,
      },
      data: {
        ...(params.name !== undefined
          ? { name: params.name.trim(), normalizedName }
          : {}),
        ...(params.description !== undefined
          ? { description: emptyToNull(params.description) }
          : {}),
        ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
        updatedByUserId: actor.actorUserId,
      },
    });

    await this.audit({
      actor,
      action:
        params.isActive === undefined
          ? "product_category.update"
          : params.isActive
            ? "product_category.activate"
            : "product_category.deactivate",
      entity: "product_category",
      targetId: category.id,
      before: existing,
      after: category,
    });

    return category;
  }

  private async findUnitOrThrow(unitId: string) {
    const unit = await this.prisma.unit.findUnique({
      where: {
        id: unitId,
      },
    });

    if (!unit) {
      throw new AppError({
        statusCode: 404,
        code: "UNIT_NOT_FOUND",
        message: "Unite introuvable.",
      });
    }

    return unit;
  }

  private async findCategoryOrThrow(categoryId: string) {
    const category = await this.prisma.productCategory.findUnique({
      where: {
        id: categoryId,
      },
    });

    if (!category) {
      throw new AppError({
        statusCode: 404,
        code: "CATEGORY_NOT_FOUND",
        message: "Categorie introuvable.",
      });
    }

    return category;
  }

  private async assertActiveCategoryNameAvailable(
    normalizedName: string,
    exceptId?: string,
  ): Promise<void> {
    const existing = await this.prisma.productCategory.findFirst({
      where: {
        normalizedName,
        isActive: true,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });

    if (existing) {
      throw new AppError({
        statusCode: 409,
        code: "ACTIVE_CATEGORY_NAME_NOT_UNIQUE",
        message: "Une categorie active porte deja ce nom.",
      });
    }
  }

  private async audit(params: {
    actor: CatalogActor;
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

export function normalizeName(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeCode(value: string): string {
  return value.trim().replace(/\s+/g, "_").toLowerCase();
}

function emptyToNull(value: string | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function paginated<TItem>(items: TItem[], total: number, params: ListParams) {
  return {
    items,
    page: params.page,
    pageSize: params.pageSize,
    total,
    pageCount: Math.ceil(total / params.pageSize),
  };
}

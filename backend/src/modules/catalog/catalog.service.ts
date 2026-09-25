import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { AppError } from "../../shared/appError.js";
import { orderByFor, type SortSpec } from "../../shared/listQuery.js";
import { normalizeName } from "../../shared/text.js";

// Re-exported so existing importers and tests keep working.
export { normalizeName };
import { postingTransactionOptions } from "../../shared/idempotency.js";

export interface CatalogActor {
  actorUserId: string;
  correlationId?: string;
}

export interface ListParams {
  sort?: SortSpec<"name" | "createdAt">;
  search?: string;
  isActive?: boolean;
  page: number;
  pageSize: number;
}

/// The product list also filters by category and stockability and sorts by
/// price and status (07 section 4.1).
export interface ProductListParams extends Omit<ListParams, "sort"> {
  sort?: SortSpec<
    "name" | "createdAt" | "salePriceTnd" | "approximateCostTnd" | "isActive"
  >;
  categoryId?: string;
  isStockable?: boolean;
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
        orderBy: orderByFor<
          "name" | "createdAt",
          Prisma.UnitOrderByWithRelationInput
        >(
          params.sort,
          {
            name: (direction) => [{ isActive: "desc" }, { name: direction }],
            createdAt: (direction) => [{ createdAt: direction }],
          },
          [{ isActive: "desc" }, { name: "asc" }],
          { id: "asc" },
        ),
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
        orderBy: orderByFor<
          "name" | "createdAt",
          Prisma.ProductCategoryOrderByWithRelationInput
        >(
          params.sort,
          {
            name: (direction) => [{ isActive: "desc" }, { name: direction }],
            createdAt: (direction) => [{ createdAt: direction }],
          },
          [{ isActive: "desc" }, { name: "asc" }],
          { id: "asc" },
        ),
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

  public async listRawMaterials(params: ListParams) {
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
                code: {
                  contains: params.search,
                  mode: "insensitive" as const,
                },
              },
              {
                category: {
                  contains: params.search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.rawMaterial.findMany({
        where,
        include: {
          baseUnit: true,
          conversions: {
            include: {
              unit: true,
            },
            orderBy: {
              unit: {
                name: "asc",
              },
            },
          },
        },
        orderBy: orderByFor<
          "name" | "createdAt",
          Prisma.RawMaterialOrderByWithRelationInput
        >(
          params.sort,
          {
            name: (direction) => [{ isActive: "desc" }, { name: direction }],
            createdAt: (direction) => [{ createdAt: direction }],
          },
          [{ isActive: "desc" }, { name: "asc" }],
          { id: "asc" },
        ),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.rawMaterial.count({ where }),
    ]);

    return paginated(items, total, params);
  }

  public async createRawMaterial(
    params: {
      code?: string;
      name: string;
      category?: string;
      baseUnitId: string;
      notes?: string;
      conversions?: { unitId: string; factorToBase: string }[];
    },
    actor: CatalogActor,
  ) {
    await this.assertActiveUnit(params.baseUnitId);
    const normalizedName = normalizeName(params.name);
    await this.assertActiveRawMaterialNameAvailable(normalizedName);

    const rawMaterial = await this.prisma.rawMaterial.create({
      data: {
        code: emptyToNull(params.code),
        name: params.name.trim(),
        normalizedName,
        category: emptyToNull(params.category),
        baseUnitId: params.baseUnitId,
        notes: emptyToNull(params.notes),
        createdByUserId: actor.actorUserId,
        updatedByUserId: actor.actorUserId,
        conversions: params.conversions
          ? {
              createMany: {
                data: params.conversions.map((conversion) => ({
                  unitId: conversion.unitId,
                  factorToBase: conversion.factorToBase,
                })),
                skipDuplicates: true,
              },
            }
          : undefined,
      },
      include: {
        baseUnit: true,
        conversions: {
          include: {
            unit: true,
          },
        },
      },
    });

    await this.audit({
      actor,
      action: "raw_material.create",
      entity: "raw_material",
      targetId: rawMaterial.id,
      after: rawMaterial,
    });

    return rawMaterial;
  }

  public async updateRawMaterial(
    rawMaterialId: string,
    params: {
      version: number;
      code?: string;
      name?: string;
      category?: string;
      baseUnitId?: string;
      notes?: string;
    },
    actor: CatalogActor,
  ) {
    const existing = await this.findRawMaterialOrThrow(rawMaterialId);
    const normalizedName =
      params.name !== undefined ? normalizeName(params.name) : undefined;

    if (params.baseUnitId) {
      await this.assertActiveUnit(params.baseUnitId);
    }

    if (existing.isActive && normalizedName) {
      await this.assertActiveRawMaterialNameAvailable(
        normalizedName,
        existing.id,
      );
    }

    const result = await this.prisma.rawMaterial.updateMany({
      where: {
        id: rawMaterialId,
        version: params.version,
      },
      data: {
        ...(params.code !== undefined
          ? { code: emptyToNull(params.code) }
          : {}),
        ...(params.name !== undefined
          ? { name: params.name.trim(), normalizedName }
          : {}),
        ...(params.category !== undefined
          ? { category: emptyToNull(params.category) }
          : {}),
        ...(params.baseUnitId !== undefined
          ? { baseUnitId: params.baseUnitId }
          : {}),
        ...(params.notes !== undefined
          ? { notes: emptyToNull(params.notes) }
          : {}),
        version: {
          increment: 1,
        },
        updatedByUserId: actor.actorUserId,
      },
    });

    assertVersionUpdated(result.count);
    const rawMaterial = await this.findRawMaterialOrThrow(rawMaterialId);

    await this.audit({
      actor,
      action: "raw_material.update",
      entity: "raw_material",
      targetId: rawMaterial.id,
      before: existing,
      after: rawMaterial,
    });

    return rawMaterial;
  }

  public async setRawMaterialActivation(
    rawMaterialId: string,
    params: { version: number; isActive: boolean },
    actor: CatalogActor,
  ) {
    const existing = await this.findRawMaterialOrThrow(rawMaterialId);

    if (params.isActive) {
      await this.assertActiveRawMaterialNameAvailable(
        existing.normalizedName,
        existing.id,
      );
    }

    const result = await this.prisma.rawMaterial.updateMany({
      where: {
        id: rawMaterialId,
        version: params.version,
      },
      data: {
        isActive: params.isActive,
        version: {
          increment: 1,
        },
        updatedByUserId: actor.actorUserId,
      },
    });

    assertVersionUpdated(result.count);
    const rawMaterial = await this.findRawMaterialOrThrow(rawMaterialId);

    await this.audit({
      actor,
      action: params.isActive
        ? "raw_material.activate"
        : "raw_material.deactivate",
      entity: "raw_material",
      targetId: rawMaterial.id,
      before: existing,
      after: rawMaterial,
    });

    return rawMaterial;
  }

  public async replaceRawMaterialConversions(
    rawMaterialId: string,
    params: {
      version: number;
      conversions: { unitId: string; factorToBase: string }[];
    },
    actor: CatalogActor,
  ) {
    const existing = await this.findRawMaterialOrThrow(rawMaterialId);
    await this.assertUnitsActive(params.conversions.map((item) => item.unitId));

    const result = await this.prisma.$transaction(async (tx) => {
      const update = await tx.rawMaterial.updateMany({
        where: {
          id: rawMaterialId,
          version: params.version,
        },
        data: {
          version: {
            increment: 1,
          },
          updatedByUserId: actor.actorUserId,
        },
      });

      assertVersionUpdated(update.count);

      await tx.rawMaterialUnitConversion.deleteMany({
        where: {
          rawMaterialId,
        },
      });
      await tx.rawMaterialUnitConversion.createMany({
        data: params.conversions.map((conversion) => ({
          rawMaterialId,
          unitId: conversion.unitId,
          factorToBase: conversion.factorToBase,
        })),
        skipDuplicates: true,
      });

      return tx.rawMaterial.findUniqueOrThrow({
        where: {
          id: rawMaterialId,
        },
        include: {
          baseUnit: true,
          conversions: {
            include: {
              unit: true,
            },
          },
        },
      });
    }, postingTransactionOptions);

    await this.audit({
      actor,
      action: "raw_material.assign_conversions",
      entity: "raw_material",
      targetId: rawMaterialId,
      before: existing,
      after: result,
    });

    return result;
  }

  public async listProducts(params: ProductListParams) {
    const normalizedSearch = params.search
      ? normalizeName(params.search)
      : undefined;
    const where = {
      ...(params.isActive === undefined ? {} : { isActive: params.isActive }),
      ...(params.categoryId ? { categoryId: params.categoryId } : {}),
      ...(params.isStockable === undefined
        ? {}
        : { isStockable: params.isStockable }),
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
                code: {
                  contains: params.search,
                  mode: "insensitive" as const,
                },
              },
              {
                barcode: {
                  contains: params.search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: {
          category: true,
          baseUnit: true,
        },
        orderBy: orderByFor<
          | "name"
          | "createdAt"
          | "salePriceTnd"
          | "approximateCostTnd"
          | "isActive",
          Prisma.ProductOrderByWithRelationInput
        >(
          params.sort,
          {
            name: (direction) => [{ isActive: "desc" }, { name: direction }],
            createdAt: (direction) => [{ createdAt: direction }],
            salePriceTnd: (direction) => [{ salePriceTnd: direction }],
            approximateCostTnd: (direction) => [
              { approximateCostTnd: { sort: direction, nulls: "last" } },
            ],
            isActive: (direction) => [{ isActive: direction }, { name: "asc" }],
          },
          [{ isActive: "desc" }, { name: "asc" }],
          { id: "asc" },
        ),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);

    return paginated(items, total, params);
  }

  public async createProduct(
    params: {
      code?: string;
      barcode?: string;
      name: string;
      categoryId: string;
      baseUnitId: string;
      salePriceTnd: string;
      approximateCostTnd?: string | null;
      isStockable: boolean;
      notes?: string;
    },
    actor: CatalogActor,
  ) {
    await this.assertActiveCategory(params.categoryId);
    await this.assertActiveUnit(params.baseUnitId);
    const normalizedName = normalizeName(params.name);
    await this.assertActiveProductNameAvailable(normalizedName);

    const product = await this.prisma.product.create({
      data: {
        code: emptyToNull(params.code),
        barcode: emptyToNull(params.barcode),
        name: params.name.trim(),
        normalizedName,
        categoryId: params.categoryId,
        baseUnitId: params.baseUnitId,
        salePriceTnd: params.salePriceTnd,
        approximateCostTnd: params.approximateCostTnd ?? null,
        isStockable: params.isStockable,
        notes: emptyToNull(params.notes),
        createdByUserId: actor.actorUserId,
        updatedByUserId: actor.actorUserId,
      },
      include: {
        category: true,
        baseUnit: true,
      },
    });

    await this.audit({
      actor,
      action: "product.create",
      entity: "product",
      targetId: product.id,
      after: product,
    });

    return product;
  }

  public async updateProduct(
    productId: string,
    params: {
      version: number;
      code?: string;
      barcode?: string;
      name?: string;
      categoryId?: string;
      baseUnitId?: string;
      salePriceTnd?: string;
      approximateCostTnd?: string | null;
      isStockable?: boolean;
      notes?: string;
    },
    actor: CatalogActor,
  ) {
    const existing = await this.findProductOrThrow(productId);
    const normalizedName =
      params.name !== undefined ? normalizeName(params.name) : undefined;

    if (params.categoryId) {
      await this.assertActiveCategory(params.categoryId);
    }
    if (params.baseUnitId) {
      await this.assertActiveUnit(params.baseUnitId);
    }
    if (existing.isActive && normalizedName) {
      await this.assertActiveProductNameAvailable(normalizedName, existing.id);
    }

    const result = await this.prisma.product.updateMany({
      where: {
        id: productId,
        version: params.version,
      },
      data: {
        ...(params.code !== undefined
          ? { code: emptyToNull(params.code) }
          : {}),
        ...(params.barcode !== undefined
          ? { barcode: emptyToNull(params.barcode) }
          : {}),
        ...(params.name !== undefined
          ? { name: params.name.trim(), normalizedName }
          : {}),
        ...(params.categoryId !== undefined
          ? { categoryId: params.categoryId }
          : {}),
        ...(params.baseUnitId !== undefined
          ? { baseUnitId: params.baseUnitId }
          : {}),
        ...(params.salePriceTnd !== undefined
          ? { salePriceTnd: params.salePriceTnd }
          : {}),
        ...(params.approximateCostTnd !== undefined
          ? { approximateCostTnd: params.approximateCostTnd }
          : {}),
        ...(params.isStockable !== undefined
          ? { isStockable: params.isStockable }
          : {}),
        ...(params.notes !== undefined
          ? { notes: emptyToNull(params.notes) }
          : {}),
        version: {
          increment: 1,
        },
        updatedByUserId: actor.actorUserId,
      },
    });

    assertVersionUpdated(result.count);
    const product = await this.findProductOrThrow(productId);

    await this.audit({
      actor,
      action: "product.update",
      entity: "product",
      targetId: product.id,
      before: existing,
      after: product,
    });

    return product;
  }

  public async setProductActivation(
    productId: string,
    params: { version: number; isActive: boolean },
    actor: CatalogActor,
  ) {
    const existing = await this.findProductOrThrow(productId);

    if (params.isActive) {
      await this.assertActiveProductNameAvailable(
        existing.normalizedName,
        existing.id,
      );
    }

    const result = await this.prisma.product.updateMany({
      where: {
        id: productId,
        version: params.version,
      },
      data: {
        isActive: params.isActive,
        version: {
          increment: 1,
        },
        updatedByUserId: actor.actorUserId,
      },
    });

    assertVersionUpdated(result.count);
    const product = await this.findProductOrThrow(productId);

    await this.audit({
      actor,
      action: params.isActive ? "product.activate" : "product.deactivate",
      entity: "product",
      targetId: product.id,
      before: existing,
      after: product,
    });

    return product;
  }

  public async getProduct(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { category: true, baseUnit: true },
    });

    if (!product) {
      throw new AppError({
        statusCode: 404,
        code: "PRODUCT_NOT_FOUND",
        message: "Produit introuvable.",
      });
    }

    return product;
  }

  public async getRawMaterial(rawMaterialId: string) {
    const rawMaterial = await this.prisma.rawMaterial.findUnique({
      where: { id: rawMaterialId },
      include: {
        baseUnit: true,
        conversions: { include: { unit: true }, orderBy: { createdAt: "asc" } },
      },
    });

    if (!rawMaterial) {
      throw new AppError({
        statusCode: 404,
        code: "RAW_MATERIAL_NOT_FOUND",
        message: "Matière première introuvable.",
      });
    }

    return rawMaterial;
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
        message: "Unité introuvable.",
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
        message: "Catégorie introuvable.",
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
        message: "Une catégorie active porte déjà ce nom.",
      });
    }
  }

  private async assertActiveUnit(unitId: string): Promise<void> {
    const unit = await this.prisma.unit.findFirst({
      where: {
        id: unitId,
        isActive: true,
      },
    });

    if (!unit) {
      throw new AppError({
        statusCode: 400,
        code: "ACTIVE_UNIT_REQUIRED",
        message: "Une unité active est requise.",
      });
    }
  }

  private async assertUnitsActive(unitIds: string[]): Promise<void> {
    const uniqueUnitIds = [...new Set(unitIds)];
    const count = await this.prisma.unit.count({
      where: {
        id: {
          in: uniqueUnitIds,
        },
        isActive: true,
      },
    });

    if (count !== uniqueUnitIds.length) {
      throw new AppError({
        statusCode: 400,
        code: "ACTIVE_UNIT_REQUIRED",
        message: "Toutes les conversions doivent utiliser des unites actives.",
      });
    }
  }

  private async assertActiveCategory(categoryId: string): Promise<void> {
    const category = await this.prisma.productCategory.findFirst({
      where: {
        id: categoryId,
        isActive: true,
      },
    });

    if (!category) {
      throw new AppError({
        statusCode: 400,
        code: "ACTIVE_CATEGORY_REQUIRED",
        message: "Une catégorie active est requise.",
      });
    }
  }

  private async assertActiveRawMaterialNameAvailable(
    normalizedName: string,
    exceptId?: string,
  ): Promise<void> {
    const existing = await this.prisma.rawMaterial.findFirst({
      where: {
        normalizedName,
        isActive: true,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });

    if (existing) {
      throw new AppError({
        statusCode: 409,
        code: "ACTIVE_RAW_MATERIAL_NAME_NOT_UNIQUE",
        message: "Une matière première active porte déjà ce nom.",
      });
    }
  }

  private async assertActiveProductNameAvailable(
    normalizedName: string,
    exceptId?: string,
  ): Promise<void> {
    const existing = await this.prisma.product.findFirst({
      where: {
        normalizedName,
        isActive: true,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });

    if (existing) {
      throw new AppError({
        statusCode: 409,
        code: "ACTIVE_PRODUCT_NAME_NOT_UNIQUE",
        message: "Un produit actif porte déjà ce nom.",
      });
    }
  }

  private async findRawMaterialOrThrow(rawMaterialId: string) {
    const rawMaterial = await this.prisma.rawMaterial.findUnique({
      where: {
        id: rawMaterialId,
      },
      include: {
        baseUnit: true,
        conversions: {
          include: {
            unit: true,
          },
        },
      },
    });

    if (!rawMaterial) {
      throw new AppError({
        statusCode: 404,
        code: "RAW_MATERIAL_NOT_FOUND",
        message: "Matière première introuvable.",
      });
    }

    return rawMaterial;
  }

  private async findProductOrThrow(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: {
        id: productId,
      },
      include: {
        category: true,
        baseUnit: true,
      },
    });

    if (!product) {
      throw new AppError({
        statusCode: 404,
        code: "PRODUCT_NOT_FOUND",
        message: "Produit introuvable.",
      });
    }

    return product;
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

function assertVersionUpdated(count: number): void {
  if (count === 0) {
    throw new AppError({
      statusCode: 409,
      code: "VERSION_CONFLICT",
      message: "Cette fiche a été modifiée. Rechargez puis réessayez.",
    });
  }
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

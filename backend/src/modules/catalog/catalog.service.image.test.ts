import type { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { MemoryMediaStore } from "../../shared/media.js";
import { CatalogService } from "./catalog.service.js";

/// Issue #64: the photo is stored under a fresh key, the product points at
/// it, the previous file goes, the version moves, and the audit says so.
function makePrisma(imageKey: string | null = null) {
  const product = {
    id: "product-1",
    name: "Pain complet",
    imageKey,
    imageUpdatedAt: null as Date | null,
    version: 3,
    category: { id: "category-1", name: "Pains" },
    baseUnit: { id: "unit-1", name: "Pièce" },
  };
  const update = vi.fn(async (args: { data: Record<string, unknown> }) => {
    product.imageKey = args.data.imageKey as string | null;
    product.version += 1;
    return { ...product };
  });
  const auditCreate = vi.fn(async () => ({}));

  return {
    prisma: {
      product: {
        findUnique: vi.fn(async () => ({ ...product })),
        update,
      },
      auditEvent: { create: auditCreate },
    } as unknown as PrismaClient,
    update,
    auditCreate,
  };
}

const actor = { actorUserId: "user-1" };

async function photo(): Promise<Buffer> {
  return sharp({
    create: { width: 800, height: 600, channels: 3, background: "#173f6d" },
  })
    .jpeg()
    .toBuffer();
}

describe("CatalogService product photo", () => {
  it("stores the re-encoded photo, points the product at it and drops the old one", async () => {
    const media = new MemoryMediaStore();
    await media.write("products/old.webp", Buffer.from("old"));
    const { prisma, update, auditCreate } = makePrisma("products/old.webp");
    const service = new CatalogService(prisma, media);

    const product = await service.setProductImage(
      "product-1",
      await photo(),
      actor,
    );

    expect(product.imageKey).toMatch(/^products\/[0-9a-f-]{36}\.webp$/);
    expect(media.files.has("products/old.webp")).toBe(false);
    const stored = media.files.get(product.imageKey as string);
    expect(stored).toBeDefined();
    expect((await sharp(stored).metadata()).format).toBe("webp");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          imageKey: product.imageKey,
          version: { increment: 1 },
          updatedByUserId: "user-1",
        }),
      }),
    );
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "product.image",
          before: { imageKey: "products/old.webp" },
        }),
      }),
    );
  });

  it("writes nothing when the upload is not an image", async () => {
    const media = new MemoryMediaStore();
    const { prisma, update } = makePrisma();
    const service = new CatalogService(prisma, media);

    await expect(
      service.setProductImage("product-1", Buffer.from("plain text"), actor),
    ).rejects.toMatchObject({ code: "PRODUCT_IMAGE_UNSUPPORTED" });
    expect(media.files.size).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });

  it("removes the photo and the file, once", async () => {
    const media = new MemoryMediaStore();
    await media.write("products/old.webp", Buffer.from("old"));
    const { prisma, update } = makePrisma("products/old.webp");
    const service = new CatalogService(prisma, media);

    const product = await service.removeProductImage("product-1", actor);
    expect(product.imageKey).toBeNull();
    expect(media.files.size).toBe(0);
    expect(update).toHaveBeenCalledTimes(1);

    // A product without a photo is left alone.
    await service.removeProductImage("product-1", actor);
    expect(update).toHaveBeenCalledTimes(1);
  });
});

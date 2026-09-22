import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { DistributionService } from "./distribution.service.js";

const soldAt = new Date("2026-09-22T09:00:00.000Z");

describe("DistributionService direct sales", () => {
  // DST-005, DST-006 and DST-008: stock leaves main immediately, the full
  // amount is recognized once, and the unpaid remainder is receivable.
  it("posts a partially paid direct sale with stock, revenue, and receivable", async () => {
    const { service, prisma } = makeService();

    const result = await service.postDirectSale(
      {
        idempotencyKey: "sale-1",
        distributorId: "distributor-1",
        soldAt,
        paidAmountTnd: "30.000",
        lines: [
          {
            productId: "product-1",
            quantity: "40",
            unitPriceTnd: "2.000",
          },
        ],
      },
      { actorUserId: "user-1" },
    );

    expect(result.sale).toMatchObject({
      reference: "VD-000001",
      totalTnd: "80.000",
      paidAmountTnd: "30.000",
      remainingDueTnd: "50.000",
      paymentState: "PARTIALLY_PAID",
    });
    expect(prisma.store.inventoryMovements).toEqual([
      expect.objectContaining({
        productId: "product-1",
        movementType: "DISTRIBUTOR_DIRECT_SALE",
        quantityDelta: "-40.000000",
      }),
    ]);
    // Full sale receivable, then the money actually received reduces it.
    expect(prisma.store.distributorLedgerEntries).toEqual([
      expect.objectContaining({
        entryType: "SALE_RECEIVABLE",
        amountTnd: "80.000",
      }),
      expect.objectContaining({
        entryType: "PAYMENT",
        amountTnd: "-30.000",
      }),
    ]);
    expect(prisma.store.distributorPayments).toHaveLength(1);
  });

  it("uses the entered price rather than the catalogue price", async () => {
    const { service, prisma } = makeService();

    const result = await service.postDirectSale(
      {
        idempotencyKey: "sale-1",
        distributorId: "distributor-1",
        soldAt,
        lines: [
          {
            productId: "product-1",
            quantity: "10",
            unitPriceTnd: "1.750",
          },
        ],
      },
      { actorUserId: "user-1" },
    );

    // The catalogue sale price is 2.500; the distributor price was entered.
    expect(result.sale.totalTnd).toBe("17.500");
    expect(prisma.store.distributorSaleLines[0]).toMatchObject({
      unitPriceTnd: "1.750",
      lineTotalTnd: "17.500",
    });
  });

  it("defaults to a fully paid sale with no receivable left", async () => {
    const { service, prisma } = makeService();

    const result = await service.postDirectSale(
      {
        idempotencyKey: "sale-1",
        distributorId: "distributor-1",
        soldAt,
        lines: [
          {
            productId: "product-1",
            quantity: "10",
            unitPriceTnd: "2.000",
          },
        ],
      },
      { actorUserId: "user-1" },
    );

    expect(result.sale).toMatchObject({
      paymentState: "PAID",
      remainingDueTnd: "0.000",
    });
    expect(
      prisma.store.distributorLedgerEntries.reduce(
        (total, entry) => total + Number(entry.amountTnd),
        0,
      ),
    ).toBe(0);
  });

  it("returns the same sale on an idempotent retry", async () => {
    const { service, prisma } = makeService();
    const payload = {
      idempotencyKey: "sale-1",
      distributorId: "distributor-1",
      soldAt,
      lines: [
        {
          productId: "product-1",
          quantity: "10",
          unitPriceTnd: "2.000",
        },
      ],
    };

    const first = await service.postDirectSale(payload, {
      actorUserId: "user-1",
    });
    const retry = await service.postDirectSale(payload, {
      actorUserId: "user-1",
    });

    expect(retry.sale.id).toBe(first.sale.id);
    expect(prisma.store.distributorSales).toHaveLength(1);
    expect(prisma.store.inventoryMovements).toHaveLength(1);
  });

  it("rejects paying more than the sale total", async () => {
    const { service } = makeService();

    await expect(
      service.postDirectSale(
        {
          idempotencyKey: "sale-1",
          distributorId: "distributor-1",
          soldAt,
          paidAmountTnd: "21.000",
          lines: [
            {
              productId: "product-1",
              quantity: "10",
              unitPriceTnd: "2.000",
            },
          ],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "DISTRIBUTOR_OVERPAYMENT_REJECTED",
    });
  });

  it("rejects a sale to an inactive distributor", async () => {
    const { service, prisma } = makeService();
    prisma.store.distributors[0].isActive = false;

    await expect(
      service.postDirectSale(
        {
          idempotencyKey: "sale-1",
          distributorId: "distributor-1",
          soldAt,
          lines: [
            {
              productId: "product-1",
              quantity: "10",
              unitPriceTnd: "2.000",
            },
          ],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "ACTIVE_DISTRIBUTOR_REQUIRED",
    });
  });

  it("rejects the same product twice in one sale", async () => {
    const { service } = makeService();

    await expect(
      service.postDirectSale(
        {
          idempotencyKey: "sale-1",
          distributorId: "distributor-1",
          soldAt,
          lines: [
            { productId: "product-1", quantity: "1", unitPriceTnd: "2.000" },
            { productId: "product-1", quantity: "2", unitPriceTnd: "2.000" },
          ],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "DUPLICATE_DISTRIBUTOR_SALE_LINE",
    });
  });

  it("does not move stock for a non-stockable product", async () => {
    const { service, prisma } = makeService();
    prisma.store.products[0].isStockable = false;

    await service.postDirectSale(
      {
        idempotencyKey: "sale-1",
        distributorId: "distributor-1",
        soldAt,
        lines: [
          {
            productId: "product-1",
            quantity: "10",
            unitPriceTnd: "2.000",
          },
        ],
      },
      { actorUserId: "user-1" },
    );

    expect(prisma.store.inventoryMovements).toHaveLength(0);
  });
});

function makeService() {
  const prisma = new DistributionPrismaDouble();
  const service = new DistributionService(prisma as unknown as PrismaClient);

  return { prisma, service };
}

type Row = Record<string, unknown>;

interface DistributionStore {
  referenceSequence: number;
  distributors: Array<{ id: string; isActive: boolean; name: string }>;
  products: Array<{
    id: string;
    name: string;
    baseUnitId: string;
    salePriceTnd: string;
    isActive: boolean;
    isStockable: boolean;
    baseUnit: { id: string; name: string };
  }>;
  stockLocations: Array<{ id: string; code: string }>;
  distributorSales: Row[];
  distributorSaleLines: Row[];
  distributorPayments: Row[];
  distributorPaymentAllocations: Row[];
  distributorLedgerEntries: Array<Row & { amountTnd: string }>;
  inventoryMovements: Row[];
  auditEvents: Row[];
  idempotencyRecords: Array<{
    scope: string;
    key: string;
    requestHash: string;
    response: unknown;
  }>;
}

class DistributionPrismaDouble {
  public store = createStore();

  public readonly idempotencyRecord = {
    findUnique: async (args: {
      where: { scope_key: { scope: string; key: string } };
    }) =>
      this.store.idempotencyRecords.find(
        (record) =>
          record.scope === args.where.scope_key.scope &&
          record.key === args.where.scope_key.key,
      ) ?? null,
  };

  public async $transaction<TResult>(
    action: (tx: ReturnType<typeof makeTransactionClient>) => Promise<TResult>,
  ): Promise<TResult> {
    const staged = structuredClone(this.store) as DistributionStore;
    const result = await action(makeTransactionClient(staged));
    this.store = staged;
    return result;
  }
}

function createStore(): DistributionStore {
  return {
    referenceSequence: 0,
    distributors: [
      { id: "distributor-1", isActive: true, name: "Distributeur Nord" },
    ],
    products: [
      {
        id: "product-1",
        name: "Baguette",
        baseUnitId: "unit-piece",
        salePriceTnd: "2.500",
        isActive: true,
        isStockable: true,
        baseUnit: { id: "unit-piece", name: "Piece" },
      },
    ],
    stockLocations: [{ id: "location-1", code: "main" }],
    distributorSales: [],
    distributorSaleLines: [],
    distributorPayments: [],
    distributorPaymentAllocations: [],
    distributorLedgerEntries: [],
    inventoryMovements: [],
    auditEvents: [],
    idempotencyRecords: [],
  };
}

function makeTransactionClient(store: DistributionStore) {
  const hydrateSale = (sale: Row) => ({
    ...sale,
    distributor:
      store.distributors.find((item) => item.id === sale.distributorId) ?? null,
    lines: store.distributorSaleLines.filter((line) => line.saleId === sale.id),
  });

  return {
    $queryRawUnsafe: async (sql: string) => {
      if (sql.includes("nextval")) {
        store.referenceSequence += 1;
        return [{ nextval: BigInt(store.referenceSequence) }];
      }

      return [];
    },
    idempotencyRecord: {
      create: async (args: {
        data: { scope: string; key: string; requestHash: string };
      }) => {
        store.idempotencyRecords.push({ ...args.data, response: null });
      },
      update: async (args: {
        where: { scope_key: { scope: string; key: string } };
        data: { response: unknown };
      }) => {
        const record = store.idempotencyRecords.find(
          (item) =>
            item.scope === args.where.scope_key.scope &&
            item.key === args.where.scope_key.key,
        );

        if (!record) {
          throw new Error("missing idempotency record");
        }

        record.response = args.data.response;
      },
    },
    distributor: {
      findUnique: async (args: { where: { id: string } }) =>
        store.distributors.find((item) => item.id === args.where.id) ?? null,
    },
    product: {
      findMany: async (args: { where: { id: { in: string[] } } }) =>
        store.products.filter((product) =>
          args.where.id.in.includes(product.id),
        ),
    },
    stockLocation: {
      findUnique: async (args: { where: { code: string } }) =>
        store.stockLocations.find(
          (location) => location.code === args.where.code,
        ) ?? null,
    },
    distributorSale: {
      create: async (args: {
        data: Row & { lines: { createMany: { data: Row[] } } };
      }) => {
        const { lines, ...saleData } = args.data;
        const sale = {
          id: `distributor-sale-${store.distributorSales.length + 1}`,
          ...saleData,
        };
        store.distributorSales.push(sale);
        lines.createMany.data.forEach((line) => {
          store.distributorSaleLines.push({
            id: `distributor-sale-line-${store.distributorSaleLines.length + 1}`,
            saleId: sale.id,
            ...line,
          });
        });

        return sale;
      },
      findUniqueOrThrow: async (args: { where: { id: string } }) => {
        const sale = store.distributorSales.find(
          (item) => item.id === args.where.id,
        );

        if (!sale) {
          throw new Error("missing distributor sale");
        }

        return hydrateSale(sale);
      },
    },
    distributorPayment: {
      create: async (args: {
        data: Row & { allocations?: { createMany: { data: Row[] } } };
      }) => {
        const { allocations, ...paymentData } = args.data;
        const payment = {
          id: `distributor-payment-${store.distributorPayments.length + 1}`,
          ...paymentData,
        };
        store.distributorPayments.push(payment);
        allocations?.createMany.data.forEach((allocation) => {
          store.distributorPaymentAllocations.push({
            paymentId: payment.id,
            ...allocation,
          });
        });

        return payment;
      },
    },
    distributorLedgerEntry: {
      create: async (args: { data: Row & { amountTnd: string } }) => {
        store.distributorLedgerEntries.push({
          id: `distributor-ledger-${store.distributorLedgerEntries.length + 1}`,
          ...args.data,
        });
      },
    },
    inventoryMovement: {
      createMany: async (args: { data: Row[] }) => {
        store.inventoryMovements.push(...args.data);
      },
    },
    auditEvent: {
      create: async (args: { data: Row }) => {
        store.auditEvents.push(args.data);
      },
    },
  };
}

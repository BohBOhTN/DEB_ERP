import type { PrismaClient } from "@prisma/client";
import { DistributionService } from "./distribution.service.js";

/// Shared in-memory Prisma stand-in for the distribution unit tests. It models
/// only what the posting commands touch inside a transaction; read paths that
/// go straight to the client are covered by the route tests instead.
export type Row = Record<string, unknown>;

export interface DistributionStore {
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
  distributorDispatches: Row[];
  distributorDispatchLines: Row[];
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

export function makeDistributionService(prisma: PrismaClient) {
  return new DistributionService(prisma);
}

export class DistributionPrismaDouble {
  public store = createDistributionStore();

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
    action: (
      tx: ReturnType<typeof makeDistributionTransactionClient>,
    ) => Promise<TResult>,
  ): Promise<TResult> {
    const staged = structuredClone(this.store) as DistributionStore;
    const result = await action(makeDistributionTransactionClient(staged));
    this.store = staged;
    return result;
  }
}

export function createDistributionStore(): DistributionStore {
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
    distributorDispatches: [],
    distributorDispatchLines: [],
    distributorPayments: [],
    distributorPaymentAllocations: [],
    distributorLedgerEntries: [],
    inventoryMovements: [],
    auditEvents: [],
    idempotencyRecords: [],
  };
}

export function makeDistributionTransactionClient(store: DistributionStore) {
  const hydrateSale = (sale: Row) => ({
    ...sale,
    distributor:
      store.distributors.find((item) => item.id === sale.distributorId) ?? null,
    lines: store.distributorSaleLines.filter((line) => line.saleId === sale.id),
  });
  const hydrateDispatch = (dispatch: Row) => ({
    ...dispatch,
    distributor:
      store.distributors.find((item) => item.id === dispatch.distributorId) ??
      null,
    lines: store.distributorDispatchLines.filter(
      (line) => line.dispatchId === dispatch.id,
    ),
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
    distributorDispatch: {
      create: async (args: {
        data: Row & { lines: { createMany: { data: Row[] } } };
      }) => {
        const { lines, ...dispatchData } = args.data;
        const dispatch = {
          id: `distributor-dispatch-${store.distributorDispatches.length + 1}`,
          ...dispatchData,
        };
        store.distributorDispatches.push(dispatch);
        lines.createMany.data.forEach((line) => {
          store.distributorDispatchLines.push({
            id: `dispatch-line-${store.distributorDispatchLines.length + 1}`,
            dispatchId: dispatch.id,
            // The database defaults these to zero.
            settledSoldQuantity: "0",
            returnedQuantity: "0",
            unaccountedQuantity: "0",
            ...line,
          });
        });

        return dispatch;
      },
      findUniqueOrThrow: async (args: { where: { id: string } }) => {
        const dispatch = store.distributorDispatches.find(
          (item) => item.id === args.where.id,
        );

        if (!dispatch) {
          throw new Error("missing distributor dispatch");
        }

        return hydrateDispatch(dispatch);
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

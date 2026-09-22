import {
  CustomerLedgerBalanceKind,
  CustomerLedgerEntryType,
  DistributorLedgerEntryType,
  ExpenseStatus,
  PosSessionStatus,
  PurchasePaymentTerms,
  PurchaseStatus,
  SalePaymentState,
  SaleStatus,
  SupplierLedgerEntryType,
  type PrismaClient,
} from "@prisma/client";
import { normalizeName } from "../shared/text.js";

/// A synthetic dataset large enough to expose queries that scale with
/// history rather than with the page: about ten thousand customer ledger
/// rows plus proportionate suppliers, distributors, expenses and products.
/// Everything is tagged with the run id so cleanup removes only what this
/// run created; the database is never reset.
export interface PerformanceFixtureSizes {
  products: number;
  customers: number;
  customerEntriesPerCustomer: number;
  suppliers: number;
  purchasesPerSupplier: number;
  distributors: number;
  dispatchesPerDistributor: number;
  expenses: number;
}

export const defaultFixtureSizes: PerformanceFixtureSizes = {
  products: 5_000,
  customers: 200,
  customerEntriesPerCustomer: 50,
  suppliers: 50,
  purchasesPerSupplier: 20,
  distributors: 10,
  dispatchesPerDistributor: 50,
  expenses: 3_000,
};

export type PerformanceFixture = Awaited<
  ReturnType<typeof seedPerformanceFixture>
>;

const mainCode = "main";
/// PostgreSQL accepts at most 65 535 bind parameters per statement and Prisma
/// does not split a createMany for it, so bulk inserts go in slices small
/// enough for the widest row.
const chunkSize = 1_000;

async function createInChunks<TRow>(
  model: { createMany: (args: { data: TRow[] }) => Promise<unknown> },
  args: { data: TRow[] },
): Promise<void> {
  for (let index = 0; index < args.data.length; index += chunkSize) {
    await model.createMany({ data: args.data.slice(index, index + chunkSize) });
  }
}
const dayMs = 24 * 60 * 60 * 1000;

function daysAgo(days: number, base = Date.now()) {
  return new Date(base - days * dayMs);
}

function money(value: number): string {
  return value.toFixed(3);
}

export async function seedPerformanceFixture(
  prisma: PrismaClient,
  runId: string,
  sizes: PerformanceFixtureSizes = defaultFixtureSizes,
) {
  const user = await prisma.user.create({
    data: {
      email: `perf+${runId}@dar-el-barka.test`,
      displayName: `Perf ${runId}`,
      passwordHash: "not-a-real-hash",
    },
  });
  const unit = await prisma.unit.create({
    data: { code: `PERF-${runId}`, name: "Pièce", symbol: "pc" },
  });
  const category = await prisma.productCategory.create({
    data: {
      name: `Perf ${runId}`,
      normalizedName: `perf ${runId}`,
      createdByUserId: user.id,
      updatedByUserId: user.id,
    },
  });

  // Products: one searchable accented name among thousands of decoys, so the
  // trigram search has something real to find.
  await createInChunks(prisma.product, {
    data: Array.from({ length: sizes.products }, (_, index) => {
      const name =
        index === 0 ? `Thé à la menthe ${runId}` : `Produit ${index} ${runId}`;
      return {
        name,
        normalizedName: normalizeName(name),
        code: `P${runId}-${index}`,
        categoryId: category.id,
        baseUnitId: unit.id,
        salePriceTnd: money(1 + (index % 20)),
        isStockable: true,
        createdByUserId: user.id,
        updatedByUserId: user.id,
      };
    }),
  });
  const products = await prisma.product.findMany({
    where: { categoryId: category.id },
    select: { id: true, name: true },
    take: 5,
  });

  await prisma.stockLocation.upsert({
    where: { code: mainCode },
    create: { code: mainCode, name: "Stock principal", isMain: true },
    update: {},
  });
  const terminal = await prisma.posTerminal.upsert({
    where: { code: mainCode },
    create: { code: mainCode, name: "Caisse principale" },
    update: { isActive: true },
  });

  // A closed session owns every sale so the open-session invariant is never
  // touched by the fixture.
  const session = await prisma.posSession.create({
    data: {
      terminalId: terminal.id,
      status: PosSessionStatus.CLOSED,
      openedAt: daysAgo(400),
      closedAt: daysAgo(399),
      openedByUserId: user.id,
      closedByUserId: user.id,
      openingCashTnd: money(0),
      // A closed session must carry its closing amounts (database check).
      countedCashTnd: money(0),
      expectedCashTnd: money(0),
      cashDifferenceTnd: money(0),
    },
  });

  // Customers with credit history: every customer has sales, receivable
  // entries, payments and one advance entry.
  await createInChunks(prisma.customer, {
    data: Array.from({ length: sizes.customers }, (_, index) => ({
      name: `Client ${index} ${runId}`,
      normalizedName: `client ${index} ${runId}`,
      phone: `2160${String(index).padStart(6, "0")}`,
      createdByUserId: user.id,
      updatedByUserId: user.id,
    })),
  });
  const customers = await prisma.customer.findMany({
    where: { normalizedName: { endsWith: runId } },
    select: { id: true },
  });

  const salesPerCustomer = Math.max(
    1,
    Math.floor(sizes.customerEntriesPerCustomer / 2),
  );
  await createInChunks(prisma.sale, {
    data: customers.flatMap((customer, customerIndex) =>
      Array.from({ length: salesPerCustomer }, (_, saleIndex) => {
        const total = 10 + ((customerIndex + saleIndex) % 40);
        return {
          sessionId: session.id,
          customerId: customer.id,
          status: SaleStatus.POSTED,
          paymentState: SalePaymentState.PARTIALLY_PAID,
          soldAt: daysAgo(saleIndex * 3),
          totalTnd: money(total),
          paidAmountTnd: money(total / 2),
          remainingDueTnd: money(total / 2),
          postedAt: daysAgo(saleIndex * 3),
          postedByUserId: user.id,
        };
      }),
    ),
  });
  const sales = await prisma.sale.findMany({
    where: { sessionId: session.id },
    select: { id: true, customerId: true, totalTnd: true, soldAt: true },
  });

  await createInChunks(prisma.customerLedgerEntry, {
    data: sales.flatMap((sale) => [
      {
        customerId: sale.customerId as string,
        saleId: sale.id,
        balanceKind: CustomerLedgerBalanceKind.RECEIVABLE,
        entryType: CustomerLedgerEntryType.SALE_RECEIVABLE,
        amountTnd: sale.totalTnd.toFixed(3),
        occurredAt: sale.soldAt,
        actorUserId: user.id,
      },
      {
        customerId: sale.customerId as string,
        saleId: sale.id,
        balanceKind: CustomerLedgerBalanceKind.RECEIVABLE,
        entryType: CustomerLedgerEntryType.PAYMENT,
        amountTnd: sale.totalTnd.div(2).negated().toFixed(3),
        occurredAt: sale.soldAt,
        actorUserId: user.id,
      },
    ]),
  });

  // Suppliers with posted purchases, payables and partial payments.
  await createInChunks(prisma.supplier, {
    data: Array.from({ length: sizes.suppliers }, (_, index) => ({
      name: `Fournisseur ${index} ${runId}`,
      normalizedName: `fournisseur ${index} ${runId}`,
      createdByUserId: user.id,
      updatedByUserId: user.id,
    })),
  });
  const suppliers = await prisma.supplier.findMany({
    where: { normalizedName: { endsWith: runId } },
    select: { id: true },
  });
  await createInChunks(prisma.purchase, {
    data: suppliers.flatMap((supplier, supplierIndex) =>
      Array.from({ length: sizes.purchasesPerSupplier }, (_, index) => {
        const total = 100 + ((supplierIndex + index) % 50);
        return {
          supplierId: supplier.id,
          purchaseDate: daysAgo(index * 5),
          status: PurchaseStatus.POSTED,
          paymentTerms: PurchasePaymentTerms.PARTIAL,
          dueDate: daysAgo(index * 5 - 30),
          totalTnd: money(total),
          paidAmountTnd: money(total / 4),
          postedAt: daysAgo(index * 5),
          postedByUserId: user.id,
          createdByUserId: user.id,
          updatedByUserId: user.id,
        };
      }),
    ),
  });
  const purchases = await prisma.purchase.findMany({
    where: { supplierId: { in: suppliers.map((row) => row.id) } },
    select: { id: true, supplierId: true, totalTnd: true, purchaseDate: true },
  });
  await createInChunks(prisma.supplierLedgerEntry, {
    data: purchases.flatMap((purchase) => [
      {
        supplierId: purchase.supplierId,
        purchaseId: purchase.id,
        entryType: SupplierLedgerEntryType.PURCHASE_PAYABLE,
        amountTnd: purchase.totalTnd.toFixed(3),
        occurredAt: purchase.purchaseDate,
        actorUserId: user.id,
      },
      {
        supplierId: purchase.supplierId,
        purchaseId: purchase.id,
        entryType: SupplierLedgerEntryType.PAYMENT,
        amountTnd: purchase.totalTnd.div(4).negated().toFixed(3),
        occurredAt: purchase.purchaseDate,
        actorUserId: user.id,
      },
    ]),
  });

  // Distributors with open dispatches held in custody and receivables.
  await createInChunks(prisma.distributor, {
    data: Array.from({ length: sizes.distributors }, (_, index) => ({
      name: `Distributeur ${index} ${runId}`,
      normalizedName: `distributeur ${index} ${runId}`,
      createdByUserId: user.id,
      updatedByUserId: user.id,
    })),
  });
  const distributors = await prisma.distributor.findMany({
    where: { normalizedName: { endsWith: runId } },
    select: { id: true },
  });
  for (const [distributorIndex, distributor] of distributors.entries()) {
    await createInChunks(prisma.distributorDispatch, {
      data: Array.from(
        { length: sizes.dispatchesPerDistributor },
        (_, index) => ({
          reference: `BL-PERF-${runId}-${distributorIndex}-${index}`,
          distributorId: distributor.id,
          dispatchedAt: daysAgo(index),
          postedByUserId: user.id,
        }),
      ),
    });
  }
  const dispatches = await prisma.distributorDispatch.findMany({
    where: { reference: { startsWith: `BL-PERF-${runId}` } },
    select: { id: true },
  });
  await createInChunks(prisma.distributorDispatchLine, {
    data: dispatches.map((dispatch, index) => ({
      dispatchId: dispatch.id,
      productId: products[index % products.length]?.id as string,
      unitId: unit.id,
      dispatchedQuantity: "40.000000",
      settledSoldQuantity: "10.000000",
      productNameSnapshot: products[index % products.length]?.name as string,
      unitNameSnapshot: "Pièce",
    })),
  });
  await createInChunks(prisma.distributorLedgerEntry, {
    data: distributors.flatMap((distributor, index) =>
      Array.from({ length: 200 }, (_, entryIndex) => ({
        distributorId: distributor.id,
        entryType:
          entryIndex % 2 === 0
            ? DistributorLedgerEntryType.SETTLEMENT_RECEIVABLE
            : DistributorLedgerEntryType.PAYMENT,
        amountTnd: money(entryIndex % 2 === 0 ? 50 + index : -(20 + index)),
        occurredAt: daysAgo(entryIndex),
        actorUserId: user.id,
      })),
    ),
  });

  // Expenses over the last year, posted, across a few categories.
  const expenseCategory = await prisma.expenseCategory.create({
    data: {
      name: `Perf ${runId}`,
      normalizedName: `perf ${runId}`,
      createdByUserId: user.id,
      updatedByUserId: user.id,
    },
  });
  await createInChunks(prisma.expense, {
    data: Array.from({ length: sizes.expenses }, (_, index) => ({
      reference: `DEP-PERF-${runId}-${index}`,
      categoryId: expenseCategory.id,
      status: ExpenseStatus.POSTED,
      expenseDate: daysAgo(index % 365),
      amountTnd: money(5 + (index % 30)),
      description: `Dépense ${index}`,
      responsibleUserId: user.id,
      postedAt: daysAgo(index % 365),
      postedByUserId: user.id,
      createdByUserId: user.id,
      updatedByUserId: user.id,
    })),
  });

  return {
    runId,
    user,
    unit,
    category,
    products,
    session,
    customers,
    suppliers,
    distributors,
    expenseCategory,
  };
}

/// Removes only what the fixture created, children before parents.
export async function cleanUpPerformanceFixture(
  prisma: PrismaClient,
  fixture: PerformanceFixture | undefined,
) {
  if (!fixture) {
    return;
  }

  const customerIds = fixture.customers.map((row) => row.id);
  const supplierIds = fixture.suppliers.map((row) => row.id);
  const distributorIds = fixture.distributors.map((row) => row.id);

  await prisma.customerLedgerEntry.deleteMany({
    where: { customerId: { in: customerIds } },
  });
  await prisma.sale.deleteMany({ where: { sessionId: fixture.session.id } });
  await prisma.posSession.delete({ where: { id: fixture.session.id } });
  await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });

  await prisma.supplierLedgerEntry.deleteMany({
    where: { supplierId: { in: supplierIds } },
  });
  await prisma.purchase.deleteMany({
    where: { supplierId: { in: supplierIds } },
  });
  await prisma.supplier.deleteMany({ where: { id: { in: supplierIds } } });

  await prisma.distributorLedgerEntry.deleteMany({
    where: { distributorId: { in: distributorIds } },
  });
  await prisma.distributorDispatchLine.deleteMany({
    where: { dispatch: { distributorId: { in: distributorIds } } },
  });
  await prisma.distributorDispatch.deleteMany({
    where: { distributorId: { in: distributorIds } },
  });
  await prisma.distributor.deleteMany({
    where: { id: { in: distributorIds } },
  });

  await prisma.expense.deleteMany({
    where: { categoryId: fixture.expenseCategory.id },
  });
  await prisma.expenseCategory.delete({
    where: { id: fixture.expenseCategory.id },
  });

  await prisma.product.deleteMany({
    where: { categoryId: fixture.category.id },
  });
  await prisma.productCategory.delete({ where: { id: fixture.category.id } });
  await prisma.unit.delete({ where: { id: fixture.unit.id } });
  await prisma.auditEvent.deleteMany({
    where: { actorUserId: fixture.user.id },
  });
  await prisma.user.delete({ where: { id: fixture.user.id } });
}

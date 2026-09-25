import {
  CustomerLedgerBalanceKind,
  CustomerOrderAdvanceMovement,
  CustomerOrderStatus,
  DistributorDispatchStatus,
  PosSessionStatus,
  Prisma,
  PurchasePaymentTerms,
  PurchaseStatus,
  SalePaymentMovement,
  SaleStatus,
  ExpenseStatus,
  type PrismaClient,
} from "@prisma/client";
import { sumOrZero } from "../../shared/ledger.js";
import {
  businessDateOf,
  endOfBusinessDay,
  startOfBusinessDay,
} from "../../shared/listQuery.js";
import { actionLabel, entityLabel, entityModule } from "../audit/labels.js";

/// OD-V2-001: the home page is an operational summary, not analytics. Every
/// block is computed by the database and appears only when the caller holds
/// the permission that would let them see the same figure on its own screen.
export interface HomeSummaryParams {
  /// Business day, `YYYY-MM-DD` in Africa/Tunis. Defaults to today.
  date?: string;
  permissions: ReadonlySet<string>;
}

const recentEventCount = 8;
const negativeStockSample = 5;
const dayMs = 24 * 60 * 60 * 1000;

export class HomeService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async getSummary(params: HomeSummaryParams) {
    const now = new Date();
    const day = params.date ?? businessDateOf(now);
    const dayStart = startOfBusinessDay(day);
    const dayEnd = endOfBusinessDay(day);
    const previousStart = new Date(dayStart.getTime() - dayMs);
    const previousEnd = new Date(dayStart.getTime() - 1);
    const can = (key: string) => params.permissions.has(key);

    const [
      sales,
      openSession,
      receivables,
      payables,
      orders,
      stock,
      expenses,
      custody,
      recent,
    ] = await Promise.all([
      can("pos.access")
        ? this.salesBlock(dayStart, dayEnd, previousStart, previousEnd)
        : null,
      can("pos.access") ? this.openSessionBlock() : null,
      can("customer_balances.view") || can("distribution.balances.view")
        ? this.receivablesBlock(
            can("customer_balances.view"),
            can("distribution.balances.view"),
          )
        : null,
      can("supplier_balances.view") ? this.payablesBlock(now) : null,
      can("orders.view") ? this.ordersBlock(dayStart, dayEnd, now) : null,
      can("inventory.view") ? this.stockBlock() : null,
      can("expenses.view")
        ? this.expensesBlock(dayStart, dayEnd, previousStart, previousEnd)
        : null,
      can("distribution.custody.view") ? this.custodyBlock() : null,
      can("audit.view") ? this.recentBlock() : null,
    ]);

    return {
      date: day,
      generatedAt: now,
      sales,
      openSession,
      receivables,
      payables,
      orders,
      stock,
      expenses,
      custody,
      recent,
    };
  }

  /// Sales of the day and of the day before. `cashTnd` is the drawer's
  /// cash of the day, the V1 formula (source of truth section 11.1): sale
  /// receipts less refunds, order advances received less refunded, and the
  /// règlements taken at a till less those reversed at a till, each dated
  /// by the moment the money moved.
  private async salesBlock(
    dayStart: Date,
    dayEnd: Date,
    previousStart: Date,
    previousEnd: Date,
  ) {
    const between = (from: Date, to: Date) => ({ gte: from, lte: to });
    const aggregate = (from: Date, to: Date) =>
      this.prisma.sale.aggregate({
        where: { status: SaleStatus.POSTED, soldAt: between(from, to) },
        _count: { _all: true },
        _sum: { totalTnd: true, remainingDueTnd: true },
      });
    const cash = async (from: Date, to: Date) => {
      const [salePayments, advances, tillPayments, tillReversals] =
        await Promise.all([
          this.prisma.salePayment.groupBy({
            by: ["movement"],
            where: { paidAt: between(from, to) },
            _sum: { amountTnd: true },
          }),
          this.prisma.customerOrderAdvance.groupBy({
            by: ["movement"],
            where: { paidAt: between(from, to) },
            _sum: { amountTnd: true },
          }),
          this.prisma.customerPayment.aggregate({
            where: { sessionId: { not: null }, paidAt: between(from, to) },
            _sum: { amountTnd: true },
          }),
          this.prisma.customerPayment.aggregate({
            where: {
              reversedInSessionId: { not: null },
              reversedAt: between(from, to),
            },
            _sum: { amountTnd: true },
          }),
        ]);
      const of = <T extends string>(
        rows: Array<{
          movement: T;
          _sum: { amountTnd: Prisma.Decimal | null };
        }>,
        movement: T,
      ) =>
        sumOrZero(
          rows.find((row) => row.movement === movement)?._sum.amountTnd,
        );

      return of(salePayments, SalePaymentMovement.RECEIPT)
        .minus(of(salePayments, SalePaymentMovement.REFUND))
        .plus(of(advances, CustomerOrderAdvanceMovement.RECEIPT))
        .minus(of(advances, CustomerOrderAdvanceMovement.REFUND))
        .plus(sumOrZero(tillPayments._sum.amountTnd))
        .minus(sumOrZero(tillReversals._sum.amountTnd));
    };
    const [today, previous, todayCash, previousCash] = await Promise.all([
      aggregate(dayStart, dayEnd),
      aggregate(previousStart, previousEnd),
      cash(dayStart, dayEnd),
      cash(previousStart, previousEnd),
    ]);
    const block = (
      row: Awaited<ReturnType<typeof aggregate>>,
      cashTnd: Prisma.Decimal,
    ) => ({
      count: row._count._all,
      totalTnd: sumOrZero(row._sum.totalTnd).toFixed(3),
      cashTnd: cashTnd.toFixed(3),
      creditTnd: sumOrZero(row._sum.remainingDueTnd).toFixed(3),
    });

    return {
      today: block(today, todayCash),
      previousDay: block(previous, previousCash),
    };
  }

  private async openSessionBlock() {
    const session = await this.prisma.posSession.findFirst({
      where: { status: PosSessionStatus.OPEN },
      include: { terminal: true },
      orderBy: { openedAt: "desc" },
    });

    if (!session) {
      return null;
    }

    const cashier = await this.prisma.user.findUnique({
      where: { id: session.openedByUserId },
      select: { id: true, displayName: true },
    });

    return {
      id: session.id,
      openedAt: session.openedAt,
      terminal: session.terminal.name,
      cashier,
      openingCashTnd: session.openingCashTnd.toFixed(3),
    };
  }

  private async receivablesBlock(customers: boolean, distributors: boolean) {
    const [customerTotal, distributorTotal] = await Promise.all([
      customers
        ? this.prisma.customerLedgerEntry.aggregate({
            where: { balanceKind: CustomerLedgerBalanceKind.RECEIVABLE },
            _sum: { amountTnd: true },
          })
        : null,
      distributors
        ? this.prisma.distributorLedgerEntry.aggregate({
            _sum: { amountTnd: true },
          })
        : null,
    ]);

    return {
      customersTnd: customerTotal
        ? sumOrZero(customerTotal._sum.amountTnd).toFixed(3)
        : null,
      distributorsTnd: distributorTotal
        ? sumOrZero(distributorTotal._sum.amountTnd).toFixed(3)
        : null,
    };
  }

  /// Payables come from the supplier ledger; overdue purchases are the posted,
  /// not fully paid ones whose due date has passed, valued by their ledger
  /// balance.
  private async payablesBlock(now: Date) {
    const [total, overduePurchases] = await Promise.all([
      this.prisma.supplierLedgerEntry.aggregate({ _sum: { amountTnd: true } }),
      this.prisma.purchase.findMany({
        where: {
          status: PurchaseStatus.POSTED,
          paymentTerms: {
            in: [PurchasePaymentTerms.PARTIAL, PurchasePaymentTerms.UNPAID],
          },
          dueDate: { lt: now },
        },
        select: { id: true },
      }),
    ]);
    const overdueIds = overduePurchases.map((row) => row.id);
    const overdueTotals =
      overdueIds.length === 0
        ? []
        : await this.prisma.supplierLedgerEntry.groupBy({
            by: ["purchaseId"],
            where: { purchaseId: { in: overdueIds } },
            _sum: { amountTnd: true },
          });
    const stillOwed = overdueTotals.filter((row) =>
      sumOrZero(row._sum.amountTnd).greaterThan(0),
    );

    return {
      suppliersTnd: sumOrZero(total._sum.amountTnd).toFixed(3),
      overdueCount: stillOwed.length,
      overdueTnd: stillOwed
        .reduce(
          (sum, row) => sum.plus(sumOrZero(row._sum.amountTnd)),
          new Prisma.Decimal(0),
        )
        .toFixed(3),
    };
  }

  private async ordersBlock(dayStart: Date, dayEnd: Date, now: Date) {
    const open = [
      CustomerOrderStatus.DRAFT,
      CustomerOrderStatus.CONFIRMED,
      CustomerOrderStatus.PREPARING,
      CustomerOrderStatus.READY,
    ];
    const [dueToday, overdue, ready] = await Promise.all([
      this.prisma.customerOrder.count({
        where: {
          status: { in: open },
          requestedFulfillmentAt: { gte: dayStart, lte: dayEnd },
        },
      }),
      this.prisma.customerOrder.count({
        where: { status: { in: open }, requestedFulfillmentAt: { lt: now } },
      }),
      this.prisma.customerOrder.count({
        where: { status: CustomerOrderStatus.READY },
      }),
    ]);

    return {
      dueTodayCount: dueToday,
      overdueCount: overdue,
      readyCount: ready,
    };
  }

  /// Balances are a sum of movements per item; the main location is the only
  /// one in V1/V2, so the projection is one group per item.
  private async stockBlock() {
    const [products, rawMaterials] = await Promise.all([
      this.prisma.inventoryMovement.groupBy({
        by: ["productId"],
        where: { productId: { not: null } },
        _sum: { quantityDelta: true },
      }),
      this.prisma.inventoryMovement.groupBy({
        by: ["rawMaterialId"],
        where: { rawMaterialId: { not: null } },
        _sum: { quantityDelta: true },
      }),
    ]);
    const negativeProducts = products.filter((row) =>
      sumOrZero(row._sum.quantityDelta).lessThan(0),
    );
    const negativeRawMaterials = rawMaterials.filter((row) =>
      sumOrZero(row._sum.quantityDelta).lessThan(0),
    );
    const sampleProductIds = negativeProducts
      .slice(0, negativeStockSample)
      .map((row) => row.productId as string);
    const sampleRawMaterialIds = negativeRawMaterials
      .slice(0, negativeStockSample)
      .map((row) => row.rawMaterialId as string);
    const [productRows, rawMaterialRows] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: sampleProductIds } },
        select: { id: true, name: true },
      }),
      this.prisma.rawMaterial.findMany({
        where: { id: { in: sampleRawMaterialIds } },
        select: { id: true, name: true },
      }),
    ]);
    const quantityOf = (
      rows: Array<{ _sum: { quantityDelta: Prisma.Decimal | null } }>,
      index: number,
    ) => sumOrZero(rows[index]?._sum.quantityDelta).toFixed(6);

    return {
      negativeCount: negativeProducts.length + negativeRawMaterials.length,
      items: [
        ...sampleProductIds.map((id, index) => ({
          itemType: "PRODUCT" as const,
          itemId: id,
          name: productRows.find((row) => row.id === id)?.name ?? "",
          quantity: quantityOf(negativeProducts, index),
        })),
        ...sampleRawMaterialIds.map((id, index) => ({
          itemType: "RAW_MATERIAL" as const,
          itemId: id,
          name: rawMaterialRows.find((row) => row.id === id)?.name ?? "",
          quantity: quantityOf(negativeRawMaterials, index),
        })),
      ].slice(0, negativeStockSample),
    };
  }

  /// Posted expenses dated inside the selected business day (issue #42),
  /// on the same Tunis boundaries as the sales, with the day before for
  /// the tile's comparison.
  private async expensesBlock(
    dayStart: Date,
    dayEnd: Date,
    previousStart: Date,
    previousEnd: Date,
  ) {
    const aggregate = (from: Date, to: Date) =>
      this.prisma.expense.aggregate({
        where: {
          status: ExpenseStatus.POSTED,
          expenseDate: { gte: from, lte: to },
        },
        _sum: { amountTnd: true },
        _count: { _all: true },
      });
    const [today, previous] = await Promise.all([
      aggregate(dayStart, dayEnd),
      aggregate(previousStart, previousEnd),
    ]);

    return {
      dayTnd: sumOrZero(today._sum.amountTnd).toFixed(3),
      dayCount: today._count._all,
      previousDayTnd: sumOrZero(previous._sum.amountTnd).toFixed(3),
    };
  }

  private async custodyBlock() {
    const heldLines = await this.prisma.distributorDispatchLine.count({
      where: { dispatch: { status: DistributorDispatchStatus.OPEN } },
    });

    return { heldLinesCount: heldLines };
  }

  private async recentBlock() {
    const events = await this.prisma.auditEvent.findMany({
      include: { actor: { select: { id: true, displayName: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: recentEventCount,
    });

    return events.map((event) => ({
      id: event.id,
      at: event.createdAt,
      action: event.action,
      actionLabelFr: actionLabel(event.action),
      entity: event.entity,
      entityLabelFr: entityLabel(event.entity),
      targetId: event.targetId,
      module: entityModule(event.entity),
      actor: event.actor,
    }));
  }
}

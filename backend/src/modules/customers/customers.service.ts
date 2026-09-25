import {
  CustomerOrderStatus,
  CustomerLedgerBalanceKind,
  CustomerLedgerEntryType,
  PosSessionStatus,
  Prisma,
  SaleStatus,
  type PrismaClient,
} from "@prisma/client";
import { AppError } from "../../shared/appError.js";
import { orderByFor, type SortSpec } from "../../shared/listQuery.js";
import {
  postingTransactionOptions,
  runIdempotentCommand,
} from "../../shared/idempotency.js";
import { planPaymentAllocations } from "../../shared/paymentAllocation.js";
import { documentPaymentProjection } from "../../shared/paymentState.js";
import {
  balanceOf,
  balancesByKey,
  money,
  pageWithCursor,
  statementDefaults,
  sumOrZero,
} from "../../shared/ledger.js";
import { normalizeName } from "../../shared/text.js";

export interface CustomerActor {
  actorUserId: string;
  correlationId?: string;
}

export interface CustomerListParams {
  sort?: SortSpec<"name" | "createdAt">;
  search?: string;
  isActive?: boolean;
  page: number;
  pageSize: number;
}

export interface CustomerBalanceListParams {
  search?: string;
  /// Active customers by default on the screen; inactive ones on request.
  isActive?: boolean;
  /// `name` is the directory order; `balance` puts the biggest debtors first
  /// and only lists customers that have ledger activity.
  sort?: "name" | "balance";
  /// Only customers owing at least this amount (decimal string).
  minBalance?: string;
  page: number;
  pageSize: number;
}

export interface CustomerStatementParams {
  /// Ledger entry id to continue from (exclusive).
  cursor?: string;
  limit?: number;
  from?: Date;
  to?: Date;
}

export interface CustomerPaymentListParams {
  sort?: SortSpec<"paidAt" | "amountTnd">;
  customerId?: string;
  page: number;
  pageSize: number;
}

export interface CustomerPaymentAllocationInput {
  saleId: string;
  amountTnd: string;
}

export class CustomersService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async listCustomers(params: CustomerListParams) {
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
      this.prisma.customer.findMany({
        where,
        orderBy: orderByFor<
          "name" | "createdAt",
          Prisma.CustomerOrderByWithRelationInput
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
      this.prisma.customer.count({ where }),
    ]);

    return paginated(items, total, params);
  }

  public async createCustomer(
    params: {
      name: string;
      phone?: string;
      address?: string;
      taxIdentifier?: string;
      notes?: string;
    },
    actor: CustomerActor,
  ) {
    const normalizedName = normalizeName(params.name);
    await this.assertActiveCustomerNameAvailable(normalizedName);

    const customer = await this.prisma.customer.create({
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
      action: "customer.create",
      entity: "customer",
      targetId: customer.id,
      after: customer,
    });

    return customer;
  }

  public async updateCustomer(
    customerId: string,
    params: {
      version: number;
      name?: string;
      phone?: string;
      address?: string;
      taxIdentifier?: string;
      notes?: string;
      isActive?: boolean;
    },
    actor: CustomerActor,
  ) {
    const existing = await this.findCustomerOrThrow(customerId);
    const normalizedName =
      params.name !== undefined ? normalizeName(params.name) : undefined;

    if ((params.isActive ?? existing.isActive) && normalizedName) {
      await this.assertActiveCustomerNameAvailable(normalizedName, existing.id);
    }

    const result = await this.prisma.customer.updateMany({
      where: {
        id: customerId,
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
    const customer = await this.findCustomerOrThrow(customerId);

    await this.audit({
      actor,
      action: "customer.update",
      entity: "customer",
      targetId: customer.id,
      before: existing,
      after: customer,
    });

    return customer;
  }

  /// Balances are summed by the database. The page is chosen either from the
  /// customer directory (name order) or from the ledger aggregate (balance
  /// order), and only the page's customers are then enriched.
  public async listCustomerBalances(params: CustomerBalanceListParams) {
    const searchWhere: Prisma.CustomerWhereInput | undefined =
      params.isActive === undefined
        ? customerSearchWhere(params.search)
        : { ...customerSearchWhere(params.search), isActive: params.isActive };
    const minBalance =
      params.minBalance === undefined
        ? undefined
        : new Prisma.Decimal(params.minBalance);
    const byBalance = params.sort === "balance" || minBalance !== undefined;

    let customers: Awaited<ReturnType<typeof this.prisma.customer.findMany>>;
    let total: number;

    if (byBalance) {
      // One group per customer with receivable activity, largest debtor
      // first. Customers with no ledger entry owe nothing and are omitted.
      const groups = await this.prisma.customerLedgerEntry.groupBy({
        by: ["customerId"],
        where: {
          balanceKind: CustomerLedgerBalanceKind.RECEIVABLE,
          ...(searchWhere ? { customer: searchWhere } : {}),
        },
        _sum: { amountTnd: true },
        ...(minBalance !== undefined
          ? { having: { amountTnd: { _sum: { gte: minBalance } } } }
          : {}),
        orderBy: { _sum: { amountTnd: "desc" } },
      });
      total = groups.length;
      const pageIds = groups
        .slice(
          (params.page - 1) * params.pageSize,
          params.page * params.pageSize,
        )
        .map((group) => group.customerId);
      const rows = await this.prisma.customer.findMany({
        where: { id: { in: pageIds } },
      });
      // findMany does not preserve the requested order.
      const byId = new Map(rows.map((row) => [row.id, row]));
      customers = pageIds
        .map((id) => byId.get(id))
        .filter((row): row is NonNullable<typeof row> => row !== undefined);
    } else {
      const where = searchWhere ?? {};
      [customers, total] = await this.prisma.$transaction([
        this.prisma.customer.findMany({
          where,
          orderBy: [{ isActive: "desc" }, { name: "asc" }],
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
        }),
        this.prisma.customer.count({ where }),
      ]);
    }

    const customerIds = customers.map((customer) => customer.id);
    // groupBy is typed per call, so these run as parallel reads rather than a
    // batch transaction; balances are append-only sums, so a snapshot is not
    // required.
    const [kindTotals, saleTotals] = await Promise.all([
      this.prisma.customerLedgerEntry.groupBy({
        by: ["customerId", "balanceKind"],
        where: { customerId: { in: customerIds } },
        _sum: { amountTnd: true },
      }),
      this.prisma.customerLedgerEntry.groupBy({
        by: ["saleId", "customerId"],
        where: {
          customerId: { in: customerIds },
          balanceKind: CustomerLedgerBalanceKind.RECEIVABLE,
          saleId: { not: null },
        },
        _sum: { amountTnd: true },
      }),
    ]);
    const openSaleTotals = saleTotals.filter((row) =>
      sumOrZero(row._sum.amountTnd).greaterThan(0),
    );
    const [openSales, openOrders] = await Promise.all([
      this.prisma.sale.findMany({
        where: {
          id: { in: openSaleTotals.map((row) => row.saleId as string) },
          status: SaleStatus.POSTED,
        },
        select: {
          id: true,
          customerId: true,
          soldAt: true,
          paymentState: true,
        },
        orderBy: [{ soldAt: "desc" }, { id: "desc" }],
      }),
      // Orders still awaiting fulfilment, counted by the database per customer.
      this.prisma.customerOrder.groupBy({
        by: ["customerId"],
        where: {
          customerId: { in: customers.map((customer) => customer.id) },
          status: {
            in: [
              CustomerOrderStatus.DRAFT,
              CustomerOrderStatus.CONFIRMED,
              CustomerOrderStatus.PREPARING,
              CustomerOrderStatus.READY,
            ],
          },
        },
        _count: { _all: true },
      }),
    ]);
    const openOrderCount = new Map(
      openOrders.map((row) => [row.customerId, row._count._all]),
    );
    const saleBalance = balancesByKey(
      openSaleTotals,
      (row) => row.saleId,
      (row) => row._sum.amountTnd,
    );
    const kindBalance = new Map(
      kindTotals.map((row) => [
        `${row.customerId}:${row.balanceKind}`,
        sumOrZero(row._sum.amountTnd),
      ]),
    );

    return paginated(
      customers.map((customer) => {
        const customerOpenSales = openSales
          .filter((sale) => sale.customerId === customer.id)
          .map((sale) => ({
            saleId: sale.id,
            soldAt: sale.soldAt,
            balanceTnd: balanceOf(saleBalance, sale.id).toFixed(3),
            paymentState: sale.paymentState,
          }));

        return {
          customer,
          balanceTnd: money(
            kindBalance.get(
              `${customer.id}:${CustomerLedgerBalanceKind.RECEIVABLE}`,
            ),
          ),
          advanceBalanceTnd: money(
            kindBalance.get(
              `${customer.id}:${CustomerLedgerBalanceKind.ADVANCE}`,
            ),
          ),
          openSaleCount: customerOpenSales.length,
          openOrderCount: openOrderCount.get(customer.id) ?? 0,
          openSales: customerOpenSales,
        };
      }),
      total,
      params,
    );
  }

  /// NFR-007: a statement states its range and how its figures are derived.
  /// Ledger entries page by cursor; the sale, order and payment sections show
  /// the most recent `limit` documents and flag when more exist.
  public async getCustomerStatement(
    customerId: string,
    params: CustomerStatementParams = {},
  ) {
    const customer = await this.findCustomerOrThrow(customerId);
    const limit = Math.min(
      params.limit ?? statementDefaults.limit,
      statementDefaults.maxLimit,
    );
    const range = {
      ...(params.from ? { gte: params.from } : {}),
      ...(params.to ? { lte: params.to } : {}),
    };
    const inRange = params.from || params.to ? { occurredAt: range } : {};

    const kindTotals = await this.prisma.customerLedgerEntry.groupBy({
      by: ["balanceKind"],
      where: {
        customerId,
        ...(params.to ? { occurredAt: { lte: params.to } } : {}),
      },
      _sum: { amountTnd: true },
    });
    const [openingTotal, ledgerPage, payments, sales, orders] =
      await this.prisma.$transaction([
        this.prisma.customerLedgerEntry.aggregate({
          where: {
            customerId,
            balanceKind: CustomerLedgerBalanceKind.RECEIVABLE,
            ...(params.from ? { occurredAt: { lt: params.from } } : {}),
          },
          _sum: { amountTnd: true },
        }),
        this.prisma.customerLedgerEntry.findMany({
          where: { customerId, ...inRange },
          include: { sale: true, payment: true, order: true },
          orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          take: limit + 1,
          ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
        }),
        this.prisma.customerPayment.findMany({
          where: { customerId },
          include: { allocations: true },
          orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
          take: limit + 1,
        }),
        this.prisma.sale.findMany({
          where: { customerId, status: SaleStatus.POSTED },
          include: { lines: true, payments: true },
          orderBy: [{ soldAt: "desc" }, { createdAt: "desc" }],
          take: limit + 1,
        }),
        this.prisma.customerOrder.findMany({
          where: { customerId },
          include: { lines: true, advances: true },
          orderBy: [{ requestedFulfillmentAt: "desc" }, { createdAt: "desc" }],
          take: limit + 1,
        }),
      ]);

    const ledger = pageWithCursor(ledgerPage, limit);
    const salesPage = sales.slice(0, limit);
    const saleTotals = await this.prisma.customerLedgerEntry.groupBy({
      by: ["saleId"],
      where: {
        customerId,
        balanceKind: CustomerLedgerBalanceKind.RECEIVABLE,
        saleId: { in: salesPage.map((sale) => sale.id) },
      },
      _sum: { amountTnd: true },
    });
    const saleBalance = balancesByKey(
      saleTotals,
      (row) => row.saleId,
      (row) => row._sum.amountTnd,
    );
    const kindBalance = new Map(
      kindTotals.map((row) => [row.balanceKind, sumOrZero(row._sum.amountTnd)]),
    );
    const openingBalance = params.from
      ? sumOrZero(openingTotal._sum.amountTnd)
      : new Prisma.Decimal(0);
    const closingBalance = sumOrZero(
      kindBalance.get(CustomerLedgerBalanceKind.RECEIVABLE),
    );

    return {
      customer,
      balanceTnd: closingBalance.toFixed(3),
      advanceBalanceTnd: money(
        kindBalance.get(CustomerLedgerBalanceKind.ADVANCE),
      ),
      sales: salesPage.map((sale) => ({
        ...sale,
        balanceTnd: balanceOf(saleBalance, sale.id).toFixed(3),
      })),
      orders: orders.slice(0, limit),
      ledgerEntries: ledger.items,
      payments: payments.slice(0, limit),
      meta: {
        limit,
        from: params.from ?? null,
        to: params.to ?? null,
        openingBalanceTnd: openingBalance.toFixed(3),
        closingBalanceTnd: closingBalance.toFixed(3),
        nextCursor: ledger.nextCursor,
        hasMoreSales: sales.length > limit,
        hasMoreOrders: orders.length > limit,
        hasMorePayments: payments.length > limit,
        basis:
          "Solde = somme des écritures du grand livre client (créances) jusqu'à la date de fin ; les avances sont suivies séparément.",
      },
    };
  }

  public async listCustomerPayments(params: CustomerPaymentListParams) {
    const where = {
      ...(params.customerId ? { customerId: params.customerId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customerPayment.findMany({
        where,
        include: {
          customer: true,
          allocations: {
            include: {
              sale: true,
            },
          },
        },
        orderBy: orderByFor<
          "paidAt" | "amountTnd",
          Prisma.CustomerPaymentOrderByWithRelationInput
        >(
          params.sort,
          {
            paidAt: (direction) => [{ paidAt: direction }],
            amountTnd: (direction) => [{ amountTnd: direction }],
          },
          [{ paidAt: "desc" }, { createdAt: "desc" }],
          { id: "desc" },
        ),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.customerPayment.count({ where }),
    ]);

    return paginated(items, total, params);
  }

  public async createCustomerPayment(
    params: {
      idempotencyKey: string;
      customerId: string;
      paidAt: Date;
      amountTnd: string;
      reference?: string;
      notes?: string;
      /// True when the cashier took the money at the till, so it belongs to the
      /// open POS session's expected cash. Back-office payments leave it unset.
      collectedAtPos?: boolean;
      /// Sales the client names explicitly. Whatever the amount leaves after
      /// them is placed on the customer's other open sales, oldest first, so a
      /// règlement always settles documents (CUS-009, CUS-011).
      allocations?: CustomerPaymentAllocationInput[];
    },
    actor: CustomerActor,
  ) {
    const amountTnd = parsePositiveMoney(params.amountTnd);
    const requested = (params.allocations ?? []).map((allocation) => ({
      key: allocation.saleId,
      amountTnd: parsePositiveMoney(allocation.amountTnd),
    }));

    return this.runIdempotentCommand(
      `customer_payment.create.${params.customerId}`,
      params.idempotencyKey,
      {
        ...params,
        amountTnd: amountTnd.toFixed(3),
      },
      async (tx) => {
        const customer = await lockCustomer(tx, params.customerId);

        if (!customer.isActive) {
          throw new AppError({
            statusCode: 400,
            code: "CUSTOMER_INACTIVE",
            message: "Ce client est désactivé.",
          });
        }

        const receivable = await tx.customerLedgerEntry.aggregate({
          where: {
            customerId: params.customerId,
            balanceKind: CustomerLedgerBalanceKind.RECEIVABLE,
          },
          _sum: { amountTnd: true },
        });
        const currentBalance = sumOrZero(receivable._sum.amountTnd);

        if (!currentBalance.greaterThan(0)) {
          throw new AppError({
            statusCode: 400,
            code: "CUSTOMER_BALANCE_NOT_DUE",
            message: "Ce client n'a pas de solde à payer.",
          });
        }

        if (amountTnd.greaterThan(currentBalance)) {
          throw new AppError({
            statusCode: 400,
            code: "CUSTOMER_OVERPAYMENT_REJECTED",
            message: "Le paiement ne peut pas dépasser le solde client.",
          });
        }

        const openSales = await this.openSalesOf(
          tx,
          params.customerId,
          requested.map((allocation) => allocation.key),
        );
        const plan = planPaymentAllocations({
          amountTnd,
          requested,
          openDocuments: openSales,
          errors: customerAllocationErrors,
        });
        const sessionId = params.collectedAtPos
          ? (await requireOpenPosSession(tx)).id
          : null;
        const payment = await tx.customerPayment.create({
          data: {
            customerId: params.customerId,
            sessionId,
            amountTnd: amountTnd.toFixed(3),
            paidAt: params.paidAt,
            reference: emptyToNull(params.reference),
            notes: emptyToNull(params.notes),
            actorUserId: actor.actorUserId,
            correlationId: actor.correlationId,
          },
        });

        if (plan.allocations.length > 0) {
          await tx.customerPaymentAllocation.createMany({
            data: plan.allocations.map((allocation) => ({
              paymentId: payment.id,
              saleId: allocation.key,
              amountTnd: allocation.amountTnd.toFixed(3),
            })),
          });

          await tx.customerLedgerEntry.createMany({
            data: plan.allocations.map((allocation) => ({
              customerId: params.customerId,
              saleId: allocation.key,
              paymentId: payment.id,
              entryType: CustomerLedgerEntryType.PAYMENT,
              amountTnd: allocation.amountTnd.negated().toFixed(3),
              occurredAt: params.paidAt,
              actorUserId: actor.actorUserId,
              correlationId: actor.correlationId,
            })),
          });
        }

        if (plan.unallocatedTnd.greaterThan(0)) {
          await tx.customerLedgerEntry.create({
            data: {
              customerId: params.customerId,
              paymentId: payment.id,
              entryType: CustomerLedgerEntryType.PAYMENT,
              amountTnd: plan.unallocatedTnd.negated().toFixed(3),
              occurredAt: params.paidAt,
              actorUserId: actor.actorUserId,
              correlationId: actor.correlationId,
            },
          });
        }

        await this.refreshSaleProjections(
          tx,
          params.customerId,
          plan.allocations.map((allocation) => allocation.key),
        );

        const allocations = plan.allocations.map((allocation) => ({
          saleId: allocation.key,
          amountTnd: allocation.amountTnd.toFixed(3),
        }));

        await this.auditWithClient(tx, {
          actor,
          action: "customer_payment.create",
          entity: "customer_payment",
          targetId: payment.id,
          after: {
            payment,
            allocations,
          },
        });

        return { payment, allocations };
      },
    );
  }

  /// Undoes a règlement recorded by mistake. The payment row stays, marked
  /// reversed; PAYMENT_REVERSAL entries give the money back to the sales it
  /// had settled, and a till règlement leaves the drawer of the session
  /// that is open now.
  public async reverseCustomerPayment(
    paymentId: string,
    params: { idempotencyKey: string; reason: string },
    actor: CustomerActor,
  ) {
    const reason = requireReason(params.reason);

    return this.runIdempotentCommand(
      `customer_payment.reverse.${paymentId}`,
      params.idempotencyKey,
      { paymentId, reason },
      async (tx) => {
        const payment = await tx.customerPayment.findUnique({
          where: { id: paymentId },
          include: { ledgerEntries: true },
        });

        if (!payment) {
          throw new AppError({
            statusCode: 404,
            code: "CUSTOMER_PAYMENT_NOT_FOUND",
            message: "Règlement introuvable.",
          });
        }

        if (payment.reversedAt) {
          throw new AppError({
            statusCode: 409,
            code: "PAYMENT_ALREADY_REVERSED",
            message: "Ce règlement a déjà été annulé.",
          });
        }

        await lockCustomer(tx, payment.customerId);
        const reversedAt = new Date();
        const reversedInSessionId = payment.sessionId
          ? (await requireOpenPosSession(tx)).id
          : null;
        const paymentEntries = payment.ledgerEntries.filter(
          (entry) => entry.entryType === CustomerLedgerEntryType.PAYMENT,
        );

        await tx.customerLedgerEntry.createMany({
          data: paymentEntries.map((entry) => ({
            customerId: payment.customerId,
            saleId: entry.saleId,
            paymentId: payment.id,
            balanceKind: entry.balanceKind,
            entryType: CustomerLedgerEntryType.PAYMENT_REVERSAL,
            amountTnd: new Prisma.Decimal(entry.amountTnd).negated().toFixed(3),
            occurredAt: reversedAt,
            actorUserId: actor.actorUserId,
            correlationId: actor.correlationId,
          })),
        });

        const reversed = await tx.customerPayment.update({
          where: { id: payment.id },
          data: {
            reversedAt,
            reversedByUserId: actor.actorUserId,
            reversalReason: reason,
            reversedInSessionId,
          },
        });

        await this.refreshSaleProjections(
          tx,
          payment.customerId,
          paymentEntries
            .map((entry) => entry.saleId)
            .filter((id): id is string => Boolean(id)),
        );

        await this.auditWithClient(tx, {
          actor,
          action: "customer_payment.reverse",
          entity: "customer_payment",
          targetId: payment.id,
          before: payment,
          after: reversed,
        });

        return { payment: reversed };
      },
    );
  }

  /// CUS-004: deactivation keeps every document and blocks new credit
  /// operations (the till, the orders and the règlements refuse an inactive
  /// customer). A customer who still owes or holds an advance cannot be
  /// deactivated (issue #46).
  public async setCustomerActive(
    customerId: string,
    params: { isActive: boolean; reason?: string },
    actor: CustomerActor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.customer.findUnique({
        where: { id: customerId },
      });

      if (!existing) {
        throw new AppError({
          statusCode: 404,
          code: "CUSTOMER_NOT_FOUND",
          message: "Client introuvable.",
        });
      }

      if (existing.isActive === params.isActive) {
        throw new AppError({
          statusCode: 409,
          code: params.isActive
            ? "CUSTOMER_ALREADY_ACTIVE"
            : "CUSTOMER_ALREADY_INACTIVE",
          message: params.isActive
            ? "Ce client est déjà actif."
            : "Ce client est déjà désactivé.",
        });
      }

      if (!params.isActive) {
        const totals = await tx.customerLedgerEntry.groupBy({
          by: ["balanceKind"],
          where: { customerId },
          _sum: { amountTnd: true },
        });

        if (totals.some((row) => !sumOrZero(row._sum.amountTnd).isZero())) {
          throw new AppError({
            statusCode: 409,
            code: "CUSTOMER_HAS_BALANCE",
            message:
              "Ce client a encore un solde ou une avance : réglez-les avant de le désactiver.",
          });
        }
      }

      const customer = await tx.customer.update({
        where: { id: customerId },
        data: {
          isActive: params.isActive,
          version: { increment: 1 },
          updatedByUserId: actor.actorUserId,
        },
      });

      await this.auditWithClient(tx, {
        actor,
        action: params.isActive ? "customer.reactivate" : "customer.deactivate",
        entity: "customer",
        targetId: customerId,
        before: existing,
        after: { ...customer, reason: emptyToNull(params.reason) },
      });

      return customer;
    }, postingTransactionOptions);
  }

  /// The figures of the customer page (issue #46), summed by the database:
  /// orders except the cancelled ones, posted sales with what was paid on
  /// them (the projection kept by #47), what is still due and the advance
  /// held, and the last sale and règlement.
  public async getCustomerSummary(customerId: string) {
    await this.findCustomerOrThrow(customerId);
    const open = [
      CustomerOrderStatus.DRAFT,
      CustomerOrderStatus.CONFIRMED,
      CustomerOrderStatus.PREPARING,
      CustomerOrderStatus.READY,
    ];
    const [
      orders,
      openOrders,
      sales,
      cancelledSales,
      kinds,
      lastSale,
      lastPayment,
    ] = await Promise.all([
      this.prisma.customerOrder.count({
        where: { customerId, status: { not: CustomerOrderStatus.CANCELLED } },
      }),
      this.prisma.customerOrder.count({
        where: { customerId, status: { in: open } },
      }),
      this.prisma.sale.aggregate({
        where: { customerId, status: SaleStatus.POSTED },
        _count: { _all: true },
        _sum: { totalTnd: true, paidAmountTnd: true },
      }),
      this.prisma.sale.count({
        where: { customerId, status: SaleStatus.CANCELLED },
      }),
      this.prisma.customerLedgerEntry.groupBy({
        by: ["balanceKind"],
        where: { customerId },
        _sum: { amountTnd: true },
      }),
      this.prisma.sale.findFirst({
        where: { customerId, status: SaleStatus.POSTED },
        orderBy: [{ soldAt: "desc" }],
        select: { soldAt: true },
      }),
      this.prisma.customerPayment.findFirst({
        where: { customerId, reversedAt: null },
        orderBy: [{ paidAt: "desc" }],
        select: { paidAt: true },
      }),
    ]);
    const kind = new Map(
      kinds.map((row) => [row.balanceKind, sumOrZero(row._sum.amountTnd)]),
    );

    return {
      ordersCount: orders,
      openOrdersCount: openOrders,
      salesCount: sales._count._all,
      cancelledSalesCount: cancelledSales,
      salesTotalTnd: money(sales._sum.totalTnd),
      paidTnd: money(sales._sum.paidAmountTnd),
      dueTnd: money(kind.get(CustomerLedgerBalanceKind.RECEIVABLE)),
      advanceTnd: money(kind.get(CustomerLedgerBalanceKind.ADVANCE)),
      lastSaleAt: lastSale?.soldAt ?? null,
      lastPaymentAt: lastPayment?.paidAt ?? null,
    };
  }

  /// The customer's sales, every state, newest first, with the balance the
  /// ledger still carries for each; paged, unlike the statement's fifty.
  public async listCustomerSales(
    customerId: string,
    params: { page: number; pageSize: number },
  ) {
    await this.findCustomerOrThrow(customerId);
    const where = { customerId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where,
        orderBy: [{ soldAt: "desc" }, { id: "desc" }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.sale.count({ where }),
    ]);
    const totals = items.length
      ? await this.prisma.customerLedgerEntry.groupBy({
          by: ["saleId"],
          where: {
            customerId,
            balanceKind: CustomerLedgerBalanceKind.RECEIVABLE,
            saleId: { in: items.map((sale) => sale.id) },
          },
          _sum: { amountTnd: true },
        })
      : [];
    const balances = balancesByKey(
      totals,
      (row) => row.saleId,
      (row) => row._sum.amountTnd,
    );

    return paginated(
      items.map((sale) => ({
        ...sale,
        balanceTnd: balanceOf(balances, sale.id).toFixed(3),
      })),
      total,
      params,
    );
  }

  /// Detail for the customer page: the row plus both balances.
  public async getCustomer(customerId: string) {
    const customer = await this.findCustomerOrThrow(customerId);
    const totals = await this.prisma.customerLedgerEntry.groupBy({
      by: ["balanceKind"],
      where: { customerId },
      _sum: { amountTnd: true },
    });
    const kind = new Map(
      totals.map((row) => [row.balanceKind, sumOrZero(row._sum.amountTnd)]),
    );

    return {
      ...customer,
      balanceTnd: money(kind.get(CustomerLedgerBalanceKind.RECEIVABLE)),
      advanceBalanceTnd: money(kind.get(CustomerLedgerBalanceKind.ADVANCE)),
    };
  }

  /// The customer's posted sales that still owe something, oldest first:
  /// the automatic allocation order. Sales the client named are included
  /// even when settled, so a wrong target is reported as exceeding that
  /// sale's balance. Only receivable entries move a sale balance; an applied
  /// order advance is recorded against the same sale but belongs to the
  /// advance balance.
  private async openSalesOf(
    client: Prisma.TransactionClient,
    customerId: string,
    namedSaleIds: string[],
  ) {
    const totals = await client.customerLedgerEntry.groupBy({
      by: ["saleId"],
      where: {
        customerId,
        balanceKind: CustomerLedgerBalanceKind.RECEIVABLE,
        saleId: { not: null },
      },
      _sum: { amountTnd: true },
    });
    const balances = balancesByKey(
      totals,
      (row) => row.saleId,
      (row) => row._sum.amountTnd,
    );
    const openIds = new Set([
      ...[...balances.entries()]
        .filter(([, balance]) => balance.greaterThan(0))
        .map(([saleId]) => saleId),
      ...namedSaleIds,
    ]);

    if (openIds.size === 0) {
      return [];
    }

    const sales = await client.sale.findMany({
      where: {
        id: { in: [...openIds] },
        customerId,
        status: SaleStatus.POSTED,
      },
      select: { id: true, soldAt: true },
      orderBy: [{ soldAt: "asc" }, { id: "asc" }],
    });

    return sales.map((sale) => ({
      key: sale.id,
      balanceTnd: balanceOf(balances, sale.id),
    }));
  }

  /// GOV-006: the stored paid amount, remaining due and state of a sale are
  /// projections of its receivable ledger, rewritten in the same transaction
  /// as the entries that moved it.
  private async refreshSaleProjections(
    client: Prisma.TransactionClient,
    customerId: string,
    saleIds: string[],
  ) {
    const unique = [...new Set(saleIds)];

    if (unique.length === 0) {
      return;
    }

    const [sales, totals] = await Promise.all([
      client.sale.findMany({
        where: { id: { in: unique } },
        select: { id: true, totalTnd: true },
      }),
      client.customerLedgerEntry.groupBy({
        by: ["saleId"],
        where: {
          customerId,
          balanceKind: CustomerLedgerBalanceKind.RECEIVABLE,
          saleId: { in: unique },
        },
        _sum: { amountTnd: true },
      }),
    ]);
    const balances = balancesByKey(
      totals,
      (row) => row.saleId,
      (row) => row._sum.amountTnd,
    );

    for (const sale of sales) {
      await client.sale.update({
        where: { id: sale.id },
        data: documentPaymentProjection(
          sale.totalTnd,
          balanceOf(balances, sale.id),
        ),
      });
    }
  }

  private async findCustomerOrThrow(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: {
        id: customerId,
      },
    });

    if (!customer) {
      throw new AppError({
        statusCode: 404,
        code: "CUSTOMER_NOT_FOUND",
        message: "Client introuvable.",
      });
    }

    return customer;
  }

  private async assertActiveCustomerNameAvailable(
    normalizedName: string,
    excludingCustomerId?: string,
  ) {
    const existing = await this.prisma.customer.findFirst({
      where: {
        normalizedName,
        isActive: true,
        ...(excludingCustomerId ? { id: { not: excludingCustomerId } } : {}),
      },
    });

    if (existing) {
      throw new AppError({
        statusCode: 409,
        code: "CUSTOMER_NAME_EXISTS",
        message: "Un client actif avec ce nom existe déjà.",
      });
    }
  }

  private async audit(params: {
    actor?: CustomerActor;
    action: string;
    entity: string;
    targetId?: string;
    before?: unknown;
    after?: unknown;
  }) {
    await this.auditWithClient(this.prisma, params);
  }

  private async auditWithClient(
    client: Pick<PrismaClient, "auditEvent"> | Prisma.TransactionClient,
    params: {
      actor?: CustomerActor;
      action: string;
      entity: string;
      targetId?: string;
      before?: unknown;
      after?: unknown;
    },
  ) {
    await client.auditEvent.create({
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

  private runIdempotentCommand<TResponse>(
    scope: string,
    key: string,
    payload: unknown,
    execute: (tx: Prisma.TransactionClient) => Promise<TResponse>,
  ): Promise<TResponse> {
    return runIdempotentCommand({
      prisma: this.prisma,
      scope,
      key,
      payload,
      execute,
    });
  }
}

const customerAllocationErrors = {
  duplicate: {
    code: "DUPLICATE_PAYMENT_ALLOCATION",
    message: "Une vente ne peut être allouée qu'une seule fois.",
  },
  unknownDocument: {
    code: "POSTED_SALE_ALLOCATION_REQUIRED",
    message: "Chaque allocation doit viser une vente confirmée du client.",
  },
  exceedsBalance: {
    code: "PAYMENT_ALLOCATION_EXCEEDS_SALE_BALANCE",
    message: "Une allocation dépasse le solde de la vente.",
  },
};

/// Serializes the payments of one customer: two règlements arriving together
/// both read the balance, and without the lock both could pass the
/// overpayment check (OD-009).
async function lockCustomer(
  client: Prisma.TransactionClient,
  customerId: string,
) {
  await client.$queryRaw`SELECT "id" FROM "customers" WHERE "id" = ${customerId} FOR UPDATE`;

  const customer = await client.customer.findUnique({
    where: { id: customerId },
  });

  if (!customer) {
    throw new AppError({
      statusCode: 404,
      code: "CUSTOMER_NOT_FOUND",
      message: "Client introuvable.",
    });
  }

  return customer;
}

function requireReason(value: string): string {
  const reason = value.trim();

  if (reason.length < 3) {
    throw new AppError({
      statusCode: 400,
      code: "REASON_REQUIRED",
      message: "Une raison est requise.",
    });
  }

  return reason;
}

/// Only one POS session may be open at a time, so the open one is the till that
/// received the money.
async function requireOpenPosSession(client: Prisma.TransactionClient) {
  const session = await client.posSession.findFirst({
    where: {
      status: PosSessionStatus.OPEN,
    },
  });

  if (!session) {
    throw new AppError({
      statusCode: 409,
      code: "POS_SESSION_NOT_OPEN",
      message:
        "Ouvrez une session de caisse pour encaisser un paiement à la caisse.",
    });
  }

  return session;
}

function parsePositiveMoney(value: string): Prisma.Decimal {
  const decimal = new Prisma.Decimal(value);

  if (!decimal.greaterThan(0)) {
    throw new AppError({
      statusCode: 400,
      code: "POSITIVE_AMOUNT_REQUIRED",
      message: "Le montant doit être supérieur à zéro.",
    });
  }

  return decimal.toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function assertVersionUpdated(count: number) {
  if (count !== 1) {
    throw new AppError({
      statusCode: 409,
      code: "VERSION_CONFLICT",
      message: "Cette fiche a été modifiée. Rechargez puis réessayez.",
    });
  }
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

function customerSearchWhere(
  search: string | undefined,
): Prisma.CustomerWhereInput | undefined {
  const trimmed = search?.trim();
  if (!trimmed) {
    return undefined;
  }

  return {
    OR: [
      { normalizedName: { contains: normalizeName(trimmed) } },
      { phone: { contains: trimmed, mode: "insensitive" } },
    ],
  };
}

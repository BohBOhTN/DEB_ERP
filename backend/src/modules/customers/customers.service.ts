import {
  CustomerLedgerBalanceKind,
  CustomerLedgerEntryType,
  PosSessionStatus,
  Prisma,
  SaleStatus,
  type PrismaClient,
} from "@prisma/client";
import { AppError } from "../../shared/appError.js";
import { runIdempotentCommand } from "../../shared/idempotency.js";
import { normalizeName } from "../../shared/text.js";

export interface CustomerActor {
  actorUserId: string;
  correlationId?: string;
}

export interface CustomerListParams {
  search?: string;
  isActive?: boolean;
  page: number;
  pageSize: number;
}

export interface CustomerPaymentListParams {
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
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
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

  public async listCustomerBalances(params: {
    page: number;
    pageSize: number;
  }) {
    const customers = await this.prisma.customer.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    });
    const customerIds = customers.map((customer) => customer.id);
    const [total, ledgerEntries, sales] = await this.prisma.$transaction([
      this.prisma.customer.count(),
      this.prisma.customerLedgerEntry.findMany({
        where: {
          customerId: {
            in: customerIds,
          },
        },
      }),
      this.prisma.sale.findMany({
        where: {
          customerId: {
            in: customerIds,
          },
          status: SaleStatus.POSTED,
        },
      }),
    ]);

    return paginated(
      customers.map((customer) => {
        const customerEntries = ledgerEntries.filter(
          (entry) => entry.customerId === customer.id,
        );
        const balance = sumEntryAmounts(receivableEntries(customerEntries));
        const advanceBalance = sumEntryAmounts(advanceEntries(customerEntries));
        const openSales = sales
          .filter((sale) => sale.customerId === customer.id)
          .map((sale) => {
            const saleBalance = saleBalanceFromEntries(sale.id, ledgerEntries);
            return {
              saleId: sale.id,
              soldAt: sale.soldAt,
              balanceTnd: saleBalance.toFixed(3),
              paymentState: sale.paymentState,
            };
          })
          .filter((sale) => new Prisma.Decimal(sale.balanceTnd).gt(0));

        return {
          customer,
          balanceTnd: balance.toFixed(3),
          advanceBalanceTnd: advanceBalance.toFixed(3),
          openSaleCount: openSales.length,
          openSales,
        };
      }),
      total,
      params,
    );
  }

  public async getCustomerStatement(customerId: string) {
    const customer = await this.findCustomerOrThrow(customerId);
    const [ledgerEntries, payments, sales, orders] =
      await this.prisma.$transaction([
        this.prisma.customerLedgerEntry.findMany({
          where: {
            customerId,
          },
          include: {
            sale: true,
            payment: true,
            order: true,
          },
          orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
        }),
        this.prisma.customerPayment.findMany({
          where: {
            customerId,
          },
          include: {
            allocations: true,
          },
          orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        }),
        this.prisma.sale.findMany({
          where: {
            customerId,
            status: SaleStatus.POSTED,
          },
          include: {
            lines: true,
            payments: true,
          },
          orderBy: [{ soldAt: "desc" }, { createdAt: "desc" }],
        }),
        this.prisma.customerOrder.findMany({
          where: {
            customerId,
          },
          include: {
            lines: true,
            advances: true,
          },
          orderBy: [{ requestedFulfillmentAt: "desc" }, { createdAt: "desc" }],
        }),
      ]);
    const balance = sumEntryAmounts(receivableEntries(ledgerEntries));
    const advanceBalance = sumEntryAmounts(advanceEntries(ledgerEntries));

    return {
      customer,
      balanceTnd: balance.toFixed(3),
      advanceBalanceTnd: advanceBalance.toFixed(3),
      sales: sales.map((sale) => ({
        ...sale,
        balanceTnd: saleBalanceFromEntries(sale.id, ledgerEntries).toFixed(3),
      })),
      orders,
      ledgerEntries,
      payments,
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
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
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
      allocations?: CustomerPaymentAllocationInput[];
    },
    actor: CustomerActor,
  ) {
    const amountTnd = parsePositiveMoney(params.amountTnd);
    const allocations = params.allocations ?? [];

    return this.runIdempotentCommand(
      `customer_payment.create.${params.customerId}`,
      params.idempotencyKey,
      {
        ...params,
        amountTnd: amountTnd.toFixed(3),
      },
      async (tx) => {
        const customer = await tx.customer.findUnique({
          where: {
            id: params.customerId,
          },
        });

        if (!customer) {
          throw new AppError({
            statusCode: 404,
            code: "CUSTOMER_NOT_FOUND",
            message: "Client introuvable.",
          });
        }

        const ledgerEntries = await tx.customerLedgerEntry.findMany({
          where: {
            customerId: params.customerId,
            balanceKind: CustomerLedgerBalanceKind.RECEIVABLE,
          },
        });
        const currentBalance = sumEntryAmounts(ledgerEntries);

        if (!currentBalance.greaterThan(0)) {
          throw new AppError({
            statusCode: 400,
            code: "CUSTOMER_BALANCE_NOT_DUE",
            message: "Ce client n'a pas de solde a payer.",
          });
        }

        if (amountTnd.greaterThan(currentBalance)) {
          throw new AppError({
            statusCode: 400,
            code: "CUSTOMER_OVERPAYMENT_REJECTED",
            message: "Le paiement ne peut pas dépasser le solde client.",
          });
        }

        const allocationRows = await this.validateCustomerPaymentAllocations(
          {
            customerId: params.customerId,
            amountTnd,
            allocations,
            ledgerEntries,
          },
          tx,
        );
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

        if (allocationRows.length > 0) {
          await tx.customerPaymentAllocation.createMany({
            data: allocationRows.map((allocation) => ({
              paymentId: payment.id,
              saleId: allocation.saleId,
              amountTnd: allocation.amountTnd.toFixed(3),
            })),
          });

          await tx.customerLedgerEntry.createMany({
            data: allocationRows.map((allocation) => ({
              customerId: params.customerId,
              saleId: allocation.saleId,
              paymentId: payment.id,
              entryType: CustomerLedgerEntryType.PAYMENT,
              amountTnd: allocation.amountTnd.negated().toFixed(3),
              occurredAt: params.paidAt,
              actorUserId: actor.actorUserId,
              correlationId: actor.correlationId,
            })),
          });
        } else {
          await tx.customerLedgerEntry.create({
            data: {
              customerId: params.customerId,
              paymentId: payment.id,
              entryType: CustomerLedgerEntryType.PAYMENT,
              amountTnd: amountTnd.negated().toFixed(3),
              occurredAt: params.paidAt,
              actorUserId: actor.actorUserId,
              correlationId: actor.correlationId,
            },
          });
        }

        await this.auditWithClient(tx, {
          actor,
          action: "customer_payment.create",
          entity: "customer_payment",
          targetId: payment.id,
          after: {
            payment,
            allocations: allocationRows,
          },
        });

        return {
          payment,
          allocations: allocationRows.map((allocation) => ({
            saleId: allocation.saleId,
            amountTnd: allocation.amountTnd.toFixed(3),
          })),
        };
      },
    );
  }

  private async validateCustomerPaymentAllocations(
    params: {
      customerId: string;
      amountTnd: Prisma.Decimal;
      allocations: CustomerPaymentAllocationInput[];
      ledgerEntries: LedgerEntrySlice[];
    },
    client: Prisma.TransactionClient,
  ) {
    if (params.allocations.length === 0) {
      return [];
    }

    const allocations = params.allocations.map((allocation) => ({
      saleId: allocation.saleId,
      amountTnd: parsePositiveMoney(allocation.amountTnd),
    }));
    const duplicateSaleId = findDuplicate(
      allocations.map((allocation) => allocation.saleId),
    );

    if (duplicateSaleId) {
      throw new AppError({
        statusCode: 400,
        code: "DUPLICATE_PAYMENT_ALLOCATION",
        message: "Une vente ne peut être allouée qu'une seule fois.",
      });
    }

    const allocationTotal = sumDecimals(
      allocations.map((allocation) => allocation.amountTnd),
      3,
    );

    if (!allocationTotal.equals(params.amountTnd)) {
      throw new AppError({
        statusCode: 400,
        code: "PAYMENT_ALLOCATION_TOTAL_MISMATCH",
        message: "Les allocations doivent correspondre au montant payé.",
      });
    }

    const sales = await client.sale.findMany({
      where: {
        id: {
          in: allocations.map((allocation) => allocation.saleId),
        },
        customerId: params.customerId,
        status: SaleStatus.POSTED,
      },
    });

    if (sales.length !== allocations.length) {
      throw new AppError({
        statusCode: 400,
        code: "POSTED_SALE_ALLOCATION_REQUIRED",
        message: "Chaque allocation doit viser une vente confirmee du client.",
      });
    }

    for (const allocation of allocations) {
      const saleBalance = saleBalanceFromEntries(
        allocation.saleId,
        params.ledgerEntries,
      );

      if (allocation.amountTnd.greaterThan(saleBalance)) {
        throw new AppError({
          statusCode: 400,
          code: "PAYMENT_ALLOCATION_EXCEEDS_SALE_BALANCE",
          message: "Une allocation dépasse le solde de la vente.",
        });
      }
    }

    return allocations;
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

/// Only receivable entries move a sale balance. An applied order advance is
/// recorded against the same sale but belongs to the advance balance, so it
/// must not reduce what the customer still owes on that sale twice.
function saleBalanceFromEntries(saleId: string, entries: LedgerEntrySlice[]) {
  return sumDecimals(
    receivableEntries(entries)
      .filter((entry) => entry.saleId === saleId)
      .map((entry) => new Prisma.Decimal(entry.amountTnd as string)),
    3,
  );
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

function receivableEntries<TEntry extends LedgerEntrySlice>(entries: TEntry[]) {
  return entries.filter(
    (entry) => entry.balanceKind === CustomerLedgerBalanceKind.RECEIVABLE,
  );
}

function advanceEntries<TEntry extends LedgerEntrySlice>(entries: TEntry[]) {
  return entries.filter(
    (entry) => entry.balanceKind === CustomerLedgerBalanceKind.ADVANCE,
  );
}

function sumEntryAmounts(entries: LedgerEntrySlice[]) {
  return sumDecimals(
    entries.map((entry) => new Prisma.Decimal(entry.amountTnd as string)),
    3,
  );
}

interface LedgerEntrySlice {
  saleId?: string | null;
  balanceKind: CustomerLedgerBalanceKind;
  amountTnd: unknown;
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

function sumDecimals(values: Prisma.Decimal[], scale: number): Prisma.Decimal {
  return values
    .reduce((total, value) => total.plus(value), new Prisma.Decimal(0))
    .toDecimalPlaces(scale, Prisma.Decimal.ROUND_HALF_UP);
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

function findDuplicate(values: string[]): string | undefined {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      return value;
    }

    seen.add(value);
  }

  return undefined;
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

import {
  CustomerOrderStatus,
  InventoryItemType,
  PurchasePaymentTerms,
} from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";
import { AccessService } from "../modules/access/access.service.js";
import { SUPER_ADMIN_SYSTEM_KEY } from "../modules/access/permissions.js";
import { CatalogService } from "../modules/catalog/catalog.service.js";
import { CustomersService } from "../modules/customers/customers.service.js";
import { DistributionService } from "../modules/distribution/distribution.service.js";
import { ExpensesService } from "../modules/expenses/expenses.service.js";
import { InventoryService } from "../modules/inventory/inventory.service.js";
import { OrdersService } from "../modules/orders/orders.service.js";
import { PosService } from "../modules/pos/pos.service.js";
import { ProcurementService } from "../modules/procurement/procurement.service.js";
import { SimulationService } from "../modules/simulation/simulation.service.js";
import { PrismaAuthRepository } from "../modules/auth/auth.repository.js";
import { AuthService } from "../modules/auth/auth.service.js";
import { PermissionCache } from "../modules/auth/permissionCache.js";

/// The synthetic French bakery dataset of the stakeholder demo (OD-V2-013,
/// 10_STAKEHOLDER_DEMO_SCRIPT.md section 0). Everything goes through the
/// services so stock, ledgers and audit are produced by the same rules as
/// production. Dates are relative to today so the demo always shows a live
/// bakery; the pseudo-random generator is seeded so two runs give the same
/// story. Never real customer data.
///
/// Usage: `npm run demo:seed` from the repository root, against an empty or
/// bootstrap-only database. `--reset` empties every table first and needs
/// `DEMO_SEED_ALLOW_RESET=1`, so the shared development database cannot be
/// wiped by accident. `--size small` seeds a quarter of the volumes for CI.
export const demoAccounts = {
  owner: {
    email: "proprietaire@demo.tn",
    displayName: "Salma Ben Ali",
    password: "Demo2026!",
  },
  cashier: {
    email: "caissier@demo.tn",
    displayName: "Amine Trabelsi",
    password: "Demo2026!",
  },
  buyer: {
    email: "achats@demo.tn",
    displayName: "Nadia Gharbi",
    password: "Demo2026!",
  },
  manager: {
    email: "gerant@demo.tn",
    displayName: "Karim Mansour",
    password: "Demo2026!",
  },
  accountant: {
    email: "comptable@demo.tn",
    displayName: "Leïla Sassi",
    password: "Demo2026!",
  },
  seller: {
    email: "vendeuse@demo.tn",
    displayName: "Rim Chaabane",
    password: "Demo2026!",
  },
} as const;

export interface DemoSeedOptions {
  size: "full" | "small";
  reset: boolean;
  now?: Date;
  log?: (message: string) => void;
}

const dayMs = 24 * 60 * 60 * 1000;

function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const money = (value: number) => value.toFixed(3);
const key = (scope: string, index: number | string) => `demo-${scope}-${index}`;

function at(now: Date, daysAgo: number, hour: number, minute = 0): Date {
  const date = new Date(now.getTime() - daysAgo * dayMs);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function businessDay(now: Date, daysFromNow: number, hour: number): Date {
  const date = new Date(now.getTime() + daysFromNow * dayMs);
  date.setHours(hour, 0, 0, 0);
  return date;
}

const categoryNames = [
  "Pains",
  "Viennoiseries",
  "Pâtisseries",
  "Gâteaux",
  "Salés",
  "Boissons",
];

const productNames: Record<string, Array<[string, number]>> = {
  Pains: [
    ["Baguette", 0.3],
    ["Pain complet", 0.6],
    ["Pain de mie", 2.5],
    ["Pain aux céréales", 1.2],
    ["Pain rond", 0.5],
    ["Pain de campagne", 1.8],
    ["Petit pain", 0.25],
  ],
  Viennoiseries: [
    ["Croissant", 1.2],
    ["Pain au chocolat", 1.3],
    ["Brioche", 2.0],
    ["Chausson aux pommes", 1.5],
    ["Pain aux raisins", 1.4],
    ["Croissant aux amandes", 1.8],
    ["Beignet", 0.8],
  ],
  Pâtisseries: [
    ["Éclair au chocolat", 2.5],
    ["Mille-feuille", 3.0],
    ["Tarte au citron", 3.2],
    ["Religieuse", 2.8],
    ["Baklawa", 2.2],
    ["Kaak warka", 1.5],
    ["Makroudh", 1.2],
  ],
  Gâteaux: [
    ["Gâteau au chocolat", 18.5],
    ["Fraisier", 25.0],
    ["Gâteau d'anniversaire", 35.0],
    ["Tarte aux fruits", 22.0],
    ["Cheesecake", 24.0],
    ["Forêt-noire", 28.0],
  ],
  Salés: [
    ["Pizza tranche", 2.5],
    ["Quiche lorraine", 3.0],
    ["Sandwich thon", 3.5],
    ["Chapati", 2.8],
    ["Brik à l'œuf", 1.5],
    ["Fricassé", 1.8],
    ["Feuilleté au fromage", 2.0],
  ],
  Boissons: [
    ["Eau minérale 50 cl", 0.8],
    ["Jus d'orange", 2.5],
    ["Café", 1.5],
    ["Thé à la menthe", 1.2],
    ["Citronnade", 2.0],
    ["Lait 25 cl", 1.0],
  ],
};

const rawMaterialNames: Array<[string, string, number, number]> = [
  // name, base unit code, price per base unit, bag factor (0 = no bag)
  ["Farine T55", "kilogram", 1.35, 50],
  ["Farine T45", "kilogram", 1.5, 50],
  ["Farine complète", "kilogram", 1.8, 25],
  ["Semoule fine", "kilogram", 1.4, 25],
  ["Sucre", "kilogram", 2.4, 50],
  ["Sel", "kilogram", 0.6, 25],
  ["Levure fraîche", "kilogram", 6.5, 0],
  ["Levure sèche", "kilogram", 18.0, 0],
  ["Beurre", "kilogram", 22.0, 0],
  ["Margarine", "kilogram", 9.5, 0],
  ["Huile de tournesol", "litre", 4.2, 0],
  ["Huile d'olive", "litre", 18.0, 0],
  ["Lait", "litre", 1.5, 0],
  ["Œufs", "piece", 0.45, 0],
  ["Chocolat noir", "kilogram", 24.0, 0],
  ["Cacao en poudre", "kilogram", 16.0, 0],
  ["Amandes", "kilogram", 38.0, 0],
  ["Noisettes", "kilogram", 32.0, 0],
  ["Vanille", "kilogram", 90.0, 0],
  ["Cannelle", "kilogram", 28.0, 0],
  ["Dattes", "kilogram", 9.0, 0],
  ["Fromage", "kilogram", 16.0, 0],
  ["Thon en boîte", "kilogram", 21.0, 0],
  ["Tomates pelées", "kilogram", 4.5, 0],
  ["Crème fraîche", "litre", 8.0, 0],
];

const supplierNames = [
  "Minoterie du Sud",
  "Grands Moulins de Tunis",
  "Laiterie Ben Youssef",
  "Sucrerie de Béja",
  "Épices Sfaxiennes",
  "Chocolaterie du Cap",
  "Œufs de la Mornaguia",
  "Emballages Nabeul",
];

const customerFirstNames = [
  "Ahmed",
  "Fatma",
  "Mohamed",
  "Amira",
  "Youssef",
  "Sonia",
  "Khaled",
  "Nour",
  "Sami",
  "Hela",
  "Anis",
  "Rania",
  "Bilel",
  "Meriem",
  "Walid",
  "Ines",
  "Hamza",
  "Salma",
  "Omar",
  "Yasmine",
];
const customerLastNames = [
  "Ben Salah",
  "Trabelsi",
  "Jlassi",
  "Gharbi",
  "Mansour",
  "Chaabane",
  "Bouazizi",
  "Hammami",
  "Sassi",
  "Dridi",
  "Karray",
  "Ayari",
];
const businessCustomers = [
  "Boulangerie Salah",
  "Café de la Place",
  "Hôtel Les Jasmins",
  "Restaurant El Menzah",
  "Cantine scolaire Ibn Khaldoun",
  "Épicerie Chez Mounir",
];

const distributorNames = ["Karim", "Fathi", "Lotfi"];

export async function runDemoSeed(
  prisma: PrismaClient,
  options: DemoSeedOptions,
) {
  const log = options.log ?? (() => undefined);
  const now = options.now ?? new Date();
  const random = makeRandom(20260923);
  const pick = <T>(items: readonly T[]): T =>
    items[Math.floor(random() * items.length)] as T;
  const between = (min: number, max: number) =>
    min + Math.floor(random() * (max - min + 1));
  const small = options.size === "small";

  if (options.reset) {
    if (process.env.DEMO_SEED_ALLOW_RESET !== "1") {
      throw new Error(
        "--reset needs DEMO_SEED_ALLOW_RESET=1; it empties every table of the target database.",
      );
    }
    const tables = await prisma.$queryRaw<
      Array<{ tablename: string }>
    >`SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
    if (tables.length > 0) {
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE ${tables.map((row) => `"${row.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
      );
    }
    log(`reset: ${tables.length} tables emptied`);
  }

  const existingUsers = await prisma.user.count();
  if (existingUsers > 0 && !options.reset) {
    throw new Error(
      "The database already holds users. Run against an empty database, or pass --reset with DEMO_SEED_ALLOW_RESET=1.",
    );
  }

  const permissionCache = new PermissionCache(1_000);
  const access = new AccessService(prisma, permissionCache);
  const auth = new AuthService(
    new PrismaAuthRepository(prisma, permissionCache),
    env.SESSION_TTL_MINUTES,
  );
  const catalog = new CatalogService(prisma);
  const inventory = new InventoryService(prisma);
  const procurement = new ProcurementService(prisma);
  const customers = new CustomersService(prisma);
  const orders = new OrdersService(prisma);
  const pos = new PosService(prisma);
  const distribution = new DistributionService(prisma);
  const expenses = new ExpensesService(prisma);
  const simulation = new SimulationService(prisma);

  await access.bootstrapSystemAccess();
  await catalog.bootstrapCatalogData();
  await inventory.bootstrapInventoryData();
  await pos.bootstrapPosData();
  await expenses.bootstrapExpenseData();

  // 1. Users and roles. The owner is created first so the bootstrap makes
  // them the Super Admin; the other roles are French and scoped.
  const ownerUser = await auth.createUser(demoAccounts.owner);
  await access.bootstrapSystemAccess();
  const owner = { actorUserId: ownerUser.id };
  const superAdminRole = await prisma.role.findUniqueOrThrow({
    where: { systemKey: SUPER_ADMIN_SYSTEM_KEY },
  });
  await access.replaceUserRoles(ownerUser.id, [superAdminRole.id], owner);

  const roleDefinitions = [
    {
      name: "Caissier",
      description: "Caisse, commandes et clients",
      keys: [
        "pos.access",
        "pos.sell",
        "pos.open_session",
        "pos.close_session",
        "pos.credit_sale",
        "orders.view",
        "orders.create",
        "orders.update",
        "orders.change_status",
        "orders.complete",
        "customers.view",
        "customers.create",
        "customers.update",
        "customer_payments.view",
        "customer_payments.create",
        "products.view",
      ],
    },
    {
      name: "Achats",
      description: "Fournisseurs, achats et paiements",
      keys: [
        "suppliers.view",
        "suppliers.create",
        "suppliers.update",
        "purchases.view",
        "purchases.create",
        "purchases.post",
        "purchases.cancel",
        "supplier_payments.view",
        "supplier_payments.create",
        "supplier_balances.view",
        "raw_materials.view",
        "raw_materials.create",
        "raw_materials.update",
        "inventory.view",
        "inventory.movements.view",
        "products.view",
      ],
    },
    {
      name: "Gérant",
      description: "Toute l'exploitation sans l'administration",
      keys: (await access.listPermissions())
        .map((permission) => permission.key)
        .filter(
          (permissionKey) =>
            !permissionKey.startsWith("users.") &&
            !permissionKey.startsWith("roles."),
        ),
    },
    {
      name: "Comptable",
      description: "Dépenses, soldes et journal d'audit",
      keys: [
        "expenses.view",
        "expenses.create",
        "expenses.cancel",
        "expense_categories.manage",
        "customer_balances.view",
        "supplier_balances.view",
        "distribution.balances.view",
        "audit.view",
        "simulations.view",
      ],
    },
  ];
  const roles: Record<string, string> = {};
  for (const definition of roleDefinitions) {
    const role = await access.createRole(
      {
        name: definition.name,
        description: definition.description,
        permissionKeys: definition.keys,
      },
      owner,
    );
    roles[definition.name] = role.id;
  }
  const staff = {
    cashier: await access.createUser(
      { ...demoAccounts.cashier, roleIds: [roles.Caissier!] },
      owner,
    ),
    buyer: await access.createUser(
      { ...demoAccounts.buyer, roleIds: [roles.Achats!] },
      owner,
    ),
    manager: await access.createUser(
      { ...demoAccounts.manager, roleIds: [roles["Gérant"]!] },
      owner,
    ),
    accountant: await access.createUser(
      { ...demoAccounts.accountant, roleIds: [roles.Comptable!] },
      owner,
    ),
    seller: await access.createUser(
      { ...demoAccounts.seller, roleIds: [roles.Caissier!] },
      owner,
    ),
  };
  const cashier = { actorUserId: staff.cashier.id };
  const buyer = { actorUserId: staff.buyer.id };
  const manager = { actorUserId: staff.manager.id };
  const accountant = { actorUserId: staff.accountant.id };
  log("users: 6 accounts, 5 roles");

  // 2. Catalogue: units, categories, products, raw materials with conversions.
  const units = Object.fromEntries(
    (await prisma.unit.findMany()).map((unit) => [unit.code, unit.id]),
  );
  const unit = (code: string) => {
    const id = units[code];
    if (!id) throw new Error(`Unit ${code} is missing from the bootstrap.`);
    return id;
  };
  const products: Array<{
    id: string;
    name: string;
    priceTnd: number;
    category: string;
  }> = [];
  for (const categoryName of categoryNames) {
    const category = await catalog.createCategory(
      { name: categoryName },
      manager,
    );
    for (const [name, price] of productNames[categoryName] ?? []) {
      const product = await catalog.createProduct(
        {
          name,
          categoryId: category.id,
          baseUnitId: unit("piece"),
          salePriceTnd: money(price),
          isStockable: true,
        },
        manager,
      );
      products.push({
        id: product.id,
        name,
        priceTnd: price,
        category: categoryName,
      });
    }
  }
  const rawMaterials: Array<{
    id: string;
    name: string;
    unitCode: string;
    priceTnd: number;
    bagFactor: number;
  }> = [];
  for (const [name, unitCode, price, bagFactor] of rawMaterialNames) {
    const rawMaterial = await catalog.createRawMaterial(
      {
        name,
        baseUnitId: unit(unitCode),
        conversions:
          bagFactor > 0
            ? [{ unitId: unit("bag"), factorToBase: String(bagFactor) }]
            : [],
      },
      manager,
    );
    rawMaterials.push({
      id: rawMaterial.id,
      name,
      unitCode,
      priceTnd: price,
      bagFactor,
    });
  }
  log(
    `catalogue: ${products.length} products in ${categoryNames.length} categories, ${rawMaterials.length} raw materials`,
  );

  // 3. Opening stock for the shop so the till and the dispatches can sell.
  for (const [index, product] of products.entries()) {
    await inventory.postOpeningStock(
      {
        idempotencyKey: key("opening", index),
        itemType: InventoryItemType.PRODUCT,
        itemId: product.id,
        quantity: String(between(80, 400)),
        reason: "Inventaire d'ouverture de la démonstration",
      },
      manager,
    );
  }

  // 4. Suppliers and purchases over the last 90 days, some overdue.
  const suppliers: string[] = [];
  for (const name of supplierNames) {
    const supplier = await procurement.createSupplier(
      {
        name,
        phone: `+216 7${between(1, 9)} ${between(100, 999)} ${between(100, 999)}`,
      },
      buyer,
    );
    suppliers.push(supplier.id);
  }
  const purchaseCount = small ? 12 : 30;
  const postedPurchases: Array<{
    id: string;
    supplierId: string;
    totalTnd: number;
    paidTnd: number;
  }> = [];
  for (let index = 0; index < purchaseCount; index += 1) {
    const supplierId = suppliers[index % suppliers.length]!;
    const daysAgo = Math.round((purchaseCount - index) * (90 / purchaseCount));
    const lineCount = between(1, 4);
    const lines = Array.from({ length: lineCount }, (_, lineIndex) => {
      const rawMaterial =
        rawMaterials[(index * 3 + lineIndex * 7) % rawMaterials.length]!;
      const byBag = rawMaterial.bagFactor > 0 && random() > 0.4;
      return {
        rawMaterialId: rawMaterial.id,
        enteredUnitId: byBag ? unit("bag") : unit(rawMaterial.unitCode),
        enteredQuantity: String(byBag ? between(2, 20) : between(5, 60)),
        unitPriceTnd: money(
          byBag
            ? rawMaterial.priceTnd * rawMaterial.bagFactor
            : rawMaterial.priceTnd,
        ),
      };
    });
    const total = lines.reduce(
      (sum, line) =>
        sum + Number(line.enteredQuantity) * Number(line.unitPriceTnd),
      0,
    );
    const terms =
      index % 5 === 0
        ? PurchasePaymentTerms.UNPAID
        : index % 3 === 0
          ? PurchasePaymentTerms.PARTIAL
          : PurchasePaymentTerms.PAID;
    const paid =
      terms === PurchasePaymentTerms.PAID
        ? total
        : terms === PurchasePaymentTerms.PARTIAL
          ? Math.round(total * 0.4)
          : 0;
    const dueInDays =
      terms === PurchasePaymentTerms.PAID
        ? undefined
        : index % 2 === 0
          ? 15
          : 45;
    const purchase = await procurement.createPurchase(
      {
        supplierId,
        purchaseDate: at(now, daysAgo, 9),
        paymentTerms: terms,
        paidAmountTnd: money(paid),
        dueDate: dueInDays ? at(now, daysAgo - dueInDays, 9) : undefined,
        lines,
      },
      buyer,
    );
    if (index % 7 !== 6) {
      await procurement.postPurchase(
        purchase.id,
        { idempotencyKey: key("purchase-post", index) },
        buyer,
      );
      postedPurchases.push({
        id: purchase.id,
        supplierId,
        totalTnd: total,
        paidTnd: paid,
      });
    }
  }
  for (const [index, purchase] of postedPurchases
    .filter((row) => row.paidTnd < row.totalTnd)
    .entries()) {
    if (index % 3 !== 0) continue;
    await procurement.createSupplierPayment(
      {
        idempotencyKey: key("supplier-payment", index),
        supplierId: purchase.supplierId,
        paidAt: at(now, between(1, 20), 11),
        amountTnd: money(
          Math.round((purchase.totalTnd - purchase.paidTnd) * 0.5),
        ),
        allocations: [
          {
            purchaseId: purchase.id,
            amountTnd: money(
              Math.round((purchase.totalTnd - purchase.paidTnd) * 0.5),
            ),
          },
        ],
      },
      buyer,
    );
  }
  log(
    `procurement: ${suppliers.length} suppliers, ${purchaseCount} purchases (${postedPurchases.length} posted)`,
  );

  // 5. Customers.
  const customerIds: Array<{ id: string; name: string }> = [];
  for (const name of businessCustomers) {
    const customer = await customers.createCustomer(
      {
        name,
        phone: `+216 2${between(0, 9)} ${between(100, 999)} ${between(100, 999)}`,
      },
      cashier,
    );
    customerIds.push({ id: customer.id, name });
  }
  const customerCount = small ? 20 : 60;
  while (customerIds.length < customerCount) {
    const name = `${pick(customerFirstNames)} ${pick(customerLastNames)}`;
    if (customerIds.some((row) => row.name === name)) continue;
    const customer = await customers.createCustomer(
      {
        name,
        phone:
          random() > 0.3
            ? `+216 5${between(0, 9)} ${between(100, 999)} ${between(100, 999)}`
            : undefined,
      },
      cashier,
    );
    customerIds.push({ id: customer.id, name });
  }
  log(`customers: ${customerIds.length}`);

  // 6. Two weeks of POS sessions with paid and credit sales, closed with a
  // small difference now and then; today's session stays open for the demo.
  const sessionDays = small ? 5 : 14;
  const cheap = products.filter((product) => product.priceTnd < 5);
  let creditSales: Array<{
    saleId: string;
    customerId: string;
    remaining: number;
  }> = [];
  for (let daysAgo = sessionDays; daysAgo >= 1; daysAgo -= 1) {
    const opening = 100;
    const { session } = await pos.openSession(
      {
        idempotencyKey: key("session-open", daysAgo),
        openingCashTnd: money(opening),
        openedAt: at(now, daysAgo, 6, 30),
      },
      cashier,
    );
    let cash = opening;
    const saleCount = small ? between(4, 8) : between(12, 30);
    for (let saleIndex = 0; saleIndex < saleCount; saleIndex += 1) {
      const lineCount = between(1, 4);
      const chosen = new Map<
        string,
        { productId: string; quantity: string; price: number }
      >();
      for (let line = 0; line < lineCount; line += 1) {
        const product = random() > 0.15 ? pick(cheap) : pick(products);
        chosen.set(product.id, {
          productId: product.id,
          quantity: String(between(1, 6)),
          price: product.priceTnd,
        });
      }
      const lines = [...chosen.values()];
      const total = lines.reduce(
        (sum, line) => sum + Number(line.quantity) * line.price,
        0,
      );
      const onCredit = random() > 0.85;
      const customer = onCredit || random() > 0.7 ? pick(customerIds) : null;
      const paid =
        onCredit && customer ? Math.round(total * 0.5 * 1000) / 1000 : total;
      const { sale } = await pos.postPaidSale(
        {
          idempotencyKey: key("sale", `${daysAgo}-${saleIndex}`),
          sessionId: session.id,
          customerId: customer?.id,
          soldAt: at(
            now,
            daysAgo,
            7 + Math.floor(saleIndex / 3),
            (saleIndex * 11) % 60,
          ),
          paidAmountTnd: money(paid),
          lines: lines.map(({ productId, quantity }) => ({
            productId,
            quantity,
          })),
        },
        cashier,
      );
      cash += paid;
      if (customer && paid < total)
        creditSales.push({
          saleId: sale.id,
          customerId: customer.id,
          remaining: total - paid,
        });
    }
    const difference = daysAgo % 4 === 0 ? -between(1, 5) : 0;
    await pos.closeSession(
      session.id,
      {
        idempotencyKey: key("session-close", daysAgo),
        countedCashTnd: money(cash + difference),
        closedAt: at(now, daysAgo, 19),
      },
      cashier,
    );
  }
  // Half of the credit sales are settled later by a back-office payment.
  creditSales = creditSales.filter((row) => row.remaining > 0);
  for (const [index, row] of creditSales.entries()) {
    if (index % 2 !== 0) continue;
    await customers.createCustomerPayment(
      {
        idempotencyKey: key("customer-payment", index),
        customerId: row.customerId,
        paidAt: at(now, between(0, 3), 10),
        amountTnd: money(row.remaining),
        allocations: [{ saleId: row.saleId, amountTnd: money(row.remaining) }],
      },
      cashier,
    );
  }
  log(
    `pos: ${sessionDays} closed sessions, ${creditSales.length} credit sales`,
  );

  // 7. Orders across statuses for today and tomorrow, some with advances.
  const orderCount = small ? 8 : 20;
  const cakes = products.filter(
    (product) =>
      product.category === "Gâteaux" || product.category === "Pâtisseries",
  );
  const statusPath: CustomerOrderStatus[][] = [
    [],
    [CustomerOrderStatus.CONFIRMED],
    [CustomerOrderStatus.CONFIRMED, CustomerOrderStatus.PREPARING],
    [
      CustomerOrderStatus.CONFIRMED,
      CustomerOrderStatus.PREPARING,
      CustomerOrderStatus.READY,
    ],
  ];
  for (let index = 0; index < orderCount; index += 1) {
    const customer = customerIds[index % customerIds.length]!;
    const product = cakes[index % cakes.length]!;
    const requestedAt =
      index % 3 === 0
        ? businessDay(now, 1, 9 + (index % 6))
        : index % 3 === 1
          ? businessDay(now, 0, 14 + (index % 5))
          : businessDay(now, 2, 10);
    const { order } = await orders.createOrder(
      {
        idempotencyKey: key("order", index),
        customerId: customer.id,
        requestedFulfillmentAt: requestedAt,
        lines: [{ productId: product.id, quantity: String(between(1, 3)) }],
      },
      cashier,
    );
    let version = order.version;
    for (const status of statusPath[index % statusPath.length]!) {
      const changed = await orders.changeOrderStatus(
        order.id,
        { version, status },
        cashier,
      );
      version = changed.order.version;
    }
    if (index % 2 === 0) {
      await orders.recordOrderAdvance(
        order.id,
        {
          idempotencyKey: key("order-advance", index),
          amountTnd: money(Math.min(20, Math.round(product.priceTnd * 0.5))),
          paidAt: at(now, 1, 16),
        },
        cashier,
      );
    }
  }
  log(`orders: ${orderCount}`);

  // 8. Distributors: closed dispatches with settlements and payments, plus
  // one open dispatch each for the demo.
  const consignable = products.filter(
    (product) =>
      product.category === "Pains" || product.category === "Viennoiseries",
  );
  for (const [distributorIndex, name] of distributorNames.entries()) {
    const distributor = await distribution.createDistributor(
      {
        name,
        phone: `+216 9${between(0, 9)} ${between(100, 999)} ${between(100, 999)}`,
      },
      manager,
    );
    const rounds = small ? 2 : 5;
    for (let round = 0; round < rounds; round += 1) {
      const daysAgo = (rounds - round) * 3;
      const lines = consignable.slice(0, 3).map((product) => ({
        productId: product.id,
        quantity: String(between(20, 40)),
      }));
      const { dispatch } = await distribution.dispatchConsignment(
        {
          idempotencyKey: key("dispatch", `${distributorIndex}-${round}`),
          distributorId: distributor.id,
          dispatchedAt: at(now, daysAgo, 7),
          lines,
        },
        manager,
      );
      const settlementLines = dispatch.lines.map((line, lineIndex) => {
        const quantity = Number(line.dispatchedQuantity);
        const returned = lineIndex === 1 ? Math.min(8, quantity) : 0;
        const unaccounted = lineIndex === 2 && round % 2 === 0 ? 2 : 0;
        return {
          dispatchLineId: line.id,
          soldQuantity: String(quantity - returned - unaccounted),
          returnedQuantity: String(returned),
          unaccountedQuantity: String(unaccounted),
          unitPriceTnd: money(consignable[lineIndex]!.priceTnd),
        };
      });
      const settlementTotal = settlementLines.reduce(
        (sum, line) =>
          sum + Number(line.soldQuantity) * Number(line.unitPriceTnd),
        0,
      );
      const { settlement } = await distribution.postSettlement(
        {
          idempotencyKey: key("settlement", `${distributorIndex}-${round}`),
          dispatchId: dispatch.id,
          settledAt: at(now, daysAgo - 1, 18),
          paidAmountTnd: money(
            round % 2 === 0
              ? settlementTotal
              : Math.round(settlementTotal * 0.6),
          ),
          lines: settlementLines,
        },
        manager,
      );
      if (round % 2 === 1) {
        const remaining = settlementTotal - Math.round(settlementTotal * 0.6);
        await distribution.createDistributorPayment(
          {
            idempotencyKey: key(
              "distributor-payment",
              `${distributorIndex}-${round}`,
            ),
            distributorId: distributor.id,
            paidAt: at(now, Math.max(0, daysAgo - 2), 12),
            amountTnd: money(remaining),
            allocations: [
              { settlementId: settlement.id, amountTnd: money(remaining) },
            ],
          },
          manager,
        );
      }
    }
    await distribution.dispatchConsignment(
      {
        idempotencyKey: key("dispatch-open", distributorIndex),
        distributorId: distributor.id,
        dispatchedAt: at(now, 0, 7),
        lines: [{ productId: consignable[0]!.id, quantity: "40" }],
      },
      manager,
    );
  }
  log(
    `distribution: ${distributorNames.length} distributors with open dispatches`,
  );

  // 9. Three months of expenses, posted, across the bootstrap categories.
  const categories = await expenses.listCategories({ isActive: true });
  const categoryByName = new Map(
    categories.map((category) => [category.name, category.id]),
  );
  const monthly: Array<[string, number, string]> = [
    ["Loyer", 1200, "Loyer du local"],
    ["Salaires", 4800, "Salaires du mois"],
    ["Electricite", 380, "Facture STEG"],
    ["Eau", 90, "Facture SONEDE"],
    ["Gaz", 260, "Bouteilles de gaz"],
  ];
  let expenseIndex = 0;
  for (let monthsAgo = 2; monthsAgo >= 0; monthsAgo -= 1) {
    for (const [categoryName, amount, description] of monthly) {
      const categoryId = categoryByName.get(categoryName);
      if (!categoryId) continue;
      const date = new Date(
        now.getFullYear(),
        now.getMonth() - monthsAgo,
        5 + (expenseIndex % 3),
        10,
      );
      if (date > now) continue;
      await expenses.createExpense(
        {
          categoryId,
          expenseDate: date,
          amountTnd: money(amount + between(-20, 20)),
          description,
          post: true,
        },
        accountant,
      );
      expenseIndex += 1;
    }
    const extras = small ? 3 : 8;
    for (let extra = 0; extra < extras; extra += 1) {
      const categoryName = pick([
        "Transport",
        "Entretien",
        "Nettoyage",
        "Divers",
      ]);
      const categoryId = categoryByName.get(categoryName);
      if (!categoryId) continue;
      const date = new Date(
        now.getFullYear(),
        now.getMonth() - monthsAgo,
        between(1, 27),
        15,
      );
      if (date > now) continue;
      await expenses.createExpense(
        {
          categoryId,
          expenseDate: date,
          amountTnd: money(between(15, 140)),
          description: pick([
            "Livraison farine",
            "Réparation four",
            "Produits d'entretien",
            "Fournitures",
            "Carburant camionnette",
          ]),
          post: extra % 4 !== 3,
        },
        accountant,
      );
      expenseIndex += 1;
    }
  }
  log(`expenses: ${expenseIndex}`);

  // 10. Simulations built on the raw materials with real prices.
  const rawByName = new Map(rawMaterials.map((row) => [row.name, row]));
  const ingredient = (name: string, quantity: string, unitCode?: string) => {
    const row = rawByName.get(name);
    if (!row) throw new Error(`Raw material ${name} missing`);
    return {
      rawMaterialId: row.id,
      enteredQuantity: quantity,
      enteredUnitId: unit(unitCode ?? row.unitCode),
      unitPriceTnd: money(row.priceTnd),
      priceBasisUnitId: unit(row.unitCode),
    };
  };
  const brioche = products.find((product) => product.name === "Brioche");
  const baguette = products.find((product) => product.name === "Baguette");
  await simulation.createSimulation(
    {
      name: "Brioche",
      targetProductId: brioche?.id,
      outputQuantity: "40",
      outputUnitId: unit("piece"),
      ingredients: [
        ingredient("Farine T45", "5"),
        ingredient("Beurre", "1.5"),
        ingredient("Sucre", "0.6"),
        ingredient("Œufs", "12"),
        ingredient("Levure fraîche", "0.15"),
        ingredient("Lait", "1.2"),
      ],
    },
    manager,
  );
  await simulation.createSimulation(
    {
      name: "Baguette",
      targetProductId: baguette?.id,
      outputQuantity: "100",
      outputUnitId: unit("piece"),
      ingredients: [
        ingredient("Farine T55", "25"),
        ingredient("Sel", "0.5"),
        ingredient("Levure fraîche", "0.4"),
      ],
    },
    manager,
  );
  await simulation.createSimulation(
    {
      name: "Croissant pur beurre",
      outputQuantity: "60",
      outputUnitId: unit("piece"),
      ingredients: [
        ingredient("Farine T45", "4"),
        ingredient("Beurre", "2.2"),
        ingredient("Sucre", "0.4"),
        ingredient("Lait", "1"),
        ingredient("Levure fraîche", "0.12"),
      ],
    },
    manager,
  );
  await simulation.createSimulation(
    {
      name: "Gâteau au chocolat",
      outputQuantity: "8",
      outputUnitId: unit("piece"),
      ingredients: [
        ingredient("Chocolat noir", "2"),
        ingredient("Beurre", "1.6"),
        ingredient("Sucre", "1.5"),
        ingredient("Œufs", "24"),
        ingredient("Farine T45", "1.2"),
      ],
    },
    manager,
  );
  log("simulations: 4");

  // 11. An early session today, already closed, so Accueil has today's
  // numbers while the till is free for the demo's "Ouvrir la caisse".
  const { session: today } = await pos.openSession(
    {
      idempotencyKey: key("session-open", "today"),
      openingCashTnd: money(100),
      openedAt: at(now, 0, 5, 30),
    },
    cashier,
  );
  let todayCash = 100;
  for (let index = 0; index < 5; index += 1) {
    const product = cheap[index % cheap.length]!;
    await pos.postPaidSale(
      {
        idempotencyKey: key("sale-today", index),
        sessionId: today.id,
        soldAt: at(now, 0, 5, 35 + index * 4),
        paidAmountTnd: money(product.priceTnd * 2),
        lines: [{ productId: product.id, quantity: "2" }],
      },
      cashier,
    );
    todayCash += product.priceTnd * 2;
  }
  await pos.closeSession(
    today.id,
    {
      idempotencyKey: key("session-close", "today"),
      countedCashTnd: money(todayCash),
      closedAt: at(now, 0, 6, 0),
    },
    cashier,
  );
  log("today: one closed early session, till free");

  return {
    ownerUserId: ownerUser.id,
    products: products.length,
    customers: customerIds.length,
  };
}

const isDirectRun =
  process.argv[1]?.endsWith("demoSeed.ts") ||
  process.argv[1]?.endsWith("demo-seed.ts");

if (isDirectRun) {
  const args = process.argv.slice(2);
  const sizeIndex = args.indexOf("--size");
  const size =
    sizeIndex >= 0 && args[sizeIndex + 1] === "small" ? "small" : "full";
  const prisma = new PrismaClient();
  try {
    const summary = await runDemoSeed(prisma, {
      size,
      reset: args.includes("--reset"),
      log: (message) => console.log(`[demo-seed] ${message}`),
    });
    console.log(
      `[demo-seed] done: ${summary.products} products, ${summary.customers} customers; owner ${demoAccounts.owner.email} / ${demoAccounts.owner.password}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

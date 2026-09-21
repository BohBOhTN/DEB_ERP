import { readApiError, type ApiEnvelope } from "../auth/authApi";
import type { Page, RawMaterial, Unit } from "../catalog/catalogApi";

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

export type PurchaseStatus = "DRAFT" | "POSTED" | "CANCELLED";
export type PurchasePaymentTerms = "PAID" | "PARTIAL" | "UNPAID";

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  taxIdentifier: string | null;
  notes: string | null;
  isActive: boolean;
  version: number;
}

export interface PurchaseLine {
  id: string;
  rawMaterialId: string;
  enteredUnitId: string;
  baseUnitId: string;
  enteredQuantity: string;
  conversionFactorToBase: string;
  normalizedQuantity: string;
  unitPriceTnd: string;
  lineTotalTnd: string;
  rawMaterialNameSnapshot: string;
  enteredUnitNameSnapshot: string;
  baseUnitNameSnapshot: string;
}

export interface Purchase {
  id: string;
  supplierId: string;
  purchaseDate: string;
  supplierReference: string | null;
  status: PurchaseStatus;
  paymentTerms: PurchasePaymentTerms;
  dueDate: string | null;
  totalTnd: string;
  paidAmountTnd: string;
  notes: string | null;
  supplier: Supplier;
  lines: PurchaseLine[];
}

export interface PurchaseDraftLineInput {
  rawMaterialId: string;
  enteredUnitId: string;
  enteredQuantity: string;
  unitPriceTnd: string;
}

export async function getSuppliers(): Promise<Page<Supplier>> {
  return getPage("/procurement/suppliers", "suppliers");
}

export async function getPurchases(): Promise<Page<Purchase>> {
  return getPage("/procurement/purchases", "purchases");
}

export async function createSupplier(params: {
  name: string;
  phone: string;
  address: string;
  taxIdentifier: string;
  notes: string;
}): Promise<Supplier> {
  return mutate("/procurement/suppliers", "POST", params, "supplier");
}

export async function updateSupplier(
  supplier: Supplier,
  params: { isActive: boolean },
): Promise<Supplier> {
  return mutate(
    `/procurement/suppliers/${supplier.id}`,
    "PATCH",
    {
      version: supplier.version,
      isActive: params.isActive,
    },
    "supplier",
  );
}

export async function createPurchase(params: {
  supplierId: string;
  purchaseDate: string;
  supplierReference: string;
  paymentTerms: PurchasePaymentTerms;
  paidAmountTnd: string;
  dueDate: string;
  notes: string;
  lines: PurchaseDraftLineInput[];
}): Promise<Purchase> {
  return mutate(
    "/procurement/purchases",
    "POST",
    {
      ...params,
      purchaseDate: toIsoDate(params.purchaseDate),
      dueDate: params.dueDate ? toIsoDate(params.dueDate) : undefined,
    },
    "purchase",
  );
}

export async function postPurchase(purchaseId: string): Promise<void> {
  await postCommand(`/procurement/purchases/${purchaseId}/post`);
}

export async function cancelPurchase(
  purchaseId: string,
  reason: string,
): Promise<void> {
  await postCommand(`/procurement/purchases/${purchaseId}/cancel`, { reason });
}

export function estimateLineTotal(
  line: PurchaseDraftLineInput,
  rawMaterials: RawMaterial[],
): string {
  const material = rawMaterials.find((item) => item.id === line.rawMaterialId);
  if (!material || !line.enteredQuantity || !line.unitPriceTnd) {
    return "0.000";
  }

  const factor =
    line.enteredUnitId === material.baseUnitId
      ? 1
      : Number(
          material.conversions.find(
            (conversion) => conversion.unitId === line.enteredUnitId,
          )?.factorToBase ?? 0,
        );

  if (!factor) {
    return "0.000";
  }

  return (
    Number(line.enteredQuantity) *
    factor *
    Number(line.unitPriceTnd)
  ).toFixed(3);
}

export function estimatePurchaseTotal(
  lines: PurchaseDraftLineInput[],
  rawMaterials: RawMaterial[],
): string {
  return lines
    .reduce(
      (total, line) => total + Number(estimateLineTotal(line, rawMaterials)),
      0,
    )
    .toFixed(3);
}

export function unitOptionsForLine(
  line: PurchaseDraftLineInput,
  rawMaterials: RawMaterial[],
  units: Unit[],
): Unit[] {
  const material = rawMaterials.find((item) => item.id === line.rawMaterialId);
  if (!material) {
    return units.filter((unit) => unit.isActive);
  }

  const unitIds = new Set([
    material.baseUnitId,
    ...material.conversions
      .filter((conversion) => conversion.isActive)
      .map((conversion) => conversion.unitId),
  ]);

  return units.filter((unit) => unit.isActive && unitIds.has(unit.id));
}

async function getPage<TItem>(path: string, key: string): Promise<Page<TItem>> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<
    Record<string, Page<TItem>>
  >;
  return body.data[key];
}

async function mutate<TResult>(
  path: string,
  method: "POST" | "PATCH",
  payload: unknown,
  key: string,
): Promise<TResult> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<Record<string, TResult>>;
  return body.data[key];
}

async function postCommand(path: string, payload?: unknown): Promise<void> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });

  if (!response.ok) {
    throw await readApiError(response);
  }
}

function toIsoDate(value: string): string {
  return new Date(`${value}T08:00:00.000`).toISOString();
}

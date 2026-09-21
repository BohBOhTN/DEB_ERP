import { readApiError, type ApiEnvelope } from "../auth/authApi";
import type { Category, Page, Unit } from "../catalog/catalogApi";

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

export interface PosProduct {
  id: string;
  code: string | null;
  barcode: string | null;
  name: string;
  salePriceTnd: string;
  isStockable: boolean;
  isActive: boolean;
  baseUnit: Unit;
  category: Category;
}

export interface PosSession {
  id: string;
  status: "OPEN" | "CLOSED";
  openedAt: string;
  openingCashTnd: string;
  closedAt: string | null;
  countedCashTnd: string | null;
  expectedCashTnd: string | null;
  cashDifferenceTnd: string | null;
}

export interface SaleLine {
  id: string;
  productId: string;
  quantity: string;
  unitPriceTnd: string;
  lineTotalTnd: string;
  productNameSnapshot: string;
  unitNameSnapshot: string;
}

export interface Sale {
  id: string;
  status: "POSTED" | "CANCELLED";
  paymentState: "PAID" | "PARTIALLY_PAID" | "UNPAID";
  soldAt: string;
  totalTnd: string;
  paidAmountTnd: string;
  lines: SaleLine[];
}

export async function getPosProducts(
  search?: string,
): Promise<Page<PosProduct>> {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  return getPage(`/pos/products${query}`, "products");
}

export async function getCurrentPosSession(): Promise<PosSession | null> {
  const response = await fetch(`${apiBaseUrl}/pos/sessions/current`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<{
    session: PosSession | null;
  }>;
  return body.data.session;
}

export async function openPosSession(params: {
  openingCashTnd: string;
}): Promise<PosSession> {
  return postCommand("/pos/sessions/open", params, "session");
}

export async function closePosSession(
  sessionId: string,
  params: { countedCashTnd: string },
): Promise<PosSession> {
  return postCommand(`/pos/sessions/${sessionId}/close`, params, "session");
}

export async function postPaidSale(params: {
  sessionId: string;
  lines: Array<{ productId: string; quantity: string }>;
}): Promise<Sale> {
  return postCommand("/pos/sales", params, "sale");
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

async function postCommand<TResult>(
  path: string,
  payload: unknown,
  key: string,
): Promise<TResult> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<Record<string, TResult>>;
  return body.data[key];
}

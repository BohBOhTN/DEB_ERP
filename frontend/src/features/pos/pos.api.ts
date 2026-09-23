import { apiClient } from "../../lib/api/client.js";
import type { PageResult } from "../../lib/api/pagination.js";
import { toSearchParams } from "../../lib/api/pagination.js";
import type { Category, Unit } from "../catalog/catalog.api.js";

/// The slice of `/api/v1/pos` the order and customer screens need: the open
/// session (money can only move through an open till) and the product
/// search. The POS screens proper arrive in Sprint 23.
export interface PosSession {
  id: string;
  status: "OPEN" | "CLOSED";
  openedAt: string;
  openedByUserId: string;
  openingCashTnd: string;
  terminal: { id: string; code: string; name: string };
}

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

export async function getCurrentSession(): Promise<PosSession | null> {
  return (
    await apiClient.get<{ session: PosSession | null }>("/pos/sessions/current")
  ).session;
}

export function listPosProducts(query: {
  page: number;
  pageSize: number;
  q?: string;
}): Promise<PageResult<PosProduct>> {
  return apiClient.list<PosProduct>("/pos/products", {
    query: toSearchParams({ ...query }),
  });
}

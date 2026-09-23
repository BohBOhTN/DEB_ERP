import { apiClient } from "../../lib/api/client.js";
import type { PageResult } from "../../lib/api/pagination.js";

/// Read-only slices of other modules the catalogue detail pages show: the
/// audit trail of an item (`Historique`) and the purchases of a raw
/// material (`Achats`). Both stay on `/api/v1` list contracts.
export interface AuditEventRow {
  id: string;
  action: string;
  actionLabelFr: string;
  entity: string;
  entityLabelFr: string;
  targetId: string | null;
  createdAt: string;
  actor: { id: string; displayName: string } | null;
  before: unknown;
  after: unknown;
}

export function listAuditEvents(query: {
  entity: string;
  targetId: string;
  page: number;
  pageSize: number;
}): Promise<PageResult<AuditEventRow>> {
  return apiClient.list<AuditEventRow>("/audit-events", {
    query: {
      entity: query.entity,
      targetId: query.targetId,
      page: query.page,
      pageSize: query.pageSize,
      sort: "createdAt:desc",
    },
  });
}

export interface PurchaseRow {
  id: string;
  reference: string | null;
  purchaseDate: string;
  status: "DRAFT" | "POSTED" | "CANCELLED";
  paymentTerms: "PAID" | "PARTIAL" | "UNPAID";
  totalTnd: string;
  supplier: { id: string; name: string };
}

export function listPurchasesOf(
  rawMaterialId: string,
  query: { page: number; pageSize: number },
): Promise<PageResult<PurchaseRow>> {
  return apiClient.list<PurchaseRow>("/procurement/purchases", {
    query: {
      rawMaterialId,
      page: query.page,
      pageSize: query.pageSize,
      sort: "purchaseDate:desc",
    },
  });
}

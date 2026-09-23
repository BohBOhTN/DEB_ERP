import type { PageResult } from "../../lib/api/pagination.js";
import {
  listRawMaterials,
  listUnits,
  type RawMaterial,
  type Unit,
} from "./catalog.api.js";

/// Compatibility shim for the V1 screens not yet rebuilt (procurement,
/// simulation, and the `Page` type in six V1 API files). It delegates to the
/// V2 catalogue API and is deleted with its last consumer in Sprint 26.
export type {
  Category,
  Product,
  RawMaterial,
  RawMaterialConversion,
  Unit,
} from "./catalog.api.js";
export type Page<TItem> = PageResult<TItem>;

const everythingActive = {
  page: 1,
  pageSize: 100,
  isActive: true,
  sort: { field: "name", direction: "asc" as const },
};

export function getRawMaterials(): Promise<Page<RawMaterial>> {
  return listRawMaterials(everythingActive);
}

export function getUnits(): Promise<Page<Unit>> {
  return listUnits(everythingActive);
}

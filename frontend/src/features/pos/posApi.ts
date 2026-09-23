/// Compatibility shim for the V1 distribution screen (deleted in Sprint
/// 24): the POS product lookup now lives in the V2 API module.
import { listPosProducts, type PosProduct } from "./pos.api.js";

export type { PosProduct };

export async function getPosProducts(search?: string) {
  return listPosProducts({ page: 1, pageSize: 100, q: search || undefined });
}

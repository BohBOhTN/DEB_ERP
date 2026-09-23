/// Where a target opens (07 section 4.11): the rebuilt detail route when one
/// exists, else the module list.
export function auditTargetHref(
  entity: string,
  targetId: string | null,
): string | null {
  if (!targetId) return null;
  const routes: Record<string, string> = {
    product: `/produits/${targetId}`,
    raw_material: `/matieres-premieres/${targetId}`,
    supplier: `/fournisseurs/${targetId}`,
    purchase: `/achats/${targetId}`,
    customer: `/clients/${targetId}`,
    customer_order: `/commandes/${targetId}`,
    distributor: `/distributeurs/${targetId}`,
    distributor_dispatch: `/distribution/sorties/${targetId}`,
    sale: `/caisse/ventes/${targetId}`,
    pos_sale: `/caisse/ventes/${targetId}`,
    pos_session: `/caisse/sessions/${targetId}`,
    cost_simulation: `/simulations/${targetId}`,
    simulation: `/simulations/${targetId}`,
    role: `/roles/${targetId}`,
    user: "/utilisateurs",
    unit: "/catalogue/parametres",
    product_category: "/catalogue/parametres",
    inventory_movement: "/stock/mouvements",
    supplier_payment: "/paiements-fournisseurs",
    customer_payment: "/clients",
    expense: "/depenses",
    expense_category: "/depenses/categories",
    distributor_payment: "/distribution/reglements",
    distributor_settlement: "/distribution/depot-vente?tab=settlements",
    distributor_sale: "/distribution/reglements",
  };
  return routes[entity] ?? null;
}

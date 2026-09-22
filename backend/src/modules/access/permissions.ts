export const SUPER_ADMIN_SYSTEM_KEY = "SUPER_ADMIN";

export const permissionCatalog = [
  permission("users.view", "Utilisateurs", "Voir les utilisateurs"),
  permission("users.create", "Utilisateurs", "Creer des utilisateurs"),
  permission("users.update", "Utilisateurs", "Modifier les utilisateurs"),
  permission(
    "users.activate",
    "Utilisateurs",
    "Activer ou desactiver les utilisateurs",
  ),
  permission(
    "users.assign_roles",
    "Utilisateurs",
    "Attribuer les roles aux utilisateurs",
  ),
  permission("roles.view", "Roles", "Voir les roles"),
  permission("roles.create", "Roles", "Creer des roles"),
  permission("roles.update", "Roles", "Modifier les roles"),
  permission("roles.activate", "Roles", "Activer ou desactiver les roles"),
  permission(
    "roles.assign_permissions",
    "Roles",
    "Attribuer les autorisations aux roles",
  ),
  permission("products.view", "Produits", "Voir les produits"),
  permission("products.create", "Produits", "Creer des produits"),
  permission("products.update", "Produits", "Modifier les produits"),
  permission(
    "products.activate",
    "Produits",
    "Activer ou desactiver les produits",
  ),
  permission("categories.view", "Categories", "Voir les categories"),
  permission("categories.manage", "Categories", "Gerer les categories"),
  permission(
    "raw_materials.view",
    "Matieres premieres",
    "Voir les matieres premieres",
  ),
  permission(
    "raw_materials.create",
    "Matieres premieres",
    "Creer des matieres premieres",
  ),
  permission(
    "raw_materials.update",
    "Matieres premieres",
    "Modifier les matieres premieres",
  ),
  permission(
    "raw_materials.activate",
    "Matieres premieres",
    "Activer ou desactiver les matieres premieres",
  ),
  permission("units.view", "Unites", "Voir les unites"),
  permission("units.manage", "Unites", "Gerer les unites"),
  permission("inventory.view", "Stock", "Voir le stock"),
  permission(
    "inventory.movements.view",
    "Stock",
    "Voir les mouvements de stock",
  ),
  permission("inventory.adjust", "Stock", "Ajuster le stock"),
  permission("inventory.opening_stock", "Stock", "Saisir le stock initial"),
  permission("suppliers.view", "Fournisseurs", "Voir les fournisseurs"),
  permission("suppliers.create", "Fournisseurs", "Creer des fournisseurs"),
  permission("suppliers.update", "Fournisseurs", "Modifier les fournisseurs"),
  permission("purchases.view", "Achats", "Voir les achats"),
  permission("purchases.create", "Achats", "Creer des achats"),
  permission("purchases.post", "Achats", "Valider les achats"),
  permission("purchases.cancel", "Achats", "Annuler les achats"),
  permission(
    "supplier_payments.view",
    "Paiements fournisseurs",
    "Voir les paiements fournisseurs",
  ),
  permission(
    "supplier_payments.create",
    "Paiements fournisseurs",
    "Creer des paiements fournisseurs",
  ),
  permission(
    "supplier_balances.view",
    "Soldes fournisseurs",
    "Voir les soldes fournisseurs",
  ),
  permission("pos.access", "Caisse", "Accéder à la caisse"),
  permission("pos.open_session", "Caisse", "Ouvrir une session de caisse"),
  permission("pos.sell", "Caisse", "Enregistrer une vente"),
  permission("pos.credit_sale", "Caisse", "Enregistrer une vente a credit"),
  permission("pos.close_session", "Caisse", "Fermer une session de caisse"),
  permission("orders.view", "Commandes client", "Voir les commandes client"),
  permission("orders.create", "Commandes client", "Creer des commandes client"),
  permission(
    "orders.update",
    "Commandes client",
    "Modifier les commandes client",
  ),
  permission(
    "orders.change_status",
    "Commandes client",
    "Changer le statut des commandes",
  ),
  permission("orders.cancel", "Commandes client", "Annuler les commandes"),
  permission("orders.complete", "Commandes client", "Terminer les commandes"),
  permission("customers.view", "Clients", "Voir les clients"),
  permission("customers.create", "Clients", "Creer des clients"),
  permission("customers.update", "Clients", "Modifier les clients"),
  permission(
    "customer_balances.view",
    "Soldes clients",
    "Voir les soldes clients",
  ),
  permission(
    "customer_payments.view",
    "Paiements clients",
    "Voir les paiements clients",
  ),
  permission(
    "customer_payments.create",
    "Paiements clients",
    "Creer des paiements clients",
  ),
  permission("distributors.view", "Distributeurs", "Voir les distributeurs"),
  permission("distributors.create", "Distributeurs", "Creer des distributeurs"),
  permission(
    "distributors.update",
    "Distributeurs",
    "Modifier les distributeurs",
  ),
  permission(
    "distribution.dispatch",
    "Distribution",
    "Expedier aux distributeurs",
  ),
  permission(
    "distribution.settle",
    "Distribution",
    "Regler les ventes distributeurs",
  ),
  permission(
    "distribution.direct_sale",
    "Distribution",
    "Saisir une vente directe distributeur",
  ),
  permission(
    "distribution.custody.view",
    "Distribution",
    "Voir la garde distributeur",
  ),
  permission(
    "distribution.balances.view",
    "Distribution",
    "Voir les soldes distributeurs",
  ),
  permission(
    "distributor_payments.view",
    "Paiements distributeurs",
    "Voir les paiements distributeurs",
  ),
  permission(
    "distributor_payments.create",
    "Paiements distributeurs",
    "Creer des paiements distributeurs",
  ),
  permission("expenses.view", "Depenses", "Voir les depenses"),
  permission("expenses.create", "Depenses", "Creer des depenses"),
  permission("expenses.cancel", "Depenses", "Annuler les depenses"),
  permission(
    "expense_categories.manage",
    "Categories de depenses",
    "Gerer les categories de depenses",
  ),
  permission("simulations.view", "Simulations", "Voir les simulations"),
  permission("simulations.create", "Simulations", "Creer des simulations"),
  permission("simulations.update", "Simulations", "Modifier les simulations"),
  permission("simulations.delete", "Simulations", "Supprimer les simulations"),
  permission("audit.view", "Audit", "Voir le journal d'audit"),
] as const;

export type PermissionKey = (typeof permissionCatalog)[number]["key"];

export const permissionKeys = permissionCatalog.map((item) => item.key);

function permission(key: string, module: string, descriptionFr: string) {
  return {
    key,
    module,
    labelFr: key,
    descriptionFr,
  };
}

export const SUPER_ADMIN_SYSTEM_KEY = "SUPER_ADMIN";

/// Short label for the action part of a key; the module gives the object.
const actionLabels: Record<string, string> = {
  view: "Voir",
  create: "Créer",
  update: "Modifier",
  activate: "Activer / désactiver",
  assign_roles: "Attribuer les rôles",
  assign_permissions: "Attribuer les autorisations",
  reset_password: "Réinitialiser le mot de passe",
  manage: "Gérer",
  adjust: "Ajuster",
  opening_stock: "Stock initial",
  post: "Valider",
  cancel: "Annuler",
  access: "Accéder",
  open_session: "Ouvrir une session",
  close_session: "Clôturer une session",
  sell: "Vendre",
  credit_sale: "Vendre à crédit",
  complete: "Terminer",
  change_status: "Changer l'état",
  direct_sale: "Vente directe",
  dispatch: "Sortie en dépôt-vente",
  settle: "Régler",
  delete: "Supprimer",
};

export const permissionCatalog = [
  permission("users.view", "Utilisateurs", "Voir les utilisateurs"),
  permission("users.create", "Utilisateurs", "Créer des utilisateurs"),
  permission("users.update", "Utilisateurs", "Modifier les utilisateurs"),
  permission(
    "users.activate",
    "Utilisateurs",
    "Activer ou désactiver les utilisateurs",
  ),
  permission(
    "users.assign_roles",
    "Utilisateurs",
    "Attribuer les rôles aux utilisateurs",
  ),
  permission(
    "users.reset_password",
    "Utilisateurs",
    "Réinitialiser le mot de passe d'un utilisateur",
  ),
  permission("roles.view", "Rôles", "Voir les rôles"),
  permission("roles.create", "Rôles", "Créer des rôles"),
  permission("roles.update", "Rôles", "Modifier les rôles"),
  permission("roles.activate", "Rôles", "Activer ou désactiver les rôles"),
  permission(
    "roles.assign_permissions",
    "Rôles",
    "Attribuer les autorisations aux rôles",
  ),
  permission("products.view", "Produits", "Voir les produits"),
  permission("products.create", "Produits", "Créer des produits"),
  permission("products.update", "Produits", "Modifier les produits"),
  permission(
    "products.activate",
    "Produits",
    "Activer ou désactiver les produits",
  ),
  permission("categories.view", "Catégories", "Voir les catégories"),
  permission("categories.manage", "Catégories", "Gérer les catégories"),
  permission(
    "raw_materials.view",
    "Matières premières",
    "Voir les matières premières",
  ),
  permission(
    "raw_materials.create",
    "Matières premières",
    "Créer des matières premières",
  ),
  permission(
    "raw_materials.update",
    "Matières premières",
    "Modifier les matières premières",
  ),
  permission(
    "raw_materials.activate",
    "Matières premières",
    "Activer ou désactiver les matières premières",
  ),
  permission("units.view", "Unités", "Voir les unités"),
  permission("units.manage", "Unités", "Gérer les unités"),
  permission("inventory.view", "Stock", "Voir le stock"),
  permission(
    "inventory.movements.view",
    "Stock",
    "Voir les mouvements de stock",
  ),
  permission("inventory.adjust", "Stock", "Ajuster le stock"),
  permission("inventory.opening_stock", "Stock", "Saisir le stock initial"),
  permission("suppliers.view", "Fournisseurs", "Voir les fournisseurs"),
  permission("suppliers.create", "Fournisseurs", "Créer des fournisseurs"),
  permission("suppliers.update", "Fournisseurs", "Modifier les fournisseurs"),
  permission("purchases.view", "Achats", "Voir les achats"),
  permission("purchases.create", "Achats", "Créer des achats"),
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
    "Créer des paiements fournisseurs",
  ),
  permission(
    "supplier_balances.view",
    "Soldes fournisseurs",
    "Voir les soldes fournisseurs",
  ),
  permission("pos.access", "Caisse", "Accéder à la caisse"),
  permission("pos.open_session", "Caisse", "Ouvrir une session de caisse"),
  permission("pos.sell", "Caisse", "Enregistrer une vente"),
  permission("pos.credit_sale", "Caisse", "Enregistrer une vente a crédit"),
  permission("pos.close_session", "Caisse", "Fermer une session de caisse"),
  permission("orders.view", "Commandes client", "Voir les commandes client"),
  permission("orders.create", "Commandes client", "Créer des commandes client"),
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
  permission("customers.create", "Clients", "Créer des clients"),
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
    "Créer des paiements clients",
  ),
  permission("distributors.view", "Distributeurs", "Voir les distributeurs"),
  permission("distributors.create", "Distributeurs", "Créer des distributeurs"),
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
    "Créer des paiements distributeurs",
  ),
  permission("expenses.view", "Dépenses", "Voir les dépenses"),
  permission("expenses.create", "Dépenses", "Créer des dépenses"),
  permission("expenses.cancel", "Dépenses", "Annuler les dépenses"),
  permission(
    "expense_categories.manage",
    "Catégories de dépenses",
    "Gérer les catégories de dépenses",
  ),
  permission("simulations.view", "Simulations", "Voir les simulations"),
  permission("simulations.create", "Simulations", "Créer des simulations"),
  permission("simulations.update", "Simulations", "Modifier les simulations"),
  permission("simulations.delete", "Simulations", "Supprimer les simulations"),
  permission("audit.view", "Audit", "Voir le journal d'audit"),
] as const;

export type PermissionKey = (typeof permissionCatalog)[number]["key"];

export const permissionKeys = permissionCatalog.map((item) => item.key);

function permission(key: string, module: string, descriptionFr: string) {
  const action = key.slice(key.lastIndexOf(".") + 1);

  return {
    key,
    module,
    labelFr: actionLabels[action] ?? descriptionFr,
    descriptionFr,
  };
}

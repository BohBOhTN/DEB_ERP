/// French labels for the audit vocabulary (BE-37). The viewer never shows a
/// raw action key or entity name as primary text; an unknown key falls back
/// to a readable form so a new action is never blank.

const actionLabels: Record<string, string> = {
  "auth.login": "Connexion",
  "auth.login_failed": "Échec de connexion",
  "auth.logout": "Déconnexion",
  "user.create": "Création d'un utilisateur",
  "user.update": "Modification d'un utilisateur",
  "user.activate": "Activation d'un utilisateur",
  "user.deactivate": "Désactivation d'un utilisateur",
  "user.assign_roles": "Attribution de rôles",
  "user.password_reset": "Réinitialisation du mot de passe",
  "user_role.bootstrap_super_admin": "Initialisation du Super Admin",
  "role.create": "Création d'un rôle",
  "role.update": "Modification d'un rôle",
  "role.assign_permissions": "Modification des autorisations d'un rôle",
  "unit.create": "Création d'une unité",
  "unit.update": "Modification d'une unité",
  "product_category.create": "Création d'une catégorie",
  "product_category.update": "Modification d'une catégorie",
  "product.create": "Création d'un produit",
  "product.update": "Modification d'un produit",
  "product.activate": "Activation d'un produit",
  "product.deactivate": "Désactivation d'un produit",
  "raw_material.create": "Création d'une matière première",
  "raw_material.update": "Modification d'une matière première",
  "raw_material.assign_conversions": "Modification des conversions",
  "inventory.movement.create": "Mouvement de stock",
  "supplier.create": "Création d'un fournisseur",
  "supplier.update": "Modification d'un fournisseur",
  "supplier.activate": "Activation d'un fournisseur",
  "supplier.deactivate": "Désactivation d'un fournisseur",
  "purchase.create": "Création d'un achat",
  "purchase.update": "Modification d'un achat brouillon",
  "purchase.post": "Validation d'un achat",
  "purchase.cancel": "Annulation d'un achat",
  "supplier_payment.create": "Paiement fournisseur",
  "pos_session.open": "Ouverture de caisse",
  "pos_session.close": "Clôture de caisse",
  "pos_sale.post": "Vente en caisse",
  "customer.create": "Création d'un client",
  "customer.update": "Modification d'un client",
  "customer_payment.create": "Règlement client",
  "customer_order.create": "Création d'une commande",
  "customer_order.update": "Modification d'une commande",
  "customer_order.change_status": "Changement d'état d'une commande",
  "customer_order.advance": "Acompte sur commande",
  "customer_order.complete": "Commande terminée",
  "customer_order.cancel": "Annulation d'une commande",
  "distributor.create": "Création d'un distributeur",
  "distributor.update": "Modification d'un distributeur",
  "distributor_sale.post": "Vente directe distributeur",
  "distributor_dispatch.post": "Sortie en dépôt-vente",
  "distributor_settlement.post": "Règlement de distribution",
  "distributor_payment.create": "Paiement distributeur",
  "expense_category.create": "Création d'une catégorie de dépense",
  "expense_category.update": "Modification d'une catégorie de dépense",
  "expense.create": "Création d'une dépense",
  "expense.update": "Modification d'une dépense",
  "expense.post": "Validation d'une dépense",
  "expense.cancel": "Annulation d'une dépense",
  "simulation.create": "Création d'une simulation",
  "simulation.update": "Modification d'une simulation",
  "simulation.duplicate": "Duplication d'une simulation",
  "simulation.delete": "Suppression d'une simulation",
};

const entityLabels: Record<string, string> = {
  user: "Utilisateur",
  role: "Rôle",
  unit: "Unité",
  product_category: "Catégorie de produit",
  product: "Produit",
  raw_material: "Matière première",
  inventory_movement: "Mouvement de stock",
  supplier: "Fournisseur",
  purchase: "Achat",
  supplier_payment: "Paiement fournisseur",
  pos_session: "Session de caisse",
  sale: "Vente",
  pos_sale: "Vente",
  customer: "Client",
  customer_payment: "Règlement client",
  customer_order: "Commande client",
  distributor: "Distributeur",
  distributor_sale: "Vente directe distributeur",
  distributor_dispatch: "Sortie en dépôt-vente",
  distributor_settlement: "Règlement de distribution",
  distributor_payment: "Paiement distributeur",
  expense_category: "Catégorie de dépense",
  expense: "Dépense",
  cost_simulation: "Simulation de coût",
  simulation: "Simulation de coût",
};

/// Which screen a target belongs to, for the viewer's "open" link.
const entityModules: Record<string, string> = {
  user: "access",
  role: "access",
  unit: "catalog",
  product_category: "catalog",
  product: "catalog",
  raw_material: "catalog",
  inventory_movement: "inventory",
  supplier: "procurement",
  purchase: "procurement",
  supplier_payment: "procurement",
  pos_session: "pos",
  sale: "pos",
  pos_sale: "pos",
  customer: "customers",
  customer_payment: "customers",
  customer_order: "orders",
  distributor: "distribution",
  distributor_sale: "distribution",
  distributor_dispatch: "distribution",
  distributor_settlement: "distribution",
  distributor_payment: "distribution",
  expense_category: "expenses",
  expense: "expenses",
  cost_simulation: "simulation",
  simulation: "simulation",
};

export function actionLabel(action: string): string {
  return actionLabels[action] ?? humanize(action);
}

export function entityLabel(entity: string): string {
  return entityLabels[entity] ?? humanize(entity);
}

export function entityModule(entity: string): string | null {
  return entityModules[entity] ?? null;
}

export function knownActionKeys(): string[] {
  return Object.keys(actionLabels);
}

function humanize(key: string): string {
  const text = key.replace(/[._]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

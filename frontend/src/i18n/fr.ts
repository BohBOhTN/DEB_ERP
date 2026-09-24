/// The one French dictionary (05 section 4). Keys are English, values are
/// the V1 vocabulary table plus every common label. Feature modules add
/// their own terms here rather than inlining strings.
export const fr = {
  // Brand
  appName: "Dar El Barka",
  appTagline: "Gestion de la boulangerie",

  // Modules (V1 vocabulary table)
  home: "Accueil",
  products: "Produits",
  productCategories: "Catégories de produits",
  rawMaterials: "Matières premières",
  categoriesAndUnits: "Catégories et unités",
  units: "Unités",
  stock: "Stock",
  stockMovements: "Mouvements",
  suppliers: "Fournisseurs",
  purchases: "Achats",
  supplierPayments: "Paiements fournisseurs",
  pos: "Caisse",
  sales: "Ventes",
  posSessions: "Sessions",
  directSale: "Vente directe",
  customerOrder: "Commande client",
  orders: "Commandes",
  customers: "Clients",
  customerPayment: "Règlement client",
  amountDue: "Reste à payer",
  amountOwed: "Montant dû",
  distributors: "Distributeurs",
  consignmentDispatch: "Sortie en dépôt-vente",
  consignment: "Dépôt-vente",
  settlement: "Règlement de distribution",
  distributorSettlements: "Règlements",
  expenses: "Dépenses",
  expenseCategories: "Catégories de dépenses",
  costSimulation: "Simulation de coût",
  simulations: "Simulations",
  users: "Utilisateurs",
  rolesAndPermissions: "Rôles et autorisations",
  auditLog: "Journal d'audit",
  settings: "Paramètres",
  more: "Plus",

  // Actions (verbs, sentence case)
  save: "Enregistrer",
  confirm: "Confirmer",
  cancel: "Annuler",
  cancelTransaction: "Annuler l'opération",
  close: "Fermer",
  back: "Retour",
  next: "Suivant",
  previous: "Précédent",
  add: "Ajouter",
  create: "Créer",
  edit: "Modifier",
  delete: "Supprimer",
  duplicate: "Dupliquer",
  search: "Rechercher",
  filter: "Filtrer",
  filters: "Filtres",
  reset: "Réinitialiser",
  retry: "Réessayer",
  reload: "Recharger",
  refresh: "Actualiser",
  apply: "Appliquer",
  select: "Sélectionner",
  clear: "Effacer",
  viewDetails: "Voir le détail",
  open: "Ouvrir",
  post: "Valider",
  activate: "Activer",
  deactivate: "Désactiver",
  logIn: "Se connecter",
  logOut: "Se déconnecter",
  showPassword: "Afficher le mot de passe",
  hidePassword: "Masquer le mot de passe",
  openMenu: "Ouvrir le menu",
  closeMenu: "Fermer le menu",
  openNavigation: "Ouvrir la navigation",
  collapseSidebar: "Réduire la barre latérale",
  expandSidebar: "Déployer la barre latérale",
  remove: "Retirer",
  copy: "Copier",
  copied: "Copié",
  print: "Imprimer",
  export: "Exporter",

  // States and status labels
  loading: "Chargement…",
  saving: "Enregistrement…",
  pending: "En cours…",
  draft: "Brouillon",
  posted: "Validé",
  cancelled: "Annulé",
  paid: "Payé",
  partial: "Partiel",
  unpaid: "Impayé",
  overdue: "En retard",
  active: "Actif",
  inactive: "Inactif",
  openState: "Ouvert",
  closed: "Fermé",
  confirmed: "Confirmée",
  preparing: "En préparation",
  ready: "Prête",
  completed: "Terminée",
  yes: "Oui",
  no: "Non",
  all: "Tous",
  none: "Aucun",
  optional: "facultatif",
  required: "obligatoire",

  // Table and lists
  actions: "Actions",
  rowActions: "Actions de la ligne",
  noResults: "Aucun résultat",
  noResultsDescription:
    "Modifiez la recherche ou les filtres pour afficher des éléments.",
  resultsCount: "{count} résultat(s)",
  pageOf: "Page {page} sur {pageCount}",
  rowsPerPage: "Lignes par page",
  sortAscending: "Trier par ordre croissant",
  sortDescending: "Trier par ordre décroissant",
  selectAll: "Tout sélectionner",
  selectRow: "Sélectionner la ligne",
  showing: "Affichage de {from} à {to} sur {total}",

  // Feedback
  successTitle: "Opération réussie",
  errorTitle: "Une erreur est survenue",
  errorDescription:
    "Réessayez. Si le problème persiste, contactez le responsable.",
  networkErrorTitle: "Connexion impossible",
  networkErrorDescription: "Vérifiez la connexion réseau puis réessayez.",
  permissionDeniedTitle: "Accès refusé",
  permissionDeniedDescription:
    "Vous n'avez pas l'autorisation d'effectuer cette action.",
  goHome: "Retour à l'accueil",
  correlationId: "Identifiant de support",
  versionConflictTitle: "Fiche modifiée entre-temps",
  versionConflictDescription:
    "Cette fiche a été modifiée par quelqu'un d'autre. Rechargez-la puis réessayez.",
  sessionExpiringTitle: "Session bientôt expirée",
  sessionExpiringDescription:
    "Enregistrez votre travail ; la session expire dans 10 minutes.",
  emptyDefaultTitle: "Rien à afficher pour le moment",
  formHasErrors: "Le formulaire contient des erreurs.",
  fieldRequired: "Ce champ est obligatoire.",
  unsavedChanges: "Modifications non enregistrées",

  // Confirmation
  confirmTitle: "Confirmer l'opération",
  impact: "Conséquences",
  reason: "Motif",
  reasonPlaceholder: "Expliquez le motif (5 à 300 caractères)",
  irreversible: "Cette action est irréversible.",

  // Money and quantities
  currency: "TND",
  total: "Total",
  subtotal: "Sous-total",
  paidAmount: "Payé",
  remaining: "Reste à payer",
  amount: "Montant",
  quantity: "Quantité",
  unitPrice: "Prix unitaire",
  lineTotal: "Total ligne",
  cash: "Espèces",
  balance: "Solde",
  advance: "Avance",

  // Dates and periods
  date: "Date",
  today: "Aujourd'hui",
  yesterday: "Hier",
  last7Days: "7 jours",
  thisMonth: "Ce mois",
  last30Days: "30 derniers jours",
  customRange: "Période personnalisée",
  from: "Du",
  to: "Au",
  justNow: "à l'instant",
  minutesAgo: "il y a {count} min",
  hoursAgo: "il y a {count} h",
  daysAgo: "il y a {count} j",

  // Common fields
  name: "Nom",
  displayName: "Nom affiché",
  email: "E-mail",
  password: "Mot de passe",
  temporaryPassword: "Mot de passe temporaire",
  phone: "Téléphone",
  notes: "Notes",
  description: "Description",
  reference: "Référence",
  status: "Statut",
  category: "Catégorie",
  unit: "Unité",
  product: "Produit",
  rawMaterial: "Matière première",
  supplier: "Fournisseur",
  customer: "Client",
  distributor: "Distributeur",
  user: "Utilisateur",
  role: "Rôle",
  roles: "Rôles",
  permissions: "Autorisations",
  createdAt: "Créé le",
  updatedAt: "Modifié le",
  postedAt: "Validé le",
  dueDate: "Échéance",

  // Shell
  navigation: "Navigation",
  mainMenu: "Menu principal",
  userMenu: "Menu utilisateur",
  breadcrumbs: "Fil d'Ariane",
  skipToContent: "Aller au contenu",
  openSession: "Session ouverte",
  noOpenSession: "Aucune session de caisse ouverte",

  // Kit
  kitTitle: "Galerie des composants",
} as const;

export type FrKey = keyof typeof fr;

/// `t("resultsCount", { count: 3 })` → "3 résultat(s)". Kept deliberately
/// tiny: one language, flat keys, `{name}` placeholders.
export function t(
  key: FrKey,
  params?: Record<string, string | number>,
): string {
  const template: string = fr[key];

  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/// French plural helper: `plural(1, "commande")` → "1 commande",
/// `plural(3, "commande")` → "3 commandes".
export function plural(
  count: number,
  singular: string,
  pluralForm?: string,
): string {
  const word = count > 1 ? (pluralForm ?? `${singular}s`) : singular;

  return `${formatCount(count)} ${word}`;
}

function formatCount(count: number): string {
  return new Intl.NumberFormat("fr-TN").format(count);
}

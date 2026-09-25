import { fr } from "./fr.js";

/// Backend error code → French title and description (06 section 3.2). The
/// backend message is already French and, when present, replaces the
/// description here; this map guarantees a sentence for every code even when
/// the message is empty (network failure, proxy error, unknown code).
export interface ErrorCopy {
  title: string;
  description: string;
}

const generic: ErrorCopy = {
  title: fr.errorTitle,
  description: fr.errorDescription,
};

const errorCopy: Record<string, ErrorCopy> = {
  // Transport and platform
  NETWORK_ERROR: {
    title: fr.networkErrorTitle,
    description: fr.networkErrorDescription,
  },
  AUTHENTICATION_REQUIRED: {
    title: "Connexion requise",
    description: "Votre session a expiré. Reconnectez-vous pour continuer.",
  },
  PERMISSION_DENIED: {
    title: fr.permissionDeniedTitle,
    description: fr.permissionDeniedDescription,
  },
  VALIDATION_ERROR: {
    title: "Données invalides",
    description: "Corrigez les champs signalés puis réessayez.",
  },
  BAD_REQUEST: {
    title: "Requête invalide",
    description: "La requête n'a pas pu être traitée.",
  },
  NOT_FOUND: {
    title: "Introuvable",
    description: "L'élément demandé n'existe pas ou plus.",
  },
  PAYLOAD_TOO_LARGE: {
    title: "Requête trop volumineuse",
    description: "Réduisez la taille des données envoyées.",
  },
  UNSUPPORTED_MEDIA_TYPE: {
    title: "Format non pris en charge",
    description: "Le format de la requête n'est pas accepté.",
  },
  RATE_LIMITED: {
    title: "Trop de tentatives",
    description: "Patientez quelques instants avant de réessayer.",
  },
  STATE_CONFLICT: {
    title: "Conflit",
    description: "L'opération entre en conflit avec l'état actuel des données.",
  },
  RETRYABLE_CONFLICT: {
    title: "Opération simultanée",
    description: "Une autre opération était en cours. Réessayez.",
  },
  VERSION_CONFLICT: {
    title: fr.versionConflictTitle,
    description: fr.versionConflictDescription,
  },
  SERVICE_UNAVAILABLE: {
    title: "Service indisponible",
    description:
      "Le serveur est momentanément indisponible. Réessayez dans un instant.",
  },
  RETRYABLE_SERVER_ERROR: generic,
  IDEMPOTENCY_KEY_REQUIRED: {
    title: "Clé de sécurité manquante",
    description: "Rechargez la page puis recommencez l'opération.",
  },
  IDEMPOTENCY_CONFLICT: {
    title: "Opération déjà soumise",
    description: "Cette demande a déjà été envoyée avec d'autres données.",
  },
  IDEMPOTENCY_IN_PROGRESS: {
    title: "Opération en cours",
    description: "La même opération est en cours de traitement. Patientez.",
  },

  // Access
  USER_NOT_FOUND: {
    title: "Utilisateur introuvable",
    description: "Cet utilisateur n'existe pas.",
  },
  ROLE_NOT_FOUND: {
    title: "Rôle introuvable",
    description: "Ce rôle n'existe pas.",
  },
  INVALID_ROLE_ID: {
    title: "Rôle invalide",
    description: "Un des rôles choisis est inconnu ou inactif.",
  },
  INVALID_PERMISSION_KEY: {
    title: "Autorisation inconnue",
    description: "Une des autorisations choisies n'existe pas.",
  },
  PROTECTED_SYSTEM_ROLE: {
    title: "Rôle protégé",
    description: "Le rôle Super Admin ne peut pas être modifié ainsi.",
  },
  LAST_SUPER_ADMIN_REQUIRED: {
    title: "Dernier Super Admin",
    description: "Le dernier Super Admin actif ne peut pas être désactivé.",
  },

  // Catalogue
  PRODUCT_NOT_FOUND: {
    title: "Produit introuvable",
    description: "Ce produit n'existe pas.",
  },
  RAW_MATERIAL_NOT_FOUND: {
    title: "Matière première introuvable",
    description: "Cette matière première n'existe pas.",
  },
  CATEGORY_NOT_FOUND: {
    title: "Catégorie introuvable",
    description: "Cette catégorie n'existe pas.",
  },
  UNIT_NOT_FOUND: {
    title: "Unité introuvable",
    description: "Cette unité n'existe pas.",
  },
  ACTIVE_PRODUCT_NAME_NOT_UNIQUE: {
    title: "Nom déjà utilisé",
    description: "Un produit actif porte déjà ce nom.",
  },
  ACTIVE_RAW_MATERIAL_NAME_NOT_UNIQUE: {
    title: "Nom déjà utilisé",
    description: "Une matière première active porte déjà ce nom.",
  },
  ACTIVE_CATEGORY_NAME_NOT_UNIQUE: {
    title: "Nom déjà utilisé",
    description: "Une catégorie active porte déjà ce nom.",
  },
  ACTIVE_CATEGORY_REQUIRED: {
    title: "Catégorie inactive",
    description: "Choisissez une catégorie active.",
  },
  ACTIVE_UNIT_REQUIRED: {
    title: "Unité inactive",
    description: "Choisissez une unité active.",
  },
  ACTIVE_RAW_MATERIAL_REQUIRED: {
    title: "Matière première inactive",
    description: "Choisissez une matière première active.",
  },
  STOCKABLE_PRODUCT_REQUIRED: {
    title: "Produit non stockable",
    description: "Ce produit ne suit pas le stock.",
  },

  // Inventory
  MAIN_STOCK_LOCATION_MISSING: {
    title: "Emplacement manquant",
    description: "L'emplacement de stock principal n'est pas configuré.",
  },
  NON_ZERO_QUANTITY_REQUIRED: {
    title: "Quantité nulle",
    description: "La quantité doit être différente de zéro.",
  },
  NON_NEGATIVE_QUANTITY_REQUIRED: {
    title: "Quantité négative",
    description: "La quantité ne peut pas être négative.",
  },
  POSITIVE_QUANTITY_REQUIRED: {
    title: "Quantité invalide",
    description: "La quantité doit être supérieure à zéro.",
  },
  REASON_REQUIRED: {
    title: "Motif requis",
    description: "Indiquez le motif de l'opération.",
  },
  PAYMENT_ALLOCATION_EXCEEDS_AMOUNT: {
    title: "Affectations en excès",
    description: "La somme des affectations dépasse le montant payé.",
  },
  PAYMENT_ALREADY_REVERSED: {
    title: "Déjà annulé",
    description: "Ce paiement a déjà été annulé.",
  },

  // Procurement
  SUPPLIER_NOT_FOUND: {
    title: "Fournisseur introuvable",
    description: "Ce fournisseur n'existe pas.",
  },
  ACTIVE_SUPPLIER_NAME_NOT_UNIQUE: {
    title: "Nom déjà utilisé",
    description: "Un fournisseur actif porte déjà ce nom.",
  },
  ACTIVE_SUPPLIER_REQUIRED: {
    title: "Fournisseur inactif",
    description: "Choisissez un fournisseur actif.",
  },
  PURCHASE_NOT_FOUND: {
    title: "Achat introuvable",
    description: "Cet achat n'existe pas.",
  },
  PURCHASE_NOT_DRAFT: {
    title: "Achat déjà traité",
    description: "Seul un achat en brouillon peut être modifié ou validé.",
  },
  PURCHASE_NOT_POSTED: {
    title: "Achat non validé",
    description: "Cette opération s'applique à un achat validé.",
  },
  PURCHASE_LINES_REQUIRED: {
    title: "Lignes manquantes",
    description: "Ajoutez au moins une ligne à l'achat.",
  },
  PURCHASE_UNIT_CONVERSION_REQUIRED: {
    title: "Conversion manquante",
    description:
      "Aucune conversion n'existe entre l'unité d'achat et l'unité de stock.",
  },
  POSITIVE_PURCHASE_TOTAL_REQUIRED: {
    title: "Total invalide",
    description: "Le total de l'achat doit être supérieur à zéro.",
  },
  PAID_PURCHASE_INVALID: {
    title: "Paiement incohérent",
    description: "Un achat payé doit être réglé en totalité.",
  },
  PARTIAL_PURCHASE_INVALID: {
    title: "Paiement incohérent",
    description: "Un achat partiel doit avoir un acompte inférieur au total.",
  },
  UNPAID_PURCHASE_INVALID: {
    title: "Paiement incohérent",
    description: "Un achat impayé ne doit pas avoir de montant payé.",
  },
  DUE_DATE_REQUIRED: {
    title: "Échéance requise",
    description: "Indiquez l'échéance pour un achat non réglé.",
  },
  SUPPLIER_BALANCE_NOT_DUE: {
    title: "Aucun montant dû",
    description: "Ce fournisseur n'a aucun montant à régler.",
  },
  SUPPLIER_OVERPAYMENT_REJECTED: {
    title: "Montant trop élevé",
    description: "Le paiement dépasse le montant dû au fournisseur.",
  },
  SUPPLIER_INACTIVE: {
    title: "Fournisseur désactivé",
    description: "Aucun paiement ne peut être enregistré pour ce fournisseur.",
  },
  SUPPLIER_PAYMENT_NOT_FOUND: {
    title: "Paiement introuvable",
    description: "Ce paiement fournisseur n'existe pas ou plus.",
  },
  POSTED_PURCHASE_ALLOCATION_REQUIRED: {
    title: "Achat non validé",
    description: "Un paiement ne peut être affecté qu'à un achat validé.",
  },
  PAYMENT_ALLOCATION_EXCEEDS_PURCHASE_BALANCE: {
    title: "Affectation trop élevée",
    description: "L'affectation dépasse le reste dû de l'achat.",
  },

  // Payments (shared)
  MONEY_AMOUNT_INVALID: {
    title: "Montant invalide",
    description: "Saisissez un montant avec au plus trois décimales.",
  },
  POSITIVE_AMOUNT_REQUIRED: {
    title: "Montant invalide",
    description: "Le montant doit être supérieur à zéro.",
  },
  NON_NEGATIVE_AMOUNT_REQUIRED: {
    title: "Montant négatif",
    description: "Le montant ne peut pas être négatif.",
  },
  POSITIVE_PAYMENT_AMOUNT_REQUIRED: {
    title: "Montant invalide",
    description: "Le paiement doit être supérieur à zéro.",
  },
  DUPLICATE_PAYMENT_ALLOCATION: {
    title: "Affectation en double",
    description: "Le même document est affecté deux fois.",
  },
  ALLOCATION_TARGET_REQUIRED: {
    title: "Document manquant",
    description: "Chaque affectation doit viser un document.",
  },
  PAYMENT_ALLOCATION_EXCEEDS_DOCUMENT_BALANCE: {
    title: "Affectation trop élevée",
    description: "L'affectation dépasse le reste dû du document.",
  },

  // POS
  MAIN_POS_TERMINAL_MISSING: {
    title: "Caisse non configurée",
    description: "Le terminal de caisse principal n'existe pas.",
  },
  POS_SESSION_ALREADY_OPEN: {
    title: "Session déjà ouverte",
    description: "Une session de caisse est déjà ouverte.",
  },
  POS_SESSION_NOT_FOUND: {
    title: "Session introuvable",
    description: "Cette session n'existe pas.",
  },
  POS_SESSION_NOT_OPEN: {
    title: "Aucune session ouverte",
    description: "Ouvrez une session de caisse avant de vendre.",
  },
  SALE_NOT_FOUND: {
    title: "Vente introuvable",
    description: "Cette vente n'existe pas.",
  },
  SALE_PRODUCT_REQUIRED: {
    title: "Produit manquant",
    description: "Chaque ligne de vente doit viser un produit.",
  },
  DUPLICATE_SALE_LINE: {
    title: "Ligne en double",
    description: "Le même produit apparaît deux fois dans la vente.",
  },
  SALE_TOTAL_REQUIRED: {
    title: "Total invalide",
    description: "Le total de la vente doit être supérieur à zéro.",
  },
  PAID_AMOUNT_INVALID: {
    title: "Montant payé invalide",
    description: "Saisissez un montant payé valide.",
  },
  PAID_AMOUNT_EXCEEDS_TOTAL: {
    title: "Montant trop élevé",
    description: "Le montant payé dépasse le total de la vente.",
  },
  CUSTOMER_REQUIRED_FOR_CREDIT: {
    title: "Client requis",
    description: "Une vente à crédit doit être rattachée à un client.",
  },
  SALE_OVERPAYMENT_REJECTED: {
    title: "Montant trop élevé",
    description: "Le paiement dépasse le reste dû de la vente.",
  },
  SALE_ALREADY_CANCELLED: {
    title: "Vente déjà annulée",
    description: "Cette vente a déjà été annulée.",
  },
  SALE_LINKED_TO_ORDER: {
    title: "Vente issue d'une commande",
    description:
      "Cette vente provient d'une commande terminée et ne peut pas être annulée ici.",
  },
  SALE_HAS_ALLOCATED_PAYMENTS: {
    title: "Règlements affectés",
    description:
      "Des règlements ont été affectés à cette vente : annulez-les d'abord.",
  },
  CUSTOMER_INACTIVE: {
    title: "Client désactivé",
    description: "Aucun règlement ne peut être enregistré pour ce client.",
  },
  CUSTOMER_PAYMENT_NOT_FOUND: {
    title: "Règlement introuvable",
    description: "Ce règlement n'existe pas ou plus.",
  },
  POSTED_SALE_ALLOCATION_REQUIRED: {
    title: "Vente non validée",
    description: "Un règlement ne peut être affecté qu'à une vente validée.",
  },
  PAYMENT_ALLOCATION_EXCEEDS_SALE_BALANCE: {
    title: "Affectation trop élevée",
    description: "L'affectation dépasse le reste dû de la vente.",
  },

  // Customers
  CUSTOMER_NOT_FOUND: {
    title: "Client introuvable",
    description: "Ce client n'existe pas.",
  },
  CUSTOMER_NAME_EXISTS: {
    title: "Nom déjà utilisé",
    description: "Un client porte déjà ce nom.",
  },
  ACTIVE_CUSTOMER_REQUIRED: {
    title: "Client inactif",
    description: "Choisissez un client actif.",
  },
  CUSTOMER_HAS_BALANCE: {
    title: "Solde en cours",
    description:
      "Ce client a encore un solde ou une avance : réglez-les avant de le désactiver.",
  },
  CUSTOMER_ALREADY_ACTIVE: {
    title: "Client déjà actif",
    description: "Ce client est déjà actif.",
  },
  CUSTOMER_ALREADY_INACTIVE: {
    title: "Client déjà désactivé",
    description: "Ce client est déjà désactivé.",
  },
  CUSTOMER_BALANCE_NOT_DUE: {
    title: "Aucun montant dû",
    description: "Ce client n'a aucun montant à régler.",
  },
  CUSTOMER_OVERPAYMENT_REJECTED: {
    title: "Montant trop élevé",
    description: "Le règlement dépasse le montant dû par le client.",
  },

  // Orders
  ORDER_NOT_FOUND: {
    title: "Commande introuvable",
    description: "Cette commande n'existe pas.",
  },
  ORDER_LINES_REQUIRED: {
    title: "Lignes manquantes",
    description: "Ajoutez au moins une ligne à la commande.",
  },
  ORDER_PRODUCT_REQUIRED: {
    title: "Produit manquant",
    description: "Chaque ligne de commande doit viser un produit.",
  },
  DUPLICATE_ORDER_LINE: {
    title: "Ligne en double",
    description: "Le même produit apparaît deux fois dans la commande.",
  },
  ORDER_TOTAL_REQUIRED: {
    title: "Total invalide",
    description: "Le total de la commande doit être supérieur à zéro.",
  },
  ORDER_NOT_EDITABLE: {
    title: "Commande non modifiable",
    description: "Cette commande ne peut plus être modifiée.",
  },
  ORDER_STATUS_TRANSITION_INVALID: {
    title: "Changement d'état impossible",
    description: "Cette commande ne peut pas passer à cet état.",
  },
  ORDER_NOT_OPEN_FOR_ADVANCE: {
    title: "Acompte impossible",
    description: "Cette commande n'accepte plus d'acompte.",
  },
  ORDER_ADVANCE_EXCEEDS_TOTAL: {
    title: "Acompte trop élevé",
    description: "L'acompte dépasse le total de la commande.",
  },
  ORDER_TOTAL_BELOW_ADVANCE: {
    title: "Total inférieur à l'acompte",
    description: "Le nouveau total est inférieur aux acomptes déjà reçus.",
  },
  ORDER_NOT_COMPLETABLE: {
    title: "Commande non terminable",
    description:
      "Cette commande ne peut pas être terminée dans son état actuel.",
  },
  ORDER_ALREADY_COMPLETED: {
    title: "Commande déjà terminée",
    description: "Cette commande a déjà été transformée en vente.",
  },
  ORDER_NOT_CANCELLABLE: {
    title: "Commande non annulable",
    description: "Cette commande ne peut plus être annulée.",
  },
  ORDER_CANCELLATION_REASON_REQUIRED: {
    title: "Motif requis",
    description: "Indiquez le motif de l'annulation.",
  },
  ORDER_ADVANCE_DISPOSITION_REQUIRED: {
    title: "Sort de l'acompte requis",
    description: "Indiquez si l'acompte est remboursé ou conservé en avoir.",
  },
  ORDER_ADVANCE_DISPOSITION_NOT_APPLICABLE: {
    title: "Sort de l'acompte inutile",
    description: "Cette commande n'a reçu aucun acompte.",
  },

  // Distribution
  DISTRIBUTOR_NOT_FOUND: {
    title: "Distributeur introuvable",
    description: "Ce distributeur n'existe pas.",
  },
  DISTRIBUTOR_NAME_EXISTS: {
    title: "Nom déjà utilisé",
    description: "Un distributeur porte déjà ce nom.",
  },
  ACTIVE_DISTRIBUTOR_REQUIRED: {
    title: "Distributeur inactif",
    description: "Choisissez un distributeur actif.",
  },
  DISTRIBUTOR_SALE_LINES_REQUIRED: {
    title: "Lignes manquantes",
    description: "Ajoutez au moins une ligne à la vente.",
  },
  DISTRIBUTOR_PRODUCT_REQUIRED: {
    title: "Produit manquant",
    description: "Chaque ligne doit viser un produit.",
  },
  DUPLICATE_DISTRIBUTOR_SALE_LINE: {
    title: "Ligne en double",
    description: "Le même produit apparaît deux fois.",
  },
  DISTRIBUTOR_SALE_TOTAL_REQUIRED: {
    title: "Total invalide",
    description: "Le total de la vente doit être supérieur à zéro.",
  },
  DISPATCH_NOT_FOUND: {
    title: "Sortie introuvable",
    description: "Cette sortie n'existe pas.",
  },
  DISPATCH_NOT_OPEN: {
    title: "Sortie clôturée",
    description: "Cette sortie en dépôt-vente est déjà soldée.",
  },
  DISPATCH_LINES_REQUIRED: {
    title: "Lignes manquantes",
    description: "Ajoutez au moins une ligne à la sortie.",
  },
  DISPATCH_LINE_REQUIRED: {
    title: "Ligne manquante",
    description: "Chaque ligne de règlement doit viser une ligne de sortie.",
  },
  DUPLICATE_DISPATCH_LINE: {
    title: "Ligne en double",
    description: "Le même produit apparaît deux fois dans la sortie.",
  },
  SETTLEMENT_LINES_REQUIRED: {
    title: "Lignes manquantes",
    description: "Ajoutez au moins une ligne au règlement.",
  },
  SETTLEMENT_QUANTITY_REQUIRED: {
    title: "Quantité requise",
    description: "Indiquez la quantité vendue ou retournée.",
  },
  SETTLEMENT_EXCEEDS_HELD_QUANTITY: {
    title: "Quantité trop élevée",
    description: "La quantité réglée dépasse la quantité en dépôt.",
  },
  DUPLICATE_SETTLEMENT_LINE: {
    title: "Ligne en double",
    description: "La même ligne de sortie est réglée deux fois.",
  },
  DISTRIBUTOR_BALANCE_NOT_DUE: {
    title: "Aucun montant dû",
    description: "Ce distributeur n'a aucun montant à régler.",
  },
  DISTRIBUTOR_OVERPAYMENT_REJECTED: {
    title: "Montant trop élevé",
    description: "Le paiement dépasse le montant dû par le distributeur.",
  },
  DISTRIBUTOR_INACTIVE: {
    title: "Distributeur désactivé",
    description: "Aucun paiement ne peut être enregistré pour ce distributeur.",
  },
  DISTRIBUTOR_PAYMENT_NOT_FOUND: {
    title: "Paiement introuvable",
    description: "Ce paiement distributeur n'existe pas ou plus.",
  },
  POSTED_DOCUMENT_ALLOCATION_REQUIRED: {
    title: "Document non validé",
    description:
      "Un paiement ne peut être affecté qu'à une vente directe ou un règlement validé.",
  },
  DUPLICATE_DISTRIBUTOR_ALLOCATION: {
    title: "Affectation en double",
    description: "Le même document est affecté deux fois.",
  },

  // Expenses
  EXPENSE_NOT_FOUND: {
    title: "Dépense introuvable",
    description: "Cette dépense n'existe pas.",
  },
  EXPENSE_CATEGORY_NOT_FOUND: {
    title: "Catégorie introuvable",
    description: "Cette catégorie de dépense n'existe pas.",
  },
  EXPENSE_CATEGORY_NAME_EXISTS: {
    title: "Nom déjà utilisé",
    description: "Une catégorie de dépense porte déjà ce nom.",
  },
  ACTIVE_EXPENSE_CATEGORY_REQUIRED: {
    title: "Catégorie inactive",
    description: "Choisissez une catégorie de dépense active.",
  },
  EXPENSE_DESCRIPTION_REQUIRED: {
    title: "Libellé requis",
    description: "Indiquez le libellé de la dépense.",
  },
  EXPENSE_NOT_EDITABLE: {
    title: "Dépense non modifiable",
    description: "Seule une dépense en brouillon peut être modifiée.",
  },
  EXPENSE_NOT_POSTABLE: {
    title: "Dépense non validable",
    description: "Seule une dépense en brouillon peut être validée.",
  },
  EXPENSE_NOT_CANCELLABLE: {
    title: "Dépense non annulable",
    description: "Seule une dépense validée peut être annulée.",
  },
  EXPENSE_CANCELLATION_REASON_REQUIRED: {
    title: "Motif requis",
    description: "Indiquez le motif de l'annulation (5 à 300 caractères).",
  },

  // Simulation
  SIMULATION_NOT_FOUND: {
    title: "Simulation introuvable",
    description: "Cette simulation n'existe pas.",
  },
  SIMULATION_NAME_REQUIRED: {
    title: "Nom requis",
    description: "Donnez un nom à la simulation.",
  },
  SIMULATION_OUTPUT_REQUIRED: {
    title: "Quantité produite requise",
    description: "Indiquez la quantité produite.",
  },
  SIMULATION_QUANTITY_REQUIRED: {
    title: "Quantité requise",
    description: "Chaque ingrédient doit avoir une quantité.",
  },
  SIMULATION_UNIT_REQUIRED: {
    title: "Unité requise",
    description: "Chaque ingrédient doit avoir une unité.",
  },
  SIMULATION_PRICE_INVALID: {
    title: "Prix invalide",
    description: "Le prix unitaire doit être un montant valide.",
  },
  SIMULATION_INGREDIENTS_REQUIRED: {
    title: "Ingrédients manquants",
    description: "Ajoutez au moins un ingrédient.",
  },
  SIMULATION_INGREDIENT_NAME_REQUIRED: {
    title: "Nom d'ingrédient requis",
    description: "Un ingrédient libre doit avoir un nom.",
  },
  SIMULATION_RAW_MATERIAL_REQUIRED: {
    title: "Matière première requise",
    description: "Choisissez une matière première ou un ingrédient libre.",
  },
  SIMULATION_CONVERSION_REQUIRED: {
    title: "Conversion manquante",
    description: "Aucune conversion n'existe vers l'unité choisie.",
  },
  SIMULATION_TARGET_PRODUCT_REQUIRED: {
    title: "Produit visé invalide",
    description: "Le produit visé n'existe pas ou est inactif.",
  },
};

export function errorCopyFor(code: string | null | undefined): ErrorCopy {
  return code ? (errorCopy[code] ?? generic) : generic;
}

/// French copy for an error the API client threw. The backend message wins
/// as the description when it is present, because it is already French and
/// more specific than the map.
export function describeError(error: unknown): ErrorCopy {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    const copy = errorCopyFor((error as { code: string }).code);
    const message = (error as { message?: unknown }).message;

    return {
      title: copy.title,
      description:
        typeof message === "string" &&
        message.trim().length > 0 &&
        !copy.title.includes(message)
          ? message
          : copy.description,
    };
  }

  return generic;
}

export function knownErrorCodes(): string[] {
  return Object.keys(errorCopy);
}

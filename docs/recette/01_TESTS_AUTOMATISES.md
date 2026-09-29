# Dar El Barka · Tests automatisés

Version de référence : **2.1.0** · Application : <https://darelbarka.work>

Ce document présente les contrôles que l'application subit automatiquement
avant chaque mise en ligne. Il complète le cahier de recette
([02_CAHIER_DE_RECETTE.md](02_CAHIER_DE_RECETTE.md)), qui décrit les
vérifications à faire à la main.

## 1. Quand les tests s'exécutent

Chaque modification du code passe par une demande de fusion (pull request)
sur GitHub. À chaque demande, le service GitHub Actions exécute la chaîne
de contrôle **CI** sur une machine neuve, avec une base de données
PostgreSQL vide créée pour l'occasion. Une modification n'est fusionnée que
si tous les contrôles sont au vert, et la mise en ligne ne démarre qu'après
un nouveau passage complet sur la branche `main`, suivi d'une approbation
manuelle.

Où le voir sur GitHub :

- l'onglet **Pull requests** affiche, sur chaque demande, la liste des
  contrôles et leur état (coche verte ou croix rouge) ;
- l'onglet **Actions**, workflow **CI**, garde l'historique complet de
  chaque exécution, étape par étape, avec les journaux.

## 2. La chaîne de contrôle, étape par étape

| #   | Étape                            | Ce qui est vérifié                                                                                                         |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | Installation                     | Les dépendances s'installent à l'identique du fichier de verrouillage (`package-lock.json`).                               |
| 2   | Migrations                       | Toutes les migrations de la base s'appliquent dans l'ordre sur une base vide, exactement comme en production.              |
| 3   | Dérive du schéma                 | Le schéma obtenu correspond au modèle déclaré ; aucune table ou colonne n'a été modifiée hors migration.                   |
| 4   | Contrat de l'API                 | Le document OpenAPI (`backend/openapi.json`) décrit exactement les routes existantes, et l'interface en utilise les types. |
| 5   | Mise en forme                    | Le code respecte une mise en forme unique (Prettier).                                                                      |
| 6   | Qualité du code                  | Aucune alerte du vérificateur de code (ESLint) ni du vérificateur de styles (Stylelint), sans tolérance.                   |
| 7   | Typage                           | Le serveur et l'interface compilent sans erreur de type (TypeScript).                                                      |
| 8   | Tests serveur et interface       | Tous les tests des sections 3 et 4 réussissent, y compris ceux qui exigent une vraie base PostgreSQL.                      |
| 9   | Performance                      | Les lectures les plus lourdes restent sous un budget de temps sur un historique volumineux (section 3.4).                  |
| 10  | Construction                     | Le serveur et l'interface se construisent ; le poids de l'interface reste sous un budget fixé (section 4.4).               |
| 11  | Parcours navigateur              | Les parcours métier sont rejoués dans un vrai navigateur, sur téléphone, tablette et ordinateur (section 5).               |
| 12  | Images de déploiement            | Les deux images Docker (serveur et interface) se construisent.                                                             |
| 13  | Vérification après mise en ligne | Après déploiement, l'adresse publique répond et annonce la version exacte qui vient d'être installée.                      |

## 3. Tests du serveur

**52 fichiers, 385 tests.** Ils se trouvent à côté du code qu'ils
vérifient, dans `backend/src`, et se reconnaissent à leur nom en
`.test.ts`.

### 3.1 Règles métier

Chaque module est testé sur ses règles de gestion, y compris les refus. Un
échantillon représentatif :

| Domaine      | Règle vérifiée                                                                                                        | Fichier                                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Caisse       | Une seule session ouverte à la fois                                                                                   | [pos.service.test.ts](../../backend/src/modules/pos/pos.service.test.ts)                                                  |
| Caisse       | Une vente payée crée le paiement, le mouvement de stock et la trace d'audit, une seule fois                           | [pos.service.test.ts](../../backend/src/modules/pos/pos.service.test.ts)                                                  |
| Caisse       | Une vente partiellement payée crée une créance client et ne compte que l'argent reçu                                  | [pos.service.test.ts](../../backend/src/modules/pos/pos.service.test.ts)                                                  |
| Caisse       | La clôture calcule les espèces attendues (ventes, acomptes, règlements encaissés, remboursements) et l'écart          | [pos.service.test.ts](../../backend/src/modules/pos/pos.service.test.ts)                                                  |
| Caisse       | L'annulation d'une vente rembourse la caisse ouverte, remet le stock et garde la vente, marquée annulée               | [pos.service.test.ts](../../backend/src/modules/pos/pos.service.test.ts)                                                  |
| Commandes    | Une commande ne crée ni chiffre d'affaires, ni paiement, ni mouvement de stock avant sa remise                        | [orders.service.test.ts](../../backend/src/modules/orders/orders.service.test.ts)                                         |
| Commandes    | Un acompte reste une avance client ; il ne peut pas dépasser le total                                                 | [orders.service.test.ts](../../backend/src/modules/orders/orders.service.test.ts)                                         |
| Commandes    | La remise crée une seule vente liée, applique l'acompte et ne compte en caisse que le complément                      | [orders.service.test.ts](../../backend/src/modules/orders/orders.service.test.ts)                                         |
| Commandes    | L'annulation d'une commande avec acompte exige de choisir : rembourser ou garder en avoir                             | [orders.service.test.ts](../../backend/src/modules/orders/orders.service.test.ts)                                         |
| Clients      | Un règlement solde d'abord les ventes les plus anciennes ; il ne peut pas dépasser ce qui est dû                      | [customers.service.payments.test.ts](../../backend/src/modules/customers/customers.service.payments.test.ts)              |
| Clients      | L'annulation d'un règlement rétablit le reste dû des ventes qu'il avait soldées                                       | [customers.service.payments.test.ts](../../backend/src/modules/customers/customers.service.payments.test.ts)              |
| Clients      | Un client ne peut être désactivé qu'une fois soldé ; il n'est jamais supprimé                                         | [customers.service.lifecycle.test.ts](../../backend/src/modules/customers/customers.service.lifecycle.test.ts)            |
| Achats       | Un paiement fournisseur solde les achats les plus anciens ; l'annulation d'un achat annule ses paiements              | [procurement.service.payments.test.ts](../../backend/src/modules/procurement/procurement.service.payments.test.ts)        |
| Distribution | Une sortie en dépôt-vente ne crée ni vente ni dette                                                                   | [ledgerReconciliation.test.ts](../../backend/src/modules/audit/ledgerReconciliation.test.ts)                              |
| Distribution | Le règlement classe chaque quantité (vendue, retournée, encore en dépôt, non justifiée) sans jamais dépasser le dépôt | [distribution.service.settlement.test.ts](../../backend/src/modules/distribution/distribution.service.settlement.test.ts) |
| Distribution | Une quantité non justifiée ne crée aucune dette automatique                                                           | [ledgerReconciliation.test.ts](../../backend/src/modules/audit/ledgerReconciliation.test.ts)                              |
| Distribution | Le prix d'une vente directe n'est jamais inférieur au coût approximatif du produit                                    | [distribution.service.pricing.test.ts](../../backend/src/modules/distribution/distribution.service.pricing.test.ts)       |
| Dépenses     | Une dépense annulée reste dans l'historique et sort des totaux ; l'annulation exige un motif                          | [expenses.service.test.ts](../../backend/src/modules/expenses/expenses.service.test.ts)                                   |
| Simulation   | L'exemple de référence (6,350 TND pour 50 pièces, soit 0,127 TND) est retrouvé, sans aucun effet sur le stock         | [simulation.service.test.ts](../../backend/src/modules/simulation/simulation.service.test.ts)                             |
| Accueil      | Chaque bloc n'apparaît que pour qui a le droit de voir le chiffre ; la marge ne porte que sur les lignes chiffrées    | [home.service.test.ts](../../backend/src/modules/home/home.service.test.ts)                                               |
| Photos       | Seuls les fichiers réellement JPEG, PNG ou WebP sont acceptés, puis réencodés par le serveur                          | [media.test.ts](../../backend/src/shared/media.test.ts)                                                                   |

### 3.2 Cohérence des comptes

Les soldes affichés (clients, fournisseurs, distributeurs) sont des sommes
d'un **grand livre** : chaque vente, paiement, acompte ou annulation y écrit
une ligne, et rien n'est jamais effacé. Des tests dédiés vérifient que le
solde calculé correspond toujours à la somme des lignes, après des
enchaînements réalistes : vente partiellement payée, règlement ultérieur,
retours, quantités non justifiées
([ledgerReconciliation.test.ts](../../backend/src/modules/audit/ledgerReconciliation.test.ts)),
et, sur un historique de plusieurs milliers d'écritures, que les soldes
calculés en base égalent ceux recalculés ligne par ligne
([performance.test.ts](../../backend/src/integration/performance.test.ts)).

### 3.3 Accès concurrents et doubles envois

Deux caissiers peuvent agir en même temps, et un réseau instable peut
renvoyer la même demande deux fois. Ces tests s'exécutent contre une vraie
base PostgreSQL, avec plusieurs opérations lancées simultanément :

| Situation                                                     | Garantie vérifiée                                       |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| Quatre tentatives simultanées de terminer la même commande    | Une seule vente est créée                               |
| Quatre règlements simultanés de la même sortie en dépôt-vente | La quantité n'est réglée qu'une fois                    |
| Ajustements de stock simultanés                               | Chacun est enregistré, aucun n'est perdu                |
| La même demande envoyée plusieurs fois (même clé)             | Un seul effet ; les suivantes reçoivent la même réponse |
| Vingt ventes et achats numérotés en parallèle                 | Aucun numéro en double                                  |

Fichiers : [orders.service.concurrency.test.ts](../../backend/src/modules/orders/orders.service.concurrency.test.ts),
[distribution.service.concurrency.test.ts](../../backend/src/modules/distribution/distribution.service.concurrency.test.ts),
[inventory.service.concurrency.test.ts](../../backend/src/modules/inventory/inventory.service.concurrency.test.ts),
[idempotency.concurrency.test.ts](../../backend/src/shared/idempotency.concurrency.test.ts),
[references.concurrency.test.ts](../../backend/src/shared/references.concurrency.test.ts).

### 3.4 Performance

Un historique volumineux est créé (5 000 produits, 200 clients et 10 000
écritures client, 50 fournisseurs et 1 000 achats, 10 distributeurs et 500
sorties, 3 000 dépenses). Les dix lectures les plus sollicitées (soldes,
relevés, dépôt-vente, totaux de dépenses, recherche de produit) sont
mesurées vingt fois chacune : 95 % des mesures doivent rester sous
**150 ms**. La dernière exécution relevait entre 3 et 36 ms selon la
lecture. La recherche « the » retrouve bien « Thé à la menthe » (accents
ignorés).

### 3.5 Sécurité et droits d'accès

| Contrôle                                                                                                                      | Fichier                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Chaque route protégée exige une autorisation précise ; seules les routes publiques documentées (connexion, santé) y échappent | [authorizationMatrix.test.ts](../../backend/src/modules/audit/authorizationMatrix.test.ts) |
| Une écriture n'est jamais protégée par une simple autorisation de lecture                                                     | [authorizationMatrix.test.ts](../../backend/src/modules/audit/authorizationMatrix.test.ts) |
| Trop de tentatives de connexion sont bloquées pendant une fenêtre de temps                                                    | [securityControls.test.ts](../../backend/src/modules/audit/securityControls.test.ts)       |
| Le cookie de session est `HttpOnly`, `SameSite` et `Secure` en production                                                     | [securityControls.test.ts](../../backend/src/modules/audit/securityControls.test.ts)       |
| Une erreur ne révèle jamais de détail technique (pile d'appels, SQL, chemin de fichier) ; le message est en français          | [errorRedaction.test.ts](../../backend/src/modules/audit/errorRedaction.test.ts)           |
| Le dernier Super Admin ne peut pas être désactivé                                                                             | [access.spec.ts](../../frontend/e2e/access.spec.ts) (parcours navigateur)                  |
| Chaque route est testée avec et sans l'autorisation requise                                                                   | fichiers `*.routes.test.ts` de chaque module                                               |

## 4. Tests de l'interface

**93 fichiers, 225 tests**, dans `frontend/src`.

### 4.1 Composants

Les 60 composants de base (champs, montants, quantités, tableaux, boîtes de
dialogue, sélecteurs, filtres de période, tuiles de chiffres) sont testés
un par un : saisie des montants à trois décimales, format `1 234,500 TND`,
dates au format tunisien, navigation au clavier.

### 4.2 Écrans

Chaque module a son fichier de test, qui rejoue les parcours du gérant et
du caissier contre un serveur simulé : caisse, ventes, commandes, clients,
achats, distribution, stock, produits, dépenses, simulations, accueil,
utilisateurs et rôles, journal d'audit, connexion. Ces tests vérifient
notamment :

- les montants affichés (reste à payer, acomptes, monnaie à rendre, écart
  de caisse) ;
- les refus affichés avant tout envoi (paiement supérieur au dû, prix
  inférieur au coût, fichier photo invalide) ;
- que chaque action n'apparaît qu'aux utilisateurs qui en ont le droit ;
- que les listes se mettent à jour après une opération, sans recharger la
  page.

### 4.3 Mise à jour des données

Les données déjà lues sont gardées en mémoire et rafraîchies selon ce que
chaque opération modifie : une vente rafraîchit le stock, la caisse, les
soldes clients et l'accueil ; un changement de nom de client ne touche ni
le stock ni la caisse. Des tests comptent les appels au serveur pour
vérifier qu'une donnée n'est pas relue inutilement.

### 4.4 Poids de l'interface

La construction mesure l'application : au plus 250 ko compressés au
premier chargement, 120 ko pour l'écran de caisse. Mesure actuelle :
201 ko et 13 ko.

## 5. Parcours dans un vrai navigateur

Neuf fichiers de parcours (`frontend/e2e`) pilotent un navigateur Chromium
comme le ferait un utilisateur, chacun à **trois largeurs d'écran** :
téléphone (360 px), tablette (768 px) et ordinateur (1 280 px).

| Parcours                                                                                                              | Fichier                      |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Connexion, ouverture de chaque module, déconnexion ; un caissier ne voit que ce que son rôle permet                   | `shell.spec.ts`              |
| Vente sur téléphone avec monnaie à rendre et à crédit, reprise après coupure réseau, clôture de caisse                | `caisse.spec.ts`             |
| Création de produit, stock d'ouverture, ajustement avec motif, défilement de la liste dans la fenêtre                 | `catalogueStock.spec.ts`     |
| Achat en sacs converti en kilos, validation, paiement fournisseur réparti sur deux achats                             | `procurement.spec.ts`        |
| Commande avec acompte, remise avec le reste à payer                                                                   | `customersOrders.spec.ts`    |
| Sortie en dépôt-vente, règlement équilibré, paiement, vente directe                                                   | `distribution.spec.ts`       |
| Annulation d'une dépense, simulation de coût                                                                          | `expensesSimulation.spec.ts` |
| Attribution d'une autorisation à un rôle, lecture dans le journal d'audit, refus de désactiver le dernier Super Admin | `access.spec.ts`             |
| Audit d'accessibilité (axe) de 30 écrans                                                                              | `a11y.spec.ts`               |

Chaque parcours vérifie aussi qu'aucune page ne déborde horizontalement.

## 6. Ce que les tests ne remplacent pas

Les tests automatisés prouvent que les règles programmées sont respectées.
Ils ne remplacent pas le regard du métier :

- que les règles programmées sont bien celles de la boulangerie ;
- que les chiffres parlent au gérant et au caissier (libellés, ordre,
  lisibilité sur le téléphone de la boutique) ;
- le comportement avec les vraies données, les vrais appareils et le vrai
  réseau.

C'est l'objet du cahier de recette.

## 7. Chiffres de référence

| Élément                        | Valeur (version 2.1.0)                  |
| ------------------------------ | --------------------------------------- |
| Tests serveur                  | 385, dans 52 fichiers                   |
| Tests interface                | 225, dans 93 fichiers                   |
| Parcours navigateur            | 9 fichiers, chacun à 3 largeurs d'écran |
| Écrans audités (accessibilité) | 30                                      |
| Budget de temps des lectures   | 150 ms (95 % des mesures)               |
| Budget de poids de l'interface | 250 ko (caisse : 120 ko)                |

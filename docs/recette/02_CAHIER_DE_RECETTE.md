# Dar El Barka · Cahier de recette

| Champ         | Valeur                    |
| ------------- | ------------------------- |
| Application   | <https://darelbarka.work> |
| Version       | 2.1.0                     |
| Testeur       |                           |
| Date de début |                           |
| Date de fin   |                           |

## Mode d'emploi

1. Les scénarios forment **une journée de boulangerie complète**, du
   paramétrage à la clôture de la caisse. Déroulez-les **dans l'ordre et le
   même jour** : les montants attendus d'un scénario dépendent des
   précédents, et les chiffres de l'accueil portent sur la journée.
2. Travaillez sur une base **vide**, avec le compte administrateur, sauf
   quand un scénario demande un autre compte.
3. Saisissez exactement les valeurs indiquées. Les montants sont en TND à
   trois décimales (`5,400` signifie 5 dinars 400 millimes).
4. Pour chaque étape, cochez **OK** si le résultat obtenu est celui
   attendu, **KO** sinon, et décrivez l'écart dans la colonne
   _Remarque_ (une capture d'écran peut être jointe).
5. Classez chaque KO :
   - **Bloquant** : empêche de travailler ou fausse un montant ;
   - **Majeur** : gêne sérieusement mais un contournement existe ;
   - **Mineur** : présentation, libellé, confort.
6. Un KO bloquant n'arrête pas la recette : notez-le et poursuivez si les
   scénarios suivants restent faisables.

## Données de référence

| Élément              | Valeur                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------ |
| Catégories produits  | Pains, Viennoiseries                                                                       |
| Produit 1            | Baguette · Pains · unité Pièce · prix 0,300 · coût approximatif 0,150 · stockable          |
| Produit 2            | Croissant · Viennoiseries · unité Pièce · prix 1,200 · coût approximatif 0,500 · stockable |
| Matière première     | Farine T55 · unité de base kg · conversion _Sac de 50 kg_ = 50 kg                          |
| Fournisseur          | Minoterie du Sud                                                                           |
| Client               | Amel Trabelsi · téléphone 98 765 432                                                       |
| Distributeur         | Karim Distribution                                                                         |
| Catégorie de dépense | Énergie                                                                                    |

---

## R1 · Connexion et accès sécurisé

| N°  | Action                                                     | Résultat attendu                                                      | OK  | KO  | Remarque |
| --- | ---------------------------------------------------------- | --------------------------------------------------------------------- | --- | --- | -------- |
| 1.1 | Ouvrir `http://darelbarka.work`                            | Le navigateur bascule sur `https://darelbarka.work` (cadenas affiché) | ☐   | ☐   |          |
| 1.2 | Se connecter avec un mauvais mot de passe                  | Message « E-mail ou mot de passe incorrect », aucun accès             | ☐   | ☐   |          |
| 1.3 | Se connecter avec le compte administrateur                 | L'accueil s'affiche avec « Bonjour, » suivi du prénom                 | ☐   | ☐   |          |
| 1.4 | Ouvrir chaque entrée du menu une fois                      | Chaque écran s'ouvre sans erreur                                      | ☐   | ☐   |          |
| 1.5 | Se déconnecter, puis revenir en arrière avec le navigateur | Retour à l'écran de connexion ; aucune donnée visible                 | ☐   | ☐   |          |

## R2 · Paramétrage du catalogue

| N°  | Action                                                                                                                                                                                      | Résultat attendu                                                                               | OK  | KO  | Remarque |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --- | --- | -------- |
| 2.1 | _Catégories et unités_ : créer les catégories Pains et Viennoiseries ; vérifier que les unités Pièce et kg existent, sinon les créer                                                        | Les deux catégories et les deux unités sont listées                                            | ☐   | ☐   |          |
| 2.2 | _Produits_ → **Nouveau produit** : créer la Baguette selon les données de référence                                                                                                         | Le produit apparaît avec le prix `0,300 TND`, le coût `0,150` et la marge `0,150 TND (50 %)`   | ☐   | ☐   |          |
| 2.3 | Créer le Croissant et lui ajouter une photo JPEG ou PNG                                                                                                                                     | Coût `0,500`, marge `0,700 TND (58,3 %)` ; la miniature apparaît dans la liste et sur la fiche | ☐   | ☐   |          |
| 2.4 | Essayer d'ajouter comme photo un fichier qui n'est pas une image (PDF, texte)                                                                                                               | Refus « La photo doit être un fichier JPEG, PNG ou WebP. », rien n'est enregistré              | ☐   | ☐   |          |
| 2.5 | _Matières premières_ : créer Farine T55 (unité de base kg) et la conversion _Sac de 50 kg_ = 50                                                                                             | La conversion apparaît sur la fiche                                                            | ☐   | ☐   |          |
| 2.6 | _Fournisseurs_ → **Nouveau fournisseur** Minoterie du Sud ; _Clients_ → **Nouveau client** Amel Trabelsi avec son téléphone ; _Distributeurs_ → **Nouveau distributeur** Karim Distribution | Chaque fiche est créée avec un solde de `0,000 TND`                                            | ☐   | ☐   |          |

## R3 · Stock d'ouverture et ajustement

| N°  | Action                                                                                                    | Résultat attendu                                                                           | OK  | KO  | Remarque |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --- | --- | -------- |
| 3.1 | _Stock_ → **Stock d'ouverture** : Baguette, quantité 200, motif « Inventaire initial » → **Suivant**      | La confirmation indique « passera de 0 pièce à 200 pièce »                                 | ☐   | ☐   |          |
| 3.2 | **Valider**, puis faire de même pour le Croissant avec 60                                                 | Stock : Baguette 200, Croissant 60                                                         | ☐   | ☐   |          |
| 3.3 | Dans la fenêtre de stock d'ouverture, faire défiler la liste des articles (souris et doigt sur téléphone) | La liste défile                                                                            | ☐   | ☐   |          |
| 3.4 | Ouvrir la fiche du Croissant → **Ajustement**                                                             | L'article est affiché en lecture seule avec « stock actuel 60 pièce », sans liste de choix | ☐   | ☐   |          |
| 3.5 | Sens **Sortie**, quantité 3, motif « Casse » → **Suivant** → **Valider**                                  | La confirmation indique « passera de 60 pièce à 57 pièce » ; le stock affiche 57           | ☐   | ☐   |          |
| 3.6 | _Stock_ → _Mouvements_                                                                                    | Les trois mouvements sont listés avec leur motif et leur quantité signée                   | ☐   | ☐   |          |

## R4 · Achat et paiement fournisseur

| N°  | Action                                                                                                         | Résultat attendu                                                                                                                     | OK  | KO  | Remarque |
| --- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --- | --- | -------- |
| 4.1 | _Achats_ → **Nouvel achat** : fournisseur Minoterie du Sud, ligne Farine T55, quantité 4, unité _Sac de 50 kg_ | Sous la ligne : « = 200 kg · prix par kg »                                                                                           | ☐   | ☐   |          |
| 4.2 | Saisir **250** dans le total de la ligne (sans toucher au prix unitaire)                                       | Le prix unitaire devient `1,250` (prix par kg) ; total de l'achat `250,000 TND`                                                      | ☐   | ☐   |          |
| 4.3 | Conditions **Partiel**, montant payé 100, échéance dans 30 jours → **Valider l'achat**                         | La confirmation indique « Stock : +200 kg Farine T55. » et une dette de `150,000 TND`                                                | ☐   | ☐   |          |
| 4.4 | **Valider**                                                                                                    | L'achat est validé avec une référence `AC-…` ; le stock de Farine T55 est de 200 kg                                                  | ☐   | ☐   |          |
| 4.5 | Fiche fournisseur                                                                                              | Solde dû `150,000 TND`                                                                                                               | ☐   | ☐   |          |
| 4.6 | **Payer** : montant 150, **Répartir automatiquement** → **Enregistrer le paiement**                            | « Reste à répartir 0,000 TND » avant validation ; solde fournisseur `0,000 TND` ; dans _Achats_, l'achat affiche un reste de `0,000` | ☐   | ☐   |          |

## R5 · Caisse : ouverture et ventes

| N°  | Action                                                        | Résultat attendu                                                                                   | OK  | KO  | Remarque |
| --- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --- | --- | -------- |
| 5.1 | _Caisse_ → **Ouvrir la caisse** avec un fonds de caisse de 50 | La caisse est ouverte ; les produits s'affichent en tuiles, le Croissant avec sa photo et son prix | ☐   | ☐   |          |
| 5.2 | **Vente A** : 10 Baguette et 2 Croissant                      | Total du panier `5,400 TND`                                                                        | ☐   | ☐   |          |
| 5.3 | **Encaisser**, montant reçu 10                                | « Monnaie à rendre : 4,600 TND »                                                                   | ☐   | ☐   |          |
| 5.4 | **Valider**                                                   | Message de succès ; la caisse reste affichée, panier vide                                          | ☐   | ☐   |          |
| 5.5 | **Vente B** : client Amel Trabelsi, 5 Croissant ; encaisser 2 | Total `6,000 TND` ; reste `4,000 TND` porté au compte du client                                    | ☐   | ☐   |          |
| 5.6 | Fiche client Amel Trabelsi                                    | _Dû_ `4,000 TND` ; la vente apparaît dans l'onglet _Ventes_ avec l'état _Partielle_                | ☐   | ☐   |          |
| 5.7 | Liste des clients : essayer de **Désactiver** Amel Trabelsi   | Refus « Solde en cours » ; le client reste actif                                                   | ☐   | ☐   |          |
| 5.8 | **Vente C** : 5 Baguette, encaisser exactement 1,500          | Vente enregistrée ; stock Baguette 185                                                             | ☐   | ☐   |          |

## R6 · Règlement client

| N°  | Action                                                                  | Résultat attendu                                                          | OK  | KO  | Remarque |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- | --- | --- | -------- |
| 6.1 | Fiche Amel Trabelsi → **Encaisser un règlement** : montant 5            | Refus : le montant dépasse ce qui est dû (`4,000`)                        | ☐   | ☐   |          |
| 6.2 | Montant 4, cocher _Encaissé à la caisse_ → **Enregistrer le règlement** | Le message indique la vente soldée ; _Dû_ `0,000 TND`                     | ☐   | ☐   |          |
| 6.3 | _Ventes_                                                                | La vente B affiche _Payée_ et un reste de `0,000`, sans recharger la page | ☐   | ☐   |          |

## R7 · Commande avec acompte

| N°  | Action                                                                                                       | Résultat attendu                                                                | OK  | KO  | Remarque |
| --- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | --- | --- | -------- |
| 7.1 | _Commandes_ → **Nouvelle commande** : Amel Trabelsi, pour demain, 20 Croissant → **Enregistrer la commande** | Total `24,000 TND` ; le prix vient du catalogue et n'est pas modifiable         | ☐   | ☐   |          |
| 7.2 | Sur la commande : **Confirmer**, puis **Encaisser un acompte**                                               | La fenêtre indique « Reste à verser » `24,000 TND`                              | ☐   | ☐   |          |
| 7.3 | Saisir 10 → **Encaisser**                                                                                    | _Avance_ `10,000`, _Reste_ `14,000` ; l'acompte apparaît avec sa date           | ☐   | ☐   |          |
| 7.4 | **Encaisser un acompte** à nouveau, saisir 15                                                                | Refus : l'acompte dépasse le reste à verser (`14,000`)                          | ☐   | ☐   |          |
| 7.5 | Fermer, puis **Terminer**                                                                                    | La fenêtre montre `14,000 TND` à encaisser et « Acompte appliqué : 10,000 TND » | ☐   | ☐   |          |
| 7.6 | Saisir 14 → **Terminer la commande**                                                                         | « Rien ne reste dû » ; la commande est _Terminée_ avec une _Vente liée_ `VT-…`  | ☐   | ☐   |          |
| 7.7 | _Stock_                                                                                                      | Croissant `57 − 2 − 5 − 20 = 30`                                                | ☐   | ☐   |          |

## R8 · Annulation d'une vente

| N°  | Action                                            | Résultat attendu                                            | OK  | KO  | Remarque |
| --- | ------------------------------------------------- | ----------------------------------------------------------- | --- | --- | -------- |
| 8.1 | _Ventes_ → vente C → **Annuler** sans motif       | Le motif est exigé                                          | ☐   | ☐   |          |
| 8.2 | Motif « Erreur de saisie » → **Annuler la vente** | La vente passe à _Annulée_ et disparaît des ventes validées | ☐   | ☐   |          |
| 8.3 | _Stock_                                           | Baguette revenue à 190                                      | ☐   | ☐   |          |
| 8.4 | Filtre de statut _Annulées_                       | La vente C y figure, avec son motif sur le ticket           | ☐   | ☐   |          |

## R9 · Distribution

| N°  | Action                                                                                                        | Résultat attendu                                                                                            | OK  | KO  | Remarque |
| --- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --- | --- | -------- |
| 9.1 | _Dépôt-vente_ → **Nouvelle sortie** : Karim Distribution, 40 Baguette → **Enregistrer la sortie**             | La confirmation indique « Aucune vente ni dette »                                                           | ☐   | ☐   |          |
| 9.2 | **Valider**                                                                                                   | Stock Baguette 150 ; solde du distributeur inchangé `0,000`                                                 | ☐   | ☐   |          |
| 9.3 | **Régler la sortie** : vendue 30, retournée 8, non justifiée 2, prix unitaire 0,300                           | « Équation vérifiée » ; revenu `9,000 TND`                                                                  | ☐   | ☐   |          |
| 9.4 | Valider le règlement                                                                                          | Stock Baguette 158 (retour de 8) ; solde distributeur `9,000` ; les 2 non justifiées ne créent aucune dette | ☐   | ☐   |          |
| 9.5 | Fiche distributeur → **Nouveau paiement** 5 → **Enregistrer le paiement**                                     | Solde `4,000 TND`                                                                                           | ☐   | ☐   |          |
| 9.6 | Accueil → action rapide _Vente directe distributeur_ : Karim, 10 Croissant, prix unitaire 0,400 → **Suivant** | Refus : prix inférieur au coût approximatif (`0,500`)                                                       | ☐   | ☐   |          |
| 9.7 | Saisir **10** dans le total de la ligne                                                                       | Le prix unitaire devient `1,000`                                                                            | ☐   | ☐   |          |
| 9.8 | Montant payé 0 → **Suivant** → **Valider**                                                                    | Vente directe enregistrée ; solde distributeur `14,000 TND` ; stock Croissant 20                            | ☐   | ☐   |          |

## R10 · Dépenses

| N°   | Action                                                                               | Résultat attendu                                                              | OK  | KO  | Remarque |
| ---- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | --- | --- | -------- |
| 10.1 | _Dépenses_ → catégories : créer Énergie                                              | La catégorie est listée                                                       | ☐   | ☐   |          |
| 10.2 | **Nouvelle dépense** « Électricité », Énergie, 120, validée                          | Elle entre dans les totaux du jour                                            | ☐   | ☐   |          |
| 10.3 | **Nouvelle dépense** « Test », Énergie, 30, validée ; puis **Annuler** avec un motif | Elle reste visible comme _Annulée_ ; le total du jour revient à `120,000 TND` | ☐   | ☐   |          |

## R11 · Simulation de coût

| N°   | Action                                                                                                       | Résultat attendu                                                                                              | OK  | KO  | Remarque |
| ---- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | --- | --- | -------- |
| 11.1 | _Simulation de coût_ → nouvelle simulation « Baguette », produit visé Baguette, quantité produite 50 pièces  | Le formulaire est prêt                                                                                        | ☐   | ☐   |          |
| 11.2 | Ingrédient Farine T55 : 5 kg à 1,250 ; **Ajouter un ingrédient**, _Ingrédient libre_ « Levure » : 0,1 kg à 1 | Coût des ingrédients `6,350 TND` ; coût unitaire `0,127 TND`                                                  | ☐   | ☐   |          |
| 11.3 | **Enregistrer la simulation**, puis ouvrir la fiche de la Baguette                                           | La ligne _Dernière simulation_ montre `0,127 TND` et « Baguette » ; le stock de Farine n'a pas bougé (200 kg) | ☐   | ☐   |          |

## R12 · Clôture de la caisse

| N°   | Action                                 | Résultat attendu                                                                                                      | OK  | KO  | Remarque |
| ---- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --- | --- | -------- |
| 12.1 | _Caisse_ → **Clôturer**                | _Espèces attendues_ `85,400 TND`                                                                                      | ☐   | ☐   |          |
| 12.2 | _Espèces comptées_ 85 → **Clôturer**   | _Écart_ `−0,400 TND` ; la session passe à _Fermée_                                                                    | ☐   | ☐   |          |
| 12.3 | _Sessions_ → ouvrir la session du jour | Le détail reprend les ventes, les acomptes, le règlement encaissé à la caisse et le remboursement de la vente annulée | ☐   | ☐   |          |

Calcul des espèces attendues :

| Ligne                                      | Montant    |
| ------------------------------------------ | ---------- |
| Fonds de caisse                            | 50,000     |
| Vente A                                    | 5,400      |
| Vente B (payé à la caisse)                 | 2,000      |
| Vente C                                    | 1,500      |
| Vente C annulée (remboursement)            | −1,500     |
| Règlement d'Amel encaissé à la caisse      | 4,000      |
| Acompte de la commande                     | 10,000     |
| Complément payé à la remise de la commande | 14,000     |
| **Espèces attendues**                      | **85,400** |

## R13 · Accueil : cohérence des chiffres du jour

Période **Aujourd'hui**.

| N°   | Tuile                          | Valeur attendue                                                        | Explication                                                                                                        | OK  | KO  | Remarque |
| ---- | ------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --- | --- | -------- |
| 13.1 | Ventes du jour                 | `35,400` · 3 ventes                                                    | A 5,400 + B 6,000 + vente liée à la commande 24,000 ; la vente C annulée est exclue                                | ☐   | ☐   |          |
| 13.2 | Encaissé en espèces            | `35,400`                                                               | Tout ce qui est entré dans la caisse sur la journée, remboursement déduit, sans le fonds de caisse                 | ☐   | ☐   |          |
| 13.3 | Dépenses du jour               | `120,000` · 1 dépense validée                                          | La dépense annulée est exclue                                                                                      | ☐   | ☐   |          |
| 13.4 | Marge approximative            | `20,400`                                                               | Chiffre d'affaires 35,400 − coûts 15,000 (27 Croissant × 0,500 + 10 Baguette × 0,150) ; ventes de caisse seulement | ☐   | ☐   |          |
| 13.5 | Reste à encaisser clients      | `14,000`, dont distributeurs `14,000`                                  | Amel est soldée ; Karim doit 14,000                                                                                | ☐   | ☐   |          |
| 13.6 | À payer fournisseurs           | `0,000`                                                                | La Minoterie a été payée                                                                                           | ☐   | ☐   |          |
| 13.7 | Passer sur la période **Hier** | Ventes, encaissé, dépenses et marge à zéro ; les deux soldes inchangés | Les soldes sont des soldes actuels, indépendants de la période                                                     | ☐   | ☐   |          |

## R14 · Contrôle de fin de journée

Relevé final à comparer avec l'application.

| Élément                         | Valeur attendue | Valeur observée | OK  | KO  |
| ------------------------------- | --------------- | --------------- | --- | --- |
| Stock Baguette                  | 158             |                 | ☐   | ☐   |
| Stock Croissant                 | 20              |                 | ☐   | ☐   |
| Stock Farine T55                | 200 kg          |                 | ☐   | ☐   |
| Solde Amel Trabelsi             | 0,000           |                 | ☐   | ☐   |
| Fiche Amel : commandes / ventes | 1 / 2 (30,000)  |                 | ☐   | ☐   |
| Solde Karim Distribution        | 14,000          |                 | ☐   | ☐   |
| Solde Minoterie du Sud          | 0,000           |                 | ☐   | ☐   |
| Écart de caisse de la session   | −0,400          |                 | ☐   | ☐   |

Détail des stocks : Baguette 200 − 10 (A) − 5 (C) + 5 (annulation C) − 40
(sortie) + 8 (retour) = 158. Croissant 60 − 3 (casse) − 2 (A) − 5 (B) − 20
(commande) − 10 (vente directe) = 20.

## R15 · Rôles, droits et journal

Les scénarios R15 et R16 rouvrent la caisse : ils viennent après le relevé
de fin de journée et ne le modifient pas.

| N°   | Action                                                                                                                                                   | Résultat attendu                                                                                              | OK  | KO  | Remarque |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --- | --- | -------- |
| 15.1 | _Rôles et autorisations_ : créer le rôle « Caissier » avec, dans le module Caisse, seulement : Accéder, Vendre, Ouvrir une session, Clôturer une session | Le rôle est enregistré                                                                                        | ☐   | ☐   |          |
| 15.2 | _Utilisateurs_ → **Nouvel utilisateur** avec ce rôle et un mot de passe temporaire                                                                       | L'utilisateur apparaît, actif                                                                                 | ☐   | ☐   |          |
| 15.3 | Se connecter avec ce compte (autre navigateur ou fenêtre privée)                                                                                         | Le menu ne propose que l'accueil et les écrans de la caisse ; aucun coût ni marge n'apparaît                  | ☐   | ☐   |          |
| 15.4 | Ouvrir la caisse avec un fonds de 0, ajouter 1 Croissant, saisir un montant reçu de 0,500                                                                | Le bouton d'encaissement reste inactif et explique pourquoi : la vente à crédit n'est pas autorisée à ce rôle | ☐   | ☐   |          |
| 15.5 | **Vider le panier**, puis **Clôturer** la caisse avec 0 compté                                                                                           | La session est fermée sans écart                                                                              | ☐   | ☐   |          |
| 15.6 | Revenir au compte administrateur ; _Utilisateurs_ → essayer de désactiver le dernier Super Admin                                                         | Refus expliqué                                                                                                | ☐   | ☐   |          |
| 15.7 | _Journal d'audit_                                                                                                                                        | Les opérations de la journée sont listées avec leur auteur, leur date et le détail avant / après              | ☐   | ☐   |          |

## R16 · Téléphone et tablette

| N°   | Action                                                                  | Résultat attendu                                                                       | OK  | KO  | Remarque |
| ---- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --- | --- | -------- |
| 16.1 | Ouvrir l'application sur le téléphone de la boutique                    | L'écran s'adapte ; aucune page ne défile de côté                                       | ☐   | ☐   |          |
| 16.2 | Ouvrir la caisse, faire une vente payée sur le téléphone, puis clôturer | Le panier s'ouvre en bas de l'écran ; l'encaissement et la clôture se font sans zoomer | ☐   | ☐   |          |
| 16.3 | Sur tablette, parcourir Ventes, Commandes et Clients                    | Les tableaux restent lisibles                                                          | ☐   | ☐   |          |

---

## Réserves

| N°  | Scénario / étape | Description | Gravité (Bloquant / Majeur / Mineur) |
| --- | ---------------- | ----------- | ------------------------------------ |
| 1   |                  |             |                                      |
| 2   |                  |             |                                      |
| 3   |                  |             |                                      |
| 4   |                  |             |                                      |
| 5   |                  |             |                                      |

## Décision

☐ **Accepté** : l'application est conforme.

☐ **Accepté avec réserves** : l'application peut être utilisée ; les
réserves ci-dessus seront corrigées dans le délai convenu.

☐ **Refusé** : au moins une réserve bloquante empêche l'utilisation.

| Rôle                  | Nom | Date | Signature |
| --------------------- | --- | ---- | --------- |
| Client (Dar El Barka) |     |      |           |
| Prestataire           |     |      |           |

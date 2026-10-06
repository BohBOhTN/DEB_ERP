import {
  ClipboardPlus,
  ShoppingBasket,
  ShoppingCart,
  Store,
  Truck,
  UserPlus,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import type {
  PermissionKey,
  PermissionSet,
} from "../../../lib/auth/permissions.js";
import { hasAny, hasPermission } from "../../../lib/auth/permissions.js";
import styles from "./QuickActionsCard.module.css";

export interface QuickActionsCardProps {
  permissions: PermissionSet;
  sessionOpen: boolean;
}

interface QuickAction {
  id: string;
  label: string;
  to: string;
  icon: typeof Store;
  anyOf: readonly PermissionKey[];
  /// Every one of these as well: a trip creates and posts a purchase and
  /// records expenses (issue 018).
  allOf?: readonly PermissionKey[];
}

/// Row 2, right: permission-gated links to the most frequent actions.
export function quickActionsFor(
  permissions: PermissionSet,
  sessionOpen: boolean,
): QuickAction[] {
  const actions: QuickAction[] = [
    {
      id: "pos",
      label: sessionOpen ? "Nouvelle vente" : "Ouvrir la caisse",
      to: "/caisse",
      icon: Store,
      anyOf: sessionOpen ? ["pos.sell"] : ["pos.open_session"],
    },
    {
      id: "order",
      label: "Nouvelle commande",
      to: "/commandes/nouvelle",
      icon: ClipboardPlus,
      anyOf: ["orders.create"],
    },
    {
      id: "purchase",
      label: "Nouvel achat",
      to: "/achats/nouveau",
      icon: ShoppingCart,
      anyOf: ["purchases.create"],
    },
    {
      id: "shopping-trip",
      label: "Course fournisseur",
      to: "/achats/course",
      icon: ShoppingBasket,
      anyOf: ["purchases.create"],
      allOf: ["purchases.post", "expenses.create"],
    },
    {
      id: "distributor-sale",
      label: "Vente directe distributeur",
      to: "/distributeurs?vente=directe",
      icon: Truck,
      anyOf: ["distribution.direct_sale"],
    },
    {
      id: "expense",
      label: "Nouvelle dépense",
      to: "/depenses",
      icon: Wallet,
      anyOf: ["expenses.create"],
    },
    {
      id: "customer",
      label: "Nouveau client",
      to: "/clients",
      icon: UserPlus,
      anyOf: ["customers.create"],
    },
  ];

  return actions.filter(
    (action) =>
      hasAny(permissions, action.anyOf) &&
      (action.allOf ?? []).every((key) => hasPermission(permissions, key)),
  );
}

export function QuickActionsCard({
  permissions,
  sessionOpen,
}: QuickActionsCardProps) {
  const actions = quickActionsFor(permissions, sessionOpen);

  if (actions.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader title="Actions rapides" />
      <ul className={styles.list}>
        {actions.map((action) => (
          <li key={action.id}>
            <Link to={action.to} className={styles.action}>
              <span className={styles.icon} aria-hidden="true">
                <action.icon />
              </span>
              {action.label}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

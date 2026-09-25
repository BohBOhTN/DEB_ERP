import {
  ClipboardPlus,
  ShoppingCart,
  Store,
  UserPlus,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import type {
  PermissionKey,
  PermissionSet,
} from "../../../lib/auth/permissions.js";
import { hasAny } from "../../../lib/auth/permissions.js";
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

  return actions.filter((action) => hasAny(permissions, action.anyOf));
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

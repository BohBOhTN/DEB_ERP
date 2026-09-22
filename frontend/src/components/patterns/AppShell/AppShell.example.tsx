import {
  Boxes,
  ClipboardList,
  Factory,
  Home,
  ShoppingCart,
  Store,
  Users,
} from "lucide-react";
import { useState } from "react";
import type { KitEntry } from "../../kit/types.js";
import { Badge } from "../../ui/Badge/Badge.js";
import {
  AppShell,
  readCollapsedPreference,
  writeCollapsedPreference,
  type ShellNavItem,
} from "./AppShell.js";

const items: ShellNavItem[] = [
  {
    id: "home",
    label: "Accueil",
    icon: <Home />,
    href: "#",
    mobilePrimary: true,
  },
  {
    id: "pos",
    label: "Caisse",
    icon: <Store />,
    href: "#",
    group: "Ventes",
    mobilePrimary: true,
  },
  {
    id: "orders",
    label: "Commandes",
    icon: <ClipboardList />,
    href: "#",
    group: "Ventes",
    mobilePrimary: true,
  },
  {
    id: "customers",
    label: "Clients",
    icon: <Users />,
    href: "#",
    group: "Ventes",
    mobilePrimary: true,
  },
  {
    id: "purchases",
    label: "Achats",
    icon: <ShoppingCart />,
    href: "#",
    group: "Achats",
  },
  {
    id: "suppliers",
    label: "Fournisseurs",
    icon: <Factory />,
    href: "#",
    group: "Achats",
  },
  { id: "stock", label: "Stock", icon: <Boxes />, href: "#", group: "Stock" },
];

function Example() {
  const [active, setActive] = useState("home");
  const [collapsed, setCollapsed] = useState(readCollapsedPreference);

  return (
    <div
      style={{
        height: 560,
        border: "1px solid var(--border-subtle)",
        borderRadius: 14,
        overflow: "hidden",
        // Makes this box the containing block of the fixed bottom navigation,
        // so the example does not bleed over the rest of the gallery.
        transform: "translateZ(0)",
      }}
    >
      <AppShell
        items={items}
        activeId={active}
        title={items.find((item) => item.id === active)?.label}
        user={{ displayName: "Amine Trabelsi", roleNames: ["Caissier"] }}
        badge={
          active === "stock" ? (
            <Badge tone="warning">Ancienne interface</Badge>
          ) : undefined
        }
        onNavigate={(item) => setActive(item.id)}
        onLogout={() => undefined}
        collapsed={collapsed}
        onCollapsedChange={(next) => {
          setCollapsed(next);
          writeCollapsedPreference(next);
        }}
      >
        <p>
          Contenu de la page « {items.find((item) => item.id === active)?.label}{" "}
          ».
        </p>
      </AppShell>
    </div>
  );
}

export const kit: KitEntry = {
  name: "AppShell",
  group: "patterns",
  description:
    "Barre latérale repliable, barre supérieure, navigation du bas et feuille « Plus » (statique, sans routeur).",
  examples: [{ title: "Coquille", render: () => <Example /> }],
};

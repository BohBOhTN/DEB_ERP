import { Plus, ShoppingCart, Users } from "lucide-react";
import { useState } from "react";
import type { KitEntry } from "../../kit/types.js";
import { Button } from "../../ui/Button/Button.js";
import { CommandPalette, CommandPaletteTrigger } from "./CommandPalette.js";

function Demo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <CommandPaletteTrigger onClick={() => setOpen(true)} />
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Ouvrir
      </Button>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        items={[
          {
            id: "pos",
            label: "Caisse",
            group: "Aller à",
            icon: <ShoppingCart />,
            onSelect: () => undefined,
          },
          {
            id: "customers",
            label: "Clients",
            group: "Aller à",
            icon: <Users />,
            onSelect: () => undefined,
          },
          {
            id: "new-sale",
            label: "Nouvelle vente",
            group: "Actions",
            icon: <Plus />,
            onSelect: () => undefined,
          },
        ]}
        search={async (query) => [
          {
            id: `c-${query}`,
            label: `Client ${query}`,
            group: "Clients",
            description: "Solde 12,500 TND",
            onSelect: () => undefined,
          },
        ]}
      />
    </>
  );
}

export const kit: KitEntry = {
  name: "CommandPalette",
  group: "patterns",
  description:
    "Ctrl+K / ⌘K sur ordinateur : aller à un écran, lancer une action, ouvrir une fiche client, produit ou fournisseur.",
  examples: [{ title: "Déclencheur et palette", render: () => <Demo /> }],
};

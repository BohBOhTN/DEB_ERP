import { MoreHorizontal, Plus } from "lucide-react";
import type { KitEntry } from "../../kit/types.js";
import { Badge } from "../../ui/Badge/Badge.js";
import { Button } from "../../ui/Button/Button.js";
import { IconButton } from "../../ui/IconButton/IconButton.js";
import { PageHeader } from "./PageHeader.js";

export const kit: KitEntry = {
  name: "PageHeader",
  group: "patterns",
  description:
    "Surtitre, h1, description, actions ; fil d'Ariane sur ordinateur.",
  examples: [
    {
      title: "Liste",
      render: () => (
        <PageHeader
          eyebrow="Achats"
          title="Fournisseurs"
          description="Fiches fournisseurs, soldes dus et relevés."
          breadcrumbs={[
            { label: "Achats", href: "#" },
            { label: "Fournisseurs" },
          ]}
          actions={<Button leftIcon={<Plus />}>Nouveau fournisseur</Button>}
          overflow={
            <IconButton
              label="Plus d'actions"
              icon={<MoreHorizontal />}
              variant="secondary"
            />
          }
        />
      ),
    },
    {
      title: "Écran V1 monté",
      render: () => (
        <PageHeader
          title="Simulations"
          badge={<Badge tone="warning">Ancienne interface</Badge>}
        />
      ),
    },
  ],
};

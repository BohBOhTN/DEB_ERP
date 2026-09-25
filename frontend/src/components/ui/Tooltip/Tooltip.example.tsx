import { Store } from "lucide-react";
import type { KitEntry } from "../../kit/types.js";
import { IconButton } from "../IconButton/IconButton.js";
import { Tooltip } from "./Tooltip.js";

export const kit: KitEntry = {
  name: "Tooltip",
  group: "ui",
  description:
    "Info-bulle Radix, ordinateur seulement ; jamais l'unique libellé.",
  examples: [
    {
      title: "Sur un bouton icône",
      render: () => (
        <Tooltip content="Ouvrir la caisse">
          <IconButton label="Caisse" icon={<Store />} variant="secondary" />
        </Tooltip>
      ),
    },
  ],
};

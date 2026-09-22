import { KeyRound, MoreHorizontal, Pencil, UserX } from "lucide-react";
import type { KitEntry } from "../../kit/types.js";
import { IconButton } from "../IconButton/IconButton.js";
import { DropdownMenu } from "./DropdownMenu.js";

export const kit: KitEntry = {
  name: "DropdownMenu",
  group: "ui",
  description:
    "Menu d'actions de ligne et menu utilisateur ; éléments dangereux et masqués.",
  examples: [
    {
      title: "Actions de ligne",
      render: () => (
        <DropdownMenu
          label="Actions de la ligne"
          trigger={
            <IconButton label="Actions" icon={<MoreHorizontal />} size="sm" />
          }
          items={[
            { id: "edit", label: "Modifier", icon: <Pencil /> },
            {
              id: "reset",
              label: "Réinitialiser le mot de passe",
              icon: <KeyRound />,
            },
            {
              id: "deactivate",
              label: "Désactiver",
              icon: <UserX />,
              danger: true,
              separatorBefore: true,
            },
          ]}
        />
      ),
    },
  ],
};

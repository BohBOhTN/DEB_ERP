import { MoreHorizontal, Pencil, Power } from "lucide-react";
import { DropdownMenu } from "../../../components/ui/DropdownMenu/DropdownMenu.js";
import { IconButton } from "../../../components/ui/IconButton/IconButton.js";
import type {
  PermissionKey,
  PermissionSet,
} from "../../../lib/auth/permissions.js";

export interface RowActionsProps {
  permissions: PermissionSet;
  isActive: boolean;
  editPermission: PermissionKey;
  activatePermission: PermissionKey;
  onEdit: () => void;
  onToggleActivation: () => void;
}

/// Row actions shared by the catalogue lists: edit and activate or
/// deactivate, each gated by its permission (hidden, not disabled).
export function RowActions({
  permissions,
  isActive,
  editPermission,
  activatePermission,
  onEdit,
  onToggleActivation,
}: RowActionsProps) {
  const items = [
    {
      id: "edit",
      label: "Modifier",
      icon: <Pencil />,
      onSelect: onEdit,
      hidden: !permissions.has(editPermission),
    },
    {
      id: "activation",
      label: isActive ? "Désactiver" : "Réactiver",
      icon: <Power />,
      onSelect: onToggleActivation,
      danger: isActive,
      hidden: !permissions.has(activatePermission),
      separatorBefore: true,
    },
  ];

  if (items.every((item) => item.hidden)) {
    return null;
  }

  return (
    <DropdownMenu
      label="Actions de la ligne"
      trigger={
        <IconButton label="Actions" icon={<MoreHorizontal />} size="sm" />
      }
      items={items}
    />
  );
}

export const listDefaults = {
  q: "",
  isActive: "true",
  sort: "name:asc",
  page: 1,
  pageSize: 25,
};

export function sortFrom(value: string): {
  field: string;
  direction: "asc" | "desc";
} {
  const [field, direction] = value.split(":");

  return {
    field: field || "name",
    direction: direction === "desc" ? "desc" : "asc",
  };
}

export function activeFilter(value: string): boolean | undefined {
  return value === "" ? undefined : value === "true";
}

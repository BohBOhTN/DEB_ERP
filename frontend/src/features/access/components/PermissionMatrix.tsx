import { useMemo, useState } from "react";
import { Button } from "../../../components/ui/Button/Button.js";
import { Checkbox } from "../../../components/ui/Checkbox/Checkbox.js";
import { TextInput } from "../../../components/ui/TextInput/TextInput.js";
import type { PermissionGroup } from "../access.api.js";
import styles from "./AccessForms.module.css";

export interface PermissionMatrixProps {
  groups: PermissionGroup[];
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  readOnly?: boolean;
}

/// The permission catalogue by module with French labels and descriptions,
/// a search box and "Tout sélectionner" per group (07 section 4.10). Keys
/// stay in the DOM as values only.
export function PermissionMatrix({
  groups,
  selected,
  onChange,
  readOnly = false,
}: PermissionMatrixProps) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return groups;
    return groups
      .map((group) => ({
        ...group,
        permissions: group.permissions.filter((permission) =>
          `${group.module} ${permission.labelFr} ${permission.descriptionFr}`
            .toLowerCase()
            .includes(needle),
        ),
      }))
      .filter((group) => group.permissions.length > 0);
  }, [groups, query]);

  const toggle = (key: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(key);
    else next.delete(key);
    onChange(next);
  };
  const toggleGroup = (group: PermissionGroup, checked: boolean) => {
    const next = new Set(selected);
    for (const permission of group.permissions) {
      if (checked) next.add(permission.key);
      else next.delete(permission.key);
    }
    onChange(next);
  };

  return (
    <div className={styles.matrix}>
      <TextInput
        type="search"
        aria-label="Rechercher une autorisation"
        placeholder="Rechercher une autorisation"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {visible.length === 0 ? (
        <p className={styles.muted}>Aucune autorisation ne correspond.</p>
      ) : null}
      {visible.map((group) => {
        const count = group.permissions.filter((permission) =>
          selected.has(permission.key),
        ).length;
        const all = count === group.permissions.length;
        return (
          <section
            key={group.module}
            className={styles.group}
            aria-label={group.module}
          >
            <div className={styles.groupHead}>
              <span className={styles.groupTitle}>
                {group.module}{" "}
                <span className={styles.muted}>
                  ({count} / {group.permissions.length})
                </span>
              </span>
              {!readOnly ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleGroup(group, !all)}
                >
                  {all ? "Tout désélectionner" : "Tout sélectionner"}
                </Button>
              ) : null}
            </div>
            <div className={styles.permissions}>
              {group.permissions.map((permission) => (
                <Checkbox
                  key={permission.key}
                  label={permission.descriptionFr}
                  description={
                    permission.labelFr !== permission.descriptionFr
                      ? permission.labelFr
                      : undefined
                  }
                  checked={selected.has(permission.key)}
                  onCheckedChange={(checked) =>
                    toggle(permission.key, checked === true)
                  }
                  disabled={readOnly}
                  value={permission.key}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

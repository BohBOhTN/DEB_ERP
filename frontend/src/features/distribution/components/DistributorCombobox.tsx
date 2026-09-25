import { useCallback } from "react";
import {
  Combobox,
  type ComboboxOption,
} from "../../../components/ui/Combobox/Combobox.js";
import { formatMoney } from "../../../i18n/format.js";
import { listDistributors, type Distributor } from "../distribution.api.js";

export interface DistributorOption extends ComboboxOption {
  distributor: Distributor;
}

export interface DistributorComboboxProps {
  value: ComboboxOption | null;
  onChange: (
    option: ComboboxOption | null,
    distributor: Distributor | null,
  ) => void;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  "aria-label"?: string;
  placeholder?: string;
}

/// Distributor search by name; each option shows what is owed and held.
export function DistributorCombobox({
  value,
  onChange,
  disabled,
  invalid,
  id,
  placeholder = "Nom du distributeur",
  ...rest
}: DistributorComboboxProps) {
  const loadOptions = useCallback(
    async (query: string): Promise<DistributorOption[]> => {
      const page = await listDistributors({
        page: 1,
        pageSize: 8,
        q: query || undefined,
        isActive: true,
      });
      return page.items.map((distributor) => ({
        value: distributor.id,
        label: distributor.name,
        description:
          [
            Number(distributor.balanceTnd ?? 0) > 0
              ? `solde dû ${formatMoney(distributor.balanceTnd ?? "0")}`
              : null,
            (distributor.heldLineCount ?? 0) > 0
              ? `${distributor.heldLineCount} ligne${(distributor.heldLineCount ?? 0) > 1 ? "s" : ""} en dépôt`
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || "Aucun solde, rien en dépôt",
        distributor,
      }));
    },
    [],
  );

  return (
    <Combobox<DistributorOption>
      id={id}
      aria-label={rest["aria-label"]}
      loadOptions={loadOptions}
      value={
        value ? { ...value, distributor: null as unknown as Distributor } : null
      }
      onChange={(option) =>
        onChange(
          option ? { value: option.value, label: option.label } : null,
          option?.distributor ?? null,
        )
      }
      placeholder={placeholder}
      emptyText="Aucun distributeur"
      disabled={disabled}
      invalid={invalid}
    />
  );
}

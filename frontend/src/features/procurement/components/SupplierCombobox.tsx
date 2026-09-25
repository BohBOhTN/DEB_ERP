import { useCallback } from "react";
import {
  Combobox,
  type ComboboxOption,
} from "../../../components/ui/Combobox/Combobox.js";
import { formatMoney } from "../../../i18n/format.js";
import {
  listSupplierBalances,
  type SupplierBalanceRow,
} from "../procurement.api.js";

export interface SupplierOption extends ComboboxOption {
  row: SupplierBalanceRow;
}

export interface SupplierComboboxProps {
  value: ComboboxOption | null;
  onChange: (
    option: ComboboxOption | null,
    row: SupplierBalanceRow | null,
  ) => void;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  "aria-label"?: string;
  placeholder?: string;
}

/// Supplier search by name through the balances endpoint, so each option
/// shows what is owed and the caller receives the open purchases with the
/// pick (07 section 4.3).
export function SupplierCombobox({
  value,
  onChange,
  disabled,
  invalid,
  id,
  placeholder = "Nom du fournisseur",
  ...rest
}: SupplierComboboxProps) {
  const loadOptions = useCallback(
    async (query: string): Promise<SupplierOption[]> => {
      const page = await listSupplierBalances({
        page: 1,
        pageSize: 8,
        q: query || undefined,
      });

      return page.items
        .filter((row) => row.supplier.isActive)
        .map((row) => ({
          value: row.supplier.id,
          label: row.supplier.name,
          description:
            Number(row.balanceTnd) > 0
              ? `Solde dû ${formatMoney(row.balanceTnd)} · ${row.openPurchaseCount} achat${row.openPurchaseCount > 1 ? "s" : ""} ouvert${row.openPurchaseCount > 1 ? "s" : ""}`
              : "Aucun solde dû",
          row,
        }));
    },
    [],
  );

  return (
    <Combobox<SupplierOption>
      id={id}
      aria-label={rest["aria-label"]}
      loadOptions={loadOptions}
      value={
        value ? { ...value, row: null as unknown as SupplierBalanceRow } : null
      }
      onChange={(option) =>
        onChange(
          option ? { value: option.value, label: option.label } : null,
          option?.row ?? null,
        )
      }
      placeholder={placeholder}
      emptyText="Aucun fournisseur"
      disabled={disabled}
      invalid={invalid}
    />
  );
}

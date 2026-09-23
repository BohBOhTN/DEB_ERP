import { useCallback } from "react";
import {
  Combobox,
  type ComboboxOption,
} from "../../../components/ui/Combobox/Combobox.js";
import { listPosCustomers } from "../pos.api.js";

export interface PosCustomerComboboxProps {
  value: ComboboxOption | null;
  onChange: (option: ComboboxOption | null) => void;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  "aria-label"?: string;
}

/// The till's customer lookup on `/pos/customers` (a cashier may lack the
/// balances permission); empty means "Client de passage".
export function PosCustomerCombobox({
  value,
  onChange,
  disabled,
  invalid,
  id,
  ...rest
}: PosCustomerComboboxProps) {
  const loadOptions = useCallback(
    async (query: string): Promise<ComboboxOption[]> => {
      const page = await listPosCustomers({
        page: 1,
        pageSize: 8,
        q: query || undefined,
      });
      return page.items.map((customer) => ({
        value: customer.id,
        label: customer.name,
        description: customer.phone ?? undefined,
      }));
    },
    [],
  );

  return (
    <Combobox
      id={id}
      aria-label={rest["aria-label"] ?? "Client"}
      loadOptions={loadOptions}
      value={value}
      onChange={onChange}
      placeholder="Client de passage"
      emptyText="Aucun client"
      disabled={disabled}
      invalid={invalid}
    />
  );
}

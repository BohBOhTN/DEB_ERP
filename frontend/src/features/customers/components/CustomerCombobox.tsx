import { useCallback } from "react";
import {
  Combobox,
  type ComboboxOption,
} from "../../../components/ui/Combobox/Combobox.js";
import { formatMoney } from "../../../i18n/format.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import {
  listCustomerBalances,
  listCustomers,
  type CustomerBalanceRow,
} from "../customers.api.js";

export interface CustomerOption extends ComboboxOption {
  row: CustomerBalanceRow;
}

export interface CustomerComboboxProps {
  value: ComboboxOption | null;
  onChange: (
    option: ComboboxOption | null,
    row: CustomerBalanceRow | null,
  ) => void;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  "aria-label"?: string;
  placeholder?: string;
}

/// Customer search by name or phone through the balances endpoint, so each
/// option shows what is owed and the caller receives the balances with the
/// pick (07 section 4.4). A caller without `customer_balances.view` (a
/// cashier taking an order) searches the plain directory instead and the
/// pick carries zero balances.
export function CustomerCombobox({
  value,
  onChange,
  disabled,
  invalid,
  id,
  placeholder = "Nom ou téléphone du client",
  ...rest
}: CustomerComboboxProps) {
  const permissions = useSessionPermissions();
  const withBalances = permissions.has("customer_balances.view");
  const loadOptions = useCallback(
    async (query: string): Promise<CustomerOption[]> => {
      if (!withBalances) {
        const page = await listCustomers({
          page: 1,
          pageSize: 8,
          q: query || undefined,
        });
        return page.items.map((customer) => ({
          value: customer.id,
          label: customer.name,
          description: customer.phone ?? undefined,
          row: {
            customer,
            balanceTnd: "0.000",
            advanceBalanceTnd: "0.000",
            openSaleCount: 0,
            openOrderCount: 0,
            openSales: [],
          },
        }));
      }
      const page = await listCustomerBalances({
        page: 1,
        pageSize: 8,
        q: query || undefined,
      });

      return page.items
        .filter((row) => row.customer.isActive)
        .map((row) => ({
          value: row.customer.id,
          label: row.customer.name,
          description:
            [
              row.customer.phone,
              Number(row.balanceTnd) > 0
                ? `reste à payer ${formatMoney(row.balanceTnd)}`
                : null,
              Number(row.advanceBalanceTnd) > 0
                ? `avance ${formatMoney(row.advanceBalanceTnd)}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Aucun solde",
          row,
        }));
    },
    [withBalances],
  );

  return (
    <Combobox<CustomerOption>
      id={id}
      aria-label={rest["aria-label"]}
      loadOptions={loadOptions}
      value={
        value ? { ...value, row: null as unknown as CustomerBalanceRow } : null
      }
      onChange={(option) =>
        onChange(
          option ? { value: option.value, label: option.label } : null,
          option?.row ?? null,
        )
      }
      placeholder={placeholder}
      emptyText="Aucun client"
      disabled={disabled}
      invalid={invalid}
    />
  );
}

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { AllocationTable } from "../../../components/patterns/AllocationTable/AllocationTable.js";
import { FormDialog } from "../../../components/patterns/FormDialog/FormDialog.js";
import { PaymentBox } from "../../../components/patterns/PaymentBox/PaymentBox.js";
import { DateInput } from "../../../components/ui/DateInput/DateInput.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { Switch } from "../../../components/ui/Switch/Switch.js";
import { TextArea } from "../../../components/ui/TextArea/TextArea.js";
import { TextInput } from "../../../components/ui/TextInput/TextInput.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { createIdempotencyKey } from "../../../lib/api/idempotency.js";
import {
  formatDate,
  formatMoney,
  toBusinessDate,
} from "../../../i18n/format.js";
import { useCurrentSession } from "../../pos/pos.queries.js";
import type { CustomerPayment } from "../customers.api.js";
import {
  useCreateCustomerPayment,
  useCustomerStatementPages,
} from "../customers.queries.js";
import {
  customerPaymentSchema,
  type CustomerPaymentFormInput,
  type CustomerPaymentFormOutput,
} from "../customers.schemas.js";
import { CustomerCombobox } from "./CustomerCombobox.js";

export interface CustomerPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// Preselected from the customer detail; the picker is then hidden.
  customer?: { id: string; name: string } | null;
  onSaved?: (payment: CustomerPayment) => void;
}

function defaultsFor(
  customer: { id: string; name: string } | null | undefined,
): CustomerPaymentFormInput {
  return {
    customer: customer ? { value: customer.id, label: customer.name } : null,
    paidAt: toBusinessDate(new Date()),
    amountTnd: "",
    reference: "",
    notes: "",
    collectedAtPos: false,
    balanceTnd: "0",
    allocations: [],
  };
}

/// "Encaisser un règlement" (07 section 4.4, AS-013): amount against the
/// receivable, an "Encaissé à la caisse" switch only while a till is open,
/// and one allocation input per open sale. Posted once with a key kept for
/// the dialog's lifetime.
export function CustomerPaymentDialog({
  open,
  onOpenChange,
  customer = null,
  onSaved,
}: CustomerPaymentDialogProps) {
  const toast = useToast();
  const create = useCreateCustomerPayment();
  const session = useCurrentSession({ enabled: open });
  const keyRef = useRef<string | null>(null);
  const form = useForm<
    CustomerPaymentFormInput,
    unknown,
    CustomerPaymentFormOutput
  >({
    resolver: zodResolver(customerPaymentSchema),
    defaultValues: defaultsFor(customer),
  });
  const errors = form.formState.errors;
  const picked = form.watch("customer");
  const amountTnd = form.watch("amountTnd") ?? "";
  const allocations = form.watch("allocations") ?? [];
  const customerId = picked?.value ?? "";
  // The statement gives the receivable and every open sale with its balance.
  const statement = useCustomerStatementPages(customerId, {});
  const first = statement.data?.pages[0];

  useEffect(() => {
    if (open) {
      keyRef.current = createIdempotencyKey();
      form.reset(defaultsFor(customer));
    }
  }, [open, customer, form]);

  useEffect(() => {
    if (!open || !first) return;
    const current = form.getValues("allocations") ?? [];
    const next = first.sales
      .filter((sale) => Number(sale.balanceTnd) > 0)
      .map((sale) => ({
        saleId: sale.id,
        reference: sale.reference,
        soldAt: sale.soldAt,
        balanceTnd: sale.balanceTnd,
        amountTnd:
          current.find((row) => row.saleId === sale.id)?.amountTnd ?? "",
      }));
    form.setValue("balanceTnd", first.balanceTnd);
    if (JSON.stringify(next) !== JSON.stringify(current))
      form.setValue("allocations", next);
  }, [open, first, form]);

  const allocationErrors: Record<string, string | undefined> = {};
  const list = errors.allocations as unknown as
    | (Array<{ amountTnd?: { message?: string } }> & {
        message?: string;
        root?: { message?: string };
      })
    | undefined;
  list?.forEach?.((row, index) => {
    if (row?.amountTnd?.message)
      allocationErrors[`allocations.${index}.amountTnd`] =
        row.amountTnd.message;
  });
  if (list?.message ?? list?.root?.message)
    allocationErrors.allocations = list?.message ?? list?.root?.message;

  const submit = async (values: CustomerPaymentFormOutput) => {
    if (!values.customer) return;
    const payment = await create.mutateAsync({
      idempotencyKey: keyRef.current ?? createIdempotencyKey(),
      body: {
        customerId: values.customer.value,
        paidAt: values.paidAt,
        amountTnd: values.amountTnd,
        reference: values.reference || undefined,
        notes: values.notes || undefined,
        collectedAtPos: values.collectedAtPos || undefined,
        allocations: values.allocations
          .filter(
            (row) =>
              row.amountTnd.trim() !== "" &&
              Number(row.amountTnd.replace(",", ".")) > 0,
          )
          .map((row) => ({
            saleId: row.saleId,
            amountTnd: row.amountTnd.replace(",", "."),
          })),
      },
    });
    toast.success(
      "Règlement enregistré",
      `${payment.customer.name} : ${formatMoney(payment.amountTnd)}.`,
    );
    onSaved?.(payment);
    onOpenChange(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Encaisser un règlement"
      description={
        customer
          ? `Règlement de ${customer.name}.`
          : "Enregistre un règlement reçu d'un client et l'affecte à ses ventes à crédit."
      }
      size="lg"
      form={form}
      onSubmit={submit}
      submitLabel="Enregistrer le règlement"
    >
      {!customer ? (
        <FormField label="Client" error={errors.customer?.message} required>
          <Controller
            control={form.control}
            name="customer"
            render={({ field }) => (
              <CustomerCombobox
                value={field.value ?? null}
                onChange={(option) => field.onChange(option)}
                invalid={Boolean(errors.customer)}
              />
            )}
          />
        </FormField>
      ) : null}
      <FormField
        label="Date du règlement"
        error={errors.paidAt?.message}
        required
      >
        <Controller
          control={form.control}
          name="paidAt"
          render={({ field }) => (
            <DateInput value={field.value ?? ""} onChange={field.onChange} />
          )}
        />
      </FormField>
      <Controller
        control={form.control}
        name="amountTnd"
        render={({ field }) => (
          <PaymentBox
            dueTnd={first?.balanceTnd ?? "0"}
            amountTnd={field.value ?? ""}
            onAmountChange={field.onChange}
            error={errors.amountTnd?.message}
          />
        )}
      />
      {session.data ? (
        <Controller
          control={form.control}
          name="collectedAtPos"
          render={({ field }) => (
            <Switch
              label="Encaissé à la caisse"
              description="Le montant sera compté dans la caisse ouverte."
              checked={field.value ?? false}
              onCheckedChange={field.onChange}
            />
          )}
        />
      ) : null}
      <FormField
        label="Référence"
        error={errors.reference?.message}
        hint="Numéro de reçu, facultatif."
      >
        <TextInput {...form.register("reference")} />
      </FormField>
      <FormField label="Notes" error={errors.notes?.message}>
        <TextArea {...form.register("notes")} rows={2} />
      </FormField>
      {customerId ? (
        <FormField
          label="Affectations"
          labelIsElement={false}
          hint="Répartissez le montant entre les ventes à crédit ; le reste restera non affecté."
        >
          <AllocationTable
            amountTnd={amountTnd}
            rows={allocations.map((row) => ({
              id: row.saleId,
              label: row.reference,
              meta: `vente du ${formatDate(row.soldAt)}`,
              balanceTnd: row.balanceTnd,
              amountTnd: row.amountTnd ?? "",
            }))}
            onChange={(next) =>
              form.setValue(
                "allocations",
                next.map((row, index) => ({
                  ...(allocations[index] as (typeof allocations)[number]),
                  amountTnd: row.amountTnd,
                })),
                { shouldValidate: form.formState.isSubmitted },
              )
            }
            errors={allocationErrors}
            emptyText="Aucune vente à crédit ouverte : le règlement restera non affecté."
          />
        </FormField>
      ) : null}
    </FormDialog>
  );
}

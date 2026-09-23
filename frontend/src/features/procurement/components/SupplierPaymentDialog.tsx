import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { FormDialog } from "../../../components/patterns/FormDialog/FormDialog.js";
import { PaymentBox } from "../../../components/patterns/PaymentBox/PaymentBox.js";
import { DateInput } from "../../../components/ui/DateInput/DateInput.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { TextArea } from "../../../components/ui/TextArea/TextArea.js";
import { TextInput } from "../../../components/ui/TextInput/TextInput.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { createIdempotencyKey } from "../../../lib/api/idempotency.js";
import {
  formatDate,
  formatMoney,
  toBusinessDate,
} from "../../../i18n/format.js";
import type { SupplierPayment } from "../procurement.api.js";
import {
  useCreateSupplierPayment,
  usePurchases,
  useSupplier,
} from "../procurement.queries.js";
import {
  supplierPaymentSchema,
  type SupplierPaymentFormInput,
  type SupplierPaymentFormOutput,
} from "../procurement.schemas.js";
import { AllocationTable } from "../../../components/patterns/AllocationTable/AllocationTable.js";
import { SupplierCombobox } from "./SupplierCombobox.js";

export interface SupplierPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// Preselected from the supplier detail; the picker is then hidden.
  supplier?: { id: string; name: string } | null;
  onSaved?: (payment: SupplierPayment) => void;
}

function defaultsFor(
  supplier: { id: string; name: string } | null | undefined,
): SupplierPaymentFormInput {
  return {
    supplier: supplier ? { value: supplier.id, label: supplier.name } : null,
    paidAt: toBusinessDate(new Date()),
    amountTnd: "",
    reference: "",
    notes: "",
    allocations: [],
  };
}

/// "Nouveau paiement" (07 section 4.3, AS-004): supplier, date, amount with
/// the amount owed and the remainder, then one allocation input per open
/// purchase. The command is posted once with an idempotency key.
export function SupplierPaymentDialog({
  open,
  onOpenChange,
  supplier = null,
  onSaved,
}: SupplierPaymentDialogProps) {
  const toast = useToast();
  const create = useCreateSupplierPayment();
  const keyRef = useRef<string | null>(null);
  const form = useForm<
    SupplierPaymentFormInput,
    unknown,
    SupplierPaymentFormOutput
  >({
    resolver: zodResolver(supplierPaymentSchema),
    defaultValues: defaultsFor(supplier),
  });
  const errors = form.formState.errors;
  const picked = form.watch("supplier");
  const amountTnd = form.watch("amountTnd") ?? "";
  const supplierId = picked?.value ?? "";
  const balance = useSupplier(supplierId, {
    enabled: open && supplierId !== "",
  });
  const openPurchases = usePurchases(
    {
      page: 1,
      pageSize: 50,
      supplierId,
      status: "POSTED",
      sort: { field: "dueDate", direction: "asc" },
    },
    { enabled: open && supplierId !== "" },
  );

  useEffect(() => {
    if (open) {
      keyRef.current = createIdempotencyKey();
      form.reset(defaultsFor(supplier));
    }
  }, [open, supplier, form]);

  // The allocation rows follow the picked supplier's open purchases; typed
  // amounts survive a refetch because rows are matched by purchase.
  const rows =
    openPurchases.data?.items.filter(
      (purchase) => Number(purchase.balanceTnd) > 0,
    ) ?? [];
  const allocations = form.watch("allocations") ?? [];
  useEffect(() => {
    if (!open || !openPurchases.data) return;
    const current = form.getValues("allocations") ?? [];
    const next = rows.map((purchase) => ({
      purchaseId: purchase.id,
      reference: purchase.reference,
      dueDate: purchase.dueDate,
      balanceTnd: purchase.balanceTnd,
      amountTnd:
        current.find((row) => row.purchaseId === purchase.id)?.amountTnd ?? "",
    }));
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      form.setValue("allocations", next);
    }
  }, [open, openPurchases.data]);

  const allocationErrors: Record<string, string | undefined> = {};
  const allocationErrorList = errors.allocations as unknown as
    | (Array<{ amountTnd?: { message?: string } }> & {
        message?: string;
        root?: { message?: string };
      })
    | undefined;
  allocationErrorList?.forEach?.((row, index) => {
    if (row?.amountTnd?.message)
      allocationErrors[`allocations.${index}.amountTnd`] =
        row.amountTnd.message;
  });
  if (allocationErrorList?.message ?? allocationErrorList?.root?.message) {
    allocationErrors.allocations =
      allocationErrorList?.message ?? allocationErrorList?.root?.message;
  }

  const submit = async (values: SupplierPaymentFormOutput) => {
    if (!values.supplier) return;
    const payment = await create.mutateAsync({
      idempotencyKey: keyRef.current ?? createIdempotencyKey(),
      body: {
        supplierId: values.supplier.value,
        paidAt: values.paidAt,
        amountTnd: values.amountTnd,
        reference: values.reference || undefined,
        notes: values.notes || undefined,
        allocations: values.allocations
          .filter(
            (row) =>
              row.amountTnd.trim() !== "" &&
              Number(row.amountTnd.replace(",", ".")) > 0,
          )
          .map((row) => ({
            purchaseId: row.purchaseId,
            amountTnd: row.amountTnd.replace(",", "."),
          })),
      },
    });
    toast.success(
      "Paiement enregistré",
      `${payment.supplier.name} : ${formatMoney(payment.amountTnd)}.`,
    );
    onSaved?.(payment);
    onOpenChange(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nouveau paiement"
      description={
        supplier
          ? `Paiement à ${supplier.name}.`
          : "Enregistre un paiement fait à un fournisseur et l'affecte à ses achats ouverts."
      }
      size="lg"
      form={form}
      onSubmit={submit}
      submitLabel="Enregistrer le paiement"
    >
      {!supplier ? (
        <FormField
          label="Fournisseur"
          error={errors.supplier?.message}
          required
        >
          <Controller
            control={form.control}
            name="supplier"
            render={({ field }) => (
              <SupplierCombobox
                value={field.value ?? null}
                onChange={(option) => field.onChange(option)}
                invalid={Boolean(errors.supplier)}
              />
            )}
          />
        </FormField>
      ) : null}
      <FormField
        label="Date du paiement"
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
            dueTnd={balance.data?.balanceTnd ?? "0"}
            amountTnd={field.value ?? ""}
            onAmountChange={field.onChange}
            error={errors.amountTnd?.message}
          />
        )}
      />
      <FormField
        label="Référence"
        error={errors.reference?.message}
        hint="Numéro de reçu ou de virement."
      >
        <TextInput {...form.register("reference")} />
      </FormField>
      <FormField label="Notes" error={errors.notes?.message}>
        <TextArea {...form.register("notes")} rows={2} />
      </FormField>
      {supplierId ? (
        <FormField
          label="Affectations"
          labelIsElement={false}
          hint="Répartissez le montant entre les achats ouverts ; le reste restera non affecté."
        >
          <AllocationTable
            amountTnd={amountTnd}
            rows={allocations.map((row) => ({
              id: row.purchaseId,
              label: row.reference ?? "Achat",
              meta: row.dueDate
                ? `échéance ${formatDate(row.dueDate)}`
                : undefined,
              balanceTnd: row.balanceTnd,
              amountTnd: row.amountTnd ?? "",
              overdue:
                rows.find((purchase) => purchase.id === row.purchaseId)
                  ?.paymentState === "OVERDUE",
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
          />
        </FormField>
      ) : null}
    </FormDialog>
  );
}

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { AllocationTable } from "../../../components/patterns/AllocationTable/AllocationTable.js";
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
import type { DistributorPayment } from "../distribution.api.js";
import {
  useCreateDistributorPayment,
  useDistributorStatementPages,
} from "../distribution.queries.js";
import {
  distributorPaymentSchema,
  type DistributorPaymentFormInput,
  type DistributorPaymentFormOutput,
} from "../distribution.schemas.js";
import { DistributorCombobox } from "./DistributorCombobox.js";

export interface DistributorPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  distributor?: { id: string; name: string } | null;
  onSaved?: (payment: DistributorPayment) => void;
}

function defaultsFor(
  distributor: { id: string; name: string } | null | undefined,
): DistributorPaymentFormInput {
  return {
    distributor: distributor
      ? { value: distributor.id, label: distributor.name }
      : null,
    paidAt: toBusinessDate(new Date()),
    amountTnd: "",
    reference: "",
    notes: "",
    balanceTnd: "0",
    allocations: [],
  };
}

/// Distributor payment (DST-025 to DST-027, AS-016): reduces the receivable,
/// never custody, never revenue; allocations to open direct sales and
/// settlements from the statement; one key per dialog open.
export function DistributorPaymentDialog({
  open,
  onOpenChange,
  distributor = null,
  onSaved,
}: DistributorPaymentDialogProps) {
  const toast = useToast();
  const create = useCreateDistributorPayment();
  const keyRef = useRef<string | null>(null);
  const form = useForm<
    DistributorPaymentFormInput,
    unknown,
    DistributorPaymentFormOutput
  >({
    resolver: zodResolver(distributorPaymentSchema),
    defaultValues: defaultsFor(distributor),
  });
  const errors = form.formState.errors;
  const picked = form.watch("distributor");
  const amountTnd = form.watch("amountTnd") ?? "";
  const allocations = form.watch("allocations") ?? [];
  const distributorId = picked?.value ?? "";
  const statement = useDistributorStatementPages(distributorId, {});
  const first = statement.data?.pages[0];

  useEffect(() => {
    if (open) {
      keyRef.current = createIdempotencyKey();
      form.reset(defaultsFor(distributor));
    }
  }, [open, distributor, form]);

  useEffect(() => {
    if (!open || !first) return;
    const current = form.getValues("allocations") ?? [];
    const next = [
      ...first.sales
        .filter((sale) => Number(sale.balanceTnd) > 0)
        .map((sale) => ({
          id: sale.id,
          kind: "sale" as const,
          reference: sale.reference,
          at: sale.soldAt,
          balanceTnd: sale.balanceTnd,
          amountTnd: current.find((row) => row.id === sale.id)?.amountTnd ?? "",
        })),
      ...first.settlements
        .filter((row) => Number(row.balanceTnd) > 0)
        .map((row) => ({
          id: row.id,
          kind: "settlement" as const,
          reference: row.reference,
          at: row.settledAt,
          balanceTnd: row.balanceTnd,
          amountTnd:
            current.find((candidate) => candidate.id === row.id)?.amountTnd ??
            "",
        })),
    ];
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

  const submit = async (values: DistributorPaymentFormOutput) => {
    if (!values.distributor) return;
    const payment = await create.mutateAsync({
      idempotencyKey: keyRef.current ?? createIdempotencyKey(),
      body: {
        distributorId: values.distributor.value,
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
            ...(row.kind === "sale"
              ? { saleId: row.id }
              : { settlementId: row.id }),
            amountTnd: row.amountTnd.replace(",", "."),
          })),
      },
    });
    toast.success(
      "Paiement enregistré",
      `${values.distributor.label} : ${formatMoney(payment.amountTnd)}.`,
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
        distributor
          ? `Paiement de ${distributor.name}.`
          : "Enregistre un paiement reçu d'un distributeur ; le dépôt-vente n'est pas modifié."
      }
      size="lg"
      form={form}
      onSubmit={submit}
      submitLabel="Enregistrer le paiement"
    >
      {!distributor ? (
        <FormField
          label="Distributeur"
          error={errors.distributor?.message}
          required
        >
          <Controller
            control={form.control}
            name="distributor"
            render={({ field }) => (
              <DistributorCombobox
                value={field.value ?? null}
                onChange={(option) => field.onChange(option)}
                invalid={Boolean(errors.distributor)}
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
            dueTnd={first?.balanceTnd ?? "0"}
            amountTnd={field.value ?? ""}
            onAmountChange={field.onChange}
            error={errors.amountTnd?.message}
          />
        )}
      />
      <FormField label="Référence" error={errors.reference?.message}>
        <TextInput {...form.register("reference")} />
      </FormField>
      <FormField label="Notes" error={errors.notes?.message}>
        <TextArea {...form.register("notes")} rows={2} />
      </FormField>
      {distributorId ? (
        <FormField
          label="Affectations"
          labelIsElement={false}
          hint="Répartissez le montant entre les ventes directes et les règlements ouverts."
        >
          <AllocationTable
            amountTnd={amountTnd}
            rows={allocations.map((row) => ({
              id: row.id,
              label: row.reference,
              meta: `${row.kind === "sale" ? "vente directe" : "règlement"} du ${formatDate(row.at)}`,
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
            emptyText="Aucun document ouvert : le paiement restera non affecté."
          />
        </FormField>
      ) : null}
    </FormDialog>
  );
}

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ConfirmPostingDialog } from "../../../components/patterns/ConfirmPostingDialog/ConfirmPostingDialog.js";
import { FormDialog } from "../../../components/patterns/FormDialog/FormDialog.js";
import {
  newLine,
  type EditorLine,
} from "../../../components/patterns/LineEditor/LineEditor.js";
import { PaymentBox } from "../../../components/patterns/PaymentBox/PaymentBox.js";
import { DateInput } from "../../../components/ui/DateInput/DateInput.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { TextArea } from "../../../components/ui/TextArea/TextArea.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { createIdempotencyKey } from "../../../lib/api/idempotency.js";
import {
  formatMoney,
  formatQuantity,
  toBusinessDate,
} from "../../../i18n/format.js";
import { fr } from "../../../i18n/fr.js";
import { OrderLineEditor } from "../../orders/components/OrderLineEditor.js";
import type { DistributorSale } from "../distribution.api.js";
import { usePostDirectSale } from "../distribution.queries.js";
import {
  directSaleSchema,
  safeDecimal,
  type DirectSaleFormInput,
  type DirectSaleFormOutput,
} from "../distribution.schemas.js";
import { DistributorCombobox } from "./DistributorCombobox.js";

export interface DirectSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  distributor?: { id: string; name: string } | null;
  onSold?: (sale: DistributorSale) => void;
}

function defaultsFor(
  distributor: { id: string; name: string } | null | undefined,
): DirectSaleFormInput {
  return {
    distributor: distributor
      ? { value: distributor.id, label: distributor.name }
      : null,
    soldAt: toBusinessDate(new Date()),
    notes: "",
    paidAmountTnd: "",
    lines: [newLine()],
  };
}

/// Direct distributor sale (DST-004 to DST-009): lines with a price entered
/// and snapshotted, a payment now, the rest as receivable; the form then
/// the posting confirmation with the impact, one key per intent.
export function DirectSaleDialog({
  open,
  onOpenChange,
  distributor = null,
  onSold,
}: DirectSaleDialogProps) {
  const toast = useToast();
  const post = usePostDirectSale();
  const keyRef = useRef<string | null>(null);
  const [pending, setPending] = useState<DirectSaleFormOutput | null>(null);
  const form = useForm<DirectSaleFormInput, unknown, DirectSaleFormOutput>({
    resolver: zodResolver(directSaleSchema),
    defaultValues: defaultsFor(distributor),
  });
  const errors = form.formState.errors;
  const lines = (form.watch("lines") ?? []) as EditorLine[];
  const total = lines
    .reduce(
      (sum, line) =>
        sum.plus(
          safeDecimal(line.quantity).times(safeDecimal(line.unitPriceTnd)),
        ),
      safeDecimal(0),
    )
    .toDecimalPlaces(3);

  useEffect(() => {
    if (open) {
      keyRef.current = createIdempotencyKey();
      form.reset(defaultsFor(distributor));
      setPending(null);
    }
  }, [open, distributor, form]);

  const lineErrors: Record<string, string | undefined> = {};
  const list = errors.lines as unknown as
    | (Array<{
        item?: { message?: string };
        quantity?: { message?: string };
        unitPriceTnd?: { message?: string };
      }> & { message?: string; root?: { message?: string } })
    | undefined;
  list?.forEach?.((row, index) => {
    if (row?.item?.message)
      lineErrors[`lines.${index}.productId`] = row.item.message;
    if (row?.quantity?.message)
      lineErrors[`lines.${index}.quantity`] = row.quantity.message;
    if (row?.unitPriceTnd?.message)
      lineErrors[`lines.${index}.unitPriceTnd`] = row.unitPriceTnd.message;
  });
  if (list?.message ?? list?.root?.message)
    lineErrors.lines = list?.message ?? list?.root?.message;

  const pendingTotal = pending
    ? pending.lines
        .reduce(
          (sum, line) =>
            sum.plus(
              safeDecimal(line.quantity).times(safeDecimal(line.unitPriceTnd)),
            ),
          safeDecimal(0),
        )
        .toDecimalPlaces(3)
    : safeDecimal(0);
  const pendingPaid = pending
    ? pending.paidAmountTnd.trim() === ""
      ? pendingTotal
      : safeDecimal(pending.paidAmountTnd)
    : safeDecimal(0);

  return (
    <>
      <FormDialog
        open={open && pending === null}
        onOpenChange={onOpenChange}
        title="Vente directe"
        description="Vend au distributeur des produits qui quittent le stock immédiatement ; le reste impayé devient une créance."
        size="lg"
        form={form}
        onSubmit={async (values) => setPending(values)}
        submitLabel={fr.next}
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
          label="Date de vente"
          error={errors.soldAt?.message}
          required
        >
          <Controller
            control={form.control}
            name="soldAt"
            render={({ field }) => (
              <DateInput value={field.value ?? ""} onChange={field.onChange} />
            )}
          />
        </FormField>
        <FormField label="Produits" labelIsElement={false} required>
          <Controller
            control={form.control}
            name="lines"
            render={({ field }) => (
              <OrderLineEditor
                lines={(field.value ?? []) as EditorLine[]}
                onChange={field.onChange}
                errors={lineErrors}
              />
            )}
          />
        </FormField>
        <Controller
          control={form.control}
          name="paidAmountTnd"
          render={({ field }) => (
            <PaymentBox
              dueTnd={total.toFixed(3)}
              amountTnd={field.value ?? ""}
              onAmountChange={field.onChange}
              error={errors.paidAmountTnd?.message}
            />
          )}
        />
        <FormField label="Notes" error={errors.notes?.message}>
          <TextArea {...form.register("notes")} rows={2} />
        </FormField>
      </FormDialog>
      {pending ? (
        <ConfirmPostingDialog
          open={open}
          title="Valider la vente directe"
          confirmLabel={fr.post}
          impact={
            <ul>
              <li>
                Stock principal :{" "}
                {pending.lines
                  .map(
                    (line) =>
                      `−${formatQuantity(line.quantity)} ${line.item?.label ?? ""}`,
                  )
                  .join(", ")}
                .
              </li>
              <li>
                Chiffre d'affaires reconnu maintenant :{" "}
                {formatMoney(pendingTotal.toFixed(3))}.
              </li>
              <li>Encaissé : {formatMoney(pendingPaid.toFixed(3))}.</li>
              {pendingTotal.minus(pendingPaid).greaterThan(0) ? (
                <li>
                  Créance sur {pending.distributor?.label} :{" "}
                  {formatMoney(pendingTotal.minus(pendingPaid).toFixed(3))}.
                </li>
              ) : (
                <li>Aucune créance.</li>
              )}
            </ul>
          }
          onPost={async () => {
            const sale = await post.mutateAsync({
              idempotencyKey: keyRef.current ?? createIdempotencyKey(),
              body: {
                distributorId: pending.distributor?.value ?? "",
                soldAt: pending.soldAt,
                paidAmountTnd: pendingPaid.toFixed(3),
                notes: pending.notes || undefined,
                lines: pending.lines.map((line) => ({
                  productId: line.item?.value ?? "",
                  quantity: line.quantity,
                  unitPriceTnd: line.unitPriceTnd,
                })),
              },
            });
            toast.success(
              "Vente directe enregistrée",
              `${sale.reference} · ${formatMoney(sale.totalTnd)}.`,
            );
            onSold?.(sale);
            onOpenChange(false);
          }}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </>
  );
}

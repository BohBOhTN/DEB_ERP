import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { FormDialog } from "../../../components/patterns/FormDialog/FormDialog.js";
import { PaymentBox } from "../../../components/patterns/PaymentBox/PaymentBox.js";
import { DateInput } from "../../../components/ui/DateInput/DateInput.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { TextArea } from "../../../components/ui/TextArea/TextArea.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { createIdempotencyKey } from "../../../lib/api/idempotency.js";
import { formatMoney, toBusinessDate } from "../../../i18n/format.js";
import { useCurrentSession } from "../../pos/pos.queries.js";
import type { Order } from "../orders.api.js";
import { useRecordAdvance } from "../orders.queries.js";
import {
  advanceSchema,
  type AdvanceFormInput,
  type AdvanceFormOutput,
} from "../orders.schemas.js";
import { remainingOf } from "./orderLabels.js";

export interface AdvanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order;
}

/// The instant a deposit dated by day was taken: now when it is today,
/// midday in Tunis otherwise, so the list never shows it at 01:00.
function paidAtInstant(day: string): string {
  return day === toBusinessDate(new Date())
    ? new Date().toISOString()
    : new Date(`${day}T12:00:00+01:00`).toISOString();
}

/// "Encaisser un acompte" (ORD-008, ORD-009, ORD-016): cash taken at the
/// open till before fulfilment, capped by what remains of the total, never
/// revenue. One idempotency key per dialog open.
export function AdvanceDialog({
  open,
  onOpenChange,
  order,
}: AdvanceDialogProps) {
  const toast = useToast();
  const record = useRecordAdvance();
  const session = useCurrentSession({ enabled: open });
  const keyRef = useRef<string | null>(null);
  const form = useForm<AdvanceFormInput, unknown, AdvanceFormOutput>({
    resolver: zodResolver(advanceSchema),
    defaultValues: {
      amountTnd: "",
      paidAt: toBusinessDate(new Date()),
      notes: "",
      remainingTnd: remainingOf(order),
    },
  });
  const errors = form.formState.errors;

  useEffect(() => {
    if (open) {
      keyRef.current = createIdempotencyKey();
      form.reset({
        amountTnd: "",
        paidAt: toBusinessDate(new Date()),
        notes: "",
        remainingTnd: remainingOf(order),
      });
    }
  }, [open, form, order]);

  const submit = async (values: AdvanceFormOutput) => {
    const result = await record.mutateAsync({
      orderId: order.id,
      body: {
        amountTnd: values.amountTnd,
        paidAt: paidAtInstant(values.paidAt),
        notes: values.notes || undefined,
      },
      idempotencyKey: keyRef.current ?? createIdempotencyKey(),
    });
    toast.success(
      "Acompte encaissé",
      `${formatMoney(result.advance.amountTnd)} sur ${order.reference}.`,
    );
    onOpenChange(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Encaisser un acompte"
      description={
        session.data === null
          ? "Ouvrez la caisse pour encaisser un acompte : l'argent entre dans la caisse ouverte."
          : "L'acompte est compté dans la caisse ouverte et reste une avance client jusqu'à la remise de la commande."
      }
      form={form}
      onSubmit={submit}
      submitLabel="Encaisser"
    >
      <Controller
        control={form.control}
        name="amountTnd"
        render={({ field }) => (
          <PaymentBox
            dueTnd={remainingOf(order)}
            dueLabel="Reste à verser"
            settleLabel="Verser le reste"
            remainingLabel="Reste après cet acompte"
            presets={false}
            amountTnd={field.value ?? ""}
            onAmountChange={field.onChange}
            error={errors.amountTnd?.message}
            disabled={session.data === null}
          />
        )}
      />
      <FormField label="Date" error={errors.paidAt?.message} required>
        <Controller
          control={form.control}
          name="paidAt"
          render={({ field }) => (
            <DateInput value={field.value ?? ""} onChange={field.onChange} />
          )}
        />
      </FormField>
      <FormField label="Notes" error={errors.notes?.message}>
        <TextArea {...form.register("notes")} rows={2} />
      </FormField>
    </FormDialog>
  );
}

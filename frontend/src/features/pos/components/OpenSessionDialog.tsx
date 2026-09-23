import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { FormDialog } from "../../../components/patterns/FormDialog/FormDialog.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { MoneyInput } from "../../../components/ui/MoneyInput/MoneyInput.js";
import { TextArea } from "../../../components/ui/TextArea/TextArea.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { createIdempotencyKey } from "../../../lib/api/idempotency.js";
import { optionalString, tnd } from "../../../lib/forms/schemas.js";
import { formatMoney } from "../../../i18n/format.js";
import { useOpenSession } from "../pos.queries.js";

const schema = z.object({ openingCashTnd: tnd(), notes: optionalString(300) });
type Input = z.input<typeof schema>;
type Output = z.output<typeof schema>;

export interface OpenSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/// "Ouvrir la caisse" (POS-005): the opening cash float, posted once with
/// a key per dialog open; a second open attempt is refused by the server.
export function OpenSessionDialog({
  open,
  onOpenChange,
}: OpenSessionDialogProps) {
  const toast = useToast();
  const openSession = useOpenSession();
  const keyRef = useRef<string | null>(null);
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(schema),
    defaultValues: { openingCashTnd: "", notes: "" },
  });
  const errors = form.formState.errors;

  useEffect(() => {
    if (open) {
      keyRef.current = createIdempotencyKey();
      form.reset({ openingCashTnd: "", notes: "" });
    }
  }, [open, form]);

  const submit = async (values: Output) => {
    const session = await openSession.mutateAsync({
      body: {
        openingCashTnd: values.openingCashTnd,
        notes: values.notes || undefined,
      },
      idempotencyKey: keyRef.current ?? createIdempotencyKey(),
    });
    toast.success(
      "Caisse ouverte",
      `Fonds de caisse ${formatMoney(session.openingCashTnd)}.`,
    );
    onOpenChange(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Ouvrir la caisse"
      description="Comptez les espèces présentes dans le tiroir avant la première vente."
      form={form}
      onSubmit={submit}
      submitLabel="Ouvrir la caisse"
    >
      <FormField
        label="Fonds de caisse"
        error={errors.openingCashTnd?.message}
        required
      >
        <Controller
          control={form.control}
          name="openingCashTnd"
          render={({ field }) => (
            <MoneyInput
              value={field.value ?? ""}
              onChange={field.onChange}
              invalid={Boolean(errors.openingCashTnd)}
            />
          )}
        />
      </FormField>
      <FormField label="Notes" error={errors.notes?.message}>
        <TextArea {...form.register("notes")} rows={2} />
      </FormField>
    </FormDialog>
  );
}

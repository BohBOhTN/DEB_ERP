import { zodResolver } from "@hookform/resolvers/zod";
import Decimal from "decimal.js-light";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ConfirmPostingDialog } from "../../../components/patterns/ConfirmPostingDialog/ConfirmPostingDialog.js";
import { FormDialog } from "../../../components/patterns/FormDialog/FormDialog.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { QuantityInput } from "../../../components/ui/QuantityInput/QuantityInput.js";
import { SegmentedControl } from "../../../components/ui/SegmentedControl/SegmentedControl.js";
import { TextArea } from "../../../components/ui/TextArea/TextArea.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { formatQuantity } from "../../../i18n/format.js";
import { fr } from "../../../i18n/fr.js";
import type { InventoryMovement } from "../inventory.api.js";
import {
  usePostAdjustment,
  usePostOpeningStock,
} from "../inventory.queries.js";
import {
  movementSchema,
  type MovementFormInput,
  type MovementFormOutput,
  type PickedItem,
} from "../inventory.schemas.js";
import { ItemCombobox } from "./ItemCombobox.js";

export interface StockMovementDialogProps {
  kind: "opening" | "adjustment";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// Preselected item when opened from a detail page.
  item?: PickedItem | null;
}

interface Pending {
  item: PickedItem;
  delta: Decimal;
  reason: string;
}

/// Opening stock and adjustments (07 section 4.2): the form collects the
/// item, the quantity and the reason; the confirmation states the impact
/// ("passera de X à Y") and posts once with an idempotency key.
export function StockMovementDialog({
  kind,
  open,
  onOpenChange,
  item = null,
}: StockMovementDialogProps) {
  const toast = useToast();
  const openingStock = usePostOpeningStock();
  const adjustment = usePostAdjustment();
  const [pending, setPending] = useState<Pending | null>(null);
  const [posted, setPosted] = useState<InventoryMovement | null>(null);
  const isOpening = kind === "opening";
  const defaults = (): MovementFormInput => ({
    item,
    direction: isOpening ? undefined : "OUT",
    quantity: "",
    reason: "",
  });
  const form = useForm<MovementFormInput, unknown, MovementFormOutput>({
    resolver: zodResolver(movementSchema(kind)),
    defaultValues: defaults(),
  });
  const errors = form.formState.errors;
  const pickedItem = form.watch("item");

  const close = () => {
    onOpenChange(false);
    form.reset(defaults());
    setPending(null);
    setPosted(null);
  };

  const submit = async (values: MovementFormOutput) => {
    if (!values.item) {
      return;
    }

    const delta =
      values.direction === "OUT"
        ? new Decimal(values.quantity).negated()
        : new Decimal(values.quantity);
    setPending({ item: values.item, delta, reason: values.reason });
  };

  const before = pending
    ? new Decimal(pending.item.currentQuantity)
    : new Decimal(0);
  const after = pending ? before.plus(pending.delta) : new Decimal(0);
  const title = isOpening ? "Stock d'ouverture" : "Ajustement de stock";

  return (
    <>
      <FormDialog
        open={open && pending === null}
        onOpenChange={(next) => (!next ? close() : onOpenChange(next))}
        title={title}
        description={
          isOpening
            ? "Enregistre la quantité comptée pour un article qui n'a pas encore de stock."
            : "Corrige le stock d'un article après un comptage, une casse ou une perte."
        }
        form={form}
        onSubmit={submit}
        submitLabel={fr.next}
      >
        <FormField label="Article" error={errors.item?.message} required>
          <Controller
            control={form.control}
            name="item"
            render={({ field }) => (
              <ItemCombobox
                value={field.value ?? null}
                onChange={field.onChange}
                invalid={Boolean(errors.item)}
              />
            )}
          />
        </FormField>
        {!isOpening ? (
          <FormField
            label="Sens"
            error={errors.direction?.message}
            required
            labelIsElement={false}
          >
            <Controller
              control={form.control}
              name="direction"
              render={({ field }) => (
                <SegmentedControl
                  label="Sens"
                  fullWidth
                  value={field.value ?? "OUT"}
                  onValueChange={field.onChange}
                  options={[
                    { value: "IN", label: "Entrée" },
                    { value: "OUT", label: "Sortie" },
                  ]}
                />
              )}
            />
          </FormField>
        ) : null}
        <FormField
          label={fr.quantity}
          error={errors.quantity?.message}
          required
          hint={pickedItem ? `Unité : ${pickedItem.unitSymbol}` : undefined}
        >
          <Controller
            control={form.control}
            name="quantity"
            render={({ field }) => (
              <QuantityInput
                value={field.value ?? ""}
                onChange={field.onChange}
                unit={pickedItem?.unitSymbol}
                invalid={Boolean(errors.quantity)}
              />
            )}
          />
        </FormField>
        <FormField
          label={fr.reason}
          error={errors.reason?.message}
          hint="5 à 300 caractères"
          required
        >
          <TextArea
            {...form.register("reason")}
            placeholder={
              isOpening ? "Inventaire initial" : "Casse, perte, comptage…"
            }
          />
        </FormField>
      </FormDialog>
      {pending ? (
        <ConfirmPostingDialog
          open={open && posted === null}
          title={title}
          confirmLabel={fr.post}
          impact={
            <ul>
              <li>
                Le stock de {pending.item.label} passera de{" "}
                {formatQuantity(before.toString(), pending.item.unitSymbol)} à{" "}
                {formatQuantity(after.toString(), pending.item.unitSymbol)}.
              </li>
              {after.lessThan(0) ? (
                <li>
                  Le stock deviendra négatif et sera signalé sur l'écran Stock.
                </li>
              ) : null}
              <li>
                Un mouvement «{" "}
                {isOpening
                  ? "Stock d'ouverture"
                  : pending.delta.isNegative()
                    ? "Ajustement (sortie)"
                    : "Ajustement (entrée)"}{" "}
                » sera journalisé avec le motif.
              </li>
            </ul>
          }
          onPost={async (idempotencyKey) => {
            const base = {
              itemType: pending.item.itemType,
              itemId: pending.item.itemId,
              reason: pending.reason,
            };
            const movement = isOpening
              ? await openingStock.mutateAsync({
                  body: { ...base, quantity: pending.delta.toString() },
                  idempotencyKey,
                })
              : await adjustment.mutateAsync({
                  body: { ...base, quantityDelta: pending.delta.toString() },
                  idempotencyKey,
                });
            setPosted(movement);
          }}
          onPosted={() => {
            toast.success(
              isOpening
                ? "Stock d'ouverture enregistré"
                : "Ajustement enregistré",
              `${pending.item.label} : ${formatQuantity(after.toString(), pending.item.unitSymbol)} en stock.`,
            );
            close();
          }}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </>
  );
}

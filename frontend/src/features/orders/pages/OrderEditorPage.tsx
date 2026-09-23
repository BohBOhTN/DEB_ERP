import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  newLine,
  type EditorLine,
} from "../../../components/patterns/LineEditor/LineEditor.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { TotalsCard } from "../../../components/patterns/TotalsCard/TotalsCard.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { DateTimeInput } from "../../../components/ui/DateTimeInput/DateTimeInput.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { MoneyInput } from "../../../components/ui/MoneyInput/MoneyInput.js";
import { TextArea } from "../../../components/ui/TextArea/TextArea.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { ApiError } from "../../../lib/api/errors.js";
import { createIdempotencyKey } from "../../../lib/api/idempotency.js";
import { applyFieldErrors } from "../../../lib/forms/applyFieldErrors.js";
import { describeError } from "../../../i18n/errors.js";
import { formatMoney } from "../../../i18n/format.js";
import { CustomerCombobox } from "../../customers/components/CustomerCombobox.js";
import { useCurrentSession } from "../../pos/pos.queries.js";
import { useCreateOrder, useRecordAdvance } from "../orders.queries.js";
import {
  orderSchema,
  orderTotal,
  safeDecimal,
  type OrderFormInput,
  type OrderFormOutput,
} from "../orders.schemas.js";
import { OrderLineEditor } from "../components/OrderLineEditor.js";
import styles from "./OrderPages.module.css";

function tomorrowAtNine(): string {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T09:00`;
}

/// `/commandes/nouvelle` (UI-14, AS-009): customer, fulfilment time in the
/// future, product lines, notes, and an optional advance taken at the open
/// till in the same flow. Two idempotency keys, one per command.
export function OrderEditorPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const session = useCurrentSession();
  const create = useCreateOrder();
  const advance = useRecordAdvance();
  const keys = useRef({
    order: createIdempotencyKey(),
    advance: createIdempotencyKey(),
  });
  const [summary, setSummary] = useState<{
    title: string;
    description: string;
  } | null>(null);
  const presetCustomer = params.get("customerId");
  const form = useForm<OrderFormInput, unknown, OrderFormOutput>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      customer: presetCustomer
        ? {
            value: presetCustomer,
            label: params.get("customerName") ?? "Client",
          }
        : null,
      requestedFulfillmentAt: tomorrowAtNine(),
      notes: "",
      lines: [newLine()],
      advanceTnd: "",
    },
  });
  const errors = form.formState.errors;
  const lines = (form.watch("lines") ?? []) as EditorLine[];
  const advanceTnd = form.watch("advanceTnd") ?? "";
  const total = orderTotal(lines);
  const busy = form.formState.isSubmitting;

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

  const submit = form.handleSubmit(async (values) => {
    setSummary(null);
    try {
      const order = await create.mutateAsync({
        idempotencyKey: keys.current.order,
        body: {
          customerId: values.customer?.value ?? "",
          requestedFulfillmentAt: new Date(
            values.requestedFulfillmentAt,
          ).toISOString(),
          notes: values.notes || undefined,
          lines: values.lines.map((line) => ({
            productId: line.item?.value ?? "",
            quantity: line.quantity,
          })),
        },
      });
      const advanceAmount = safeDecimal(values.advanceTnd);
      if (advanceAmount.greaterThan(0)) {
        await advance.mutateAsync({
          orderId: order.id,
          body: {
            amountTnd: advanceAmount.toFixed(3),
            paidAt: new Date().toISOString(),
          },
          idempotencyKey: keys.current.advance,
        });
        toast.success(
          "Commande enregistrée",
          `${order.reference} · acompte de ${formatMoney(advanceAmount.toFixed(3))} encaissé.`,
        );
      } else {
        toast.success("Commande enregistrée", order.reference);
      }
      navigate(`/commandes/${order.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.isValidation) {
        const unknown = applyFieldErrors(form.setError, error.fieldErrors);
        if (unknown.length > 0)
          setSummary({
            title: "Le formulaire contient des erreurs",
            description: unknown.join(" "),
          });
        return;
      }
      setSummary(describeError(error));
    }
  });

  return (
    <>
      <PageHeader
        eyebrow="Ventes"
        title="Nouvelle commande"
        breadcrumbs={[
          { label: "Commandes", href: "/commandes" },
          { label: "Nouvelle commande" },
        ]}
      />
      <form
        className={styles.editor}
        noValidate
        onSubmit={(event) => event.preventDefault()}
      >
        <div className={styles.editorMain}>
          {summary ? (
            <div role="alert" className={styles.muted}>
              <strong>{summary.title}</strong> {summary.description}
            </div>
          ) : null}
          <Card>
            <CardHeader as="h2" title="Commande" />
            <div className={styles.formGrid}>
              <FormField
                label="Client"
                error={errors.customer?.message}
                required
              >
                <Controller
                  control={form.control}
                  name="customer"
                  render={({ field }) => (
                    <CustomerCombobox
                      value={field.value ?? null}
                      onChange={(option) => field.onChange(option)}
                      invalid={Boolean(errors.customer)}
                      disabled={busy}
                    />
                  )}
                />
              </FormField>
              <FormField
                label="Retrait le"
                error={errors.requestedFulfillmentAt?.message}
                required
              >
                <Controller
                  control={form.control}
                  name="requestedFulfillmentAt"
                  render={({ field }) => (
                    <DateTimeInput
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      disabled={busy}
                      invalid={Boolean(errors.requestedFulfillmentAt)}
                    />
                  )}
                />
              </FormField>
            </div>
            <FormField label="Notes" error={errors.notes?.message}>
              <TextArea {...form.register("notes")} rows={2} disabled={busy} />
            </FormField>
          </Card>
          <Card>
            <CardHeader as="h2" title="Produits" />
            <Controller
              control={form.control}
              name="lines"
              render={({ field }) => (
                <OrderLineEditor
                  lines={(field.value ?? []) as EditorLine[]}
                  onChange={field.onChange}
                  errors={lineErrors}
                  disabled={busy}
                />
              )}
            />
          </Card>
        </div>
        <aside className={styles.editorSide} aria-label="Totaux">
          <Card>
            <TotalsCard
              totalTnd={total.toFixed(3)}
              paidTnd={safeDecimal(advanceTnd).toFixed(3)}
              remainingTnd={
                total.minus(safeDecimal(advanceTnd)).greaterThan(0)
                  ? total.minus(safeDecimal(advanceTnd)).toFixed(3)
                  : "0"
              }
              provisional
            />
            {session.data ? (
              <FormField
                label="Acompte"
                error={errors.advanceTnd?.message}
                hint="Encaissé maintenant dans la caisse ouverte, facultatif."
              >
                <Controller
                  control={form.control}
                  name="advanceTnd"
                  render={({ field }) => (
                    <MoneyInput
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      disabled={busy}
                      invalid={Boolean(errors.advanceTnd)}
                    />
                  )}
                />
              </FormField>
            ) : (
              <p className={styles.muted}>
                Ouvrez la caisse pour encaisser un acompte.
              </p>
            )}
          </Card>
          <div className={styles.editorFooter}>
            <Button
              variant="secondary"
              onClick={() => navigate("/commandes")}
              disabled={busy}
            >
              Annuler
            </Button>
            <Button onClick={() => void submit()} loading={busy}>
              Enregistrer la commande
            </Button>
          </div>
        </aside>
      </form>
    </>
  );
}

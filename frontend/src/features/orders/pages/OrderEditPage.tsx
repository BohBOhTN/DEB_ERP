import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import {
  newLine,
  type EditorLine,
} from "../../../components/patterns/LineEditor/LineEditor.js";
import { KeyValueList } from "../../../components/patterns/KeyValueList/KeyValueList.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { TotalsCard } from "../../../components/patterns/TotalsCard/TotalsCard.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { DateTimeInput } from "../../../components/ui/DateTimeInput/DateTimeInput.js";
import { ErrorState } from "../../../components/ui/ErrorState/ErrorState.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { Skeleton } from "../../../components/ui/Skeleton/Skeleton.js";
import { TextArea } from "../../../components/ui/TextArea/TextArea.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { ApiError } from "../../../lib/api/errors.js";
import { applyFieldErrors } from "../../../lib/forms/applyFieldErrors.js";
import { describeError } from "../../../i18n/errors.js";
import { formatMoney } from "../../../i18n/format.js";
import type { Order } from "../orders.api.js";
import { useOrder, useUpdateOrder } from "../orders.queries.js";
import {
  orderEditSchema,
  orderTotal,
  type OrderEditInput,
  type OrderEditOutput,
} from "../orders.schemas.js";
import { editableOrderStatuses } from "../components/orderLabels.js";
import { OrderLineEditor } from "../components/OrderLineEditor.js";
import styles from "./OrderPages.module.css";

/// The editor's lines from the order's: the price shown is the one agreed
/// on the order until the lines are changed.
function linesOf(order: Order): EditorLine[] {
  return (order.lines ?? []).map((line) => ({
    ...newLine(),
    item: { value: line.productId, label: line.productNameSnapshot },
    quantity: trimZeros(line.quantity),
    unitId: line.unitId,
    unitPriceTnd: line.unitPriceTnd,
  }));
}

function trimZeros(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

/// The same products in the same quantities: nothing to send for the lines.
function sameLines(order: Order, lines: OrderEditOutput["lines"]): boolean {
  const before = (order.lines ?? [])
    .map((line) => `${line.productId}:${Number(line.quantity)}`)
    .sort();
  const after = lines
    .map((line) => `${line.item?.value ?? ""}:${Number(line.quantity)}`)
    .sort();

  return before.join("|") === after.join("|");
}

/// `/commandes/:id/modifier` (issue 015, ORD-002): the pickup time, the
/// notes and the lines of a draft or confirmed order. The customer and the
/// deposits are not edited here. Lines are sent only when they changed,
/// because the server prices changed lines again from the catalogue.
export function OrderEditPage() {
  const { orderId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const query = useOrder(orderId);
  const update = useUpdateOrder();
  const [loadedVersion, setLoadedVersion] = useState<number | null>(null);
  const [summary, setSummary] = useState<{
    title: string;
    description: string;
  } | null>(null);
  const form = useForm<OrderEditInput, unknown, OrderEditOutput>({
    resolver: zodResolver(orderEditSchema),
    defaultValues: { requestedFulfillmentAt: "", notes: "", lines: [] },
  });
  const order = query.data;

  useEffect(() => {
    if (!order || loadedVersion === order.version) return;
    form.reset({
      // The browser's own time zone, as the creation form reads it back.
      requestedFulfillmentAt: format(
        new Date(order.requestedFulfillmentAt),
        "yyyy-MM-dd'T'HH:mm",
      ),
      notes: order.notes ?? "",
      lines: linesOf(order),
    });
    setLoadedVersion(order.version);
  }, [order, loadedVersion, form]);

  if (query.isError) {
    const copy = describeError(query.error);
    return (
      <ErrorState
        title={copy.title}
        description={copy.description}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (!order || loadedVersion === null) {
    return <Skeleton variant="table" rows={6} />;
  }

  if (!editableOrderStatuses.includes(order.status)) {
    return (
      <ErrorState
        title="Commande non modifiable"
        description="Seule une commande en brouillon ou confirmée peut être modifiée."
        action={
          <Button onClick={() => navigate(`/commandes/${order.id}`)}>
            Voir la commande
          </Button>
        }
      />
    );
  }

  const errors = form.formState.errors;
  const lines = (form.watch("lines") ?? []) as EditorLine[];
  const total = orderTotal(lines);
  const held = order.advanceBalanceTnd;
  const busy = form.formState.isSubmitting;
  const lineErrors: Record<string, string | undefined> = {};
  const list = errors.lines as unknown as
    | (Array<{
        item?: { message?: string };
        quantity?: { message?: string };
      }> & { message?: string; root?: { message?: string } })
    | undefined;
  list?.forEach?.((row, index) => {
    if (row?.item?.message)
      lineErrors[`lines.${index}.productId`] = row.item.message;
    if (row?.quantity?.message)
      lineErrors[`lines.${index}.quantity`] = row.quantity.message;
  });
  if (list?.message ?? list?.root?.message)
    lineErrors.lines = list?.message ?? list?.root?.message;

  const submit = form.handleSubmit(async (values) => {
    setSummary(null);
    if (total.lessThan(held)) {
      form.setError("lines", {
        message: `Le total ne peut pas descendre sous l'acompte déjà versé (${formatMoney(held)}).`,
      });
      return;
    }
    try {
      const saved = await update.mutateAsync({
        orderId: order.id,
        body: {
          version: order.version,
          requestedFulfillmentAt: new Date(
            values.requestedFulfillmentAt,
          ).toISOString(),
          notes: values.notes ?? "",
          ...(sameLines(order, values.lines)
            ? {}
            : {
                lines: values.lines.map((line) => ({
                  productId: line.item?.value ?? "",
                  quantity: line.quantity,
                })),
              }),
        },
      });
      toast.success("Commande modifiée", saved.reference);
      navigate(`/commandes/${saved.id}`);
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
        title={`Modifier ${order.reference}`}
        breadcrumbs={[
          { label: "Commandes", href: "/commandes" },
          { label: order.reference, href: `/commandes/${order.id}` },
          { label: "Modifier" },
        ]}
      />
      <form
        className={styles.editor}
        noValidate
        onSubmit={(event) => event.preventDefault()}
      >
        <div className={styles.editorMain}>
          {summary ? (
            <div role="alert" className={styles.formError}>
              <strong>{summary.title}</strong> {summary.description}
            </div>
          ) : null}
          <Card>
            <CardHeader as="h2" title="Commande" />
            <KeyValueList
              items={[{ label: "Client", value: order.customer.name }]}
            />
            <div className={styles.formGrid}>
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
            <CardHeader
              as="h2"
              title="Produits"
              description="Si vous changez les lignes, leurs prix sont repris du catalogue à l'enregistrement."
            />
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
              paidTnd={held}
              remainingTnd={
                total.minus(held).greaterThan(0)
                  ? total.minus(held).toFixed(3)
                  : "0"
              }
              provisional
            />
          </Card>
          <div className={styles.editorFooter}>
            <Button
              variant="secondary"
              onClick={() => navigate(`/commandes/${order.id}`)}
              disabled={busy}
            >
              Annuler
            </Button>
            <Button onClick={() => void submit()} loading={busy}>
              Enregistrer les modifications
            </Button>
          </div>
        </aside>
      </form>
    </>
  );
}

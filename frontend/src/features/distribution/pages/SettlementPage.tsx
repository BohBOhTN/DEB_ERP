import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { ConfirmPostingDialog } from "../../../components/patterns/ConfirmPostingDialog/ConfirmPostingDialog.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { DateInput } from "../../../components/ui/DateInput/DateInput.js";
import { ErrorState } from "../../../components/ui/ErrorState/ErrorState.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { Skeleton } from "../../../components/ui/Skeleton/Skeleton.js";
import { TextArea } from "../../../components/ui/TextArea/TextArea.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { createIdempotencyKey } from "../../../lib/api/idempotency.js";
import { describeError } from "../../../i18n/errors.js";
import {
  formatMoney,
  formatQuantity,
  toBusinessDate,
} from "../../../i18n/format.js";
import { fr } from "../../../i18n/fr.js";
import { listPosProducts } from "../../pos/pos.api.js";
import type { Dispatch } from "../distribution.api.js";
import { useDispatch, usePostSettlement } from "../distribution.queries.js";
import {
  safeDecimal,
  settlementLineTotal,
  settlementRemainder,
  settlementSchema,
  type SettlementFormInput,
  type SettlementFormOutput,
  type SettlementLineValues,
} from "../distribution.schemas.js";
import { SettlementLineEditor } from "../components/SettlementLineEditor.js";
import { SettlementTotalsCard } from "../components/SettlementTotalsCard.js";
import styles from "./DistributionPages.module.css";

function linesFor(
  dispatch: Dispatch,
  prices: Map<string, string>,
): SettlementLineValues[] {
  return dispatch.lines
    .filter((line) => Number(line.stillHeldQuantity) > 0)
    .map((line) => ({
      dispatchLineId: line.id,
      productName: line.productNameSnapshot,
      unitName: line.unitNameSnapshot,
      heldQuantity: trim(line.stillHeldQuantity),
      soldQuantity: "",
      returnedQuantity: "",
      stillHeldQuantity: "",
      unaccountedQuantity: "",
      unitPriceTnd: prices.get(line.productId) ?? "",
    }));
}

function trim(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

/// `/distribution/sorties/:id/regler` (UI-16, AS-015, AS-V2-20): every line
/// classifies what is still held into sold, returned, still held and
/// unaccounted; the page blocks until each equation holds; the sold amount
/// becomes revenue and, minus the payment now, distributor receivable;
/// unaccounted quantities create no debt (DST-020).
export function SettlementPage() {
  const { dispatchId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const query = useDispatch(dispatchId);
  const post = usePostSettlement();
  const keyRef = useRef(createIdempotencyKey());
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [pending, setPending] = useState<SettlementFormOutput | null>(null);
  const form = useForm<SettlementFormInput, unknown, SettlementFormOutput>({
    resolver: zodResolver(settlementSchema),
    defaultValues: {
      settledAt: toBusinessDate(new Date()),
      notes: "",
      paidAmountTnd: "",
      lines: [],
    },
  });
  const errors = form.formState.errors;
  const lines = (form.watch("lines") ?? []) as SettlementLineValues[];
  const soldTnd = lines
    .reduce((sum, line) => sum.plus(settlementLineTotal(line)), safeDecimal(0))
    .toFixed(3);
  const balanced =
    lines.length > 0 &&
    lines.every((line) => settlementRemainder(line).isZero());
  const busy = form.formState.isSubmitting || post.isPending;

  // Prices default from the product's current sale price, editable per line
  // (OD-006 default: the entered price is snapshotted).
  useEffect(() => {
    const dispatch = query.data;
    if (!dispatch || loadedFor === dispatch.id) return;
    let cancelled = false;
    (async () => {
      const prices = new Map<string, string>();
      try {
        const page = await listPosProducts({ page: 1, pageSize: 100 });
        page.items.forEach((product) =>
          prices.set(product.id, product.salePriceTnd),
        );
      } catch {
        // Prices stay empty; the cashier enters them.
      }
      if (cancelled) return;
      form.reset({
        settledAt: toBusinessDate(new Date()),
        notes: "",
        paidAmountTnd: "",
        lines: linesFor(dispatch, prices),
      });
      setLoadedFor(dispatch.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [query.data, loadedFor, form]);

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

  if (!query.data || loadedFor !== query.data.id) {
    return <Skeleton variant="table" rows={6} />;
  }

  const dispatch = query.data;

  if (dispatch.status !== "OPEN") {
    return (
      <ErrorState
        title="Sortie déjà réglée"
        description="Cette sortie est soldée ; rien ne reste en dépôt."
      />
    );
  }

  const lineErrors: Record<string, string | undefined> = {};
  const list = errors.lines as unknown as
    | Array<{
        remainder?: { message?: string };
        unitPriceTnd?: { message?: string };
      }>
    | undefined;
  list?.forEach?.((row, index) => {
    if (row?.remainder?.message)
      lineErrors[`lines.${index}.remainder`] = row.remainder.message;
    if (row?.unitPriceTnd?.message)
      lineErrors[`lines.${index}.unitPriceTnd`] = row.unitPriceTnd.message;
  });

  const submit = form.handleSubmit(async (values) => setPending(values));
  const pendingSold = pending
    ? pending.lines.reduce(
        (sum, line) => sum.plus(settlementLineTotal(line)),
        safeDecimal(0),
      )
    : safeDecimal(0);
  const pendingPaid = pending
    ? safeDecimal(pending.paidAmountTnd)
    : safeDecimal(0);

  return (
    <>
      <PageHeader
        eyebrow="Distribution"
        title={`Régler ${dispatch.reference}`}
        description={`Dépôt de ${dispatch.distributor.name}.`}
        breadcrumbs={[
          { label: "Dépôt-vente", href: "/distribution/depot-vente" },
          {
            label: dispatch.reference,
            href: `/distribution/sorties/${dispatch.id}`,
          },
          { label: "Régler" },
        ]}
      />
      <form
        className={styles.editor}
        noValidate
        onSubmit={(event) => event.preventDefault()}
      >
        <div className={styles.editorMain}>
          <Card>
            <CardHeader
              as="h2"
              title="Règlement"
              description="Classez chaque quantité en dépôt ; une quantité non justifiée reste visible sans créer de dette."
            />
            <div className={styles.formGrid}>
              <FormField
                label="Date du règlement"
                error={errors.settledAt?.message}
                required
              >
                <Controller
                  control={form.control}
                  name="settledAt"
                  render={({ field }) => (
                    <DateInput
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      disabled={busy}
                    />
                  )}
                />
              </FormField>
              <FormField label="Notes" error={errors.notes?.message}>
                <TextArea
                  {...form.register("notes")}
                  rows={2}
                  disabled={busy}
                />
              </FormField>
            </div>
          </Card>
          <Card>
            <CardHeader as="h2" title="Quantités" />
            <Controller
              control={form.control}
              name="lines"
              render={({ field }) => (
                <SettlementLineEditor
                  lines={(field.value ?? []) as SettlementLineValues[]}
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
            <Controller
              control={form.control}
              name="paidAmountTnd"
              render={({ field }) => (
                <SettlementTotalsCard
                  soldTnd={soldTnd}
                  paidAmountTnd={field.value ?? ""}
                  onPaidAmountChange={field.onChange}
                  error={errors.paidAmountTnd?.message}
                  disabled={busy}
                />
              )}
            />
          </Card>
          <div className={styles.editorFooter}>
            <Button
              variant="secondary"
              onClick={() => navigate(`/distribution/sorties/${dispatch.id}`)}
              disabled={busy}
            >
              Annuler
            </Button>
            <Button
              onClick={() => void submit()}
              loading={busy}
              disabled={!balanced}
              title={
                balanced
                  ? undefined
                  : "Chaque ligne doit être classée en totalité."
              }
            >
              Régler la sortie
            </Button>
          </div>
          {!balanced ? (
            <p className={styles.muted}>
              Chaque ligne doit être classée en totalité avant le règlement.
            </p>
          ) : null}
        </aside>
      </form>
      {pending ? (
        <ConfirmPostingDialog
          open
          title={`Régler ${dispatch.reference}`}
          confirmLabel={fr.post}
          impact={
            <ul>
              <li>
                Dépôt {dispatch.distributor.name} :{" "}
                {pending.lines
                  .map(
                    (line) =>
                      `−${formatQuantity(safeDecimal(line.heldQuantity).minus(safeDecimal(line.stillHeldQuantity)).toString())} ${line.productName}`,
                  )
                  .join(", ")}
                .
              </li>
              {pending.lines.some((line) =>
                safeDecimal(line.returnedQuantity).greaterThan(0),
              ) ? (
                <li>
                  Retour en stock principal :{" "}
                  {pending.lines
                    .filter((line) =>
                      safeDecimal(line.returnedQuantity).greaterThan(0),
                    )
                    .map(
                      (line) =>
                        `+${formatQuantity(line.returnedQuantity)} ${line.productName}`,
                    )
                    .join(", ")}
                  .
                </li>
              ) : null}
              <li>
                Chiffre d'affaires reconnu :{" "}
                {formatMoney(pendingSold.toFixed(3))} pour les quantités
                vendues.
              </li>
              <li>
                Encaissé maintenant : {formatMoney(pendingPaid.toFixed(3))}
                {pendingSold.minus(pendingPaid).greaterThan(0)
                  ? ` ; créance sur ${dispatch.distributor.name} : ${formatMoney(pendingSold.minus(pendingPaid).toFixed(3))}`
                  : ""}
                .
              </li>
              {pending.lines.some((line) =>
                safeDecimal(line.unaccountedQuantity).greaterThan(0),
              ) ? (
                <li>
                  Non justifié :{" "}
                  {pending.lines
                    .filter((line) =>
                      safeDecimal(line.unaccountedQuantity).greaterThan(0),
                    )
                    .map(
                      (line) =>
                        `${formatQuantity(line.unaccountedQuantity)} ${line.productName}`,
                    )
                    .join(", ")}
                  , signalé comme écart sans créer de dette.
                </li>
              ) : null}
            </ul>
          }
          onPost={async () => {
            const settlement = await post.mutateAsync({
              idempotencyKey: keyRef.current,
              body: {
                dispatchId: dispatch.id,
                settledAt: pending.settledAt,
                paidAmountTnd: pendingPaid.greaterThan(0)
                  ? pendingPaid.toFixed(3)
                  : undefined,
                notes: pending.notes || undefined,
                lines: pending.lines.map((line) => ({
                  dispatchLineId: line.dispatchLineId,
                  soldQuantity: safeDecimal(line.soldQuantity).toString(),
                  returnedQuantity: safeDecimal(
                    line.returnedQuantity,
                  ).toString(),
                  unaccountedQuantity: safeDecimal(
                    line.unaccountedQuantity,
                  ).toString(),
                  unitPriceTnd: safeDecimal(line.unitPriceTnd).toFixed(3),
                })),
              },
            });
            toast.success(
              "Sortie réglée",
              `${settlement.reference} · ${formatMoney(settlement.totalTnd)} vendus.`,
            );
            navigate(`/distribution/sorties/${dispatch.id}`);
          }}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </>
  );
}

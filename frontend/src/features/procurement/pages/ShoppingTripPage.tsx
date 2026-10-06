import { zodResolver } from "@hookform/resolvers/zod";
import Decimal from "decimal.js-light";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { ConfirmPostingDialog } from "../../../components/patterns/ConfirmPostingDialog/ConfirmPostingDialog.js";
import { KeyValueList } from "../../../components/patterns/KeyValueList/KeyValueList.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { DateInput } from "../../../components/ui/DateInput/DateInput.js";
import { ErrorState } from "../../../components/ui/ErrorState/ErrorState.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { TextArea } from "../../../components/ui/TextArea/TextArea.js";
import { TextInput } from "../../../components/ui/TextInput/TextInput.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { ApiError } from "../../../lib/api/errors.js";
import { applyFieldErrors } from "../../../lib/forms/applyFieldErrors.js";
import {
  formatDate,
  formatMoney,
  formatQuantity,
  toBusinessDate,
} from "../../../i18n/format.js";
import { fr } from "../../../i18n/fr.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import { categoryLabel } from "../../expenses/expenses.api.js";
import { useExpenseCategories } from "../../expenses/expenses.queries.js";
import {
  ExpenseLineEditor,
  newExpenseLine,
  type ExpenseEditorLine,
} from "../../expenses/components/ExpenseLineEditor.js";
import type { ShoppingTripInput } from "../procurement.api.js";
import { usePostShoppingTrip } from "../procurement.queries.js";
import {
  expensesTotal,
  purchaseTotal,
  safeDecimal,
  shoppingTripSchema,
  type ShoppingTripFormInput,
  type ShoppingTripFormOutput,
} from "../procurement.schemas.js";
import {
  countFieldErrors,
  errorSummary,
  toTripFormFieldErrors,
} from "../purchaseFormErrors.js";
import {
  newPurchaseLine,
  PurchaseLineEditor,
  type PurchaseEditorLine,
} from "../components/PurchaseLineEditor.js";
import {
  paidFor,
  PurchaseTotalsCard,
} from "../components/PurchaseTotalsCard.js";
import { SupplierCombobox } from "../components/SupplierCombobox.js";
import styles from "./ProcurementPages.module.css";

function emptyDefaults(): ShoppingTripFormInput {
  return {
    supplier: null,
    purchaseDate: toBusinessDate(new Date()),
    supplierReference: "",
    notes: "",
    paymentTerms: "PAID",
    paidAmountTnd: "",
    dueDate: "",
    lines: [newPurchaseLine()],
    expenses: [newExpenseLine()],
  };
}

const tripPermissions = [
  "purchases.create",
  "purchases.post",
  "expenses.create",
] as const;

/// `/achats/course` (issue 018, DEC-V2-009): what was bought at one store,
/// the raw materials and the rest, validated together. The raw materials
/// become a posted purchase (stock, supplier account); the other goods
/// become posted expenses, paid on the spot. One page, one button.
export function ShoppingTripPage() {
  const permissions = useSessionPermissions();
  const navigate = useNavigate();
  const toast = useToast();
  const categories = useExpenseCategories({ isActive: true });
  const post = usePostShoppingTrip();
  const [summary, setSummary] = useState<{
    title: string;
    description: string;
  } | null>(null);
  const [toConfirm, setToConfirm] = useState<ShoppingTripFormOutput | null>(
    null,
  );
  const form = useForm<ShoppingTripFormInput, unknown, ShoppingTripFormOutput>({
    resolver: zodResolver(shoppingTripSchema),
    defaultValues: emptyDefaults(),
  });
  const errors = form.formState.errors;
  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (summary) summaryRef.current?.scrollIntoView?.({ block: "center" });
  }, [summary]);

  const lines = (form.watch("lines") ?? []) as PurchaseEditorLine[];
  const expenseLines = (form.watch("expenses") ?? []) as ExpenseEditorLine[];
  const supplier = form.watch("supplier");
  const paymentTerms = form.watch("paymentTerms") ?? "PAID";
  const paidAmountTnd = form.watch("paidAmountTnd") ?? "";
  const dueDate = form.watch("dueDate") ?? "";
  const purchaseTnd = purchaseTotal(lines);
  const expensesTnd = expensesTotal(expenseLines);
  const paidOnPurchase =
    lines.length > 0
      ? paidFor(paymentTerms, purchaseTnd.toFixed(3), paidAmountTnd)
      : new Decimal(0);
  const paidToday = paidOnPurchase.plus(expensesTnd);

  if (!tripPermissions.every((key) => permissions.has(key))) {
    return (
      <ErrorState
        variant="denied"
        title="Autorisation insuffisante"
        description="Une course fournisseur crée et valide un achat et enregistre des dépenses : les trois autorisations sont nécessaires."
      />
    );
  }

  const lineErrors = purchaseLineErrors(errors.lines);
  const expenseErrors = expenseLineErrors(errors.expenses);

  const refused = (invalid: unknown) =>
    setSummary(errorSummary(countFieldErrors(invalid)));

  const confirm = form.handleSubmit((values) => {
    setSummary(null);
    setToConfirm(values);
  }, refused);

  const busy = form.formState.isSubmitting || post.isPending;

  return (
    <>
      <PageHeader
        eyebrow="Achats"
        title="Nouvelle course"
        description="Ce que vous avez acheté chez un fournisseur : les matières premières et le reste, validés ensemble."
        breadcrumbs={[
          { label: "Achats", href: "/achats" },
          { label: "Nouvelle course" },
        ]}
      />
      <form
        className={styles.editor}
        noValidate
        onSubmit={(event) => event.preventDefault()}
      >
        <div className={styles.editorMain}>
          {summary ? (
            <div ref={summaryRef} role="alert" className={styles.formError}>
              <strong>{summary.title}</strong> {summary.description}
            </div>
          ) : null}
          <Card>
            <CardHeader as="h2" title="Magasin" />
            <div className={styles.formGrid}>
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
                      disabled={busy}
                    />
                  )}
                />
              </FormField>
              <FormField
                label="Date de la course"
                error={errors.purchaseDate?.message}
                required
              >
                <Controller
                  control={form.control}
                  name="purchaseDate"
                  render={({ field }) => (
                    <DateInput
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      max={toBusinessDate(new Date())}
                      invalid={Boolean(errors.purchaseDate)}
                      disabled={busy}
                    />
                  )}
                />
              </FormField>
              <FormField
                label="Référence du ticket"
                error={errors.supplierReference?.message}
                hint="Numéro de facture, de ticket ou de bon de livraison."
              >
                <TextInput
                  {...form.register("supplierReference")}
                  disabled={busy}
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
            <CardHeader
              as="h2"
              title="Matières premières"
              description="Entrent en stock et dans le compte du fournisseur. Le prix unitaire s'entend par unité de base."
            />
            <Controller
              control={form.control}
              name="lines"
              render={({ field }) => (
                <PurchaseLineEditor
                  lines={(field.value ?? []) as PurchaseEditorLine[]}
                  onChange={field.onChange}
                  errors={lineErrors}
                  disabled={busy}
                />
              )}
            />
            <p className={styles.subtotal}>
              <span>Sous-total matières premières</span>
              <strong className="tabular-nums">
                {formatMoney(purchaseTnd.toFixed(3))}
              </strong>
            </p>
          </Card>
          <Card>
            <CardHeader
              as="h2"
              title="Autres achats"
              description="Comptés en dépenses, réglés sur place : ne touchent ni le stock ni le compte du fournisseur."
            />
            <Controller
              control={form.control}
              name="expenses"
              render={({ field }) => (
                <ExpenseLineEditor
                  lines={(field.value ?? []) as ExpenseEditorLine[]}
                  onChange={field.onChange}
                  categories={categories.data ?? []}
                  errors={expenseErrors}
                  disabled={busy}
                />
              )}
            />
            <p className={styles.subtotal}>
              <span>Sous-total autres achats</span>
              <strong className="tabular-nums">
                {formatMoney(expensesTnd.toFixed(3))}
              </strong>
            </p>
          </Card>
        </div>
        <aside className={styles.editorSide} aria-label="Totaux">
          <Card>
            <CardHeader as="h2" title="Totaux de la course" />
            <KeyValueList
              columns={1}
              items={[
                {
                  label: "Matières premières",
                  value: formatMoney(purchaseTnd.toFixed(3)),
                  numeric: true,
                },
                {
                  label: "Autres achats",
                  value: formatMoney(expensesTnd.toFixed(3)),
                  numeric: true,
                },
              ]}
            />
            <div className={styles.bigNumber}>
              <span className={styles.muted}>Total de la course</span>
              <strong className="tabular-nums">
                {formatMoney(purchaseTnd.plus(expensesTnd).toFixed(3))}
              </strong>
            </div>
          </Card>
          {lines.length > 0 ? (
            <Card>
              <CardHeader
                as="h2"
                title="Paiement des matières premières"
                description="Les autres achats sont réglés sur place."
              />
              <PurchaseTotalsCard
                totalTnd={purchaseTnd.toFixed(3)}
                paymentTerms={paymentTerms}
                onPaymentTermsChange={(terms) =>
                  form.setValue("paymentTerms", terms, {
                    shouldValidate: form.formState.isSubmitted,
                  })
                }
                paidAmountTnd={paidAmountTnd}
                onPaidAmountChange={(amount) =>
                  form.setValue("paidAmountTnd", amount, {
                    shouldValidate: form.formState.isSubmitted,
                  })
                }
                dueDate={dueDate}
                onDueDateChange={(date) =>
                  form.setValue("dueDate", date, {
                    shouldValidate: form.formState.isSubmitted,
                  })
                }
                errors={{
                  paidAmountTnd: errors.paidAmountTnd?.message,
                  dueDate: errors.dueDate?.message,
                }}
                disabled={busy}
              />
            </Card>
          ) : null}
          <Card>
            <KeyValueList
              columns={1}
              items={[
                {
                  label: "Sortie de caisse aujourd'hui",
                  value: formatMoney(paidToday.toFixed(3)),
                  numeric: true,
                },
              ]}
            />
          </Card>
          <div className={styles.editorFooter}>
            <Button
              variant="secondary"
              onClick={() => navigate("/achats")}
              disabled={busy}
            >
              Annuler
            </Button>
            <Button onClick={() => void confirm()} loading={busy}>
              Valider la course
            </Button>
          </div>
        </aside>
      </form>
      <ConfirmPostingDialog
        open={toConfirm !== null}
        title={`Valider la course${supplier ? ` chez ${supplier.label}` : ""}`}
        confirmLabel={fr.post}
        impact={
          toConfirm ? (
            <TripImpact
              values={toConfirm}
              // The schema's output keeps the fields it declares; the base
              // unit symbol lives on the editor line, read by key.
              baseUnitSymbol={(key) =>
                lines.find((line) => line.key === key)?.rawMaterial?.baseUnit
                  .symbol ?? ""
              }
              categoryName={(id) => {
                const category = (categories.data ?? []).find(
                  (row) => row.id === id,
                );
                return category ? categoryLabel(category) : "";
              }}
            />
          ) : null
        }
        onPost={async (idempotencyKey) => {
          if (!toConfirm) return;
          try {
            const result = await post.mutateAsync({
              body: bodyFrom(toConfirm),
              idempotencyKey,
            });
            const storeName = toConfirm.supplier?.label ?? "";
            setToConfirm(null);
            if (result.purchase) {
              toast.success(
                "Course validée",
                `${result.purchase.reference ?? ""} · ${storeName}`.trim(),
              );
              navigate(`/achats/${result.purchase.id}`);
            } else {
              toast.success(
                "Course validée",
                `${result.expenses.length} dépense${result.expenses.length > 1 ? "s" : ""} · ${storeName}`,
              );
              navigate("/depenses");
            }
          } catch (error) {
            if (error instanceof ApiError && error.isValidation) {
              const fieldErrors = toTripFormFieldErrors(error.fieldErrors);
              applyFieldErrors(form.setError, fieldErrors);
              setSummary(errorSummary(Object.keys(fieldErrors).length));
              setToConfirm(null);
              return;
            }
            throw error;
          }
        }}
        onCancel={() => setToConfirm(null)}
      />
    </>
  );
}

/// The two documents the trip becomes, said before the one validation.
function TripImpact({
  values,
  baseUnitSymbol,
  categoryName,
}: {
  values: ShoppingTripFormOutput;
  baseUnitSymbol: (lineKey: string) => string;
  categoryName: (id: string) => string;
}) {
  const total = purchaseTotal(values.lines);
  const paid =
    values.lines.length > 0
      ? paidFor(values.paymentTerms, total.toFixed(3), values.paidAmountTnd)
      : new Decimal(0);
  const remaining = total.minus(paid);
  const expenses = expensesTotal(values.expenses);
  const stock = values.lines
    .map((line) => {
      const base = safeDecimal(line.quantity).times(
        safeDecimal(line.factorToBase || "1"),
      );
      return `+${formatQuantity(base.toString(), baseUnitSymbol(line.key))} ${line.item?.label ?? ""}`.trim();
    })
    .join(", ");

  return (
    <ul>
      {values.lines.length > 0 ? (
        <>
          <li>Stock : {stock}.</li>
          <li>
            Dette fournisseur {values.supplier?.label ?? ""} :{" "}
            {remaining.greaterThan(0)
              ? `+${formatMoney(remaining.toFixed(3))}`
              : "aucune"}
            {remaining.greaterThan(0) && values.dueDate
              ? `, échéance ${formatDate(values.dueDate)}`
              : ""}
            .
          </li>
          {paid.greaterThan(0) ? (
            <li>
              Paiement enregistré sur l'achat : {formatMoney(paid.toFixed(3))}.
            </li>
          ) : null}
        </>
      ) : (
        <li>Aucune matière première : ni stock ni dette fournisseur.</li>
      )}
      {values.expenses.length > 0 ? (
        <li>
          {values.expenses.length} dépense
          {values.expenses.length > 1 ? "s" : ""} pour{" "}
          {formatMoney(expenses.toFixed(3))}, réglée
          {values.expenses.length > 1 ? "s" : ""} sur place :{" "}
          {values.expenses
            .map(
              (line) =>
                `${line.description.trim()} (${categoryName(line.categoryId ?? "")})`,
            )
            .join(", ")}
          .
        </li>
      ) : null}
      <li>
        Sortie de caisse aujourd'hui :{" "}
        {formatMoney(paid.plus(expenses).toFixed(3))}.
      </li>
      <li>
        Chaque document reçoit une référence et ne pourra plus être modifié,
        seulement annulé avec un motif.
      </li>
    </ul>
  );
}

function bodyFrom(values: ShoppingTripFormOutput): ShoppingTripInput {
  const total = purchaseTotal(values.lines);
  const paid = paidFor(
    values.paymentTerms,
    total.toFixed(3),
    values.paidAmountTnd,
  );

  return {
    supplierId: values.supplier?.value ?? "",
    tripDate: values.purchaseDate,
    supplierReference: values.supplierReference || undefined,
    notes: values.notes || undefined,
    purchase:
      values.lines.length > 0
        ? {
            paymentTerms: values.paymentTerms,
            paidAmountTnd: paid.toFixed(3),
            dueDate: paid.lessThan(total)
              ? values.dueDate || undefined
              : undefined,
            lines: values.lines.map((line) => ({
              rawMaterialId: line.item?.value ?? "",
              enteredUnitId: line.unitId ?? "",
              enteredQuantity: line.quantity,
              unitPriceTnd: line.unitPriceTnd,
            })),
          }
        : undefined,
    expenses: values.expenses.map((line) => ({
      categoryId: line.categoryId ?? "",
      description: line.description.trim(),
      amountTnd: safeDecimal(line.amountTnd).toFixed(3),
    })),
  };
}

type LineErrorList =
  | (Array<Record<string, { message?: string } | undefined> | undefined> & {
      message?: string;
      root?: { message?: string };
    })
  | undefined;

/// react-hook-form's nested errors flattened to the keys the line editors
/// read (`lines.N.quantity`, `expenses.N.amountTnd`).
function purchaseLineErrors(
  value: unknown,
): Record<string, string | undefined> {
  const list = value as LineErrorList;
  const out: Record<string, string | undefined> = {};
  list?.forEach?.((row, index) => {
    if (row?.item?.message)
      out[`lines.${index}.rawMaterialId`] = row.item.message;
    if (row?.quantity?.message)
      out[`lines.${index}.quantity`] = row.quantity.message;
    if (row?.unitPriceTnd?.message)
      out[`lines.${index}.unitPriceTnd`] = row.unitPriceTnd.message;
  });
  if (list?.message ?? list?.root?.message) {
    out.lines = list?.message ?? list?.root?.message;
  }
  return out;
}

function expenseLineErrors(value: unknown): Record<string, string | undefined> {
  const list = value as LineErrorList;
  const out: Record<string, string | undefined> = {};
  list?.forEach?.((row, index) => {
    for (const field of ["categoryId", "description", "amountTnd"] as const) {
      if (row?.[field]?.message) {
        out[`expenses.${index}.${field}`] = row[field]?.message;
      }
    }
  });
  if (list?.message ?? list?.root?.message) {
    out.expenses = list?.message ?? list?.root?.message;
  }
  return out;
}

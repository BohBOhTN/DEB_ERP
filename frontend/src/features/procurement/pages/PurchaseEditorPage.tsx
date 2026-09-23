import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { DateInput } from "../../../components/ui/DateInput/DateInput.js";
import { ErrorState } from "../../../components/ui/ErrorState/ErrorState.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { Skeleton } from "../../../components/ui/Skeleton/Skeleton.js";
import { TextArea } from "../../../components/ui/TextArea/TextArea.js";
import { TextInput } from "../../../components/ui/TextInput/TextInput.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { ApiError } from "../../../lib/api/errors.js";
import { applyFieldErrors } from "../../../lib/forms/applyFieldErrors.js";
import { describeError } from "../../../i18n/errors.js";
import { toBusinessDate } from "../../../i18n/format.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import { getRawMaterial } from "../../catalog/catalog.api.js";
import type { Purchase, PurchaseInput } from "../procurement.api.js";
import { usePurchase, useSavePurchase } from "../procurement.queries.js";
import {
  purchaseSchema,
  purchaseTotal,
  type PurchaseFormInput,
  type PurchaseFormOutput,
} from "../procurement.schemas.js";
import { PostPurchaseDialog } from "../components/PostPurchaseDialog.js";
import {
  lineFromRawMaterial,
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

function emptyDefaults(): PurchaseFormInput {
  return {
    supplier: null,
    purchaseDate: toBusinessDate(new Date()),
    supplierReference: "",
    notes: "",
    paymentTerms: "UNPAID",
    paidAmountTnd: "",
    dueDate: "",
    lines: [newPurchaseLine()],
  };
}

/// `/achats/nouveau` and `/achats/:id/modifier` (UI-12, AS-005): a full
/// page with the header form and the lines on the left, the sticky totals
/// on the right. "Valider l'achat" saves the draft then opens the posting
/// confirmation with the impact on stock, payable and payment.
export function PurchaseEditorPage() {
  const { purchaseId } = useParams();
  const permissions = useSessionPermissions();
  const navigate = useNavigate();
  const toast = useToast();
  const existing = usePurchase(purchaseId ?? "", {
    enabled: Boolean(purchaseId),
  });
  const save = useSavePurchase();
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [toPost, setToPost] = useState<Purchase | null>(null);
  const [summary, setSummary] = useState<{
    title: string;
    description: string;
  } | null>(null);
  const form = useForm<PurchaseFormInput, unknown, PurchaseFormOutput>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: emptyDefaults(),
  });
  const errors = form.formState.errors;
  const lines = form.watch("lines") as PurchaseEditorLine[];
  const paymentTerms = form.watch("paymentTerms") ?? "UNPAID";
  const paidAmountTnd = form.watch("paidAmountTnd") ?? "";
  const dueDate = form.watch("dueDate") ?? "";
  const totalTnd = purchaseTotal(lines ?? []).toFixed(3);

  // Editing a draft: the lines need their raw material records for the
  // unit options, fetched once per material.
  useEffect(() => {
    const purchase = existing.data;
    if (!purchaseId || !purchase || loadedFor === purchase.id) return;
    let cancelled = false;
    (async () => {
      try {
        const ids = [
          ...new Set(purchase.lines.map((line) => line.rawMaterialId)),
        ];
        const records = await Promise.all(ids.map((id) => getRawMaterial(id)));
        const byId = new Map(records.map((record) => [record.id, record]));
        if (cancelled) return;
        form.reset({
          supplier: {
            value: purchase.supplierId,
            label: purchase.supplier.name,
          },
          purchaseDate: toBusinessDate(purchase.purchaseDate),
          supplierReference: purchase.supplierReference ?? "",
          notes: purchase.notes ?? "",
          paymentTerms: purchase.paymentTerms,
          paidAmountTnd:
            purchase.paymentTerms === "PARTIAL" ? purchase.paidAmountTnd : "",
          dueDate: purchase.dueDate ? toBusinessDate(purchase.dueDate) : "",
          lines: purchase.lines.map((line) => {
            const rawMaterial = byId.get(line.rawMaterialId);
            return rawMaterial
              ? lineFromRawMaterial(rawMaterial, {
                  unitId: line.enteredUnitId,
                  quantity: trimZeros(line.enteredQuantity),
                  unitPriceTnd: line.unitPriceTnd,
                })
              : {
                  ...newPurchaseLine(),
                  item: {
                    value: line.rawMaterialId,
                    label: line.rawMaterialNameSnapshot,
                  },
                  quantity: trimZeros(line.enteredQuantity),
                  unitPriceTnd: line.unitPriceTnd,
                };
          }),
        });
        setLoadedFor(purchase.id);
      } catch (error) {
        if (!cancelled) setLoadError(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [purchaseId, existing.data, loadedFor, form]);

  const lineErrors: Record<string, string | undefined> = {};
  const lineErrorList = errors.lines as unknown as
    | (Array<{
        item?: { message?: string };
        quantity?: { message?: string };
        unitPriceTnd?: { message?: string };
      }> & { message?: string; root?: { message?: string } })
    | undefined;
  lineErrorList?.forEach?.((row, index) => {
    if (row?.item?.message)
      lineErrors[`lines.${index}.rawMaterialId`] = row.item.message;
    if (row?.quantity?.message)
      lineErrors[`lines.${index}.quantity`] = row.quantity.message;
    if (row?.unitPriceTnd?.message)
      lineErrors[`lines.${index}.unitPriceTnd`] = row.unitPriceTnd.message;
  });
  if (lineErrorList?.message ?? lineErrorList?.root?.message) {
    lineErrors.lines = lineErrorList?.message ?? lineErrorList?.root?.message;
  }

  const bodyFrom = (values: PurchaseFormOutput): PurchaseInput => ({
    supplierId: values.supplier?.value ?? "",
    purchaseDate: values.purchaseDate,
    supplierReference: values.supplierReference || undefined,
    notes: values.notes || undefined,
    paymentTerms: values.paymentTerms,
    paidAmountTnd: paidFor(
      values.paymentTerms,
      purchaseTotal(values.lines).toFixed(3),
      values.paidAmountTnd,
    ).toFixed(3),
    dueDate: paidFor(
      values.paymentTerms,
      purchaseTotal(values.lines).toFixed(3),
      values.paidAmountTnd,
    ).lessThan(purchaseTotal(values.lines))
      ? values.dueDate || undefined
      : undefined,
    lines: values.lines.map((line) => ({
      rawMaterialId: line.item?.value ?? "",
      enteredUnitId: line.unitId ?? "",
      enteredQuantity: line.quantity,
      unitPriceTnd: line.unitPriceTnd,
    })),
  });

  const persist = async (
    values: PurchaseFormOutput,
  ): Promise<Purchase | null> => {
    setSummary(null);
    try {
      return await save.mutateAsync({ purchaseId, body: bodyFrom(values) });
    } catch (error) {
      if (error instanceof ApiError && error.isValidation) {
        const unknown = applyFieldErrors(form.setError, error.fieldErrors);
        if (unknown.length > 0)
          setSummary({
            title: "Le formulaire contient des erreurs",
            description: unknown.join(" "),
          });
        return null;
      }
      setSummary(describeError(error));
      return null;
    }
  };

  const saveDraft = form.handleSubmit(async (values) => {
    const purchase = await persist(values);
    if (purchase) {
      toast.success("Brouillon enregistré", purchase.supplier.name);
      navigate(`/achats/${purchase.id}`);
    }
  });

  const saveAndPost = form.handleSubmit(async (values) => {
    const purchase = await persist(values);
    if (purchase) setToPost(purchase);
  });

  if (purchaseId && (existing.isError || loadError)) {
    const copy = describeError(existing.error ?? loadError);
    return (
      <ErrorState
        title={copy.title}
        description={copy.description}
        onRetry={() => void existing.refetch()}
      />
    );
  }

  if (purchaseId && loadedFor !== purchaseId) {
    return <Skeleton variant="table" rows={6} />;
  }

  if (purchaseId && existing.data && existing.data.status !== "DRAFT") {
    return (
      <ErrorState
        title="Achat non modifiable"
        description="Seul un achat en brouillon peut être modifié."
      />
    );
  }

  const editing = Boolean(purchaseId);
  const busy = form.formState.isSubmitting;

  return (
    <>
      <PageHeader
        eyebrow="Achats"
        title={editing ? "Modifier le brouillon" : "Nouvel achat"}
        breadcrumbs={[
          { label: "Achats", href: "/achats" },
          { label: editing ? "Modifier" : "Nouvel achat" },
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
            <CardHeader as="h2" title="Achat" />
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
                label="Date d'achat"
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
                      disabled={busy}
                    />
                  )}
                />
              </FormField>
              <FormField
                label="Référence fournisseur"
                error={errors.supplierReference?.message}
                hint="Numéro de facture ou de bon de livraison."
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
              title="Lignes"
              description="Le prix unitaire s'entend par unité de base de la matière."
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
          </Card>
        </div>
        <aside className={styles.editorSide} aria-label="Totaux">
          <Card>
            <PurchaseTotalsCard
              totalTnd={totalTnd}
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
          <div className={styles.editorFooter}>
            <Button
              variant="secondary"
              onClick={() =>
                navigate(editing ? `/achats/${purchaseId}` : "/achats")
              }
              disabled={busy}
            >
              Annuler
            </Button>
            <Button
              variant="secondary"
              onClick={() => void saveDraft()}
              loading={busy}
            >
              Enregistrer le brouillon
            </Button>
            {permissions.has("purchases.post") ? (
              <Button onClick={() => void saveAndPost()} loading={busy}>
                Valider l'achat
              </Button>
            ) : null}
          </div>
        </aside>
      </form>
      <PostPurchaseDialog
        open={toPost !== null}
        purchase={toPost}
        onPosted={(purchase) => {
          toast.success(
            "Achat validé",
            `${purchase.reference ?? ""} · ${purchase.supplier.name}`.trim(),
          );
          setToPost(null);
          navigate(`/achats/${purchase.id}`);
        }}
        onCancel={() => {
          const saved = toPost;
          setToPost(null);
          if (saved) navigate(`/achats/${saved.id}`);
        }}
      />
    </>
  );
}

function trimZeros(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

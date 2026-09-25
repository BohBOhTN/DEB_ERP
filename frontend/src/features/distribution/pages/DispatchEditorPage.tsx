import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { ConfirmPostingDialog } from "../../../components/patterns/ConfirmPostingDialog/ConfirmPostingDialog.js";
import {
  LineEditor,
  newLine,
  type EditorLine,
} from "../../../components/patterns/LineEditor/LineEditor.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { DateInput } from "../../../components/ui/DateInput/DateInput.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { TextArea } from "../../../components/ui/TextArea/TextArea.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { createIdempotencyKey } from "../../../lib/api/idempotency.js";
import { formatQuantity, toBusinessDate } from "../../../i18n/format.js";
import { fr } from "../../../i18n/fr.js";
import { listPosProducts } from "../../pos/pos.api.js";
import { usePostDispatch } from "../distribution.queries.js";
import {
  dispatchSchema,
  type DispatchFormInput,
  type DispatchFormOutput,
} from "../distribution.schemas.js";
import { DistributorCombobox } from "../components/DistributorCombobox.js";
import styles from "./DistributionPages.module.css";

async function loadProducts(query: string) {
  const page = await listPosProducts({
    page: 1,
    pageSize: 8,
    q: query || undefined,
  });
  return page.items.map((product) => ({
    value: product.id,
    label: product.name,
    description: `${product.baseUnit.name} · ${product.category.name}`,
  }));
}

/// `/distribution/sorties/nouvelle` (UI-16, AS-014): distributor, date and
/// quantity lines; the confirmation states the stock and custody move and
/// that nothing is sold. One key per page intent.
export function DispatchEditorPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const post = usePostDispatch();
  const keyRef = useRef(createIdempotencyKey());
  const [pending, setPending] = useState<DispatchFormOutput | null>(null);
  const form = useForm<DispatchFormInput, unknown, DispatchFormOutput>({
    resolver: zodResolver(dispatchSchema),
    defaultValues: {
      distributor: null,
      dispatchedAt: toBusinessDate(new Date()),
      notes: "",
      lines: [newLine()],
    },
  });
  const errors = form.formState.errors;
  const busy = form.formState.isSubmitting || post.isPending;

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

  const submit = form.handleSubmit(async (values) => setPending(values));

  return (
    <>
      <PageHeader
        eyebrow="Distribution"
        title="Nouvelle sortie"
        breadcrumbs={[
          { label: "Dépôt-vente", href: "/distribution/depot-vente" },
          { label: "Nouvelle sortie" },
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
              title="Sortie en dépôt-vente"
              description="Les produits restent la propriété de la boulangerie jusqu'au règlement."
            />
            <div className={styles.formGrid}>
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
                      disabled={busy}
                    />
                  )}
                />
              </FormField>
              <FormField
                label="Date de sortie"
                error={errors.dispatchedAt?.message}
                required
              >
                <Controller
                  control={form.control}
                  name="dispatchedAt"
                  render={({ field }) => (
                    <DateInput
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      disabled={busy}
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
                <LineEditor
                  lines={(field.value ?? []) as EditorLine[]}
                  onChange={field.onChange}
                  loadItems={loadProducts}
                  itemLabel="Produit"
                  showPrice={false}
                  errors={lineErrors}
                  disabled={busy}
                />
              )}
            />
          </Card>
        </div>
        <aside className={styles.editorSide} aria-label="Actions">
          <div className={styles.editorFooter}>
            <Button
              variant="secondary"
              onClick={() => navigate("/distribution/depot-vente")}
              disabled={busy}
            >
              Annuler
            </Button>
            <Button onClick={() => void submit()} loading={busy}>
              Enregistrer la sortie
            </Button>
          </div>
        </aside>
      </form>
      {pending ? (
        <ConfirmPostingDialog
          open
          title="Confirmer la sortie"
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
                Dépôt {pending.distributor?.label} :{" "}
                {pending.lines
                  .map(
                    (line) =>
                      `+${formatQuantity(line.quantity)} ${line.item?.label ?? ""}`,
                  )
                  .join(", ")}
                .
              </li>
              <li>
                Aucune vente ni dette : les produits restent à la boulangerie
                jusqu'au règlement.
              </li>
            </ul>
          }
          onPost={async () => {
            const dispatch = await post.mutateAsync({
              idempotencyKey: keyRef.current,
              body: {
                distributorId: pending.distributor?.value ?? "",
                dispatchedAt: pending.dispatchedAt,
                notes: pending.notes || undefined,
                lines: pending.lines.map((line) => ({
                  productId: line.item?.value ?? "",
                  quantity: line.quantity,
                })),
              },
            });
            toast.success(
              "Sortie enregistrée",
              `${dispatch.reference} · ${dispatch.distributor.name}`,
            );
            navigate(`/distribution/sorties/${dispatch.id}`);
          }}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </>
  );
}

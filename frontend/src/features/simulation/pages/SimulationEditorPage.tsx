import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import {
  Combobox,
  type ComboboxOption,
} from "../../../components/ui/Combobox/Combobox.js";
import { ErrorState } from "../../../components/ui/ErrorState/ErrorState.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { QuantityInput } from "../../../components/ui/QuantityInput/QuantityInput.js";
import { Select } from "../../../components/ui/Select/Select.js";
import { Skeleton } from "../../../components/ui/Skeleton/Skeleton.js";
import { TextArea } from "../../../components/ui/TextArea/TextArea.js";
import { TextInput } from "../../../components/ui/TextInput/TextInput.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { ApiError } from "../../../lib/api/errors.js";
import { applyFieldErrors } from "../../../lib/forms/applyFieldErrors.js";
import { describeError } from "../../../i18n/errors.js";
import { formatMoney } from "../../../i18n/format.js";
import {
  getRawMaterial,
  listProducts,
  type Product,
} from "../../catalog/catalog.api.js";
import { useCachedSearch } from "../../../lib/query/cachedOptions.js";
import { roots } from "../../../lib/query/invalidation.js";
import type { SimulationInput } from "../simulation.api.js";
import { useUnits } from "../../catalog/catalog.queries.js";
import {
  useCreateSimulation,
  useSimulation,
  useUpdateSimulation,
} from "../simulation.queries.js";
import {
  simulationSchema,
  simulationTotals,
  type IngredientLineValues,
  type SimulationFormInput,
  type SimulationFormOutput,
} from "../simulation.schemas.js";
import {
  IngredientLineEditor,
  newIngredientLine,
} from "../components/IngredientLineEditor.js";
import { SimulationTotalsCard } from "../components/SimulationTotalsCard.js";
import styles from "./SimulationPages.module.css";

interface ProductOption extends ComboboxOption {
  product: Product;
}

async function fetchProductOptions(query: string): Promise<ProductOption[]> {
  const page = await listProducts({
    page: 1,
    pageSize: 8,
    q: query || undefined,
    isActive: true,
    sort: { field: "name", direction: "asc" },
  });
  return page.items.map((product) => ({
    value: product.id,
    label: product.name,
    description: `${formatMoney(product.salePriceTnd)} / ${product.baseUnit.symbol}`,
    product,
  }));
}

/// `/simulations/nouvelle` and `/simulations/:id/modifier` (UI-18, AS-018):
/// header, ingredient lines with a live cost, the sticky totals with the unit
/// cost and an indicative margin; the server recomputes and snapshots.
export function SimulationEditorPage() {
  const { simulationId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  // Issue 009: the target product picker reads the session cache.
  const loadProducts = useCachedSearch(
    roots.catalogProducts,
    fetchProductOptions,
  );
  const existing = useSimulation(simulationId ?? "");
  const create = useCreateSimulation();
  const update = useUpdateSimulation();
  const units = useUnits();
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [targetProduct, setTargetProduct] = useState<{
    option: ComboboxOption;
    salePriceTnd: string;
  } | null>(null);
  const [summary, setSummary] = useState<{
    title: string;
    description: string;
  } | null>(null);
  const form = useForm<SimulationFormInput, unknown, SimulationFormOutput>({
    resolver: zodResolver(simulationSchema),
    defaultValues: {
      name: "",
      targetProductId: "",
      outputQuantity: "",
      outputUnitId: "",
      notes: "",
      ingredients: [newIngredientLine()],
    },
  });
  const errors = form.formState.errors;
  const lines = (form.watch("ingredients") ?? []) as IngredientLineValues[];
  const outputQuantity = form.watch("outputQuantity") ?? "";
  const outputUnitId = form.watch("outputUnitId") ?? "";
  const totals = simulationTotals(lines, outputQuantity);
  const outputUnitName =
    units.data?.items.find((unit) => unit.id === outputUnitId)?.name ?? "unité";
  const busy = form.formState.isSubmitting;

  // Editing: the raw material records are fetched so each line keeps its
  // unit options; free-text lines come back as entered.
  useEffect(() => {
    const simulation = existing.data;
    if (!simulationId || !simulation || loadedFor === simulation.id) return;
    let cancelled = false;
    (async () => {
      try {
        const ids = [
          ...new Set(
            simulation.ingredients
              .map((line) => line.rawMaterialId)
              .filter((id): id is string => Boolean(id)),
          ),
        ];
        const records = await Promise.all(ids.map((id) => getRawMaterial(id)));
        const byId = new Map(records.map((record) => [record.id, record]));
        if (cancelled) return;
        form.reset({
          name: simulation.name,
          targetProductId: simulation.targetProductId ?? "",
          outputQuantity: trim(simulation.outputQuantity),
          outputUnitId: simulation.outputUnitId,
          notes: simulation.notes ?? "",
          ingredients: simulation.ingredients.map((line) => {
            const rawMaterial = line.rawMaterialId
              ? (byId.get(line.rawMaterialId) ?? null)
              : null;
            return {
              ...newIngredientLine(),
              mode: rawMaterial ? ("RAW" as const) : ("FREE" as const),
              rawMaterial,
              ingredientName: line.ingredientName,
              enteredQuantity: trim(line.enteredQuantity),
              enteredUnitId: line.enteredUnitId,
              unitPriceTnd: line.unitPriceTnd,
              priceBasisUnitId: line.priceBasisUnitId,
              factorToBase: trim(line.conversionFactorToBase),
            };
          }),
        });
        if (simulation.targetProduct)
          setTargetProduct({
            option: {
              value: simulation.targetProduct.id,
              label: simulation.targetProduct.name,
            },
            salePriceTnd: simulation.targetProduct.salePriceTnd,
          });
        setLoadedFor(simulation.id);
      } catch (error) {
        if (!cancelled) setLoadError(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [simulationId, existing.data, loadedFor, form]);

  const lineErrors: Record<string, string | undefined> = {};
  const list = errors.ingredients as unknown as
    | (Array<Record<string, { message?: string } | undefined>> & {
        message?: string;
        root?: { message?: string };
      })
    | undefined;
  list?.forEach?.((row, index) => {
    for (const field of [
      "ingredientName",
      "enteredQuantity",
      "enteredUnitId",
      "unitPriceTnd",
    ]) {
      const message = row?.[field]?.message;
      if (message) lineErrors[`ingredients.${index}.${field}`] = message;
    }
  });
  if (list?.message ?? list?.root?.message)
    lineErrors.ingredients = list?.message ?? list?.root?.message;

  const submit = form.handleSubmit(async (values) => {
    setSummary(null);
    const body: SimulationInput = {
      name: values.name,
      targetProductId: values.targetProductId || undefined,
      outputQuantity: values.outputQuantity,
      outputUnitId: values.outputUnitId,
      notes: values.notes || undefined,
      ingredients: values.ingredients.map((line) => ({
        rawMaterialId:
          line.mode === "RAW" ? (line.rawMaterial?.id ?? undefined) : undefined,
        ingredientName:
          line.mode === "FREE" ? line.ingredientName.trim() : undefined,
        enteredQuantity: line.enteredQuantity,
        enteredUnitId: line.enteredUnitId,
        unitPriceTnd: line.unitPriceTnd.replace(",", "."),
        priceBasisUnitId: line.priceBasisUnitId || line.enteredUnitId,
        ...(line.mode === "FREE" &&
        line.priceBasisUnitId &&
        line.priceBasisUnitId !== line.enteredUnitId
          ? { conversionFactorToBase: line.factorToBase }
          : {}),
      })),
    };
    try {
      const saved =
        simulationId && existing.data
          ? await update.mutateAsync({
              simulationId,
              body: { ...body, version: existing.data.version },
            })
          : await create.mutateAsync(body);
      toast.success(
        simulationId ? "Simulation modifiée" : "Simulation enregistrée",
        `${saved.name} · ${formatMoney(saved.costPerOutputUnitTnd)} par ${saved.outputUnitNameSnapshot.toLowerCase()}`,
      );
      navigate(`/simulations/${saved.id}`);
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

  if (simulationId && (existing.isError || loadError)) {
    const copy = describeError(existing.error ?? loadError);
    return (
      <ErrorState
        title={copy.title}
        description={copy.description}
        onRetry={() => void existing.refetch()}
      />
    );
  }

  if ((simulationId && loadedFor !== simulationId) || units.isPending) {
    return <Skeleton variant="table" rows={6} />;
  }

  const editing = Boolean(simulationId);
  const unitOptions = (units.data?.items ?? []).map((unit) => ({
    value: unit.id,
    label: unit.name,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Finances"
        title={editing ? "Modifier la simulation" : "Nouvelle simulation"}
        breadcrumbs={[
          { label: "Simulations", href: "/simulations" },
          { label: editing ? "Modifier" : "Nouvelle simulation" },
        ]}
      />
      <form
        className={styles.editor}
        noValidate
        onSubmit={(event) => event.preventDefault()}
      >
        <div className={styles.editorMain}>
          <p className={styles.banner} role="note">
            Une simulation n'a aucun effet sur le stock ni la comptabilité.
          </p>
          {summary ? (
            <div role="alert" className={styles.muted}>
              <strong>{summary.title}</strong> {summary.description}
            </div>
          ) : null}
          <Card>
            <CardHeader as="h2" title="Scénario" />
            <div className={styles.formGrid}>
              <FormField label="Nom" error={errors.name?.message} required>
                <TextInput
                  {...form.register("name")}
                  placeholder="Baguette tradition, 50 pièces"
                  disabled={busy}
                />
              </FormField>
              <FormField
                label="Produit cible"
                hint="Facultatif ; donne le prix de vente pour la marge indicative."
              >
                <Controller
                  control={form.control}
                  name="targetProductId"
                  render={({ field }) => (
                    <Combobox<ProductOption>
                      aria-label="Produit cible"
                      loadOptions={loadProducts}
                      value={
                        targetProduct
                          ? {
                              ...targetProduct.option,
                              product: null as unknown as Product,
                            }
                          : null
                      }
                      onChange={(option) => {
                        field.onChange(option?.value ?? "");
                        setTargetProduct(
                          option
                            ? {
                                option: {
                                  value: option.value,
                                  label: option.label,
                                },
                                salePriceTnd:
                                  option.product?.salePriceTnd ??
                                  targetProduct?.salePriceTnd ??
                                  "0",
                              }
                            : null,
                        );
                      }}
                      placeholder="Aucun produit"
                      emptyText="Aucun produit"
                      disabled={busy}
                    />
                  )}
                />
              </FormField>
              <FormField
                label="Quantité produite"
                error={errors.outputQuantity?.message}
                required
              >
                <Controller
                  control={form.control}
                  name="outputQuantity"
                  render={({ field }) => (
                    <QuantityInput
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      invalid={Boolean(errors.outputQuantity)}
                      disabled={busy}
                    />
                  )}
                />
              </FormField>
              <FormField
                label="Unité produite"
                error={errors.outputUnitId?.message}
                required
              >
                <Controller
                  control={form.control}
                  name="outputUnitId"
                  render={({ field }) => (
                    <Select
                      aria-label="Unité produite"
                      placeholder="Unité"
                      value={field.value || null}
                      onValueChange={(value) => field.onChange(value ?? "")}
                      options={unitOptions}
                      invalid={Boolean(errors.outputUnitId)}
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
            <CardHeader as="h2" title="Ingrédients" />
            <Controller
              control={form.control}
              name="ingredients"
              render={({ field }) => (
                <IngredientLineEditor
                  lines={(field.value ?? []) as IngredientLineValues[]}
                  onChange={field.onChange}
                  units={units.data?.items ?? []}
                  errors={lineErrors}
                  disabled={busy}
                />
              )}
            />
          </Card>
        </div>
        <aside className={styles.editorSide} aria-label="Totaux">
          <Card>
            <SimulationTotalsCard
              totalTnd={totals.total.toFixed(3)}
              perUnitTnd={totals.perUnit.toFixed(3)}
              outputUnitName={outputUnitName}
              salePriceTnd={targetProduct?.salePriceTnd ?? null}
              provisional
            />
          </Card>
          <div className={styles.editorFooter}>
            <Button
              variant="secondary"
              onClick={() =>
                navigate(
                  editing ? `/simulations/${simulationId}` : "/simulations",
                )
              }
              disabled={busy}
            >
              Annuler
            </Button>
            <Button onClick={() => void submit()} loading={busy}>
              {editing ? "Enregistrer" : "Enregistrer la simulation"}
            </Button>
          </div>
        </aside>
      </form>
    </>
  );
}

function trim(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

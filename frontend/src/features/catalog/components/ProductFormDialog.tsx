import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateAfter } from "../../../lib/query/invalidation.js";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { FormDialog } from "../../../components/patterns/FormDialog/FormDialog.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { MoneyInput } from "../../../components/ui/MoneyInput/MoneyInput.js";
import { Select } from "../../../components/ui/Select/Select.js";
import { Switch } from "../../../components/ui/Switch/Switch.js";
import { TextArea } from "../../../components/ui/TextArea/TextArea.js";
import { TextInput } from "../../../components/ui/TextInput/TextInput.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { fr } from "../../../i18n/fr.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import type { Product } from "../catalog.api.js";
import {
  useCategories,
  useCreateProduct,
  useUnits,
  useUpdateProduct,
} from "../catalog.queries.js";
import {
  productSchema,
  type ProductFormInput,
  type ProductFormOutput,
} from "../catalog.schemas.js";
import styles from "./FormDialogs.module.css";

export interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// Editing an existing product; creation otherwise.
  product?: Product | null;
  onSaved?: (product: Product) => void;
}

function defaultsFor(product: Product | null | undefined): ProductFormInput {
  return {
    name: product?.name ?? "",
    categoryId: product?.categoryId ?? "",
    baseUnitId: product?.baseUnitId ?? "",
    salePriceTnd: product?.salePriceTnd ?? "",
    approximateCostTnd: product?.approximateCostTnd ?? "",
    isStockable: product?.isStockable ?? true,
    code: product?.code ?? "",
    barcode: product?.barcode ?? "",
    notes: product?.notes ?? "",
  };
}

/// Create or edit a product (07 section 4.1). Edits carry the version; a
/// `VERSION_CONFLICT` shows the reload prompt of `FormDialog`.
export function ProductFormDialog({
  open,
  onOpenChange,
  product = null,
  onSaved,
}: ProductFormDialogProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const permissions = useSessionPermissions();
  const categories = useCategories();
  const units = useUnits();
  const create = useCreateProduct();
  const update = useUpdateProduct(product?.id ?? "");
  const form = useForm<ProductFormInput, unknown, ProductFormOutput>({
    resolver: zodResolver(productSchema),
    defaultValues: defaultsFor(product),
  });
  const errors = form.formState.errors;

  useEffect(() => {
    if (open) {
      form.reset(defaultsFor(product));
    }
  }, [open, product, form]);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={product ? `Modifier ${product.name}` : "Nouveau produit"}
      form={form}
      onReload={() => {
        // The newer version is fetched again so the list shows it (AS-V2-15).
        void invalidateAfter(queryClient, "catalog.product");
        onOpenChange(false);
      }}
      onSubmit={async (values) => {
        // Without margin.view the cost is neither shown nor sent, so an
        // edit by a clerk never clears the owner's figure.
        const input = permissions.has("margin.view")
          ? values
          : (({ approximateCostTnd: _cost, ...rest }) => rest)(values);
        const saved = product
          ? await update.mutateAsync({ ...input, version: product.version })
          : await create.mutateAsync(input);
        toast.success(product ? "Produit modifié" : "Produit créé", saved.name);
        onSaved?.(saved);
        onOpenChange(false);
      }}
    >
      <FormField label={fr.name} error={errors.name?.message} required>
        <TextInput {...form.register("name")} />
      </FormField>
      <div className={styles.twoColumns}>
        <FormField
          label={fr.category}
          error={errors.categoryId?.message}
          required
        >
          <Controller
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <Select
                options={(categories.data?.items ?? []).map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
                value={field.value || null}
                onValueChange={(value) => field.onChange(value ?? "")}
                invalid={Boolean(errors.categoryId)}
              />
            )}
          />
        </FormField>
        <FormField
          label="Unité de base"
          error={errors.baseUnitId?.message}
          required
        >
          <Controller
            control={form.control}
            name="baseUnitId"
            render={({ field }) => (
              <Select
                options={(units.data?.items ?? []).map((item) => ({
                  value: item.id,
                  label: `${item.name} (${item.symbol})`,
                }))}
                value={field.value || null}
                onValueChange={(value) => field.onChange(value ?? "")}
                invalid={Boolean(errors.baseUnitId)}
              />
            )}
          />
        </FormField>
      </div>
      <div className={styles.twoColumns}>
        <FormField
          label="Prix de vente"
          error={errors.salePriceTnd?.message}
          required
        >
          <Controller
            control={form.control}
            name="salePriceTnd"
            render={({ field }) => (
              <MoneyInput
                value={field.value ?? ""}
                onChange={field.onChange}
                invalid={Boolean(errors.salePriceTnd)}
              />
            )}
          />
        </FormField>
        <FormField label="Code" error={errors.code?.message} hint="Facultatif">
          <TextInput {...form.register("code")} />
        </FormField>
      </div>
      {permissions.has("margin.view") ? (
        <FormField
          label={fr.approximateCost}
          error={errors.approximateCostTnd?.message}
          hint="Facultatif · par unité de base, ingrédients seulement"
        >
          <Controller
            control={form.control}
            name="approximateCostTnd"
            render={({ field }) => (
              <MoneyInput
                value={field.value ?? ""}
                onChange={field.onChange}
                invalid={Boolean(errors.approximateCostTnd)}
              />
            )}
          />
        </FormField>
      ) : null}
      <FormField
        label="Code-barres"
        error={errors.barcode?.message}
        hint="Facultatif"
      >
        <TextInput {...form.register("barcode")} inputMode="numeric" />
      </FormField>
      <Controller
        control={form.control}
        name="isStockable"
        render={({ field }) => (
          <Switch
            label="Stockable"
            description="Le stock est suivi pour ce produit."
            checked={field.value ?? true}
            onCheckedChange={field.onChange}
          />
        )}
      />
      <FormField label={fr.notes} error={errors.notes?.message}>
        <TextArea {...form.register("notes")} rows={2} />
      </FormField>
    </FormDialog>
  );
}

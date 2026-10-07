import { Printer, Tag, Trash2, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { FilterBar } from "../../../components/patterns/FilterBar/FilterBar.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { Badge } from "../../../components/ui/Badge/Badge.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { Checkbox } from "../../../components/ui/Checkbox/Checkbox.js";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState.js";
import { ErrorState } from "../../../components/ui/ErrorState/ErrorState.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { IconButton } from "../../../components/ui/IconButton/IconButton.js";
import { NumberInput } from "../../../components/ui/NumberInput/NumberInput.js";
import { SegmentedControl } from "../../../components/ui/SegmentedControl/SegmentedControl.js";
import { Select } from "../../../components/ui/Select/Select.js";
import { Skeleton } from "../../../components/ui/Skeleton/Skeleton.js";
import { formatMoney } from "../../../i18n/format.js";
import { useUrlState } from "../../../lib/hooks/useUrlState.js";
import type { Product } from "../catalog.api.js";
import { useCategories, useProductPages } from "../catalog.queries.js";
import { PriceTag } from "../components/PriceTag.js";
import {
  clampTagSize,
  packSheet,
  paginate,
  presetOf,
  SHEET,
  TAG_LIMITS,
  TAG_PRESETS,
  type TagPresetId,
} from "../components/tagLayout.js";
import styles from "./PriceTagsPage.module.css";

const defaults = {
  q: "",
  categoryId: "",
  resale: "",
  w: TAG_PRESETS[1].widthMm as number,
  h: TAG_PRESETS[1].heightMm as number,
};

interface Picked {
  product: Product;
  copies: number;
}

const MAX_COPIES = 50;

/// Issue 024 (`DEC-V2-014`): pick products, choose a tag format, print A4
/// sheets of price tags packed without waste. The filters and the format
/// live in the URL; the selection is local to the page.
export function PriceTagsPage() {
  const [state, setState] = useUrlState(defaults);
  const [picked, setPicked] = useState<Picked[]>([]);
  const categories = useCategories();
  const products = useProductPages({
    pageSize: 100,
    q: state.q || undefined,
    isActive: true,
    sort: { field: "name", direction: "asc" },
    ...(state.categoryId ? { categoryId: state.categoryId } : {}),
    ...(state.resale ? { isResale: state.resale === "true" } : {}),
  });
  const rows = useMemo(
    () => products.data?.pages.flatMap((page) => page.items) ?? [],
    [products.data],
  );
  const total = products.data?.pages[0]?.total ?? 0;
  const activeCount = (state.categoryId ? 1 : 0) + (state.resale ? 1 : 0);

  const { widthMm, heightMm } = clampTagSize({
    widthMm: state.w,
    heightMm: state.h,
  });
  const size = useMemo(() => ({ widthMm, heightMm }), [widthMm, heightMm]);
  const layout = useMemo(() => packSheet(size), [size]);
  const tags = useMemo(
    () =>
      picked.flatMap(({ product, copies }) =>
        Array.from({ length: copies }, (_, copy) => ({
          key: `${product.id}-${copy}`,
          product,
        })),
      ),
    [picked],
  );
  const sheets = useMemo(() => paginate(tags, layout), [tags, layout]);

  const pickedIds = new Set(picked.map((entry) => entry.product.id));
  const allShownPicked =
    rows.length > 0 && rows.every((row) => pickedIds.has(row.id));

  const toggle = (product: Product, checked: boolean) =>
    setPicked((current) =>
      checked
        ? current.some((entry) => entry.product.id === product.id)
          ? current
          : [...current, { product, copies: 1 }]
        : current.filter((entry) => entry.product.id !== product.id),
    );
  const pickShown = () =>
    setPicked((current) => {
      const held = new Set(current.map((entry) => entry.product.id));
      return [
        ...current,
        ...rows
          .filter((row) => !held.has(row.id))
          .map((product) => ({ product, copies: 1 })),
      ];
    });
  const setCopies = (productId: string, copies: number) =>
    setPicked((current) =>
      current.map((entry) =>
        entry.product.id === productId ? { ...entry, copies } : entry,
      ),
    );
  const setSize = (widthMm: number, heightMm: number) =>
    setState({ w: widthMm, h: heightMm });

  const preset: TagPresetId | "custom" = presetOf(size) ?? "custom";

  return (
    <>
      <PageHeader
        eyebrow="Catalogue"
        title="Étiquettes de prix"
        description="Choisissez les produits, le format de l'étiquette, puis imprimez les feuilles A4 à découper."
        breadcrumbs={[
          { label: "Produits", href: "/produits" },
          { label: "Étiquettes" },
        ]}
        actions={
          <Button
            leftIcon={<Printer />}
            disabled={sheets.length === 0}
            onClick={() => window.print()}
          >
            Imprimer
          </Button>
        }
      />
      <div className={styles.layout}>
        <div className={styles.side} data-print="hide">
          <Card padding="none">
            <CardHeader
              title="Produits"
              description={
                total > 0
                  ? `${total} produit${total > 1 ? "s" : ""} actif${total > 1 ? "s" : ""}`
                  : undefined
              }
              actions={
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={rows.length === 0 || allShownPicked}
                  onClick={pickShown}
                >
                  Tout sélectionner
                </Button>
              }
              className={styles.cardHeader}
            />
            <FilterBar
              search={state.q}
              onSearchChange={(q) => setState({ q })}
              searchPlaceholder="Rechercher un produit"
              activeCount={activeCount}
              onReset={() => setState({ categoryId: "", resale: "" })}
              className={styles.filters}
              filters={
                <>
                  <Select
                    aria-label="Catégorie"
                    placeholder="Toutes les catégories"
                    clearable
                    value={state.categoryId || null}
                    onValueChange={(categoryId) =>
                      setState({ categoryId: categoryId ?? "" })
                    }
                    options={(categories.data?.items ?? []).map((category) => ({
                      value: category.id,
                      label: category.name,
                    }))}
                  />
                  <Select
                    aria-label="Origine"
                    placeholder="Toutes les origines"
                    clearable
                    value={state.resale || null}
                    onValueChange={(resale) =>
                      setState({ resale: resale ?? "" })
                    }
                    options={[
                      { value: "false", label: "Fabriqués ici" },
                      { value: "true", label: "Produits de revente" },
                    ]}
                  />
                </>
              }
            />
            <div className={styles.list} role="group" aria-label="Produits">
              {products.isPending ? (
                <div className={styles.listSkeleton}>
                  <Skeleton height={36} />
                  <Skeleton height={36} />
                  <Skeleton height={36} />
                </div>
              ) : products.isError ? (
                <ErrorState
                  title="Les produits n'ont pas pu être chargés"
                  onRetry={() => void products.refetch()}
                />
              ) : rows.length === 0 ? (
                <EmptyState
                  size="sm"
                  icon={<Tag />}
                  title="Aucun produit"
                  description="Aucun produit actif ne correspond à la recherche."
                />
              ) : (
                <ul className={styles.rows}>
                  {rows.map((product) => (
                    <li key={product.id} className={styles.row}>
                      <Checkbox
                        checked={pickedIds.has(product.id)}
                        onCheckedChange={(checked) =>
                          toggle(product, checked === true)
                        }
                        label={product.name}
                        description={
                          <span className={styles.rowMeta}>
                            <Badge tone="neutral">
                              {product.category.name}
                            </Badge>
                            {product.isResale ? (
                              <Badge tone="accent">Revente</Badge>
                            ) : null}
                          </span>
                        }
                      />
                      <span className={styles.rowPrice}>
                        {formatMoney(product.salePriceTnd)}
                        {product.baseUnit.precision > 0
                          ? ` / ${product.baseUnit.symbol}`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {products.hasNextPage ? (
                <div className={styles.more}>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={products.isFetchingNextPage}
                    onClick={() => void products.fetchNextPage()}
                  >
                    Afficher plus
                  </Button>
                </div>
              ) : null}
            </div>
          </Card>

          <Card padding="none">
            <CardHeader
              title="Sélection"
              description={
                tags.length === 0
                  ? "Aucun produit choisi"
                  : `${picked.length} produit${picked.length > 1 ? "s" : ""}, ${tags.length} étiquette${tags.length > 1 ? "s" : ""}`
              }
              actions={
                picked.length > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<Trash2 />}
                    onClick={() => setPicked([])}
                  >
                    Tout retirer
                  </Button>
                ) : null
              }
              className={styles.cardHeader}
            />
            {picked.length === 0 ? (
              <p className={styles.hint}>
                Cochez des produits dans la liste pour composer la feuille.
              </p>
            ) : (
              <ul className={styles.rows} aria-label="Produits choisis">
                {picked.map(({ product, copies }) => (
                  <li key={product.id} className={styles.row}>
                    <span className={styles.pickedName}>{product.name}</span>
                    <NumberInput
                      aria-label={`Exemplaires de ${product.name}`}
                      value={String(copies)}
                      decimals={0}
                      min="1"
                      max={String(MAX_COPIES)}
                      onChange={(value) =>
                        setCopies(
                          product.id,
                          Math.min(
                            MAX_COPIES,
                            Math.max(1, Math.trunc(Number(value) || 1)),
                          ),
                        )
                      }
                      className={styles.copies}
                    />
                    <IconButton
                      label={`Retirer ${product.name}`}
                      icon={<X />}
                      size="sm"
                      variant="ghost"
                      onClick={() => toggle(product, false)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card padding="none">
            <CardHeader
              title="Format de l'étiquette"
              description={`${layout.perPage} par feuille A4, ${Math.round(layout.usedShare * 100)} % de la feuille`}
              className={styles.cardHeader}
            />
            <div className={styles.format}>
              <SegmentedControl
                label="Format"
                fullWidth
                value={preset}
                onValueChange={(value) => {
                  const chosen = TAG_PRESETS.find((item) => item.id === value);
                  if (chosen) setSize(chosen.widthMm, chosen.heightMm);
                }}
                options={[
                  ...TAG_PRESETS.map((item) => ({
                    value: item.id,
                    label: item.label,
                  })),
                  { value: "custom", label: "Libre", disabled: true },
                ]}
              />
              <div className={styles.dimensions}>
                <FormField
                  label="Largeur"
                  hint={`${TAG_LIMITS.minWidthMm} à ${TAG_LIMITS.maxWidthMm} mm`}
                >
                  <NumberInput
                    value={String(size.widthMm)}
                    decimals={0}
                    min={String(TAG_LIMITS.minWidthMm)}
                    max={String(TAG_LIMITS.maxWidthMm)}
                    suffix="mm"
                    onChange={(value) =>
                      value !== "" && setSize(Number(value), size.heightMm)
                    }
                  />
                </FormField>
                <FormField
                  label="Hauteur"
                  hint={`${TAG_LIMITS.minHeightMm} à ${TAG_LIMITS.maxHeightMm} mm`}
                >
                  <NumberInput
                    value={String(size.heightMm)}
                    decimals={0}
                    min={String(TAG_LIMITS.minHeightMm)}
                    max={String(TAG_LIMITS.maxHeightMm)}
                    suffix="mm"
                    onChange={(value) =>
                      value !== "" && setSize(size.widthMm, Number(value))
                    }
                  />
                </FormField>
              </div>
              <p className={styles.hint}>
                Les étiquettes sont posées bord à bord depuis le coin haut
                gauche
                {layout.rotatedCount > 0
                  ? `, ${layout.rotatedCount} d'entre elles tournées d'un quart de tour`
                  : ""}
                . Les chutes se retrouvent à droite et en bas.
              </p>
            </div>
          </Card>
        </div>

        <section className={styles.preview} aria-label="Aperçu des feuilles">
          <p className={styles.summary} data-print="hide">
            {tags.length === 0
              ? "La feuille se remplit au fil de la sélection."
              : `${tags.length} étiquette${tags.length > 1 ? "s" : ""} sur ${sheets.length} feuille${sheets.length > 1 ? "s" : ""} A4`}
          </p>
          {sheets.length === 0 ? (
            <div data-print="hide">
              <EmptyState
                icon={<Tag />}
                title="Aucune étiquette"
                description="Choisissez des produits pour voir la feuille."
              />
            </div>
          ) : (
            <SheetStack>
              {sheets.map((sheet, index) => (
                <div
                  key={index}
                  className={styles.sheet}
                  role="group"
                  aria-label={`Feuille ${index + 1} sur ${sheets.length}`}
                  style={{
                    width: `${SHEET.widthMm}mm`,
                    height: `${SHEET.heightMm}mm`,
                  }}
                >
                  {sheet.map(({ tag, slot }) => (
                    <PriceTag key={tag.key} product={tag.product} slot={slot} />
                  ))}
                </div>
              ))}
            </SheetStack>
          )}
        </section>
      </div>
      <style>{printStyles}</style>
    </>
  );
}

/// The sheets at true size, scaled down to the width available on screen;
/// the stack takes the drawn height. The print stylesheet drops the scale.
function SheetStack({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, height: 0 });

  useEffect(() => {
    const stack = outer.current;
    const sheets = inner.current;
    if (!stack || !sheets || typeof ResizeObserver === "undefined") return;
    const sheetWidthPx = (SHEET.widthMm / 25.4) * 96;
    const update = () => {
      const scale = Math.min(1, stack.clientWidth / sheetWidthPx);
      setFit({ scale, height: sheets.offsetHeight * scale });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stack);
    observer.observe(sheets);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={outer}
      className={styles.stack}
      style={fit.height > 0 ? { height: fit.height } : undefined}
    >
      <div
        ref={inner}
        className={styles.scaled}
        style={{ "--sheet-scale": fit.scale } as CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}

/// Printed after `styles/print.css`, so the sheet wins: A4 without margin,
/// the sheets alone, one per page.
const printStyles = `@media print {
  @page { size: A4 portrait; margin: 0; }
  [data-print="hide"] { display: none !important; }
}`;

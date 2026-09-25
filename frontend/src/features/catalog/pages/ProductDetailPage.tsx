import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { KeyValueList } from "../../../components/patterns/KeyValueList/KeyValueList.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { PermissionGate } from "../../../components/patterns/PermissionGate/PermissionGate.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { ErrorState } from "../../../components/ui/ErrorState/ErrorState.js";
import { Skeleton } from "../../../components/ui/Skeleton/Skeleton.js";
import { StatusPill } from "../../../components/ui/StatusPill/StatusPill.js";
import { Tabs } from "../../../components/ui/Tabs/Tabs.js";
import { describeError } from "../../../i18n/errors.js";
import { formatDate, formatMoney } from "../../../i18n/format.js";
import { fr } from "../../../i18n/fr.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import { useSimulations } from "../../simulation/simulation.queries.js";
import { useProduct } from "../catalog.queries.js";
import { ProductFormDialog } from "../components/ProductFormDialog.js";
import { productMargin } from "../components/productMargin.js";
import {
  HistoryTab,
  MovementsTab,
  StockTab,
} from "../components/detailTabs.js";
import { StockMovementDialog } from "../../inventory/components/StockMovementDialog.js";
import styles from "./CatalogPages.module.css";

/// `/produits/:id` (UI-10): summary, then Stock, Mouvements and Historique.
export function ProductDetailPage() {
  const { productId = "" } = useParams();
  const permissions = useSessionPermissions();
  const query = useProduct(productId);
  const [editing, setEditing] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const product = query.data;
  const canSeeMargin = permissions.has("margin.view");
  // Issue 008: the latest saved simulation targeting this product, as a
  // hint next to the typed cost. Simulations stay a planning tool; nothing
  // is copied without the owner typing it (SIM-*).
  const lastSimulation = useSimulations(
    {
      page: 1,
      pageSize: 1,
      targetProductId: productId,
      sort: { field: "updatedAt", direction: "desc" },
    },
    canSeeMargin && permissions.has("simulations.view"),
  );
  const simulation = lastSimulation.data?.items[0];
  const margin = product
    ? productMargin(product.salePriceTnd, product.approximateCostTnd)
    : null;

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

  if (!product) {
    return <Skeleton variant="table" rows={6} />;
  }

  return (
    <>
      <PageHeader
        eyebrow="Catalogue"
        title={product.name}
        breadcrumbs={[
          { label: "Produits", href: "/produits" },
          { label: product.name },
        ]}
        badge={<StatusPill status={product.isActive ? "ACTIVE" : "INACTIVE"} />}
        actions={
          <>
            <PermissionGate
              permissions={permissions}
              permission="inventory.adjust"
            >
              <Button
                variant="secondary"
                leftIcon={<Plus />}
                onClick={() => setAdjusting(true)}
                disabled={!product.isStockable}
              >
                Ajustement
              </Button>
            </PermissionGate>
            <PermissionGate
              permissions={permissions}
              permission="products.update"
            >
              <Button leftIcon={<Pencil />} onClick={() => setEditing(true)}>
                Modifier
              </Button>
            </PermissionGate>
          </>
        }
      />
      <div className={styles.tabBody}>
        <Card>
          <CardHeader as="h2" title="Fiche produit" />
          <KeyValueList
            items={[
              { label: "Catégorie", value: product.category.name },
              {
                label: "Unité de base",
                value: `${product.baseUnit.name} (${product.baseUnit.symbol})`,
              },
              {
                label: "Prix de vente",
                value: formatMoney(product.salePriceTnd),
                numeric: true,
              },
              ...(canSeeMargin
                ? [
                    {
                      label: fr.approximateCost,
                      value:
                        product.approximateCostTnd === null ||
                        product.approximateCostTnd === undefined ? (
                          <span>Non renseigné</span>
                        ) : (
                          formatMoney(product.approximateCostTnd)
                        ),
                      numeric: true,
                    },
                    {
                      label: fr.approximateMargin,
                      value: margin ? (
                        <span>
                          {formatMoney(margin.amountTnd)}
                          {margin.rate
                            ? ` (${margin.rate.replace(".", ",")} %)`
                            : ""}
                        </span>
                      ) : null,
                      numeric: true,
                    },
                    ...(simulation
                      ? [
                          {
                            label: "Dernière simulation",
                            value: (
                              <Link to={`/simulations/${simulation.id}`}>
                                {formatMoney(simulation.costPerOutputUnitTnd)}{" "}
                                par{" "}
                                {simulation.outputUnitNameSnapshot.toLowerCase()}{" "}
                                · {simulation.name}
                              </Link>
                            ),
                            numeric: true,
                          },
                        ]
                      : []),
                  ]
                : []),
              {
                label: "Stockable",
                value: product.isStockable ? "Oui" : "Non",
              },
              { label: "Code", value: product.code },
              { label: "Code-barres", value: product.barcode },
              { label: "Créé le", value: formatDate(product.createdAt) },
              { label: "Notes", value: product.notes },
            ]}
          />
        </Card>
        <Tabs
          label="Détail du produit"
          items={[
            {
              value: "stock",
              label: "Stock",
              content: (
                <StockTab
                  itemType="PRODUCT"
                  itemId={product.id}
                  unitSymbol={product.baseUnit.symbol}
                  tracked={product.isStockable}
                />
              ),
            },
            {
              value: "movements",
              label: "Mouvements",
              content: <MovementsTab itemId={product.id} />,
            },
            {
              value: "history",
              label: "Historique",
              content: <HistoryTab entity="product" targetId={product.id} />,
            },
          ]}
        />
      </div>
      <ProductFormDialog
        open={editing}
        onOpenChange={setEditing}
        product={product}
      />
      {adjusting ? (
        <StockMovementDialog
          kind="adjustment"
          open
          onOpenChange={(open) => !open && setAdjusting(false)}
          item={{
            itemType: "PRODUCT",
            itemId: product.id,
            label: product.name,
            unitSymbol: product.baseUnit.symbol,
            currentQuantity: "0",
          }}
        />
      ) : null}
    </>
  );
}

import { Pencil } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
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
import { formatDate } from "../../../i18n/format.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import { useRawMaterial } from "../catalog.queries.js";
import { RawMaterialFormDialog } from "../components/RawMaterialFormDialog.js";
import {
  MovementsTab,
  PurchasesTab,
  StockTab,
} from "../components/detailTabs.js";
import { PriceHistoryTab } from "../components/PriceHistoryTab.js";
import { conversionsSummary } from "./RawMaterialsPage.js";
import styles from "./CatalogPages.module.css";

/// `/matieres-premieres/:id` (UI-10): summary, then Stock, Mouvements, Achats.
export function RawMaterialDetailPage() {
  const { rawMaterialId = "" } = useParams();
  const permissions = useSessionPermissions();
  const query = useRawMaterial(rawMaterialId);
  const [editing, setEditing] = useState(false);
  const rawMaterial = query.data;

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

  if (!rawMaterial) {
    return <Skeleton variant="table" rows={6} />;
  }

  return (
    <>
      <PageHeader
        eyebrow="Catalogue"
        title={rawMaterial.name}
        breadcrumbs={[
          { label: "Matières premières", href: "/matieres-premieres" },
          { label: rawMaterial.name },
        ]}
        badge={
          <StatusPill
            status={rawMaterial.isActive ? "ACTIVE" : "INACTIVE"}
            label={rawMaterial.isActive ? "Active" : "Inactive"}
          />
        }
        actions={
          <PermissionGate
            permissions={permissions}
            permission="raw_materials.update"
          >
            <Button leftIcon={<Pencil />} onClick={() => setEditing(true)}>
              Modifier
            </Button>
          </PermissionGate>
        }
      />
      <div className={styles.tabBody}>
        <Card>
          <CardHeader as="h2" title="Fiche matière première" />
          <KeyValueList
            items={[
              {
                label: "Unité de base",
                value: `${rawMaterial.baseUnit.name} (${rawMaterial.baseUnit.symbol})`,
              },
              {
                label: "Conversions",
                value: conversionsSummary(rawMaterial) || "Aucune",
              },
              { label: "Famille", value: rawMaterial.category },
              { label: "Code", value: rawMaterial.code },
              { label: "Créée le", value: formatDate(rawMaterial.createdAt) },
              { label: "Notes", value: rawMaterial.notes },
            ]}
          />
        </Card>
        <Tabs
          label="Détail de la matière première"
          items={[
            {
              value: "stock",
              label: "Stock",
              content: (
                <StockTab
                  itemType="RAW_MATERIAL"
                  itemId={rawMaterial.id}
                  unitSymbol={rawMaterial.baseUnit.symbol}
                />
              ),
            },
            {
              value: "movements",
              label: "Mouvements",
              content: <MovementsTab itemId={rawMaterial.id} />,
            },
            {
              value: "purchases",
              label: "Achats",
              content: <PurchasesTab rawMaterialId={rawMaterial.id} />,
            },
            // Issue 023: how the price paid moved, purchase after purchase.
            ...(permissions.has("purchases.view")
              ? [
                  {
                    value: "prices",
                    label: "Prix",
                    content: (
                      <PriceHistoryTab
                        item={{
                          rawMaterialId: rawMaterial.id,
                          unitSymbol: rawMaterial.baseUnit.symbol,
                        }}
                      />
                    ),
                  },
                ]
              : []),
          ]}
        />
      </div>
      <RawMaterialFormDialog
        open={editing}
        onOpenChange={setEditing}
        rawMaterial={rawMaterial}
      />
    </>
  );
}

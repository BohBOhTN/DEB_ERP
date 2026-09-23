import { Copy, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/patterns/DataTable/DataTable.js";
import { KeyValueList } from "../../../components/patterns/KeyValueList/KeyValueList.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { PermissionGate } from "../../../components/patterns/PermissionGate/PermissionGate.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { ErrorState } from "../../../components/ui/ErrorState/ErrorState.js";
import { Skeleton } from "../../../components/ui/Skeleton/Skeleton.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { describeError } from "../../../i18n/errors.js";
import {
  formatDateTime,
  formatMoney,
  formatQuantity,
} from "../../../i18n/format.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import type { SimulationIngredient } from "../simulation.api.js";
import {
  useDuplicateSimulation,
  useSimulation,
} from "../simulation.queries.js";
import { DeleteSimulationDialog } from "../components/DeleteSimulationDialog.js";
import { SimulationTotalsCard } from "../components/SimulationTotalsCard.js";
import styles from "./SimulationPages.module.css";

/// `/simulations/:id` (UI-18): the saved scenario as it was calculated,
/// with Dupliquer, Modifier and Supprimer.
export function SimulationDetailPage() {
  const { simulationId = "" } = useParams();
  const permissions = useSessionPermissions();
  const navigate = useNavigate();
  const toast = useToast();
  const query = useSimulation(simulationId);
  const duplicate = useDuplicateSimulation();
  const [deleting, setDeleting] = useState(false);
  const simulation = query.data;

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

  if (!simulation) {
    return <Skeleton variant="table" rows={6} />;
  }

  const columns: DataTableColumn<SimulationIngredient>[] = [
    {
      id: "name",
      header: "Ingrédient",
      accessorFn: (row) => row.ingredientName,
    },
    {
      id: "quantity",
      header: "Quantité",
      meta: { align: "right" },
      accessorFn: (row) =>
        formatQuantity(row.enteredQuantity, row.enteredUnitNameSnapshot),
    },
    {
      id: "base",
      header: "Quantité de base",
      meta: { align: "right" },
      accessorFn: (row) =>
        row.conversionFactorToBase === "1.000000"
          ? "—"
          : formatQuantity(row.baseQuantity, row.priceBasisUnitNameSnapshot),
    },
    {
      id: "price",
      header: "Prix unitaire",
      meta: { align: "right" },
      accessorFn: (row) =>
        `${formatMoney(row.unitPriceTnd)} / ${row.priceBasisUnitNameSnapshot.toLowerCase()}`,
    },
    {
      id: "cost",
      header: "Coût",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.lineCostTnd),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Finances"
        title={simulation.name}
        breadcrumbs={[
          { label: "Simulations", href: "/simulations" },
          { label: simulation.name },
        ]}
        actions={
          <>
            <PermissionGate
              permissions={permissions}
              permission="simulations.update"
            >
              <Button
                leftIcon={<Pencil />}
                onClick={() =>
                  navigate(`/simulations/${simulation.id}/modifier`)
                }
              >
                Modifier
              </Button>
            </PermissionGate>
            <PermissionGate
              permissions={permissions}
              permission="simulations.create"
            >
              <Button
                variant="secondary"
                leftIcon={<Copy />}
                loading={duplicate.isPending}
                onClick={() =>
                  duplicate.mutate(
                    {
                      simulationId: simulation.id,
                      name: `${simulation.name} (copie)`,
                    },
                    {
                      onSuccess: (copy) => {
                        toast.success("Simulation dupliquée", copy.name);
                        navigate(`/simulations/${copy.id}`);
                      },
                      onError: (error) => toast.fromError(error),
                    },
                  )
                }
              >
                Dupliquer
              </Button>
            </PermissionGate>
            <PermissionGate
              permissions={permissions}
              permission="simulations.delete"
            >
              <Button
                variant="danger"
                leftIcon={<Trash2 />}
                onClick={() => setDeleting(true)}
              >
                Supprimer
              </Button>
            </PermissionGate>
          </>
        }
      />
      <div className={styles.stack}>
        <p className={styles.banner} role="note">
          Une simulation n'a aucun effet sur le stock ni la comptabilité.
        </p>
        <div className={styles.summaryGrid}>
          <div className={styles.stack}>
            <Card>
              <CardHeader as="h2" title="Scénario" />
              <KeyValueList
                columns={2}
                items={[
                  {
                    label: "Produit visé",
                    value: simulation.targetProductNameSnapshot,
                  },
                  {
                    label: "Quantité produite",
                    value: formatQuantity(
                      simulation.outputQuantity,
                      simulation.outputUnitNameSnapshot,
                    ),
                  },
                  {
                    label: "Modifiée le",
                    value: formatDateTime(simulation.updatedAt),
                  },
                  { label: "Notes", value: simulation.notes },
                ]}
              />
            </Card>
            <Card padding="none">
              <DataTable<SimulationIngredient>
                label="Ingrédients"
                columns={columns}
                data={simulation.ingredients}
                total={simulation.ingredients.length}
                page={1}
                pageSize={Math.max(simulation.ingredients.length, 1)}
                onChange={() => undefined}
                getRowId={(row) => row.id}
                empty={{ title: "Aucun ingrédient" }}
                mobileCard={(row) => (
                  <>
                    <span className={styles.cardTop}>
                      <strong>{row.ingredientName}</strong>
                      <span className="tabular-nums">
                        {formatMoney(row.lineCostTnd)}
                      </span>
                    </span>
                    <span className={styles.muted}>
                      {formatQuantity(
                        row.enteredQuantity,
                        row.enteredUnitNameSnapshot,
                      )}{" "}
                      × {formatMoney(row.unitPriceTnd)} /{" "}
                      {row.priceBasisUnitNameSnapshot.toLowerCase()}
                    </span>
                  </>
                )}
              />
            </Card>
          </div>
          <Card>
            <CardHeader as="h2" title="Coût" />
            <SimulationTotalsCard
              totalTnd={simulation.totalIngredientCostTnd}
              perUnitTnd={simulation.costPerOutputUnitTnd}
              outputUnitName={simulation.outputUnitNameSnapshot}
              salePriceTnd={simulation.targetProduct?.salePriceTnd ?? null}
            />
          </Card>
        </div>
      </div>
      <DeleteSimulationDialog
        simulation={deleting ? simulation : null}
        onClose={() => setDeleting(false)}
        onDeleted={() => navigate("/simulations")}
      />
    </>
  );
}

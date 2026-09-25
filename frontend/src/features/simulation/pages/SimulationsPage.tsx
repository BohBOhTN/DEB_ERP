import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/patterns/DataTable/DataTable.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { PermissionGate } from "../../../components/patterns/PermissionGate/PermissionGate.js";
import { Button } from "../../../components/ui/Button/Button.js";
import {
  formatDateTime,
  formatMoney,
  formatQuantity,
} from "../../../i18n/format.js";
import { useUrlState } from "../../../lib/hooks/useUrlState.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import type { CostSimulation } from "../simulation.api.js";
import { useSimulations } from "../simulation.queries.js";
import styles from "./SimulationPages.module.css";

const defaults = { sort: "updatedAt:desc", page: 1, pageSize: 25 };

/// `/simulations` (UI-18): saved scenarios with their unit cost; the banner
/// says the module touches nothing operational (SIM-003).
export function SimulationsPage() {
  const permissions = useSessionPermissions();
  const navigate = useNavigate();
  const [state, setState] = useUrlState(defaults);
  const [field, direction] = state.sort.split(":");
  const sort = {
    field: field || "updatedAt",
    direction: direction === "asc" ? ("asc" as const) : ("desc" as const),
  };
  const query = useSimulations({
    page: state.page,
    pageSize: state.pageSize,
    sort,
  });

  const columns: DataTableColumn<CostSimulation>[] = [
    {
      id: "name",
      header: "Nom",
      meta: { sortField: "name" },
      accessorFn: (row) => row.name,
    },
    {
      id: "product",
      header: "Produit visé",
      accessorFn: (row) => row.targetProductNameSnapshot ?? "—",
    },
    {
      id: "output",
      header: "Quantité produite",
      meta: { align: "right" },
      accessorFn: (row) =>
        formatQuantity(row.outputQuantity, row.outputUnitNameSnapshot),
    },
    {
      id: "total",
      header: "Coût total",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.totalIngredientCostTnd),
    },
    {
      id: "unit",
      header: "Coût unitaire",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.costPerOutputUnitTnd),
    },
    {
      id: "updated",
      header: "Modifiée le",
      meta: { sortField: "updatedAt" },
      accessorFn: (row) => formatDateTime(row.updatedAt),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Finances"
        title="Simulation de coût"
        description="Estimez le coût des ingrédients d'une production."
        actions={
          <PermissionGate
            permissions={permissions}
            permission="simulations.create"
          >
            <Button
              leftIcon={<Plus />}
              onClick={() => navigate("/simulations/nouvelle")}
            >
              Nouvelle simulation
            </Button>
          </PermissionGate>
        }
      />
      <div className={styles.stack}>
        <p className={styles.banner} role="note">
          Une simulation n'a aucun effet sur le stock ni la comptabilité.
        </p>
        <DataTable<CostSimulation>
          label="Simulations"
          columns={columns}
          data={query.data?.items ?? []}
          total={query.data?.total ?? 0}
          page={state.page}
          pageSize={state.pageSize}
          sort={sort}
          onChange={(change) =>
            setState({
              ...(change.page ? { page: change.page } : {}),
              ...(change.pageSize ? { pageSize: change.pageSize } : {}),
              ...(change.sort
                ? { sort: `${change.sort.field}:${change.sort.direction}` }
                : {}),
            })
          }
          loading={query.isPending || query.isFetching}
          error={query.error}
          onRetry={() => void query.refetch()}
          empty={{
            title: "Aucune simulation",
            description:
              "Créez une simulation pour estimer le coût d'une production.",
          }}
          getRowId={(row) => row.id}
          onRowClick={(row) => navigate(`/simulations/${row.id}`)}
          mobileCard={(row) => (
            <>
              <span className={styles.cardTop}>
                <strong>{row.name}</strong>
                <span className="tabular-nums">
                  {formatMoney(row.costPerOutputUnitTnd)} /{" "}
                  {row.outputUnitNameSnapshot.toLowerCase()}
                </span>
              </span>
              <span className={styles.muted}>
                {formatQuantity(row.outputQuantity, row.outputUnitNameSnapshot)}{" "}
                · coût total {formatMoney(row.totalIngredientCostTnd)}
              </span>
            </>
          )}
        />
      </div>
    </>
  );
}

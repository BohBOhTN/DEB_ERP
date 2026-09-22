import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import type { KitEntry } from "../../kit/types.js";
import type { SortSpec } from "../../../lib/api/pagination.js";
import { formatDate, formatMoney } from "../../../i18n/format.js";
import { IconButton } from "../../ui/IconButton/IconButton.js";
import {
  StatusPill,
  type DocumentStatus,
} from "../../ui/StatusPill/StatusPill.js";
import { DataTable, type DataTableColumn } from "./DataTable.js";

interface PurchaseRow {
  id: string;
  reference: string;
  supplier: string;
  purchasedAt: string;
  totalTnd: string;
  status: DocumentStatus;
}

const all: PurchaseRow[] = Array.from({ length: 12 }, (_, index) => ({
  id: `p${index + 1}`,
  reference: `AC-${String(index + 1).padStart(6, "0")}`,
  supplier:
    ["Minoterie du Sud", "Sucrerie Nord", "Laiterie Ben Ali"][index % 3] ?? "",
  purchasedAt: `2026-09-${String(22 - index).padStart(2, "0")}T08:00:00.000Z`,
  totalTnd: String(1250 - index * 37.5),
  status:
    (["POSTED", "PARTIAL", "DRAFT", "CANCELLED"] as DocumentStatus[])[
      index % 4
    ] ?? "DRAFT",
}));

const columns: DataTableColumn<PurchaseRow>[] = [
  {
    id: "reference",
    header: "Référence",
    accessorKey: "reference",
    meta: { sortField: "reference", width: "130px" },
  },
  {
    id: "supplier",
    header: "Fournisseur",
    accessorKey: "supplier",
    meta: { sortField: "supplierName" },
  },
  {
    id: "date",
    header: "Date",
    accessorFn: (row) => formatDate(row.purchasedAt),
    meta: { sortField: "purchasedAt" },
  },
  {
    id: "total",
    header: "Total",
    accessorFn: (row) => formatMoney(row.totalTnd),
    meta: { align: "right", sortField: "totalTnd" },
  },
  {
    id: "status",
    header: "Statut",
    cell: ({ row }) => <StatusPill status={row.original.status} />,
  },
];

function Example({ state }: { state?: "loading" | "empty" | "error" }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<SortSpec | undefined>({
    field: "purchasedAt",
    direction: "desc",
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const data = state ? [] : all.slice((page - 1) * pageSize, page * pageSize);

  return (
    <DataTable<PurchaseRow>
      label="Achats"
      columns={columns}
      data={data}
      total={state ? 0 : all.length}
      page={page}
      pageSize={pageSize}
      sort={sort}
      loading={state === "loading"}
      error={
        state === "error"
          ? {
              code: "SERVICE_UNAVAILABLE",
              message: "",
              correlationId: "7f3a9c2e",
            }
          : undefined
      }
      onRetry={() => undefined}
      empty={{
        title: "Aucun achat",
        description: "Créez votre premier achat pour alimenter le stock.",
      }}
      onChange={(change) => {
        if (change.page) setPage(change.page);
        if (change.pageSize) setPageSize(change.pageSize);
        if (change.sort) setSort(change.sort);
      }}
      getRowId={(row) => row.id}
      selectable
      selectedIds={selected}
      onSelectionChange={setSelected}
      rowActions={() => (
        <IconButton label="Actions" icon={<MoreHorizontal />} size="sm" />
      )}
      mobileCard={(row) => (
        <>
          <strong>{row.reference}</strong>
          <span>{row.supplier}</span>
          <span>
            {formatDate(row.purchasedAt)} ·{" "}
            <span className="tabular-nums">{formatMoney(row.totalTnd)}</span>
          </span>
          <StatusPill status={row.status} />
        </>
      )}
    />
  );
}

export const kit: KitEntry = {
  name: "DataTable",
  group: "patterns",
  description:
    "Tableau piloté par le serveur : tri, pagination, sélection, cartes sur téléphone, états.",
  examples: [
    { title: "Achats", render: () => <Example /> },
    { title: "Chargement", render: () => <Example state="loading" /> },
    { title: "Vide", render: () => <Example state="empty" /> },
    { title: "Erreur", render: () => <Example state="error" /> },
  ],
};

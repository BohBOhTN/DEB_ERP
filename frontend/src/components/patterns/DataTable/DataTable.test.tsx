import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../lib/api/errors.js";
import { DataTable, type DataTableColumn } from "./DataTable.js";

interface RowShape {
  id: string;
  name: string;
  totalTnd: string;
}

const columns: DataTableColumn<RowShape>[] = [
  {
    id: "name",
    header: "Nom",
    accessorKey: "name",
    meta: { sortField: "name" },
  },
  {
    id: "total",
    header: "Total",
    accessorKey: "totalTnd",
    meta: { align: "right", sortField: "totalTnd" },
  },
];

const rows: RowShape[] = [
  { id: "1", name: "Minoterie du Sud", totalTnd: "1 250,000" },
  { id: "2", name: "Sucrerie Nord", totalTnd: "320,000" },
];

function renderTable(
  overrides: Partial<Parameters<typeof DataTable<RowShape>>[0]> = {},
) {
  const onChange = vi.fn();
  render(
    <DataTable<RowShape>
      label="Fournisseurs"
      columns={columns}
      data={rows}
      total={52}
      page={2}
      pageSize={25}
      sort={{ field: "name", direction: "asc" }}
      onChange={onChange}
      getRowId={(row) => row.id}
      {...overrides}
    />,
  );

  return onChange;
}

describe("DataTable", () => {
  it("renders headers with sort state and emits sort and page changes", async () => {
    const onChange = renderTable();

    expect(
      screen.getByRole("table", { name: "Fournisseurs" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Nom/ })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    expect(screen.getByText("1 250,000")).toHaveClass("tabular-nums");

    await userEvent.click(screen.getByRole("button", { name: /^Nom/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      sort: { field: "name", direction: "desc" },
      page: 1,
    });

    await userEvent.click(screen.getByRole("button", { name: "Suivant" }));
    expect(onChange).toHaveBeenLastCalledWith({ page: 3 });
    expect(screen.getByText("Page 2 sur 3")).toBeInTheDocument();
    expect(screen.getByText(/Affichage de 26 à 50 sur 52/)).toBeInTheDocument();
  });

  it("shows the skeleton, the empty state and the error state", () => {
    const { unmount } = render(
      <DataTable<RowShape>
        label="A"
        columns={columns}
        data={[]}
        total={0}
        page={1}
        pageSize={25}
        onChange={() => undefined}
        loading
      />,
    );
    expect(screen.getByLabelText("Chargement")).toBeInTheDocument();
    unmount();

    const second = render(
      <DataTable<RowShape>
        label="B"
        columns={columns}
        data={[]}
        total={0}
        page={1}
        pageSize={25}
        onChange={() => undefined}
        empty={{
          title: "Aucun fournisseur",
          description: "Ajoutez votre premier fournisseur.",
        }}
      />,
    );
    expect(screen.getByText("Aucun fournisseur")).toBeInTheDocument();
    second.unmount();

    render(
      <DataTable<RowShape>
        label="C"
        columns={columns}
        data={[]}
        total={0}
        page={1}
        pageSize={25}
        onChange={() => undefined}
        error={
          new ApiError({
            code: "SERVICE_UNAVAILABLE",
            message: "",
            status: 503,
            correlationId: "corr-9",
          })
        }
        onRetry={() => undefined}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Service indisponible");
    expect(screen.getByText("corr-9")).toBeInTheDocument();
  });

  it("selects rows", async () => {
    const onSelectionChange = vi.fn();
    renderTable({
      selectable: true,
      selectedIds: new Set(),
      onSelectionChange,
    });

    await userEvent.click(
      screen.getAllByRole("checkbox", {
        name: "Sélectionner la ligne",
      })[0] as HTMLElement,
    );
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(["1"]));

    await userEvent.click(
      screen.getByRole("checkbox", { name: "Tout sélectionner" }),
    );
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(["1", "2"]));
  });
});

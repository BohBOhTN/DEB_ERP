import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../../lib/cx.js";
import { pageSizeOptions, type SortSpec } from "../../../lib/api/pagination.js";
import { useIsPhone } from "../../../lib/hooks/useBreakpoint.js";
import { fr, plural, t } from "../../../i18n/fr.js";
import { describeError } from "../../../i18n/errors.js";
import { Checkbox } from "../../ui/Checkbox/Checkbox.js";
import { EmptyState } from "../../ui/EmptyState/EmptyState.js";
import { ErrorState } from "../../ui/ErrorState/ErrorState.js";
import { IconButton } from "../../ui/IconButton/IconButton.js";
import { Select } from "../../ui/Select/Select.js";
import { Skeleton } from "../../ui/Skeleton/Skeleton.js";
import styles from "./DataTable.module.css";

export interface DataTableColumnMeta {
  /// Money and quantity columns: right-aligned tabular numerals.
  align?: "left" | "right" | "center";
  /// Sort field sent to the API when the header is clicked.
  sortField?: string;
  /// Hidden below 600 px when the row is rendered as a card by `mobileCard`.
  width?: string;
}

export type DataTableColumn<TRow> = ColumnDef<TRow, unknown> & {
  meta?: DataTableColumnMeta;
};

export interface DataTableChange {
  page?: number;
  pageSize?: number;
  sort?: SortSpec;
}

export interface DataTableProps<TRow> {
  columns: DataTableColumn<TRow>[];
  data: TRow[];
  total: number;
  page: number;
  pageSize: number;
  sort?: SortSpec;
  onChange: (change: DataTableChange) => void;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty?: { title: string; description?: string; action?: ReactNode };
  rowActions?: (row: TRow) => ReactNode;
  /// Card rendering below 600 px; without it the table scrolls horizontally.
  mobileCard?: (row: TRow) => ReactNode;
  getRowId?: (row: TRow) => string;
  onRowClick?: (row: TRow) => void;
  selectable?: boolean;
  selectedIds?: ReadonlySet<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  /// Accessible name of the table.
  label: string;
  className?: string;
}

/// Server-driven table (05 section 3.2): page, size and sort go to the API
/// through `onChange`; nothing is sliced or sorted in the browser.
export function DataTable<TRow>({
  columns,
  data,
  total,
  page,
  pageSize,
  sort,
  onChange,
  loading = false,
  error,
  onRetry,
  empty,
  rowActions,
  mobileCard,
  getRowId,
  onRowClick,
  selectable = false,
  selectedIds,
  onSelectionChange,
  label,
  className,
}: DataTableProps<TRow>) {
  const isPhone = useIsPhone();
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
  });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const toggleAll = (checked: boolean) => {
    if (!onSelectionChange) {
      return;
    }

    const next = new Set(selectedIds);
    for (const row of table.getRowModel().rows) {
      if (checked) {
        next.add(row.id);
      } else {
        next.delete(row.id);
      }
    }
    onSelectionChange(next);
  };

  const toggleRow = (row: Row<TRow>, checked: boolean) => {
    if (!onSelectionChange) {
      return;
    }

    const next = new Set(selectedIds);
    if (checked) {
      next.add(row.id);
    } else {
      next.delete(row.id);
    }
    onSelectionChange(next);
  };

  const headerSortButton = (
    headerLabel: ReactNode,
    field: string | undefined,
    align?: string,
  ) => {
    if (!field) {
      return headerLabel;
    }

    const active = sort?.field === field;
    const Icon = active
      ? sort?.direction === "asc"
        ? ArrowUp
        : ArrowDown
      : ArrowUpDown;
    const nextDirection: "asc" | "desc" =
      active && sort?.direction === "asc" ? "desc" : "asc";

    return (
      <button
        type="button"
        className={cx(styles.sortButton, align === "right" && styles.sortRight)}
        onClick={() =>
          onChange({ sort: { field, direction: nextDirection }, page: 1 })
        }
        aria-label={`${typeof headerLabel === "string" ? headerLabel : field} : ${nextDirection === "asc" ? fr.sortAscending : fr.sortDescending}`}
      >
        {headerLabel}
        <Icon
          aria-hidden="true"
          className={cx(styles.sortIcon, active && styles.sortActive)}
        />
      </button>
    );
  };

  let body: ReactNode;

  if (error) {
    const copy = describeError(error);
    const correlationId =
      (error as { correlationId?: string | null })?.correlationId ?? undefined;
    body = (
      <ErrorState
        title={copy.title}
        description={copy.description}
        onRetry={onRetry}
        correlationId={correlationId}
      />
    );
  } else if (loading && data.length === 0) {
    body = <Skeleton variant="table" rows={Math.min(pageSize, 8)} />;
  } else if (data.length === 0) {
    body = (
      <EmptyState
        illustration="ledger"
        size="sm"
        title={empty?.title ?? fr.noResults}
        description={empty?.description ?? fr.noResultsDescription}
        action={empty?.action}
      />
    );
  } else if (isPhone && mobileCard) {
    body = (
      <ul
        className={styles.cards}
        aria-label={label}
        aria-busy={loading || undefined}
      >
        {table.getRowModel().rows.map((row) => (
          <li
            key={row.id}
            className={cx(styles.card, onRowClick && styles.clickable)}
          >
            {selectable ? (
              <Checkbox
                label={fr.selectRow}
                checked={selectedIds?.has(row.id) ?? false}
                onCheckedChange={(checked) => toggleRow(row, checked === true)}
                className={styles.cardCheckbox}
              />
            ) : null}
            <div
              className={styles.cardBody}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => event.key === "Enter" && onRowClick(row.original)
                  : undefined
              }
              role={onRowClick ? "button" : undefined}
              tabIndex={onRowClick ? 0 : undefined}
            >
              {mobileCard(row.original)}
            </div>
            {rowActions ? (
              <div className={styles.cardActions}>
                {rowActions(row.original)}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    );
  } else {
    body = (
      <div className={styles.scroller}>
        <table
          className={styles.table}
          aria-label={label}
          aria-busy={loading || undefined}
        >
          <thead className={styles.head}>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {selectable ? (
                  <th scope="col" className={styles.selectCell}>
                    <Checkbox
                      label={fr.selectAll}
                      checked={
                        table.getRowModel().rows.length > 0 &&
                        table
                          .getRowModel()
                          .rows.every((row) => selectedIds?.has(row.id))
                          ? true
                          : table
                                .getRowModel()
                                .rows.some((row) => selectedIds?.has(row.id))
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={(checked) => toggleAll(checked === true)}
                    />
                  </th>
                ) : null}
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as
                    DataTableColumnMeta | undefined;

                  return (
                    <th
                      key={header.id}
                      scope="col"
                      className={cx(
                        styles.th,
                        meta?.align === "right" && styles.right,
                        meta?.align === "center" && styles.center,
                      )}
                      style={meta?.width ? { width: meta.width } : undefined}
                      aria-sort={
                        meta?.sortField && sort?.field === meta.sortField
                          ? sort.direction === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                    >
                      {header.isPlaceholder
                        ? null
                        : headerSortButton(
                            flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            ),
                            meta?.sortField,
                            meta?.align,
                          )}
                    </th>
                  );
                })}
                {rowActions ? (
                  <th scope="col" className={styles.actionsHead}>
                    <span className="visually-hidden">{fr.actions}</span>
                  </th>
                ) : null}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={cx(
                  styles.tr,
                  onRowClick && styles.clickable,
                  selectedIds?.has(row.id) && styles.selected,
                )}
                onClick={
                  onRowClick ? () => onRowClick(row.original) : undefined
                }
                onKeyDown={
                  onRowClick
                    ? (event) =>
                        event.key === "Enter" && onRowClick(row.original)
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
              >
                {selectable ? (
                  <td
                    className={styles.selectCell}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Checkbox
                      label={fr.selectRow}
                      checked={selectedIds?.has(row.id) ?? false}
                      onCheckedChange={(checked) =>
                        toggleRow(row, checked === true)
                      }
                    />
                  </td>
                ) : null}
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta as
                    DataTableColumnMeta | undefined;

                  return (
                    <td
                      key={cell.id}
                      className={cx(
                        styles.td,
                        meta?.align === "right" &&
                          cx(styles.right, "tabular-nums"),
                        meta?.align === "center" && styles.center,
                      )}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  );
                })}
                {rowActions ? (
                  <td
                    className={styles.actionsCell}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {rowActions(row.original)}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className={cx(styles.root, className)}>
      {loading && data.length > 0 ? (
        <div className={styles.refreshBar} aria-hidden="true" />
      ) : null}
      {body}
      {!error && total > 0 ? (
        <div className={styles.footer}>
          <p className={styles.summary}>
            {t("showing", { from, to, total })}
            {" · "}
            {plural(total, "élément")}
          </p>
          <div className={styles.pager}>
            <label className={styles.pageSize}>
              <span className="visually-hidden">{fr.rowsPerPage}</span>
              <Select
                aria-label={fr.rowsPerPage}
                options={pageSizeOptions.map((size) => ({
                  value: String(size),
                  label: String(size),
                }))}
                value={String(pageSize)}
                onValueChange={(value) =>
                  value && onChange({ pageSize: Number(value), page: 1 })
                }
              />
            </label>
            <IconButton
              label={fr.previous}
              icon={<ChevronLeft />}
              size="sm"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => onChange({ page: page - 1 })}
            />
            <span
              className={cx(styles.pageLabel, "tabular-nums")}
              aria-live="polite"
            >
              {t("pageOf", { page, pageCount })}
            </span>
            <IconButton
              label={fr.next}
              icon={<ChevronRight />}
              size="sm"
              variant="secondary"
              disabled={page >= pageCount}
              onClick={() => onChange({ page: page + 1 })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

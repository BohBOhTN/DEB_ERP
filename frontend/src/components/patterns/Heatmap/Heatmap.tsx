import {
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { cx } from "../../../lib/cx.js";
import styles from "./Heatmap.module.css";

export interface HeatmapCell {
  /// Indexes into `rows` and `columns`.
  row: number;
  column: number;
  value: number;
  /// What the cell says when it is hovered, focused or read aloud:
  /// "Samedi, 9 h à 10 h : 12 ventes, 96,500 TND".
  label: string;
}

export interface HeatmapProps {
  title: string;
  rows: string[];
  columns: string[];
  /// Only the cells that hold something; the others are empty cells.
  cells: HeatmapCell[];
  /// The label of a cell without a value: "Lundi, 14 h à 15 h : aucune vente".
  emptyLabel: (row: number, column: number) => string;
  /// Shown under the grid until a cell is hovered or focused.
  caption?: string;
  className?: string;
}

const levels = 4;
const keySteps: Record<string, [row: number, column: number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

/// A rows-by-columns grid whose cells darken with their value, on the heat
/// tokens (05 section 3.2): "when do we sell", weekday by hour. One cell is
/// in the tab order and the arrow keys move between cells, so a keyboard
/// user crosses the chart in one stop; every cell carries its figures as a
/// label and shows them in the line under the grid.
export function Heatmap({
  title,
  rows,
  columns,
  cells,
  emptyLabel,
  caption,
  className,
}: HeatmapProps) {
  const readoutId = useId();
  const [active, setActive] = useState<{ row: number; column: number } | null>(
    null,
  );
  const byPosition = useMemo(
    () => new Map(cells.map((cell) => [`${cell.row}:${cell.column}`, cell])),
    [cells],
  );
  const max = Math.max(0, ...cells.map((cell) => cell.value));
  const labelOf = (row: number, column: number) =>
    byPosition.get(`${row}:${column}`)?.label ?? emptyLabel(row, column);
  const levelOf = (row: number, column: number) => {
    const value = byPosition.get(`${row}:${column}`)?.value ?? 0;

    return value <= 0 || max <= 0
      ? 0
      : Math.max(1, Math.ceil((value / max) * levels));
  };
  // The busiest cell is where the keyboard enters the grid.
  const entry = cells.reduce<HeatmapCell | null>(
    (best, cell) => (!best || cell.value > best.value ? cell : best),
    null,
  );
  const tabStop = active ?? {
    row: entry?.row ?? 0,
    column: entry?.column ?? 0,
  };

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = keySteps[event.key];
    const from = event.currentTarget.dataset.cell;

    if (!step || !from) {
      return;
    }

    const [row, column] = from.split(":").map(Number) as [number, number];
    const next = {
      row: Math.min(rows.length - 1, Math.max(0, row + step[0])),
      column: Math.min(columns.length - 1, Math.max(0, column + step[1])),
    };

    event.preventDefault();
    event.currentTarget
      .closest('[role="grid"]')
      ?.querySelector<HTMLElement>(`[data-cell="${next.row}:${next.column}"]`)
      ?.focus();
  }

  return (
    <div className={cx(styles.root, className)}>
      <div className={styles.scroller}>
        <div
          role="grid"
          aria-label={title}
          aria-describedby={readoutId}
          className={styles.grid}
          style={{ "--heatmap-columns": columns.length } as CSSProperties}
        >
          <div role="row" className={styles.row}>
            <span className={styles.corner} aria-hidden="true" />
            {columns.map((column, index) => (
              <span
                key={index}
                role="columnheader"
                className={styles.columnLabel}
              >
                {column}
              </span>
            ))}
          </div>
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} role="row" className={styles.row}>
              <span role="rowheader" className={styles.rowLabel}>
                {row}
              </span>
              {columns.map((_, columnIndex) => {
                const label = labelOf(rowIndex, columnIndex);

                return (
                  <div
                    key={columnIndex}
                    role="gridcell"
                    tabIndex={
                      tabStop.row === rowIndex && tabStop.column === columnIndex
                        ? 0
                        : -1
                    }
                    data-cell={`${rowIndex}:${columnIndex}`}
                    data-level={levelOf(rowIndex, columnIndex)}
                    className={styles.cell}
                    aria-label={label}
                    title={label}
                    onKeyDown={onKeyDown}
                    onFocus={() =>
                      setActive({ row: rowIndex, column: columnIndex })
                    }
                    onMouseEnter={() =>
                      setActive({ row: rowIndex, column: columnIndex })
                    }
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className={styles.footer}>
        <p id={readoutId} className={styles.readout} aria-live="polite">
          {active ? labelOf(active.row, active.column) : (caption ?? "")}
        </p>
        <p className={styles.legend} aria-hidden="true">
          Moins
          {Array.from({ length: levels + 1 }, (_, level) => (
            <span key={level} className={styles.swatch} data-level={level} />
          ))}
          Plus
        </p>
      </div>
    </div>
  );
}

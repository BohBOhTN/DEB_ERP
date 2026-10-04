import { useId, useState } from "react";
import { cx } from "../../../lib/cx.js";
import styles from "./TrendChart.module.css";

export interface TrendPoint {
  /// Full label of the point for the readout: "samedi 12/09/2026".
  label: string;
  /// Short label for the axis: "12/09".
  tick: string;
  value: number;
  /// Preformatted value: "110,000 TND".
  formatted: string;
  /// The comparison series at the same rank, when there is one.
  comparison?: number | null;
  comparisonFormatted?: string;
}

export interface TrendChartProps {
  title: string;
  points: TrendPoint[];
  /// Names of the two series for the legend and the readout.
  seriesLabel: string;
  comparisonLabel?: string;
  /// Preformatted top of the scale: "120,000 TND".
  formatScale: (value: number) => string;
  height?: number;
  className?: string;
}

const width = 600;

/// A series over time as a line with its area, and an optional dashed
/// comparison line (the previous period), on the chart tokens (05 section
/// 3.2). Hovering a point reads it in the line under the chart; the same
/// line follows the arrow keys through a range input, so the keyboard and
/// the screen reader get every figure the pointer gets.
export function TrendChart({
  title,
  points,
  seriesLabel,
  comparisonLabel,
  formatScale,
  height = 200,
  className,
}: TrendChartProps) {
  const titleId = useId();
  const [active, setActive] = useState<number | null>(null);
  const hasComparison =
    comparisonLabel !== undefined &&
    points.some(
      (point) => point.comparison !== null && point.comparison !== undefined,
    );
  const max = Math.max(
    1,
    ...points.map((point) => point.value),
    ...(hasComparison ? points.map((point) => point.comparison ?? 0) : []),
  );
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  const x = (index: number) => (points.length > 1 ? index * step : width / 2);
  const y = (value: number) => height - (value / max) * height;
  const path = (pick: (point: TrendPoint) => number) =>
    points
      .map(
        (point, index) => `${x(index).toFixed(1)},${y(pick(point)).toFixed(1)}`,
      )
      .join(" ");
  const line = path((point) => point.value);
  const current = active === null ? null : points[active];
  const ticks = tickIndexes(points.length);

  return (
    <div className={cx(styles.root, className)}>
      <div className={styles.header}>
        <p className={styles.legend}>
          <span className={styles.key}>
            <span className={styles.swatch} aria-hidden="true" />
            {seriesLabel}
          </span>
          {hasComparison ? (
            <span className={styles.key}>
              <span
                className={cx(styles.swatch, styles.dashed)}
                aria-hidden="true"
              />
              {comparisonLabel}
            </span>
          ) : null}
        </p>
        <p className={cx(styles.scale, "tabular-nums")}>
          {`Maximum ${formatScale(max)}`}
        </p>
      </div>
      <div className={styles.plot}>
        <svg
          className={styles.svg}
          viewBox={`0 0 ${width} ${height}`}
          height={height}
          role="img"
          aria-labelledby={titleId}
          preserveAspectRatio="none"
        >
          <title id={titleId}>{title}</title>
          {[0.25, 0.5, 0.75].map((share) => (
            <line
              key={share}
              className={styles.gridline}
              x1="0"
              x2={width}
              y1={height * share}
              y2={height * share}
            />
          ))}
          {points.length > 1 ? (
            <polygon
              className={styles.area}
              points={`0,${height} ${line} ${width},${height}`}
            />
          ) : null}
          {hasComparison ? (
            <polyline
              className={styles.comparison}
              points={path((point) => point.comparison ?? 0)}
              fill="none"
            />
          ) : null}
          <polyline className={styles.line} points={line} fill="none" />
          {current && active !== null ? (
            <line
              className={styles.cursor}
              x1={x(active)}
              x2={x(active)}
              y1="0"
              y2={height}
            />
          ) : null}
        </svg>
        <div className={styles.hover} aria-hidden="true">
          {points.map((point, index) => (
            <span
              key={index}
              className={styles.hoverColumn}
              onMouseEnter={() => setActive(index)}
            />
          ))}
        </div>
        <input
          type="range"
          className={styles.scrubber}
          aria-label={`${title} : parcourir les points`}
          min={0}
          max={Math.max(0, points.length - 1)}
          step={1}
          value={active ?? Math.max(0, points.length - 1)}
          aria-valuetext={
            current ? describe(current, hasComparison) : undefined
          }
          onChange={(event) => setActive(Number(event.target.value))}
          onFocus={() => setActive((index) => index ?? points.length - 1)}
        />
      </div>
      <div className={styles.axis} aria-hidden="true">
        {ticks.map((index) => (
          <span key={index}>{points[index]?.tick}</span>
        ))}
      </div>
      <p className={styles.readout} aria-live="polite">
        {current
          ? describe(current, hasComparison, seriesLabel, comparisonLabel)
          : "Survolez la courbe, ou utilisez les flèches, pour lire un point."}
      </p>
    </div>
  );
}

/// "samedi 12/09/2026 : 110,000 TND (période précédente : 80,000 TND)".
function describe(
  point: TrendPoint,
  withComparison: boolean,
  seriesLabel?: string,
  comparisonLabel?: string,
): string {
  const value = seriesLabel
    ? `${seriesLabel} ${point.formatted}`
    : point.formatted;
  const comparison =
    withComparison && point.comparisonFormatted
      ? ` · ${comparisonLabel ?? "avant"} ${point.comparisonFormatted}`
      : "";

  return `${point.label} : ${value}${comparison}`;
}

/// First, last and up to three points between them: enough to read the
/// span without crowding a phone.
function tickIndexes(count: number): number[] {
  if (count <= 5) {
    return Array.from({ length: count }, (_, index) => index);
  }

  return [0, 0.25, 0.5, 0.75, 1].map((share) =>
    Math.round((count - 1) * share),
  );
}

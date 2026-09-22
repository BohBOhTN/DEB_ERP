import { AlertTriangle } from "lucide-react";
import { formatQuantity } from "../../../i18n/format.js";
import { Badge } from "../../ui/Badge/Badge.js";

export interface StockBadgeProps {
  quantity: string | number;
  unit?: string | null;
  /// Below this the badge turns to warning; negative is always danger.
  lowThreshold?: string | number;
  className?: string;
}

/// Quantity with the negative-stock warning the source of truth requires:
/// a negative balance is shown, never hidden.
export function StockBadge({
  quantity,
  unit,
  lowThreshold,
  className,
}: StockBadgeProps) {
  const numeric = Number(quantity);
  const negative = numeric < 0;
  const low =
    !negative && lowThreshold !== undefined && numeric <= Number(lowThreshold);
  const tone = negative ? "danger" : low ? "warning" : "neutral";

  return (
    <Badge
      tone={tone}
      icon={negative || low ? <AlertTriangle /> : undefined}
      className={className}
    >
      <span className="tabular-nums">{formatQuantity(quantity, unit)}</span>
      {negative ? <span> (stock négatif)</span> : null}
    </Badge>
  );
}

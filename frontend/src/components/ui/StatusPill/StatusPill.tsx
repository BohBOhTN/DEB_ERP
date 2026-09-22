import {
  AlertTriangle,
  Ban,
  Check,
  CheckCheck,
  CircleDot,
  Clock,
  FileText,
  Lock,
  Package,
  Pause,
  Play,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "../Badge/Badge.js";

/// Every document state the API exposes, with its French label, tone and
/// icon in one place. A screen never maps an enum value itself.
export type DocumentStatus =
  | "DRAFT"
  | "POSTED"
  | "CANCELLED"
  | "PAID"
  | "PARTIAL"
  | "UNPAID"
  | "OVERDUE"
  | "OPEN"
  | "CLOSED"
  | "CONFIRMED"
  | "PREPARING"
  | "READY"
  | "COMPLETED"
  | "ACTIVE"
  | "INACTIVE"
  | "HELD"
  | "SETTLED";

interface StatusDescriptor {
  labelFr: string;
  tone: BadgeTone;
  icon: ReactNode;
}

export const statusDescriptors: Record<DocumentStatus, StatusDescriptor> = {
  DRAFT: { labelFr: "Brouillon", tone: "neutral", icon: <FileText /> },
  POSTED: { labelFr: "Validé", tone: "success", icon: <Check /> },
  CANCELLED: { labelFr: "Annulé", tone: "danger", icon: <Ban /> },
  PAID: { labelFr: "Payé", tone: "success", icon: <Check /> },
  PARTIAL: { labelFr: "Partiel", tone: "warning", icon: <Clock /> },
  UNPAID: { labelFr: "Impayé", tone: "danger", icon: <AlertTriangle /> },
  OVERDUE: { labelFr: "En retard", tone: "danger", icon: <AlertTriangle /> },
  OPEN: { labelFr: "Ouverte", tone: "info", icon: <CircleDot /> },
  CLOSED: { labelFr: "Fermée", tone: "neutral", icon: <Lock /> },
  CONFIRMED: { labelFr: "Confirmée", tone: "info", icon: <Check /> },
  PREPARING: { labelFr: "En préparation", tone: "warning", icon: <Play /> },
  READY: { labelFr: "Prête", tone: "success", icon: <Package /> },
  COMPLETED: { labelFr: "Terminée", tone: "success", icon: <CheckCheck /> },
  ACTIVE: { labelFr: "Actif", tone: "success", icon: <Check /> },
  INACTIVE: { labelFr: "Inactif", tone: "neutral", icon: <Pause /> },
  HELD: { labelFr: "En dépôt", tone: "info", icon: <Package /> },
  SETTLED: { labelFr: "Soldée", tone: "success", icon: <CheckCheck /> },
};

export interface StatusPillProps {
  status: DocumentStatus;
  /// Overrides the default French label (e.g. "Ouvert" for a masculine noun).
  label?: string;
  className?: string;
}

export function StatusPill({ status, label, className }: StatusPillProps) {
  const descriptor = statusDescriptors[status];

  return (
    <Badge tone={descriptor.tone} icon={descriptor.icon} className={className}>
      {label ?? descriptor.labelFr}
    </Badge>
  );
}

export function statusLabel(status: DocumentStatus): string {
  return statusDescriptors[status].labelFr;
}

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { formatTime } from "../../../i18n/format.js";
import { plural } from "../../../i18n/fr.js";
import type { HomeSummary } from "../home.api.js";
import styles from "./AlertsCard.module.css";

export interface AlertsCardProps {
  summary: HomeSummary;
}

interface AlertItem {
  id: string;
  text: string;
  to: string;
  tone: "warning" | "danger" | "info";
}

/// Row 2, left: actionable items with links (07 section 3.1).
export function buildAlerts(summary: HomeSummary): AlertItem[] {
  const alerts: AlertItem[] = [];

  if (summary.sales) {
    alerts.push(
      summary.openSession
        ? {
            id: "session",
            text: `Session ouverte depuis ${formatTime(summary.openSession.openedAt)}${summary.openSession.cashier ? ` par ${summary.openSession.cashier.displayName}` : ""}`,
            to: "/caisse",
            tone: "info",
          }
        : {
            id: "session",
            text: "Aucune session de caisse ouverte",
            to: "/caisse",
            tone: "warning",
          },
    );
  }

  if (summary.payables && summary.payables.overdueCount > 0) {
    alerts.push({
      id: "purchases",
      text: `${plural(summary.payables.overdueCount, "achat")} en retard`,
      to: "/achats",
      tone: "danger",
    });
  }

  if (summary.orders) {
    if (summary.orders.overdueCount > 0) {
      alerts.push({
        id: "orders-overdue",
        text: `${plural(summary.orders.overdueCount, "commande")} en retard`,
        to: "/commandes",
        tone: "danger",
      });
    }

    if (summary.orders.dueTodayCount > 0) {
      alerts.push({
        id: "orders-today",
        text: `${plural(summary.orders.dueTodayCount, "commande")} à livrer aujourd'hui`,
        to: "/commandes",
        tone: "warning",
      });
    }

    if (summary.orders.readyCount > 0) {
      alerts.push({
        id: "orders-ready",
        text: `${plural(summary.orders.readyCount, "commande prête", "commandes prêtes")}`,
        to: "/commandes",
        tone: "info",
      });
    }
  }

  if (summary.stock && summary.stock.negativeCount > 0) {
    const first = summary.stock.items[0];
    alerts.push({
      id: "stock",
      text: `${plural(summary.stock.negativeCount, "stock négatif", "stocks négatifs")}${first ? ` : ${first.name}` : ""}`,
      to: "/stock",
      tone: "danger",
    });
  }

  if (summary.custody && summary.custody.heldLinesCount > 0) {
    alerts.push({
      id: "custody",
      text: `${plural(summary.custody.heldLinesCount, "ligne")} en dépôt-vente`,
      to: "/distribution/depot-vente",
      tone: "info",
    });
  }

  return alerts;
}

export function AlertsCard({ summary }: AlertsCardProps) {
  const alerts = buildAlerts(summary);

  return (
    <Card>
      <CardHeader
        title="Alertes"
        description={
          alerts.length === 0 ? "Rien ne demande votre attention." : undefined
        }
      />
      {alerts.length === 0 ? (
        <p className={styles.calm}>
          <CheckCircle2 aria-hidden="true" /> Tout est en ordre.
        </p>
      ) : (
        <ul className={styles.list}>
          {alerts.map((alert) => (
            <li
              key={alert.id}
              className={`${styles.item} ${styles[alert.tone]}`}
            >
              <AlertTriangle aria-hidden="true" className={styles.icon} />
              <Link to={alert.to} className={styles.link}>
                {alert.text}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

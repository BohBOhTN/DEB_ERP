import { Repeat, UserPlus, UserRoundX, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { KpiGrid } from "../../../components/patterns/KpiGrid/KpiGrid.js";
import { KpiTile } from "../../../components/patterns/KpiTile/KpiTile.js";
import { RankedList } from "../../../components/patterns/RankedList/RankedList.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState.js";
import {
  formatDate,
  formatInteger,
  formatMoney,
} from "../../../i18n/format.js";
import { plural } from "../../../i18n/fr.js";
import type { AnalyticsCustomers, AnalyticsQuery } from "../analytics.api.js";
import { useAnalyticsCustomers } from "../analytics.queries.js";
import { shareOf } from "../analyticsFormat.js";
import { AnalysisState } from "../AnalysisState.js";
import styles from "../Analytics.module.css";

/// `Clients`: who buys, who came for the first time, who comes back, and
/// who stopped coming.
export function CustomersTab({ query }: { query: AnalyticsQuery }) {
  return (
    <AnalysisState query={useAnalyticsCustomers(query)}>
      {(customers) => {
        const { summary } = customers;
        const revenue =
          Number(summary.identifiedRevenueTnd) +
          Number(summary.anonymousRevenueTnd);

        return (
          <>
            <KpiGrid columns={4}>
              <KpiTile
                featured
                label="Clients actifs"
                value={formatInteger(summary.activeCount)}
                icon={<Users />}
                note={`${plural(summary.identifiedSalesCount, "vente")} à des clients enregistrés`}
              />
              <KpiTile
                label="Nouveaux clients"
                value={formatInteger(summary.newCount)}
                icon={<UserPlus />}
                note="premier achat sur la période"
              />
              <KpiTile
                label="Clients fidèles"
                value={formatInteger(summary.returningCount)}
                icon={<Repeat />}
                note="au moins deux achats sur la période"
              />
              <KpiTile
                label="Ventes sans client"
                value={`${shareOf(summary.anonymousRevenueTnd, revenue)} %`}
                icon={<UserRoundX />}
                note={`${formatMoney(summary.anonymousRevenueTnd)} · ${plural(summary.anonymousSalesCount, "vente")} au comptoir`}
              />
            </KpiGrid>
            <div className={styles.two}>
              <TopCustomersCard customers={customers} />
              <InactiveCard customers={customers} />
            </div>
          </>
        );
      }}
    </AnalysisState>
  );
}

function customerLink(customer: { customerId: string; name: string }) {
  return <Link to={`/clients/${customer.customerId}`}>{customer.name}</Link>;
}

function TopCustomersCard({ customers }: { customers: AnalyticsCustomers }) {
  return (
    <Card>
      <CardHeader
        as="h2"
        title="Meilleurs clients"
        description="Les clients enregistrés qui ont le plus acheté sur la période."
      />
      {customers.top.length === 0 ? (
        <EmptyState
          size="sm"
          title="Aucune vente à un client enregistré sur cette période"
        />
      ) : (
        <RankedList
          title="Meilleurs clients par chiffre d'affaires"
          items={customers.top.map((customer) => ({
            label: customerLink(customer),
            value: Number(customer.revenueTnd),
            formatted: `${formatMoney(customer.revenueTnd)} · ${plural(customer.salesCount, "achat")}`,
          }))}
        />
      )}
    </Card>
  );
}

function InactiveCard({ customers }: { customers: AnalyticsCustomers }) {
  const { inactive } = customers;
  const more = inactive.count - inactive.items.length;

  return (
    <Card>
      <CardHeader
        as="h2"
        title="Clients à relancer"
        description={`Clients actifs sans achat depuis ${inactive.thresholdDays} jours, les plus importants d'abord.`}
      />
      {inactive.items.length === 0 ? (
        <EmptyState
          size="sm"
          title="Aucun client à relancer"
          description="Tous vos clients ont acheté récemment."
        />
      ) : (
        <>
          <ul className={styles.rows} aria-label="Clients à relancer">
            {inactive.items.map((customer) => (
              <li key={customer.customerId} className={styles.rowItem}>
                <span className={styles.rowMain}>
                  {customerLink(customer)}
                  <span className={styles.muted}>
                    {`Dernier achat le ${formatDate(customer.lastPurchaseAt)}, il y a ${plural(customer.daysSince, "jour")}`}
                  </span>
                </span>
                <span className={styles.rowMain}>
                  <span className={`${styles.rowValue} tabular-nums`}>
                    {formatMoney(customer.revenueTnd)}
                  </span>
                  <span className={styles.muted}>
                    {`en ${plural(customer.salesCount, "achat")}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {more > 0 ? (
            <p className={styles.note}>
              {`et ${plural(more, "autre client", "autres clients")}.`}
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
}

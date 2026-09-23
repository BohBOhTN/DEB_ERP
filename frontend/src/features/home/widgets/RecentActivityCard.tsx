import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState.js";
import { Timeline } from "../../../components/patterns/Timeline/Timeline.js";
import type { HomeSummary } from "../home.api.js";

const modulePaths: Record<string, string> = {
  access: "/utilisateurs",
  catalog: "/produits",
  inventory: "/stock",
  procurement: "/achats",
  pos: "/caisse/ventes",
  customers: "/clients",
  orders: "/commandes",
  distribution: "/distributeurs",
  expenses: "/depenses",
  simulation: "/simulations",
};

/// Row 3, left: the last eight audit events, each linking to its module
/// (per-record links arrive with the rebuilt screens in R8 and R9).
export function RecentActivityCard({
  recent,
}: {
  recent: NonNullable<HomeSummary["recent"]>;
}) {
  return (
    <Card>
      <CardHeader title="Activité récente" />
      {recent.length === 0 ? (
        <EmptyState size="sm" title="Aucune activité pour le moment" />
      ) : (
        <Timeline
          title="Activité récente"
          timeFormat="relative"
          events={recent.map((event) => ({
            id: event.id,
            at: event.at,
            actor: event.actor?.displayName ?? null,
            title: event.actionLabelFr,
            description: event.entityLabelFr,
            href: event.module ? modulePaths[event.module] : undefined,
          }))}
        />
      )}
    </Card>
  );
}

import { useSessionPermissions } from "../../app/sessionContext.js";
import { PageHeader } from "../../components/patterns/PageHeader/PageHeader.js";
import { PeriodFilter } from "../../components/patterns/PeriodFilter/PeriodFilter.js";
import { EmptyState } from "../../components/ui/EmptyState/EmptyState.js";
import { Tabs, type TabItem } from "../../components/ui/Tabs/Tabs.js";
import {
  analysisPeriodPresets,
  periodFromParams,
  periodRange,
  periodToParams,
  type PeriodValue,
} from "../../lib/dates/periodRange.js";
import { useUrlState } from "../../lib/hooks/useUrlState.js";
import { CustomersTab } from "./tabs/CustomersTab.js";
import { FrequencyTab } from "./tabs/FrequencyTab.js";
import { OverviewTab } from "./tabs/OverviewTab.js";
import { ProductsTab } from "./tabs/ProductsTab.js";

type AnalysisTab = "overview" | "frequency" | "products" | "customers";

// `page` belongs to the product table: a new period or tab starts it over.
const defaults = {
  period: "last30",
  from: "",
  to: "",
  tab: "overview",
  page: 1,
};
/// The server refuses a longer window (`maxPeriodDays`).
const maxDays = 366;
const dayMs = 24 * 60 * 60 * 1000;

/// `/analyses` (issue 014, DEC-V2-006): the analyses over the history the
/// application already records. The period and the tab live in the URL, so
/// a view can be bookmarked or sent to someone.
export function AnalyticsPage() {
  const permissions = useSessionPermissions();
  const [state, setState] = useUrlState(defaults);
  const period = analysisPeriod(state);
  const range = periodRange(period);
  const query = { from: range.from, to: range.to };
  const tooLong =
    (Date.parse(range.to) - Date.parse(range.from)) / dayMs + 1 > maxDays;
  const items: TabItem<AnalysisTab>[] = [
    {
      value: "overview",
      label: "Vue d'ensemble",
      content: <OverviewTab query={query} />,
    },
    {
      value: "frequency",
      label: "Fréquence",
      content: <FrequencyTab query={query} />,
    },
    {
      value: "products",
      label: "Produits",
      content: <ProductsTab query={query} />,
    },
    // Names and habits of customers: the customer list permission too.
    ...(permissions.has("customers.view")
      ? [
          {
            value: "customers" as const,
            label: "Clients",
            content: <CustomersTab query={query} />,
          },
        ]
      : []),
  ];
  const tab = items.some((item) => item.value === state.tab)
    ? (state.tab as AnalysisTab)
    : "overview";

  return (
    <>
      <PageHeader
        eyebrow="Pilotage"
        title="Analyses"
        description="Ce que disent vos ventes, vos produits et vos clients sur la période choisie."
      />
      <PeriodFilter
        presets={analysisPeriodPresets}
        value={period}
        onChange={(next) => setState({ ...periodToParams(next), page: 1 })}
      />
      {tooLong ? (
        <EmptyState
          title="Période trop longue"
          description={`Choisissez une période de ${maxDays} jours au plus.`}
        />
      ) : (
        <Tabs<AnalysisTab>
          label="Analyses"
          items={items}
          value={tab}
          onValueChange={(next) => setState({ tab: next, page: 1 })}
        />
      )}
    </>
  );
}

/// An analysis always reads a window: a custom period without dates falls
/// back to the last thirty days instead of "every date".
function analysisPeriod(state: {
  period: string;
  from: string;
  to: string;
}): PeriodValue {
  const period = periodFromParams(state, "last30");

  return period.preset === "custom" && !period.from && !period.to
    ? { preset: "last30", from: "", to: "" }
    : period;
}

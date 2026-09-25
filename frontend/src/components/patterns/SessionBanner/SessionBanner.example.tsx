import type { KitEntry } from "../../kit/types.js";
import { Button } from "../../ui/Button/Button.js";
import { SessionBanner } from "./SessionBanner.js";

export const kit: KitEntry = {
  name: "SessionBanner",
  group: "patterns",
  description:
    "État de la session de caisse : ouverte (par qui, depuis quand) ou à ouvrir.",
  examples: [
    {
      title: "Ouverte",
      render: () => (
        <SessionBanner
          session={{
            openedAt: new Date(),
            cashierName: "Amine",
            terminalName: "Caisse principale",
            openingCashTnd: "50",
          }}
          action={
            <Button size="sm" variant="secondary">
              Clôturer la caisse
            </Button>
          }
        />
      ),
    },
    {
      title: "Fermée",
      render: () => (
        <SessionBanner
          session={null}
          action={<Button size="sm">Ouvrir la caisse</Button>}
        />
      ),
    },
  ],
};

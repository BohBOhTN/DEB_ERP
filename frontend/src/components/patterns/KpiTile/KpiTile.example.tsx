import { Banknote, Receipt, Users, Wallet } from "lucide-react";
import type { KitEntry } from "../../kit/types.js";
import { Badge } from "../../ui/Badge/Badge.js";
import { KpiTile } from "./KpiTile.js";

export const kit: KitEntry = {
  name: "KpiTile",
  group: "patterns",
  description:
    "Tuile KPI : libellé, icône, valeur tabulaire, delta, note ; variante mise en avant.",
  examples: [
    {
      title: "Quatre tuiles",
      render: () => (
        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          <KpiTile
            featured
            label="Ventes du jour"
            value="1 250,000"
            unit="TND"
            icon={<Receipt />}
            delta={{ label: "+12 % vs hier", direction: "up" }}
            note="14 ventes"
          />
          <KpiTile
            label="Encaissé en espèces"
            value="980,000"
            unit="TND"
            icon={<Banknote />}
            delta={{ label: "−3 %", direction: "down" }}
          />
          <KpiTile
            label="Reste à encaisser clients"
            value="2 340,500"
            unit="TND"
            icon={<Users />}
            delta={{ label: "+8 %", direction: "up", positiveIsGood: false }}
          />
          <KpiTile
            label="À payer fournisseurs"
            value="5 120,000"
            unit="TND"
            icon={<Wallet />}
            badge={<Badge tone="danger">3 en retard</Badge>}
            href="#"
          />
          <KpiTile label="Chargement" value="" loading />
        </div>
      ),
    },
  ],
};

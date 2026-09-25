import type { KitEntry } from "../../kit/types.js";
import { Button } from "../Button/Button.js";
import { Card, CardBody, CardFooter, CardHeader } from "./Card.js";

export const kit: KitEntry = {
  name: "Card",
  group: "ui",
  description:
    "Surface blanche avec en-tête, corps et pied ; variantes atténuée et inversée.",
  examples: [
    {
      title: "Complète",
      render: () => (
        <Card>
          <CardHeader
            title="Fournisseurs"
            description="12 fournisseurs actifs"
            actions={<Button size="sm">Ajouter</Button>}
          />
          <CardBody>
            Le corps de la carte accueille un tableau, un formulaire ou une
            liste.
          </CardBody>
          <CardFooter>
            <span>Total</span>
            <strong className="tabular-nums">1 250,000 TND</strong>
          </CardFooter>
        </Card>
      ),
    },
    {
      title: "Tonalités",
      render: () => (
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          }}
        >
          <Card tone="muted">
            <CardHeader as="h3" title="Atténuée" />
          </Card>
          <Card tone="inverse">
            <CardHeader
              as="h3"
              title="Inversée"
              description="Tuile mise en avant"
            />
          </Card>
        </div>
      ),
    },
  ],
};

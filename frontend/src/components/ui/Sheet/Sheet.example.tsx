import { useState } from "react";
import type { KitEntry } from "../../kit/types.js";
import { Button } from "../Button/Button.js";
import { Sheet } from "./Sheet.js";

function Example({ side }: { side: "right" | "bottom" }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Ouvrir ({side === "right" ? "droite" : "bas"})
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        side={side}
        title={side === "right" ? "Détail du client" : "Filtres"}
        description={
          side === "right" ? "Solde, avances et derniers règlements" : undefined
        }
        footer={<Button onClick={() => setOpen(false)}>Appliquer</Button>}
      >
        <p>
          Le contenu du panneau défile indépendamment de l'en-tête et du pied.
        </p>
      </Sheet>
    </>
  );
}

export const kit: KitEntry = {
  name: "Sheet",
  group: "ui",
  description:
    "Panneau latéral (détail) ou feuille du bas (filtres sur téléphone).",
  examples: [
    {
      title: "Côtés",
      render: () => (
        <div style={{ display: "flex", gap: 12 }}>
          <Example side="right" />
          <Example side="bottom" />
        </div>
      ),
    },
  ],
};

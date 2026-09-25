import { useState } from "react";
import type { KitEntry } from "../../kit/types.js";
import { Button } from "../../ui/Button/Button.js";
import { StatusPill } from "../../ui/StatusPill/StatusPill.js";
import { KeyValueList } from "../KeyValueList/KeyValueList.js";
import { DetailPanel } from "./DetailPanel.js";

const details = (
  <KeyValueList
    items={[
      { label: "Fournisseur", value: "Minoterie du Sud" },
      { label: "Date", value: "22/09/2026" },
      { label: "Total", value: "1 250,000 TND", numeric: true },
      { label: "Reste à payer", value: "450,000 TND", numeric: true },
    ]}
  />
);

function SheetExample() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Ouvrir le panneau
      </Button>
      <DetailPanel
        mode="sheet"
        open={open}
        onOpenChange={setOpen}
        title="Achat AC-000012"
        meta={<StatusPill status="POSTED" />}
        description="Minoterie du Sud · 22/09/2026"
        actions={<Button variant="danger">Annuler l'achat</Button>}
      >
        {details}
      </DetailPanel>
    </>
  );
}

export const kit: KitEntry = {
  name: "DetailPanel",
  group: "patterns",
  description:
    "Fiche de détail en page ou en panneau latéral, avec référence, statut et actions.",
  examples: [
    {
      title: "En page",
      render: () => (
        <DetailPanel
          title="Achat AC-000012"
          meta={<StatusPill status="PARTIAL" />}
          description="Minoterie du Sud · 22/09/2026"
          actions={
            <>
              <Button size="sm">Enregistrer un paiement</Button>
              <Button size="sm" variant="danger">
                Annuler l'achat
              </Button>
            </>
          }
        >
          {details}
        </DetailPanel>
      ),
    },
    { title: "En panneau", render: () => <SheetExample /> },
  ],
};

import { useState } from "react";
import type { KitEntry } from "../../kit/types.js";
import { Button } from "../Button/Button.js";
import { FormField } from "../FormField/FormField.js";
import { TextInput } from "../TextInput/TextInput.js";
import { Dialog, type DialogSize } from "./Dialog.js";

function Example({ size }: { size: DialogSize }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Ouvrir ({size})
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size={size}
        title="Nouveau client"
        description="Le client pourra acheter à crédit une fois enregistré."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={() => setOpen(false)}>Enregistrer</Button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 16 }}>
          <FormField label="Nom" required>
            <TextInput />
          </FormField>
          <FormField label="Téléphone">
            <TextInput inputMode="tel" />
          </FormField>
        </div>
      </Dialog>
    </>
  );
}

export const kit: KitEntry = {
  name: "Dialog",
  group: "ui",
  description:
    "Boîte de dialogue Radix ; feuille du bas sur téléphone ; piège de focus ; Échap.",
  examples: [
    {
      title: "Tailles",
      render: () => (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {(["sm", "md", "lg", "full"] as DialogSize[]).map((size) => (
            <Example key={size} size={size} />
          ))}
        </div>
      ),
    },
  ],
};

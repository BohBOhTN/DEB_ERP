import type { KitEntry } from "../../kit/types.js";
import { TextInput } from "../TextInput/TextInput.js";
import { FormField } from "./FormField.js";

export const kit: KitEntry = {
  name: "FormField",
  group: "ui",
  description: "Libellé, contrôle, aide et erreur reliés par aria-describedby.",
  examples: [
    {
      title: "États",
      render: () => (
        <div style={{ display: "grid", gap: 16, maxWidth: 360 }}>
          <FormField label="Nom" required>
            <TextInput placeholder="Farine T55" />
          </FormField>
          <FormField label="Téléphone" hint="Huit chiffres, sans espace">
            <TextInput inputMode="tel" />
          </FormField>
          <FormField
            label="E-mail"
            error="Saisissez une adresse e-mail valide."
          >
            <TextInput defaultValue="amine@" />
          </FormField>
        </div>
      ),
    },
  ],
};

import type { KitEntry } from "../../kit/types.js";
import { FormField } from "../FormField/FormField.js";
import { TextArea } from "./TextArea.js";

export const kit: KitEntry = {
  name: "TextArea",
  group: "ui",
  description: "Zone de texte redimensionnable pour les motifs et les notes.",
  examples: [
    {
      title: "Dans un champ",
      render: () => (
        <div style={{ maxWidth: 420 }}>
          <FormField
            label="Motif de l'annulation"
            hint="5 à 300 caractères"
            required
          >
            <TextArea placeholder="Expliquez le motif" />
          </FormField>
        </div>
      ),
    },
  ],
};

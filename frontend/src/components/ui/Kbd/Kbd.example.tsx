import type { KitEntry } from "../../kit/types.js";
import { Kbd } from "./Kbd.js";

export const kit: KitEntry = {
  name: "Kbd",
  group: "ui",
  description: "Raccourcis clavier de la caisse sur ordinateur.",
  examples: [
    {
      title: "Raccourcis",
      render: () => (
        <p style={{ display: "flex", gap: 16 }}>
          <span>
            <Kbd>/</Kbd> Rechercher
          </span>
          <span>
            <Kbd>F2</Kbd> Client
          </span>
          <span>
            <Kbd>F9</Kbd> Encaisser
          </span>
        </p>
      ),
    },
  ],
};

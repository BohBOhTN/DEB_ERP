import type { KitEntry } from "../../kit/types.js";
import { Avatar } from "./Avatar.js";

export const kit: KitEntry = {
  name: "Avatar",
  group: "ui",
  description: "Initiales sur fond navy ou or.",
  examples: [
    {
      title: "Tailles et tonalités",
      render: () => (
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Avatar name="Amine Trabelsi" size="sm" />
          <Avatar name="Amine Trabelsi" />
          <Avatar name="Salma Ben Ali" size="lg" tone="gold" />
        </div>
      ),
    },
  ],
};

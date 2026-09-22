import type { KitEntry } from "../../kit/types.js";
import {
  StatusPill,
  statusDescriptors,
  type DocumentStatus,
} from "./StatusPill.js";

export const kit: KitEntry = {
  name: "StatusPill",
  group: "ui",
  description:
    "Tous les états de document avec libellé français, icône et tonalité.",
  examples: [
    {
      title: "Tous les états",
      render: () => (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(Object.keys(statusDescriptors) as DocumentStatus[]).map(
            (status) => (
              <StatusPill key={status} status={status} />
            ),
          )}
        </div>
      ),
    },
  ],
};

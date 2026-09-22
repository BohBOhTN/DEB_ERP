import type { KitEntry } from "../../kit/types.js";
import { Skeleton } from "./Skeleton.js";

export const kit: KitEntry = {
  name: "Skeleton",
  group: "ui",
  description: "Squelettes de chargement : texte, bloc, cercle, tableau, KPI.",
  examples: [
    {
      title: "Variantes",
      render: () => (
        <div style={{ display: "grid", gap: 16 }}>
          <Skeleton width="60%" />
          <Skeleton variant="rect" />
          <Skeleton variant="circle" />
          <Skeleton variant="kpi" />
          <Skeleton variant="table" rows={4} />
        </div>
      ),
    },
  ],
};

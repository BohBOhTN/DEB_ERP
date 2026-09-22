import { useState } from "react";
import type { KitEntry } from "../../kit/types.js";
import { SegmentedControl } from "./SegmentedControl.js";

function Example({
  fullWidth = false,
  size,
}: {
  fullWidth?: boolean;
  size?: "sm" | "md";
}) {
  const [value, setValue] = useState("today");

  return (
    <SegmentedControl
      label="Période"
      size={size}
      fullWidth={fullWidth}
      value={value}
      onValueChange={setValue}
      options={[
        { value: "today", label: "Aujourd'hui" },
        { value: "yesterday", label: "Hier" },
        { value: "week", label: "7 jours" },
      ]}
    />
  );
}

export const kit: KitEntry = {
  name: "SegmentedControl",
  group: "ui",
  description:
    "Sélecteur de période et puces de filtre ; sémantique radio, flèches au clavier.",
  examples: [
    { title: "Par défaut", render: () => <Example /> },
    { title: "Petit", render: () => <Example size="sm" /> },
    { title: "Pleine largeur", render: () => <Example fullWidth /> },
  ],
};

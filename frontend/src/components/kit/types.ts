import type { ReactNode } from "react";

/// Every `*.example.tsx` exports a `kit` entry; the `/_kit` gallery collects
/// them with `import.meta.glob`, so a component without an example is
/// simply absent from the gallery and fails the sprint's acceptance.
export interface KitExample {
  title: string;
  description?: string;
  render: () => ReactNode;
}

export interface KitEntry {
  name: string;
  group: "ui" | "patterns";
  description: string;
  examples: KitExample[];
}

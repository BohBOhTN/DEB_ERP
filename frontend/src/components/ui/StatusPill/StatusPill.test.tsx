import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusPill, statusDescriptors, statusLabel } from "./StatusPill.js";

describe("StatusPill", () => {
  it("shows the French label for a document state", () => {
    render(<StatusPill status="POSTED" />);

    expect(screen.getByText("Validé")).toBeInTheDocument();
    expect(statusLabel("OVERDUE")).toBe("En retard");
  });

  it("accepts a label override for gendered nouns", () => {
    render(<StatusPill status="OPEN" label="Ouvert" />);

    expect(screen.getByText("Ouvert")).toBeInTheDocument();
  });

  it("has an icon for every state so colour is never the only signal", () => {
    for (const descriptor of Object.values(statusDescriptors)) {
      expect(descriptor.icon).toBeTruthy();
      expect(descriptor.labelFr.length).toBeGreaterThan(0);
    }
  });
});

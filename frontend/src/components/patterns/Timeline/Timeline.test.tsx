import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Timeline } from "./Timeline.js";

describe("Timeline", () => {
  it("lists events with actor and time", () => {
    render(
      <Timeline
        title="Activité récente"
        events={[
          {
            id: "1",
            at: "2026-09-22T07:12:00.000Z",
            actor: "Amine",
            title: "Ouverture de caisse",
          },
          {
            id: "2",
            at: "2026-09-22T08:00:00.000Z",
            title: "Vente en caisse",
            href: "/caisse/ventes/1",
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("list", { name: "Activité récente" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ouverture de caisse")).toBeInTheDocument();
    expect(screen.getByText(/Amine/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Vente en caisse" }),
    ).toHaveAttribute("href", "/caisse/ventes/1");
    expect(screen.getByText("22/09/2026 08:12")).toBeInTheDocument();
  });
});

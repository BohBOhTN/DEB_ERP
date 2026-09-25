import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SessionBanner } from "./SessionBanner.js";

describe("SessionBanner", () => {
  it("describes the open session", () => {
    render(
      <SessionBanner
        session={{
          openedAt: "2026-09-22T07:12:00.000Z",
          cashierName: "Amine",
          openingCashTnd: "50",
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Session ouverte");
    expect(screen.getByRole("status")).toHaveTextContent(
      "depuis 08:12 par Amine",
    );
    expect(screen.getByRole("status")).toHaveTextContent("50,000");
  });

  it("invites the cashier to open the till", () => {
    render(
      <SessionBanner
        session={null}
        action={<button>Ouvrir la caisse</button>}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Aucune session de caisse ouverte",
    );
    expect(
      screen.getByRole("button", { name: "Ouvrir la caisse" }),
    ).toBeInTheDocument();
  });
});

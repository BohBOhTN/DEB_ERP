import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { toPermissionSet } from "../../../lib/auth/permissions.js";
import { PermissionGate } from "./PermissionGate.js";

const cashier = toPermissionSet(["pos.access", "pos.sell"]);

describe("PermissionGate", () => {
  it("renders children only when the permission is held", () => {
    render(
      <>
        <PermissionGate permissions={cashier} permission="pos.sell">
          <button>Encaisser</button>
        </PermissionGate>
        <PermissionGate
          permissions={cashier}
          permission="purchases.post"
          fallback={<p>Masqué</p>}
        >
          <button>Valider l'achat</button>
        </PermissionGate>
        <PermissionGate
          permissions={cashier}
          anyOf={["orders.create", "pos.access"]}
        >
          <button>Commande</button>
        </PermissionGate>
        <PermissionGate
          permissions={cashier}
          allOf={["pos.access", "orders.create"]}
        >
          <button>Les deux</button>
        </PermissionGate>
      </>,
    );

    expect(
      screen.getByRole("button", { name: "Encaisser" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Valider l'achat" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Masqué")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Commande" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Les deux" }),
    ).not.toBeInTheDocument();
  });
});

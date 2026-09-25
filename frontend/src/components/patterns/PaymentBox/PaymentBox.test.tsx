import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PaymentBox } from "./PaymentBox.js";

function Harness({ allowOverpayment = false }: { allowOverpayment?: boolean }) {
  const [amount, setAmount] = useState("");

  return (
    <PaymentBox
      dueTnd="125"
      amountTnd={amount}
      onAmountChange={setAmount}
      allowOverpayment={allowOverpayment}
    />
  );
}

describe("PaymentBox", () => {
  it("shows the remaining amount as the user types and settles in full", async () => {
    render(<Harness />);

    await userEvent.type(
      screen.getByRole("textbox", { name: /Montant/ }),
      "100",
    );
    expect(
      screen.getByText("Reste à payer").nextElementSibling,
    ).toHaveTextContent("25,000");

    await userEvent.click(screen.getByRole("button", { name: "Tout régler" }));
    expect(
      screen.getByText("Reste à payer").nextElementSibling,
    ).toHaveTextContent("0,000");
  });

  it("flags an overpayment unless change is allowed", async () => {
    const { unmount } = render(<Harness />);
    await userEvent.type(
      screen.getByRole("textbox", { name: /Montant/ }),
      "200",
    );
    expect(
      screen.getByText("Le montant dépasse le montant dû."),
    ).toBeInTheDocument();
    unmount();

    render(<Harness allowOverpayment />);
    await userEvent.type(
      screen.getByRole("textbox", { name: /Montant/ }),
      "200",
    );
    expect(
      screen.getByText("Monnaie à rendre").nextElementSibling,
    ).toHaveTextContent("75,000");
  });
});

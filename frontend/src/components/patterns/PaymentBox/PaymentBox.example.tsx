import { useState } from "react";
import type { KitEntry } from "../../kit/types.js";
import { PaymentBox } from "./PaymentBox.js";

function Example({ allowOverpayment = false }: { allowOverpayment?: boolean }) {
  const [amount, setAmount] = useState("100");

  return (
    <div style={{ maxWidth: 420 }}>
      <PaymentBox
        dueTnd="125"
        amountTnd={amount}
        onAmountChange={setAmount}
        allowOverpayment={allowOverpayment}
      />
    </div>
  );
}

export const kit: KitEntry = {
  name: "PaymentBox",
  group: "patterns",
  description:
    "Montant, mode (espèces), raccourcis et « Reste à payer » ; monnaie à rendre en caisse.",
  examples: [
    { title: "Règlement", render: () => <Example /> },
    { title: "Caisse (monnaie)", render: () => <Example allowOverpayment /> },
  ],
};

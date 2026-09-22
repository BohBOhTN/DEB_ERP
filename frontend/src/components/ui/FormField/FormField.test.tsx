import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TextInput } from "../TextInput/TextInput.js";
import { FormField } from "./FormField.js";

describe("FormField", () => {
  it("wires label, hint and error to the input", () => {
    render(
      <FormField
        label="Nom"
        hint="Tel qu'il apparaît sur les documents"
        error="Ce champ est obligatoire."
        required
      >
        <TextInput />
      </FormField>,
    );

    const input = screen.getByLabelText(/Nom/);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-required", "true");
    expect(input).toHaveAccessibleDescription(
      "Ce champ est obligatoire. Tel qu'il apparaît sur les documents",
    );
  });

  it("has no error wiring when the field is valid", () => {
    render(
      <FormField label="Téléphone">
        <TextInput />
      </FormField>,
    );

    expect(screen.getByLabelText("Téléphone")).not.toHaveAttribute(
      "aria-invalid",
    );
  });
});

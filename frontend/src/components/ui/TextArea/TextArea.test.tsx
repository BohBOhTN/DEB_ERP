import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormField } from "../FormField/FormField.js";
import { TextArea } from "./TextArea.js";

describe("TextArea", () => {
  it("takes its id and error state from the surrounding field", () => {
    render(
      <FormField label="Motif" error="Saisissez au moins 5 caractères.">
        <TextArea />
      </FormField>,
    );

    expect(screen.getByLabelText("Motif")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});

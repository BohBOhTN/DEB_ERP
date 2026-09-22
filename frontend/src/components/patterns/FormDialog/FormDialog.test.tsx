import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError } from "../../../lib/api/errors.js";
import { requiredString } from "../../../lib/forms/schemas.js";
import { FormField } from "../../ui/FormField/FormField.js";
import { TextInput } from "../../ui/TextInput/TextInput.js";
import { FormDialog } from "./FormDialog.js";

const schema = z.object({ name: requiredString(2, 40) });
type Values = z.infer<typeof schema>;

function Harness({
  onSubmit,
}: {
  onSubmit: (values: Values) => Promise<void>;
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
  });

  return (
    <FormDialog
      open
      onOpenChange={() => undefined}
      title="Nouveau client"
      form={form}
      onSubmit={onSubmit}
      onReload={() => undefined}
    >
      <FormField
        label="Nom"
        error={form.formState.errors.name?.message}
        required
      >
        <TextInput {...form.register("name")} />
      </FormField>
    </FormDialog>
  );
}

describe("FormDialog", () => {
  it("shows the zod error without calling submit", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(
      await screen.findByText("Saisissez au moins 2 caractères."),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("maps server field errors onto the fields", async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError({
        code: "VALIDATION_ERROR",
        message: "",
        status: 400,
        fieldErrors: { name: "Un client porte déjà ce nom." },
      }),
    );
    render(<Harness onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/Nom/), "Salma");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(
      await screen.findByText("Un client porte déjà ce nom."),
    ).toBeInTheDocument();
  });

  it("disables submit while pending and offers reload on a version conflict", async () => {
    let release: () => void = () => undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          release = () =>
            reject(
              new ApiError({
                code: "VERSION_CONFLICT",
                message: "Cette fiche a été modifiée.",
                status: 409,
              }),
            );
        }),
    );
    render(<Harness onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/Nom/), "Salma");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Enregistrer" }),
      ).toBeDisabled(),
    );
    expect(
      screen.queryByRole("button", { name: "Fermer" }),
    ).not.toBeInTheDocument();

    release();
    expect(
      await screen.findByRole("button", { name: "Recharger" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Fiche modifiée entre-temps",
    );
  });
});

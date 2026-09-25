import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { KitEntry } from "../../kit/types.js";
import { ApiError } from "../../../lib/api/errors.js";
import { optionalPhone, requiredString } from "../../../lib/forms/schemas.js";
import { Button } from "../../ui/Button/Button.js";
import { FormField } from "../../ui/FormField/FormField.js";
import { TextInput } from "../../ui/TextInput/TextInput.js";
import { FormDialog } from "./FormDialog.js";

const schema = z.object({ name: requiredString(2, 80), phone: optionalPhone });
type Input = z.input<typeof schema>;
type Output = z.output<typeof schema>;

function Example() {
  const [open, setOpen] = useState(false);
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", phone: "" },
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>Nouveau client</Button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Nouveau client"
        description="Saisissez « Salma » pour simuler un doublon côté serveur."
        form={form}
        onSubmit={async (values) => {
          await new Promise((resolve) => setTimeout(resolve, 800));
          if (values.name === "Salma") {
            throw new ApiError({
              code: "VALIDATION_ERROR",
              message: "",
              status: 400,
              fieldErrors: { name: "Un client porte déjà ce nom." },
            });
          }
          setOpen(false);
        }}
      >
        <FormField
          label="Nom"
          error={form.formState.errors.name?.message}
          required
        >
          <TextInput {...form.register("name")} />
        </FormField>
        <FormField
          label="Téléphone"
          error={form.formState.errors.phone?.message}
        >
          <TextInput inputMode="tel" {...form.register("phone")} />
        </FormField>
      </FormDialog>
    </>
  );
}

export const kit: KitEntry = {
  name: "FormDialog",
  group: "patterns",
  description:
    "Dialogue + react-hook-form + zod ; erreurs serveur mappées ; envoi bloquant.",
  examples: [{ title: "Nouveau client", render: () => <Example /> }],
};

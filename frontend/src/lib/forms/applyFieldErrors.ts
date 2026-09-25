import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

/// Maps the backend `fieldErrors` (`{ "lines.0.quantity": "..." }`) onto the
/// form (06 section 3.4). Paths the form does not know are returned so the
/// caller can show them in the form-level summary.
export function applyFieldErrors<TFieldValues extends FieldValues>(
  setError: UseFormSetError<TFieldValues>,
  fieldErrors: Record<string, string>,
  knownFields?: readonly string[],
): string[] {
  const unknown: string[] = [];

  for (const [path, message] of Object.entries(fieldErrors)) {
    if (
      knownFields &&
      !knownFields.some(
        (field) => path === field || path.startsWith(`${field}.`),
      )
    ) {
      unknown.push(message);
      continue;
    }

    setError(path as Path<TFieldValues>, { type: "server", message });
  }

  return unknown;
}

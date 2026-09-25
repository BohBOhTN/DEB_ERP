import type { ZodError, ZodIssue } from "zod";

const genericMessage = "Cette valeur est invalide.";

/// Zod's own messages are English ("Invalid input: expected string, received
/// undefined"). The language rule forbids leaking a raw English exception to
/// the interface, so every issue is translated here and `issue.message` is
/// never passed through.
export function toFrenchFieldErrors(error: ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_";

    // The first problem on a field is the one worth showing.
    if (!fieldErrors[path]) {
      fieldErrors[path] = toFrenchMessage(issue);
    }
  }

  return fieldErrors;
}

function toFrenchMessage(issue: ZodIssue): string {
  switch (issue.code) {
    case "invalid_type":
      return issue.input === undefined
        ? "Ce champ est obligatoire."
        : "Le format de ce champ est invalide.";
    case "too_small":
      return describeTooSmall(issue);
    case "too_big":
      return describeTooBig(issue);
    case "invalid_format":
      return "Le format de ce champ est invalide.";
    case "invalid_value":
    case "invalid_union":
      return "Cette valeur n'est pas autorisée.";
    case "not_multiple_of":
      return "Cette valeur n'a pas le pas attendu.";
    case "unrecognized_keys":
      return "Ce champ n'est pas attendu.";
    default:
      return genericMessage;
  }
}

function describeTooSmall(issue: ZodIssue): string {
  const { origin, minimum, inclusive } = issue as unknown as {
    origin?: string;
    minimum?: number | bigint;
    inclusive?: boolean;
  };

  if (origin === "string") {
    return Number(minimum) <= 1
      ? "Ce champ est obligatoire."
      : `Ce champ doit contenir au moins ${String(minimum)} caractères.`;
  }

  if (origin === "array") {
    return Number(minimum) <= 1
      ? "Ajoutez au moins un élément."
      : `Ajoutez au moins ${String(minimum)} éléments.`;
  }

  if (origin === "date") {
    return "Cette date est trop ancienne.";
  }

  // `.positive()` is an exclusive zero minimum and `.nonnegative()` an
  // inclusive one. Saying "positive or zero" for the first would be wrong.
  if (Number(minimum) === 0) {
    return inclusive
      ? "Cette valeur doit être positive ou nulle."
      : "Cette valeur doit être supérieure à zéro.";
  }

  return "Cette valeur est trop petite.";
}

function describeTooBig(issue: ZodIssue): string {
  const { origin, maximum } = issue as unknown as {
    origin?: string;
    maximum?: number | bigint;
  };

  if (origin === "string") {
    return `Ce champ ne peut pas dépasser ${String(maximum)} caractères.`;
  }

  if (origin === "array") {
    return `Ajoutez au plus ${String(maximum)} éléments.`;
  }

  if (origin === "date") {
    return "Cette date est trop lointaine.";
  }

  return "Cette valeur est trop grande.";
}

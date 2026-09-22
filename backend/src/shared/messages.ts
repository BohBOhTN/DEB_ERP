/// User-facing French copy for the shared layers (error handler, correlation,
/// rate limiting, idempotency, health). Module services still carry their own
/// business messages next to their error codes; BE-47 folds those into this
/// catalogue when the shared helpers are extracted.
///
/// Every string here is proper French with accents. The language rule forbids
/// ASCII-only French as much as it forbids English.
export const messages = {
  VALIDATION_ERROR: "Les données saisies sont invalides.",
  MALFORMED_BODY: "Le corps de la requête est illisible.",
  PAYLOAD_TOO_LARGE: "La requête est trop volumineuse.",
  UNSUPPORTED_MEDIA_TYPE: "Le format de la requête n'est pas pris en charge.",
  BAD_REQUEST: "La requête est invalide.",
  NOT_FOUND: "Ressource introuvable.",
  UNIQUE_CONFLICT: "Un enregistrement identique existe déjà.",
  REFERENCE_CONFLICT:
    "Cette opération référence un enregistrement inexistant ou encore utilisé.",
  RETRYABLE_CONFLICT:
    "Une autre opération a modifié ces données au même moment. Veuillez réessayer.",
  VERSION_CONFLICT:
    "Cette fiche a été modifiée entre-temps. Rechargez puis réessayez.",
  SERVICE_UNAVAILABLE:
    "Le service est momentanément indisponible. Veuillez réessayer dans un instant.",
  RETRYABLE_SERVER_ERROR: "Une erreur est survenue. Veuillez réessayer.",
  RATE_LIMITED: "Trop de tentatives. Veuillez réessayer plus tard.",
  IDEMPOTENCY_KEY_REQUIRED: "Une clé d'idempotence est requise.",
  IDEMPOTENCY_CONFLICT: "Cette clé a déjà été utilisée pour une autre demande.",
  IDEMPOTENCY_IN_PROGRESS:
    "Cette demande est déjà en cours de traitement. Veuillez patienter.",
} as const;

export type MessageKey = keyof typeof messages;

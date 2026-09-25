import { randomId } from "../ids.js";
/// One key per posting intent (06 section 3.4). `ConfirmPostingDialog`
/// creates it when the dialog opens and reuses it on retry, so a network
/// failure after the server committed cannot post twice.
export function createIdempotencyKey(): string {
  return randomId();
}

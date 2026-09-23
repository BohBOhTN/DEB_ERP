import { z } from "zod";
import {
  email,
  optionalString,
  requiredString,
} from "../../lib/forms/schemas.js";

export const password = z
  .string()
  .min(8, "Au moins 8 caractères.")
  .max(128, "Au plus 128 caractères.");

export const userSchema = z.object({
  displayName: requiredString(2, 80),
  email,
  password,
  roleIds: z.array(z.string()).default([]),
});
export type UserFormInput = z.input<typeof userSchema>;
export type UserFormOutput = z.output<typeof userSchema>;

export const userProfileSchema = z.object({
  displayName: requiredString(2, 80),
  email,
});
export type UserProfileFormInput = z.input<typeof userProfileSchema>;
export type UserProfileFormOutput = z.output<typeof userProfileSchema>;

export const resetPasswordSchema = z.object({ password });
export type ResetPasswordFormInput = z.input<typeof resetPasswordSchema>;
export type ResetPasswordFormOutput = z.output<typeof resetPasswordSchema>;

export const roleSchema = z.object({
  name: requiredString(2, 60),
  description: optionalString(200),
});
export type RoleFormInput = z.input<typeof roleSchema>;
export type RoleFormOutput = z.output<typeof roleSchema>;

/// A readable temporary password (OD-V2-011): three groups of letters and
/// digits without look-alike characters, to be read out or copied once.
export function generateTemporaryPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const chars = [...bytes].map((byte) => alphabet[byte % alphabet.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8, 12).join("")}`;
}

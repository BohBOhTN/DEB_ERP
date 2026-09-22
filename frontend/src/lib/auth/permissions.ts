import type { PermissionKey } from "./permissionKeys.gen.js";

export type { PermissionKey } from "./permissionKeys.gen.js";
export { permissionKeys, permissionModules } from "./permissionKeys.gen.js";

/// The effective permissions of the signed-in user, as `/auth/me` returns
/// them. A `Set` keeps every check O(1) inside render loops.
export type PermissionSet = ReadonlySet<string>;

export function toPermissionSet(keys: readonly string[]): PermissionSet {
  return new Set(keys);
}

export function hasPermission(
  permissions: PermissionSet,
  key: PermissionKey,
): boolean {
  return permissions.has(key);
}

export function hasAny(
  permissions: PermissionSet,
  keys: readonly PermissionKey[],
): boolean {
  return keys.some((key) => permissions.has(key));
}

export function hasAll(
  permissions: PermissionSet,
  keys: readonly PermissionKey[],
): boolean {
  return keys.every((key) => permissions.has(key));
}

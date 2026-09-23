import { apiClient } from "../../lib/api/client.js";
import type { PageResult, SortSpec } from "../../lib/api/pagination.js";
import { toSearchParams } from "../../lib/api/pagination.js";

/// `/api/v1/access` (UI-19, BE-38). Permission keys never reach the screen
/// as primary text: the catalogue carries `labelFr` and `descriptionFr`.
export interface Permission {
  key: string;
  module: string;
  labelFr: string;
  descriptionFr: string;
}

export interface PermissionGroup {
  module: string;
  permissions: Array<Pick<Permission, "key" | "labelFr" | "descriptionFr">>;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isSystem: boolean;
  systemKey: string | null;
  permissionKeys: string[];
  permissionCount: number;
  userCount: number | null;
}

export interface RoleSummary {
  id: string;
  name: string;
  isActive: boolean;
  isSystem: boolean;
  systemKey: string | null;
}

export interface AccessUser {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  version: number | null;
  createdAt: string | null;
  roles: RoleSummary[];
}

export async function getPermissionCatalogue(): Promise<{
  permissions: Permission[];
  groups: PermissionGroup[];
}> {
  return apiClient.get<{
    permissions: Permission[];
    groups: PermissionGroup[];
  }>("/access/permissions");
}

export async function listRoles(): Promise<Role[]> {
  return (await apiClient.get<{ roles: Role[] }>("/access/roles")).roles;
}

export async function getRole(roleId: string): Promise<Role> {
  return (await apiClient.get<{ role: Role }>(`/access/roles/${roleId}`)).role;
}

export async function createRole(input: {
  name: string;
  description?: string;
  permissionKeys: string[];
}): Promise<Role> {
  return (await apiClient.post<{ role: Role }>("/access/roles", input)).role;
}

export async function updateRole(
  roleId: string,
  input: { name?: string; description?: string; isActive?: boolean },
): Promise<Role> {
  return (
    await apiClient.patch<{ role: Role }>(`/access/roles/${roleId}`, input)
  ).role;
}

export async function replaceRolePermissions(
  roleId: string,
  permissionKeys: string[],
): Promise<Role> {
  return (
    await apiClient.put<{ role: Role }>(`/access/roles/${roleId}/permissions`, {
      permissionKeys,
    })
  ).role;
}

export interface UserListQuery {
  page: number;
  pageSize: number;
  q?: string;
  sort?: SortSpec;
  isActive?: boolean;
  roleId?: string;
}

export function listUsers(
  query: UserListQuery,
): Promise<PageResult<AccessUser>> {
  return apiClient.list<AccessUser>("/access/users", {
    query: toSearchParams({ ...query }),
  });
}

export async function createUser(input: {
  email: string;
  displayName: string;
  password: string;
  roleIds: string[];
}): Promise<AccessUser> {
  return (await apiClient.post<{ user: AccessUser }>("/access/users", input))
    .user;
}

export async function updateUser(
  userId: string,
  input: { version: number; displayName?: string; email?: string },
): Promise<AccessUser> {
  return (
    await apiClient.patch<{ user: AccessUser }>(
      `/access/users/${userId}`,
      input,
    )
  ).user;
}

export async function resetUserPassword(
  userId: string,
  password: string,
): Promise<AccessUser> {
  return (
    await apiClient.post<{ user: AccessUser }>(
      `/access/users/${userId}/password-reset`,
      { password },
    )
  ).user;
}

export async function replaceUserRoles(
  userId: string,
  roleIds: string[],
): Promise<AccessUser> {
  return (
    await apiClient.put<{ user: AccessUser }>(`/access/users/${userId}/roles`, {
      roleIds,
    })
  ).user;
}

export async function setUserActivation(
  userId: string,
  isActive: boolean,
): Promise<AccessUser> {
  return (
    await apiClient.patch<{ user: AccessUser }>(
      `/access/users/${userId}/activation`,
      { isActive },
    )
  ).user;
}

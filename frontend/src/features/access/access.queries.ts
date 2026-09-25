import { useMutation, useQuery } from "@tanstack/react-query";
import { tier } from "../../lib/query/cachePolicy.js";
import { useInvalidateAfter } from "../../lib/query/invalidation.js";
import * as api from "./access.api.js";

export const accessKeys = {
  all: ["access"] as const,
  catalogue: ["access", "permissions"] as const,
  roles: ["access", "roles"] as const,
  role: (id: string) => ["access", "role", id] as const,
  users: (query: api.UserListQuery) => ["access", "users", query] as const,
};

export function usePermissionCatalogue() {
  return useQuery({
    queryKey: accessKeys.catalogue,
    queryFn: api.getPermissionCatalogue,
    ...tier("reference"),
  });
}

export function useRoles() {
  return useQuery({
    queryKey: accessKeys.roles,
    queryFn: api.listRoles,
    ...tier("reference"),
  });
}

export function useRole(roleId: string) {
  return useQuery({
    queryKey: accessKeys.role(roleId),
    queryFn: () => api.getRole(roleId),
    enabled: roleId !== "",
    ...tier("document"),
  });
}

export function useUsers(query: api.UserListQuery) {
  return useQuery({
    queryKey: accessKeys.users(query),
    queryFn: () => api.listUsers(query),
    placeholderData: (previous) => previous,
    ...tier("list"),
  });
}

export function useCreateRole() {
  const invalidate = useInvalidateAfter("access");
  return useMutation({ mutationFn: api.createRole, onSuccess: invalidate });
}

export function useUpdateRole() {
  const invalidate = useInvalidateAfter("access");
  return useMutation({
    mutationFn: (input: {
      roleId: string;
      body: Parameters<typeof api.updateRole>[1];
    }) => api.updateRole(input.roleId, input.body),
    onSuccess: invalidate,
  });
}

export function useReplaceRolePermissions() {
  const invalidate = useInvalidateAfter("access");
  return useMutation({
    mutationFn: (input: { roleId: string; permissionKeys: string[] }) =>
      api.replaceRolePermissions(input.roleId, input.permissionKeys),
    onSuccess: invalidate,
  });
}

export function useCreateUser() {
  const invalidate = useInvalidateAfter("access");
  return useMutation({ mutationFn: api.createUser, onSuccess: invalidate });
}

export function useUpdateUser() {
  const invalidate = useInvalidateAfter("access");
  return useMutation({
    mutationFn: (input: {
      userId: string;
      body: Parameters<typeof api.updateUser>[1];
    }) => api.updateUser(input.userId, input.body),
    onSuccess: invalidate,
  });
}

export function useResetUserPassword() {
  const invalidate = useInvalidateAfter("access");
  return useMutation({
    mutationFn: (input: { userId: string; password: string }) =>
      api.resetUserPassword(input.userId, input.password),
    onSuccess: invalidate,
  });
}

export function useReplaceUserRoles() {
  const invalidate = useInvalidateAfter("access");
  return useMutation({
    mutationFn: (input: { userId: string; roleIds: string[] }) =>
      api.replaceUserRoles(input.userId, input.roleIds),
    onSuccess: invalidate,
  });
}

export function useSetUserActivation() {
  const invalidate = useInvalidateAfter("access");
  return useMutation({
    mutationFn: (input: { userId: string; isActive: boolean }) =>
      api.setUserActivation(input.userId, input.isActive),
    onSuccess: invalidate,
  });
}

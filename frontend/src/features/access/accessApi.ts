import { readApiError, type ApiEnvelope } from "../auth/authApi";

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

export interface Permission {
  key: string;
  module: string;
  labelFr: string;
  descriptionFr: string;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isSystem: boolean;
  systemKey: string | null;
  permissionKeys: string[];
}

export interface AccessUser {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  roles: Array<{
    id: string;
    name: string;
    isActive: boolean;
    isSystem: boolean;
    systemKey: string | null;
  }>;
}

export async function getAccessWorkspace(): Promise<{
  permissions: Permission[];
  roles: Role[];
  users: AccessUser[];
}> {
  const [permissions, roles, users] = await Promise.all([
    getPermissions(),
    getRoles(),
    getUsers(),
  ]);

  return { permissions, roles, users };
}

export async function getPermissions(): Promise<Permission[]> {
  const response = await fetch(`${apiBaseUrl}/access/permissions`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<{
    permissions: Permission[];
  }>;
  return body.data.permissions;
}

export async function getRoles(): Promise<Role[]> {
  const response = await fetch(`${apiBaseUrl}/access/roles`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<{ roles: Role[] }>;
  return body.data.roles;
}

export async function getUsers(): Promise<AccessUser[]> {
  const response = await fetch(`${apiBaseUrl}/access/users`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<{ users: AccessUser[] }>;
  return body.data.users;
}

export async function createUser(params: {
  email: string;
  displayName: string;
  password: string;
  roleIds: string[];
}): Promise<AccessUser> {
  const response = await fetch(`${apiBaseUrl}/access/users`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<{ user: AccessUser }>;
  return body.data.user;
}

export async function createRole(params: {
  name: string;
  description: string;
  permissionKeys: string[];
}): Promise<Role> {
  const response = await fetch(`${apiBaseUrl}/access/roles`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<{ role: Role }>;
  return body.data.role;
}

export async function updateRole(
  roleId: string,
  params: {
    name?: string;
    description?: string;
    isActive?: boolean;
  },
): Promise<Role> {
  const response = await fetch(`${apiBaseUrl}/access/roles/${roleId}`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<{ role: Role }>;
  return body.data.role;
}

export async function replaceRolePermissions(
  roleId: string,
  permissionKeys: string[],
): Promise<Role> {
  const response = await fetch(
    `${apiBaseUrl}/access/roles/${roleId}/permissions`,
    {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ permissionKeys }),
    },
  );

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<{ role: Role }>;
  return body.data.role;
}

export async function replaceUserRoles(
  userId: string,
  roleIds: string[],
): Promise<AccessUser> {
  const response = await fetch(`${apiBaseUrl}/access/users/${userId}/roles`, {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ roleIds }),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<{ user: AccessUser }>;
  return body.data.user;
}

export async function setUserActivation(
  userId: string,
  isActive: boolean,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/access/users/${userId}/activation`,
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ isActive }),
    },
  );

  if (!response.ok) {
    throw await readApiError(response);
  }
}

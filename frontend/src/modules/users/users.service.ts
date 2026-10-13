import { httpClient } from "../../services/http";
import type { Permission, LabUserRole } from "../auth/permissions";

export type TenantStaffUser = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: LabUserRole | string;
  customPermissions: Permission[];
  effectivePermissions: Permission[];
  createdAt: string;
};

type ApiOk<T> = { success: true; data: T };

export const usersService = {
  async listStaff(): Promise<TenantStaffUser[]> {
    const { data } = await httpClient.get<ApiOk<{ users: TenantStaffUser[] }>>("/api/users");
    return data.data.users;
  },

  async updatePermissions(userId: string, permissions: Permission[]): Promise<TenantStaffUser> {
    const { data } = await httpClient.patch<ApiOk<{ user: TenantStaffUser }>>(`/api/users/${userId}/permissions`, {
      permissions
    });
    return data.data.user;
  },

  async roleDefaults(role: string): Promise<Permission[]> {
    const { data } = await httpClient.get<ApiOk<{ permissions: Permission[] }>>(`/api/users/role-defaults/${role}`);
    return data.data.permissions;
  }
};

import { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { auditService } from "../audit/audit.service";
import {
  getUserById,
  listTenantUsers,
  updateUserPermissions as applyUserPermissions
} from "../auth/auth.service";
import {
  normalizeRole,
  PERMISSIONS,
  Permission,
  resolveEffectivePermissions,
  ROLE_DEFAULT_PERMISSIONS,
  LabUserRole
} from "../auth/permissions";
import { PublicUser } from "../auth/auth.types";
import { userPermissionsRepository } from "./userPermissions.repository";

export type TenantUserRow = PublicUser;

export const usersService = {
  listTenantStaff(tenantId: string): TenantUserRow[] {
    return listTenantUsers(tenantId);
  },

  async updatePermissions(input: {
    tenantId: string;
    targetUserId: string;
    permissions: Permission[];
    modifiedByUserId: string;
  }): Promise<TenantUserRow> {
    const target = getUserById(input.targetUserId);
    if (!target || target.tenantId !== input.tenantId) {
      throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
    }

    const invalid = input.permissions.filter((p) => !PERMISSIONS.includes(p));
    if (invalid.length > 0) {
      throw new AppError("Invalid permission values", HTTP_STATUS.BAD_REQUEST, "INVALID_PERMISSIONS");
    }

    const previousPermissions = resolveEffectivePermissions(target);
    const updated = await applyUserPermissions(input.targetUserId, input.permissions);
    await userPermissionsRepository.upsert(
      input.tenantId,
      input.targetUserId,
      input.permissions,
      input.modifiedByUserId
    );

    await auditService.log({
      userId: input.modifiedByUserId,
      tenantId: input.tenantId,
      action: "UPDATE",
      entity: "UserPermissions",
      entityId: input.targetUserId,
      metadata: {
        modifiedBy: input.modifiedByUserId,
        previousPermissions,
        newPermissions: input.permissions,
        targetEmail: target.email
      }
    });

    return updated;
  },

  roleDefaults(role: string): Permission[] {
    return [...ROLE_DEFAULT_PERMISSIONS[normalizeRole(role)]];
  }
};

/** Re-export canonical User model from backend */
export {
  UserModel,
  type IUser
} from "../../../../backend/src/database/models/User";
export {
  PERMISSIONS,
  type Permission,
  LAB_ROLES,
  type LabUserRole,
  hasPermission,
  resolveEffectivePermissions,
  ROLE_DEFAULT_PERMISSIONS
} from "../../../../backend/src/modules/auth/permissions";

import mongoose, { Document, Schema } from "mongoose";
import {
  hasPermission as checkPermission,
  Permission,
  PERMISSIONS,
  LAB_ROLES,
  LabUserRole,
  resolveEffectivePermissions
} from "../../modules/auth/permissions";

export type IUser = Document & {
  tenantId: string;
  name: string;
  email: string;
  role: LabUserRole;
  passwordHash: string;
  customPermissions: Permission[];
  department?: string | null;
  medicalLicense?: string | null;
  digitalSignatureUrl?: string | null;
  hasPermission(perm: Permission): boolean;
  getEffectivePermissions(): Permission[];
};

const userSchema = new Schema<IUser>(
  {
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    role: { type: String, enum: LAB_ROLES, required: true },
    passwordHash: { type: String, required: true },
    customPermissions: { type: [String], enum: PERMISSIONS, default: [] },
    department: { type: String, default: null },
    medicalLicense: { type: String, default: null },
    digitalSignatureUrl: { type: String, default: null }
  },
  { timestamps: true }
);

userSchema.methods.hasPermission = function hasPermission(this: IUser, perm: Permission): boolean {
  return checkPermission({ role: this.role, customPermissions: this.customPermissions }, perm);
};

userSchema.methods.getEffectivePermissions = function getEffectivePermissions(this: IUser): Permission[] {
  return resolveEffectivePermissions({ role: this.role, customPermissions: this.customPermissions });
};

userSchema.index({ tenantId: 1, email: 1 }, { unique: true });

export const UserModel = mongoose.models.User ?? mongoose.model<IUser>("User", userSchema);
